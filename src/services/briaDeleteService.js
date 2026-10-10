// Prepara y ejecuta eliminaciones de pendientes pedidas conversando con Bria (10 de octubre de 2026).
// Preparar nunca escribe. Confirmar elimina tarea por tarea con `auditAndDeleteTask`, la misma vía del botón
// de Gestión: queda el registro de qué se eliminó, quién y por qué. Las mismas puertas que la pantalla:
// elimina quien creó la tarea, un administrador o un project manager (`canDeleteTask`), nunca un pendiente
// privado que la persona no puede abrir, y nunca uno ya realizado (lo cerrado es historial).

import { randomUUID } from 'node:crypto';
import { canUseBria } from '../lib/briaLivingMemory.js';
import { canDeleteTask, hasModulePermission } from '../config/security.js';
import { canOpenTask } from '../lib/taskPrivacy.js';
import { knowledgeError } from '../lib/briaKnowledge.js';
import { deleteIntent, deleteStage, isDeleteConfirmation, DELETE_MAX_ITEMS } from '../lib/briaDeleteDraft.js';

export const canDeleteWithBria = (user) => canUseBria(user) && hasModulePermission(user, 'gestion');
const authorize = (user) => { if (!canDeleteWithBria(user)) throw knowledgeError('Necesitas acceso a Gestión para eliminar pendientes con Bria.', 403, 'BRIA_DELETE_FORBIDDEN'); };
const tidy = (value) => String(value || '').normalize('NFKC').trim();
const TASK_SELECT = {
  id: true, title: true, status: true, creatorId: true, isPrivate: true,
  client: { select: { name: true } },
  assignee: { select: { name: true, userId: true } },
  collaborators: { select: { member: { select: { userId: true } } } },
  viewers: { select: { userId: true } }
};

/** Por qué esta persona no puede eliminar esta tarea, con palabras; null si sí puede. */
export const deleteProblem = (user, task) => {
  if (!task) return 'Ya no existe.';
  if (!canOpenTask(task, user.userId || user.id)) return 'Es un pendiente privado que no puedes abrir.';
  if (!canDeleteTask(user, task)) return 'Solo lo elimina quien lo creó, un administrador o un project manager.';
  if (task.status === 'REALIZADA') return 'Ya está realizado: lo cerrado se conserva como historial.';
  return null;
};

export const createBriaDeleteService = ({ db, deleteTask, readOnly = false } = {}) => ({
  async prepare({ user, args = {}, question, previous }) {
    authorize(user);
    const owner = user.userId || user.id;
    const ongoing = previous && previous.status === 'DRAFT';
    if (ongoing && previous.ownerId !== owner) throw knowledgeError('Esta eliminación la preparó otra persona.', 403);
    const fresh = !ongoing || args.nuevo === true;
    if (fresh && !deleteIntent(question)) throw knowledgeError('Pide explícitamente eliminar o borrar el pendiente para preparar la eliminación.', 400, 'BRIA_DELETE_NO_INTENT');
    const draft = fresh ? { id: randomUUID(), ownerId: owner, status: 'DRAFT', reason: null, items: [] } : structuredClone(previous);
    const ids = [...new Set((Array.isArray(args.tareas) ? args.tareas : []).map(tidy).filter(Boolean))].slice(0, DELETE_MAX_ITEMS);
    const rows = ids.length ? await db.task.findMany({ where: { id: { in: ids } }, select: TASK_SELECT }) : [];
    const byId = new Map(rows.map((row) => [row.id, row]));
    for (const taskId of ids) {
      const row = byId.get(taskId);
      let item = draft.items.find((entry) => entry.taskId === taskId);
      if (!item) { item = { taskId, title: row?.title || 'Pendiente' }; draft.items.push(item); }
      if (row) Object.assign(item, { title: row.title, client: row.client?.name || null, assignee: row.assignee?.name || null, status: row.status });
      const problem = deleteProblem(user, row);
      if (problem) item.skip = problem; else delete item.skip;
    }
    if (args.motivo != null) draft.reason = tidy(args.motivo).slice(0, 300) || null;
    if (draft.items.length > DELETE_MAX_ITEMS) throw knowledgeError(`Una eliminación lleva hasta ${DELETE_MAX_ITEMS} pendientes.`, 400, 'BRIA_DELETE_SIZE');
    return draft;
  },

  async createConfirmedDelete({ user, draft, question, revalidate }) {
    authorize(user);
    if (readOnly) throw knowledgeError('Esta vista solo prepara eliminaciones. Elimina desde la plataforma.', 403);
    const owner = user.userId || user.id;
    if (!draft || draft.ownerId !== owner) throw knowledgeError('Esta eliminación la preparó otra persona.', 403, 'BRIA_DELETE_OWNER');
    if (deleteStage(draft) !== 'READY' || !isDeleteConfirmation(question)) throw knowledgeError('Primero revisa qué se va a eliminar y confirma con «Eliminar pendiente».', 400, 'BRIA_DELETE_NOT_READY');
    const results = [];
    for (const item of draft.items.filter((entry) => !entry.skip)) {
      await revalidate?.();
      authorize(user);
      const base = { taskId: item.taskId, title: item.title };
      try {
        // Se vuelve a mirar la tarea justo antes: reintentar no falla por lo ya eliminado, y un permiso que
        // cambió entre el resumen y la confirmación se respeta.
        const row = await db.task.findUnique({ where: { id: item.taskId }, select: TASK_SELECT });
        if (!row) { results.push({ ...base, outcome: 'ALREADY' }); continue; }
        const problem = deleteProblem(user, row);
        if (problem) { results.push({ ...base, outcome: 'SKIPPED', reason: problem }); continue; }
        await deleteTask(item.taskId, draft.reason, owner);
        results.push({ ...base, outcome: 'DELETED' });
      } catch (failure) {
        console.error('[BriaDelete] No se pudo eliminar el pendiente:', failure?.response?.data || failure?.message || failure);
        results.push({ ...base, outcome: 'FAILED', reason: 'No se pudo eliminar; inténtalo desde Gestión.' });
      }
    }
    return { results };
  }
});
