// Prepara y ejecuta despachos a producción pedidos conversando con Bria. Preparar nunca escribe. Confirmar
// despacha pieza por pieza con `sendItemToKanban`, la vía del botón «Despachar a Kanban»: la tarea queda
// ligada a su pieza y una pieza con tarea abierta no recibe otra. Una pieza que falla no deshace ni frena
// a las demás, y su motivo se dice con palabras.

import { randomUUID } from 'node:crypto';
import { canUseBria } from '../lib/briaLivingMemory.js';
import { hasModulePermission } from '../config/security.js';
import { bogotaDate } from '../lib/colombiaBusinessDays.js';
import { knowledgeError } from '../lib/briaKnowledge.js';
import { resolveTaskDate } from '../lib/briaTaskDraft.js';
import { dispatchIntent, dispatchStage, isDispatchConfirmation, DISPATCH_MAX_ITEMS } from '../lib/briaDispatchDraft.js';

export const canDispatch = (user) => canUseBria(user) && hasModulePermission(user, 'gestion') && hasModulePermission(user, 'parrillas');
const authorize = (user) => { if (!canDispatch(user)) throw knowledgeError('Necesitas acceso a Gestión y a Parrillas para despachar a producción con Bria.', 403, 'BRIA_DISPATCH_FORBIDDEN'); };
const tidy = (value) => String(value || '').normalize('NFKC').trim();
const pieceDay = (value) => (value ? new Date(value).toISOString().slice(0, 10) : null);
const same = (a, b) => tidy(a).toLowerCase() === tidy(b).toLowerCase();

// El mismo criterio que los pendientes: con una sola coincidencia se elige; con varias, solo si una es exacta.
const pick = (rows, term) => {
  if (rows.length === 1) return rows[0];
  const exact = rows.filter((row) => same(row.name, term) || same(row.email, term));
  return exact.length === 1 ? exact[0] : null;
};

const humanReason = (failure) => {
  const message = String(failure?.message || '');
  if (/active task/i.test(message)) return 'Ya tiene una tarea de producción abierta.';
  if (/not found/i.test(message)) return 'La pieza ya no existe en la parrilla.';
  return 'No se pudo despachar; inténtalo desde la parrilla.';
};

