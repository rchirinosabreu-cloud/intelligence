import { randomUUID } from 'node:crypto';
import { canUseBria } from '../lib/briaLivingMemory.js';
import { hasModulePermission } from '../config/security.js';
import { bogotaDate } from '../lib/colombiaBusinessDays.js';
import { knowledgeError } from '../lib/briaKnowledge.js';
import { resolveTaskDate, taskDraftStage, taskDraftItems, taskDraftRequestProblem, materialDeclined, isTaskConfirmation, TASK_PRIORITIES, MAX_TASKS_PER_DRAFT } from '../lib/briaTaskDraft.js';
const tidy = value => String(value || '').normalize('NFKC').trim();
const clientWords = value => tidy(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
// El modelo pasa el nombre o alias que dijo la persona. Las consultas anteriores y los resultados de
// herramientas no eligen una cuenta para un pendiente nuevo; una selección del borrador propio se conserva.
const mentionsClient = (question, reference) => {
  const words = clientWords(reference);
  return Boolean(words) && ` ${clientWords(question)} `.includes(` ${words} `);
};
export const canCreateBriaTask = user => canUseBria(user) && hasModulePermission(user, 'gestion');
const authorize = user => { if (!canCreateBriaTask(user)) throw knowledgeError('Necesitas acceso a Gestión para crear pendientes con Bria.', 403); };
const bounded = (value, length, label) => { const text = tidy(value); if (text.length > length) throw knowledgeError(`${label} es demasiado largo. Divídelo en partes.`); return text; };
const links = (values, evidence) => {
  if (!Array.isArray(values) || values.length > 10) throw knowledgeError('Puedes usar hasta diez enlaces de cada tipo.');
  return [...new Set(values)].map(value => {
    let url; try { url = new URL(String(value)); } catch { throw knowledgeError('La referencia debe ser un enlace completo.'); }
    if (!['https:','http:'].includes(url.protocol) || url.username || url.password || String(value).length > 2000 || !evidence.includes(String(value))) throw knowledgeError('Usa únicamente los enlaces que compartiste en esta conversación.');
    return { url: url.href };
  });
};
const pick = (rows, term) => rows.length === 1 ? rows[0] : rows.filter(row => [row.name, row.email, row.slug].some(value => value && tidy(value).toLowerCase() === tidy(term).toLowerCase())).length === 1 ? rows.find(row => [row.name, row.email, row.slug].some(value => value && tidy(value).toLowerCase() === tidy(term).toLowerCase())) : null;
const readPriority = (value, strict) => {
  if (value == null) return null;
  const priority = tidy(value).toUpperCase();
  if (TASK_PRIORITIES.includes(priority)) return priority;
  if (strict) throw knowledgeError('Elige prioridad normal, alta o urgente.');
  return null;
};
export const createBriaTaskDraftService = ({ db, createTask, uploadFile, removeFile, notify, now = () => new Date(), readOnly = false } = {}) => {
  const findClient = async (term) => {
    const rows = term ? await db.client.findMany({ where: { isArchived: false, OR: [{ name: { contains: term, mode: 'insensitive' } }, { slug: { equals: term, mode: 'insensitive' } }] }, select: { id: true, name: true, slug: true, isArchived: true }, orderBy: { name: 'asc' }, take: 6 }) : [];
    return { chosen: pick(rows.filter(row => !row.isArchived), term), candidates: rows.map(({ id, name, slug }) => ({ id, name, slug })) };
  };
  const resolveClient = async ({ reference, selection, question, request, prior }) => {
    if (mentionsClient(question, reference)) return findClient(reference);
    // La selección natural la interpreta Bria, pero solo puede elegir entre las opciones que ya tenía
    // este borrador. La cita acredita su origen; no convierte un ajuste de fecha en una elección de cuenta.
    if (request.intent !== 'ADJUST' || !prior || taskDraftRequestProblem({ request: { intent: 'ADJUST', evidence: selection }, question, ongoing: true })) return null;
    const matches = (prior.clientCandidates || []).filter(row => [row.id, row.name, row.slug].some(value => value && tidy(value).toLowerCase() === tidy(reference).toLowerCase()));
    if (matches.length !== 1) return null;
    const selected = matches[0];
    const client = await db.client.findUnique({ where: { id: selected.id }, select: { id: true, name: true, slug: true, isArchived: true } });
    return client && !client.isArchived
      ? { chosen: client, candidates: [] }
      : { chosen: null, candidates: prior.clientCandidates.filter(row => row.id !== selected.id) };
  };
  const findMember = async (term, user) => {
    if (tidy(term).toLowerCase() === 'yo') {
      const userId = user?.userId || user?.id;
      const member = userId ? await db.teamMember.findUnique({ where: { userId }, select: { id: true, name: true, role: true, email: true, isActive: true, userId: true } }) : null;
      return { chosen: member?.isActive ? member : null, candidates: [] };
    }
    const rows = term ? await db.teamMember.findMany({ where: { isActive: true, OR: [{ name: { contains: term, mode: 'insensitive' } }, { email: { equals: term, mode: 'insensitive' } }] }, select: { id: true, name: true, role: true, email: true, isActive: true, userId: true }, orderBy: { name: 'asc' }, take: 6 }) : [];
    return { chosen: pick(rows.filter(row => row.isActive), term), candidates: rows.map(({ id, name, role }) => ({ id, name, role })) };
  };
  return {
    /**
     * Prepara o ajusta el borrador. `defaults.client` es el cliente del último pendiente creado en este chat: si la
     * persona no nombra otro, se asume (Rodny, 20 de octubre de 2026: «si lleva cinco pendientes de Nattal, el sexto
     * es de Nattal»). Varios pendientes en un mensaje llegan en `args.pendientes` y viven en `draft.items`.
     */
    async prepare({ user, args = {}, request, question, previous, attachments = [], evidence = question || '', defaults = {} }) {
      authorize(user);
      const ongoing = previous && !['CREATED','CANCELLED'].includes(previous.status);
      if (ongoing && previous.ownerId !== (user.userId || user.id)) throw knowledgeError('Este borrador pertenece a otra persona.', 403);
      // La cita acredita procedencia del mensaje actual, no interpreta por sí sola su intención ni autoriza
      // ejecutar. El modelo solo prepara; la creación sigue exigiendo el resumen y una confirmación posterior.
      const requestProblem = taskDraftRequestProblem({ request, question, ongoing: Boolean(ongoing), newDraft: args.nuevo === true });
      if (requestProblem) throw knowledgeError(requestProblem);
      const prior = ongoing && args.nuevo !== true ? previous : null;
      const draft = ongoing && args.nuevo !== true ? structuredClone(previous) : { id: randomUUID(), ownerId: user.userId || user.id, status: 'DRAFT', references: [], inputs: [], files: [] };
      const stage = taskDraftStage(draft);
      const today = bogotaDate(now());
      if (args.titulo != null) draft.title = bounded(args.titulo, 180, 'El título');
      if (args.contexto != null) draft.context = bounded(args.contexto, 8000, 'El contexto');
      if (args.cliente != null) {
        const reference = bounded(args.cliente, 160, 'El nombre del cliente');
        const resolved = await resolveClient({ reference, selection: args.seleccionCliente, question, request, prior });
        if (resolved) {
          const { chosen, candidates } = resolved;
          draft.client = chosen; draft.clientCandidates = candidates; draft.clientInferred = false;
          draft.clientReference = reference;
        }
      }
      // Una cuenta expresamente pedida pero aún no resuelta debe seguir siendo una pregunta, también en el
      // siguiente turno. Reenviar desde el modelo el nombre heredado no lo convierte en elección explícita.
      if (!draft.client && !draft.clientReference && !draft.clientCandidates?.length && defaults.client?.id) { draft.client = { id: defaults.client.id, name: defaults.client.name, slug: defaults.client.slug || null }; draft.clientInferred = true; }
      if (args.responsable != null) {
        const { chosen, candidates } = await findMember(bounded(args.responsable, 160, 'El nombre del responsable'), user);
        draft.assignee = chosen; draft.assigneeCandidates = candidates;
      }
      const dateInput = args.fecha ?? (stage === 'DATE' ? question : null);
      if (dateInput != null) draft.dueDate = resolveTaskDate(dateInput, today);
      const priority = readPriority(args.prioridad, args.prioridad != null);
      if (priority) draft.priority = priority;
      // Prioridad Normal salvo que la persona diga otra: ya no se pregunta (Rodny, 20 de octubre de 2026).
      if (!TASK_PRIORITIES.includes(draft.priority)) draft.priority = 'NORMAL';
      if (args.referencias != null) draft.references = links(args.referencias, evidence);
      if (args.insumos != null) draft.inputs = links(args.insumos, evidence);
      const byId = new Map([...(draft.files || []), ...attachments].map(file => [file.id, { id: file.id, name: file.name }]));
      if (byId.size > 5) throw knowledgeError('Usa hasta cinco archivos en el pendiente. No se descartó ningún insumo.');
      draft.files = [...byId.values()];
      if (materialDeclined(question, stage) || args.sinMaterial === true) draft.withoutMaterials = true;
      if (draft.references.length || draft.inputs.length || draft.files.length) draft.withoutMaterials = false;
      if (Array.isArray(args.pendientes) && args.pendientes.length) {
        if (args.pendientes.length > MAX_TASKS_PER_DRAFT) throw knowledgeError(`Puedo preparar hasta ${MAX_TASKS_PER_DRAFT} pendientes de una vez. Divídelos en dos mensajes.`);
        const previousItems = Array.isArray(draft.items) ? draft.items : [];
        const items = [];
        for (const [index, row] of args.pendientes.entries()) {
          const before = previousItems[index] || {};
          const item = { ...before, id: before.id || randomUUID() };
          if (row?.titulo != null) item.title = bounded(row.titulo, 180, `El título del pendiente ${index + 1}`);
          if (row?.contexto != null) item.context = bounded(row.contexto, 8000, `El contexto del pendiente ${index + 1}`);
          if (row?.cliente != null) {
            const reference = bounded(row.cliente, 160, 'El nombre del cliente');
            const itemPrior = prior?.items?.[index] || (args.pendientes.length === 1 && !prior?.items?.length ? prior : null);
            const resolved = await resolveClient({ reference, selection: row.seleccionCliente, question, request, prior: itemPrior });
            if (resolved) {
              const { chosen, candidates } = resolved;
              item.client = chosen || null; item.clientReference = reference; item.clientCandidates = candidates; item.clientInferred = false;
            }
          }
          if (row?.responsable != null) { const { chosen } = await findMember(bounded(row.responsable, 160, 'El nombre del responsable'), user); item.assignee = chosen || null; }
          if (row?.fecha != null) item.dueDate = resolveTaskDate(row.fecha, today);
          const own = readPriority(row?.prioridad, row?.prioridad != null);
          if (own) item.priority = own;
          items.push(item);
        }
        // Un solo pendiente en la lista es el pendiente de siempre.
        if (items.length === 1) {
          const item = items[0];
          Object.assign(draft, { title: item.title ?? draft.title, context: item.context ?? draft.context, dueDate: item.dueDate ?? draft.dueDate, priority: item.priority ?? draft.priority });
          if (Object.hasOwn(item, 'assignee')) draft.assignee = item.assignee;
          if (Object.hasOwn(item, 'client')) Object.assign(draft, { client: item.client, clientReference: item.clientReference, clientCandidates: item.clientCandidates, clientInferred: item.clientInferred });
          delete draft.items;
        }
        else draft.items = items;
      }
      return draft;
    },
    /**
     * Crea los pendientes del borrador confirmado, uno por uno y cada uno con su propio id (idempotente). En un lote,
     * una falla no frena a los demás: se cuenta en `tasks[].error`. Un solo pendiente que falla sigue lanzando.
     */
    async createConfirmedTask({ user, draft, question, loadAttachment, revalidate }) {
      authorize(user);
      if (readOnly) throw knowledgeError('Esta vista de investigación solo prepara borradores. Crea el pendiente desde la plataforma.', 403);
      if (!draft || draft.ownerId !== (user.userId || user.id) || taskDraftStage(draft) !== 'READY' || !isTaskConfirmation(question)) throw knowledgeError('Primero revisa el resumen completo y confirma crear el pendiente.');
      const items = taskDraftItems(draft);
      const results = [];
      for (const item of items) {
        try { results.push({ ...(await createOne({ user, item, loadAttachment, revalidate })), title: item.title, assignee: item.assignee.name, error: null }); }
        catch (failure) {
          if (items.length === 1) throw failure;
          results.push({ taskId: null, alreadyCreated: false, title: item.title, assignee: item.assignee.name, error: failure?.message || 'No se pudo crear.' });
        }
      }
      return { taskId: results.find(row => row.taskId)?.taskId || null, alreadyCreated: results.every(row => row.alreadyCreated), tasks: results };
    }
  };
  async function createOne({ user, item, loadAttachment, revalidate }) {
    const existing = await db.task.findUnique({ where: { id: item.id } });
    if (existing) {
      if (existing.creatorId !== (user.userId || user.id)) throw knowledgeError('No se pudo verificar este pendiente.', 409);
      return { taskId: existing.id, alreadyCreated: true };
    }
    const [client, member] = await Promise.all([db.client.findUnique({ where: { id: item.client.id } }), db.teamMember.findUnique({ where: { id: item.assignee.id } })]);
    if (!client || client.isArchived || !member?.isActive) throw knowledgeError('La cuenta o el responsable cambiaron. Ajusta el pendiente antes de crearlo.', 409);
    const copies = [];
    try {
      for (const file of item.files || []) {
        await revalidate?.();
        const original = await loadAttachment?.(file.id);
        if (!original?.buffer || !uploadFile) throw knowledgeError('No se pudo recuperar el insumo. Vuelve a adjuntarlo.', 409);
        const stored = await uploadFile({ originalname: original.name, mimetype: original.mime || 'application/octet-stream', buffer: original.buffer, size: original.buffer.length }, `tasks/${item.id}/inputs`, { maxBytes: 20 * 1024 * 1024 });
        copies.push(stored);
      }
      await revalidate?.(); authorize(user);
      const task = await createTask({ title: item.title, clientId: client.id, assigneeId: member.id, creatorId: user.userId || user.id, dueDate: `${item.dueDate}T12:00:00.000Z`, status: 'PENDIENTE', priority: item.priority, isPriority: item.priority !== 'NORMAL', comments: '', initial_comments: item.context ? [{ content: item.context }] : [], initial_references: item.references || [], initial_inputs: [...(item.inputs || []), ...copies.map(({ url, name }) => ({ url, name }))] }, { taskId: item.id, requireActiveClient: true });
      if (member.userId && member.userId !== (user.userId || user.id) && notify) {
        try { await notify({ userId: member.userId, type: 'TASK_ASSIGNED', relatedId: task.id, message: `Se te asignó un pendiente: ${item.title}` }); }
        catch (failure) { console.error('[BriaTask] Assignment notification failed:', failure?.message || failure); }
      }
      return { taskId: task.id, alreadyCreated: false };
    } catch (failure) {
      // A lost response after native creation must not remove a task's files or create a duplicate.
      let saved;
      try { saved = await db.task.findUnique({ where: { id: item.id } }); }
      catch { throw failure; } // An uncertain commit retains copies until the idempotent retry.
      if (saved?.creatorId === (user.userId || user.id)) return { taskId: saved.id, alreadyCreated: true };
      for (const file of copies) { try { await removeFile?.(file.key); } catch (cleanupError) { console.error('[BriaTask] Uncommitted input cleanup failed:', cleanupError?.message || cleanupError); } }
      throw failure;
    }
  }
};
