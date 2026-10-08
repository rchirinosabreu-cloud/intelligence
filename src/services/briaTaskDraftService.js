import { randomUUID } from 'node:crypto';
import { canUseBria } from '../lib/briaLivingMemory.js';
import { hasModulePermission } from '../config/security.js';
import { bogotaDate } from '../lib/colombiaBusinessDays.js';
import { knowledgeError } from '../lib/briaKnowledge.js';
import { resolveTaskDate, taskDraftStage, taskCreationIntent, materialDeclined, isTaskConfirmation } from '../lib/briaTaskDraft.js';
const tidy = value => String(value || '').normalize('NFKC').trim();
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
export const createBriaTaskDraftService = ({ db, createTask, uploadFile, removeFile, notify, now = () => new Date(), readOnly = false } = {}) => ({
  async prepare({ user, args = {}, question, previous, attachments = [], evidence = question || '' }) {
    authorize(user);
    const ongoing = previous && !['CREATED','CANCELLED'].includes(previous.status);
    if ((!ongoing || args.nuevo === true) && !taskCreationIntent(question)) throw knowledgeError('Pide explícitamente crear un pendiente para preparar su borrador.');
    if (ongoing && previous.ownerId !== (user.userId || user.id)) throw knowledgeError('Este borrador pertenece a otra persona.', 403);
    const draft = ongoing && args.nuevo !== true ? structuredClone(previous) : { id: randomUUID(), ownerId: user.userId || user.id, status: 'DRAFT', references: [], inputs: [], files: [] };
    const stage = taskDraftStage(draft);
    if (args.titulo != null) draft.title = bounded(args.titulo, 180, 'El título');
    if (args.contexto != null) draft.context = bounded(args.contexto, 8000, 'El contexto');
    if (args.cliente != null) {
      const term = bounded(args.cliente, 160, 'El nombre del cliente');
      const rows = term ? await db.client.findMany({ where: { isArchived: false, OR: [{ name: { contains: term, mode: 'insensitive' } }, { slug: { equals: term, mode: 'insensitive' } }] }, select: { id: true, name: true, slug: true, isArchived: true }, orderBy: { name: 'asc' }, take: 6 }) : [];
      draft.client = pick(rows.filter(row => !row.isArchived), term); draft.clientCandidates = rows.map(({ id, name, slug }) => ({ id, name, slug }));
    }
    if (args.responsable != null) {
      const term = bounded(args.responsable, 160, 'El nombre del responsable');
      const rows = term ? await db.teamMember.findMany({ where: { isActive: true, OR: [{ name: { contains: term, mode: 'insensitive' } }, { email: { equals: term, mode: 'insensitive' } }] }, select: { id: true, name: true, role: true, email: true, isActive: true, userId: true }, orderBy: { name: 'asc' }, take: 6 }) : [];
      draft.assignee = pick(rows.filter(row => row.isActive), term); draft.assigneeCandidates = rows.map(({ id, name, role }) => ({ id, name, role }));
    }
    const dateInput = args.fecha ?? (stage === 'DATE' ? question : null);
    if (dateInput != null) draft.dueDate = resolveTaskDate(dateInput, bogotaDate(now()));
    const priorityInput = args.prioridad ?? (stage === 'PRIORITY' ? question : null);
    if (priorityInput != null) {
      const priority = tidy(priorityInput).toUpperCase();
      if (['NORMAL','ALTA','URGENTE'].includes(priority)) draft.priority = priority;
      else if (args.prioridad != null) throw knowledgeError('Elige prioridad normal, alta o urgente.');
    }
    if (args.referencias != null) draft.references = links(args.referencias, evidence);
    if (args.insumos != null) draft.inputs = links(args.insumos, evidence);
    const byId = new Map([...(draft.files || []), ...attachments].map(file => [file.id, { id: file.id, name: file.name }]));
    if (byId.size > 5) throw knowledgeError('Usa hasta cinco archivos en el pendiente. No se descartó ningún insumo.');
    draft.files = [...byId.values()];
    if (materialDeclined(question, stage)) draft.withoutMaterials = true;
    if (args.sinMaterial === true && !draft.withoutMaterials) throw knowledgeError('Hace falta que confirmes si continuamos sin referencias ni insumos.');
    if (draft.references.length || draft.inputs.length || draft.files.length) draft.withoutMaterials = false;
    return draft;
  },
  async confirm({ user, draft, question, loadAttachment, revalidate }) {
    authorize(user);
    if (readOnly) throw knowledgeError('Esta vista de investigación solo prepara borradores. Crea el pendiente desde la plataforma.', 403);
    if (!draft || draft.ownerId !== (user.userId || user.id) || taskDraftStage(draft) !== 'READY' || !isTaskConfirmation(question)) throw knowledgeError('Primero revisa el resumen completo y confirma crear el pendiente.');
    const existing = await db.task.findUnique({ where: { id: draft.id } });
    if (existing) {
      if (existing.creatorId !== (user.userId || user.id)) throw knowledgeError('No se pudo verificar este pendiente.', 409);
      return { taskId: existing.id, alreadyCreated: true };
    }
    const [client, member] = await Promise.all([db.client.findUnique({ where: { id: draft.client.id } }), db.teamMember.findUnique({ where: { id: draft.assignee.id } })]);
    if (!client || client.isArchived || !member?.isActive) throw knowledgeError('La cuenta o el responsable cambiaron. Ajusta el pendiente antes de crearlo.', 409);
    const copies = [];
    try {
      for (const file of draft.files || []) {
        await revalidate?.();
        const original = await loadAttachment?.(file.id);
        if (!original?.buffer || !uploadFile) throw knowledgeError('No se pudo recuperar el insumo. Vuelve a adjuntarlo.', 409);
        const stored = await uploadFile({ originalname: original.name, mimetype: original.mime || 'application/octet-stream', buffer: original.buffer, size: original.buffer.length }, `tasks/${draft.id}/inputs`, { maxBytes: 20 * 1024 * 1024 });
        copies.push(stored);
      }
      await revalidate?.(); authorize(user);
      const task = await createTask({ title: draft.title, clientId: client.id, assigneeId: member.id, creatorId: user.userId || user.id, dueDate: `${draft.dueDate}T12:00:00.000Z`, status: 'PENDIENTE', priority: draft.priority, isPriority: draft.priority !== 'NORMAL', comments: '', initial_comments: [{ content: draft.context }], initial_references: draft.references || [], initial_inputs: [...(draft.inputs || []), ...copies.map(({ url, name }) => ({ url, name }))] }, { taskId: draft.id });
      if (member.userId && member.userId !== (user.userId || user.id) && notify) {
        try { await notify({ userId: member.userId, type: 'TASK_ASSIGNED', relatedId: task.id, message: `Se te asignó un pendiente: ${draft.title}` }); }
        catch (failure) { console.error('[BriaTask] Assignment notification failed:', failure?.message || failure); }
      }
      return { taskId: task.id, alreadyCreated: false };
    } catch (failure) {
      // A lost response after native creation must not remove a task's files or create a duplicate.
      let saved;
      try { saved = await db.task.findUnique({ where: { id: draft.id } }); }
      catch { throw failure; } // An uncertain commit retains copies until the idempotent retry.
      if (saved?.creatorId === (user.userId || user.id)) return { taskId: saved.id, alreadyCreated: true };
      for (const file of copies) { try { await removeFile?.(file.key); } catch (cleanupError) { console.error('[BriaTask] Uncommitted input cleanup failed:', cleanupError?.message || cleanupError); } }
      throw failure;
    }
  }
});