export const createBriaDispatchService = ({ db, dispatchItem, now = () => new Date(), readOnly = false } = {}) => ({
  async prepare({ user, args = {}, question, previous }) {
    authorize(user);
    const owner = user.userId || user.id;
    const ongoing = previous && previous.status === 'DRAFT';
    if (ongoing && previous.ownerId !== owner) throw knowledgeError('Este despacho pertenece a otra persona.', 403);
    if ((!ongoing || args.nuevo === true) && !dispatchIntent(question)) throw knowledgeError('Pide explícitamente despachar piezas a producción para preparar el despacho.', 400, 'BRIA_DISPATCH_NO_INTENT');
    const fresh = !ongoing || args.nuevo === true;
    const planId = tidy(args.planId) || (fresh ? '' : previous.planId);
    if (!planId) throw knowledgeError('Falta la parrilla: búscala primero con parrilla_de_cliente.', 400, 'BRIA_DISPATCH_PLAN');
    if (!fresh && planId !== previous.planId) throw knowledgeError('Un despacho es de una sola parrilla. Pide uno nuevo para la otra.', 400, 'BRIA_DISPATCH_PLAN');
    const draft = fresh ? { id: randomUUID(), ownerId: owner, status: 'DRAFT', planId, client: null, items: [] } : structuredClone(previous);
    const requested = (Array.isArray(args.piezas) ? args.piezas : []).slice(0, DISPATCH_MAX_ITEMS);
    const ids = [...new Set(requested.map((row) => tidy(row.pieza)).filter(Boolean))];
    const rows = ids.length ? await db.contentItem.findMany({
      where: { id: { in: ids }, planId, deletedAt: null, plan: { deletedAt: null } },
      select: {
        id: true, objective: true, format: true, publishDate: true, status: true, planId: true,
        plan: { select: { id: true, month: true, year: true, client: { select: { id: true, name: true, isArchived: true } } } },
        tasks: { where: { status: { not: 'REALIZADA' } }, take: 1, select: { id: true, assignee: { select: { name: true } } } }
      }
    }) : [];
    const byId = new Map(rows.map((row) => [row.id, row]));
    const today = bogotaDate(now());
    for (const request of requested) {
      const itemId = tidy(request.pieza);
      const row = byId.get(itemId);
      let item = draft.items.find((entry) => entry.itemId === itemId);
      if (!item) { item = { itemId, title: row?.objective || 'Pieza sin nombre', assignee: null, priority: 'NORMAL' }; draft.items.push(item); }
      if (!row) { item.skip = 'No está en esa parrilla.'; continue; }
      draft.client ||= { id: row.plan.client.id, name: row.plan.client.name };
      Object.assign(item, { title: row.objective, format: row.format, publishDay: pieceDay(row.publishDate) });
      if (row.plan.client.isArchived) { item.skip = 'El cliente está archivado.'; continue; }
      if (row.status === 'PUBLICADO') { item.skip = 'Ya se publicó.'; continue; }
      if (row.tasks?.length) { item.skip = `Ya está en producción${row.tasks[0].assignee?.name ? ` con ${row.tasks[0].assignee.name}` : ''}.`; continue; }
      delete item.skip;
      if (request.responsable != null) {
        const term = tidy(request.responsable).slice(0, 160);
        const people = term ? await db.teamMember.findMany({ where: { isActive: true, OR: [{ name: { contains: term, mode: 'insensitive' } }, { email: { equals: term, mode: 'insensitive' } }] }, select: { id: true, name: true, email: true, isActive: true }, orderBy: { name: 'asc' }, take: 6 }) : [];
        const chosen = pick(people.filter((person) => person.isActive), term);
        item.assignee = chosen ? { id: chosen.id, name: chosen.name } : null;
        item.assigneeCandidates = people.map(({ id, name }) => ({ id, name }));
      }
      if (request.fecha != null) {
        const day = resolveTaskDate(request.fecha, today);
        if (!day) throw knowledgeError(`No entendí la fecha de «${item.title}». Dime un día concreto.`, 400, 'BRIA_DISPATCH_DATE');
        item.dueDate = day;
      }
      item.dueDate ||= item.publishDay || today; // Sin fecha, la de publicación, igual que el botón de la parrilla.
      if (request.prioridad != null) item.priority = tidy(request.prioridad).toUpperCase() === 'ALTA' ? 'ALTA' : 'NORMAL';
    }
    if (draft.items.length > DISPATCH_MAX_ITEMS) throw knowledgeError(`Un despacho lleva hasta ${DISPATCH_MAX_ITEMS} piezas.`, 400, 'BRIA_DISPATCH_SIZE');
    return draft;
  },

  async confirm({ user, draft, question, revalidate }) {
    authorize(user);
    if (readOnly) throw knowledgeError('Esta vista solo prepara despachos. Despacha desde la plataforma.', 403);
    const owner = user.userId || user.id;
    if (!draft || draft.ownerId !== owner) throw knowledgeError('Este despacho lo preparó otra persona.', 403, 'BRIA_DISPATCH_OWNER');
    if (dispatchStage(draft) !== 'READY' || !isDispatchConfirmation(question)) throw knowledgeError('Primero revisa el despacho completo y confirma con «Despachar a producción».', 400, 'BRIA_DISPATCH_NOT_READY');
    const results = [];
    for (const item of draft.items.filter((entry) => !entry.skip)) {
      await revalidate?.();
      authorize(user);
      const base = { itemId: item.itemId, title: item.title, assignee: item.assignee?.name || null };
      try {
        // Reintentar no duplica: si esta persona ya despachó la pieza, se recupera esa tarea.
        const open = await db.task.findFirst({ where: { contentItemId: item.itemId, status: { not: 'REALIZADA' } }, select: { id: true, creatorId: true } });
        if (open) {
          results.push(open.creatorId === owner ? { ...base, outcome: 'ALREADY', taskId: open.id } : { ...base, outcome: 'SKIPPED', reason: 'Otra persona ya la despachó.' });
          continue;
        }
        const member = await db.teamMember.findUnique({ where: { id: item.assignee.id }, select: { id: true, isActive: true } });
        if (!member?.isActive) { results.push({ ...base, outcome: 'FAILED', reason: `${item.assignee.name} ya no está activo en el equipo.` }); continue; }
        const saved = await dispatchItem(item.itemId, owner, { assigneeId: member.id, dueDate: `${item.dueDate}T12:00:00.000Z`, isPriority: item.priority === 'ALTA' });
        results.push({ ...base, outcome: 'CREATED', taskId: saved?.tasks?.[0]?.id || null });
      } catch (failure) {
        console.error('[BriaDispatch] No se pudo despachar la pieza:', failure?.response?.data || failure?.message || failure);
        results.push({ ...base, outcome: 'FAILED', reason: humanReason(failure) });
      }
    }
    return { results };
  }
});
