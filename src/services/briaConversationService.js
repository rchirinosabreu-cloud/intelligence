import { normalizeQuestion, MAX_QUESTION_LENGTH } from '../lib/briaAssistant.js';
import { knowledgeError } from '../lib/briaKnowledge.js';
import { validateAttachmentSelection, BRIA_AUDIO_MAX_BYTES } from '../lib/briaAttachments.js';
import { readBriaAttachment, attachmentModelPart } from './briaAttachmentReader.js';
import { taskDraftReply, taskDraftStage, taskCreationIntent, isTaskConfirmation, isTaskCancellation, materialDeclined } from '../lib/briaTaskDraft.js';
export const createBriaConversationService = ({ repository, resolveActor, assistant, ai, taskDrafts, prepareAttachment = readBriaAttachment, authorizeTurn = async () => true }) => {
  const pending = new Set();
  const authorizeInput = async user => { const actor = await resolveActor(user); if (!['ADMIN', 'PROJECT_MANAGER'].includes(actor.role)) throw knowledgeError('Solo Admin y Project Manager pueden adjuntar o dictar.', 403); return actor; };
  const permitted = async (user, turn) => !turn.permissionChanged && await authorizeTurn(user, turn);
  const sanitize = async (user, row) => ({ ...row, turns: await Promise.all(row.turns.map(async turn => turn.role !== 'assistant' || await permitted(user, turn) ? turn : { id: turn.id, role: 'assistant', text: 'Tu acceso a las fuentes cambió. Vuelve a consultar para ver la información disponible ahora.', sources: [], failures: [] })) });
  const read = async (user, id) => {
    const actor = await resolveActor(user), row = await repository.get(actor, id);
    if (!row) throw knowledgeError('No encontramos esa conversación.', 404);
    await resolveActor(user);
    return sanitize(user, row);
  };
  return {
    async list(user) { const rows = await repository.list(await resolveActor(user)); await resolveActor(user); return rows; },
    async create(user) { return repository.create(await resolveActor(user)); },
    read,
    async remove(user, id, expectedRevision) {
      if (!Number.isInteger(expectedRevision) || expectedRevision < 0) throw knowledgeError('Recarga la conversación antes de borrarla.');
      return repository.remove(await resolveActor(user), id, expectedRevision);
    },
    authorizeInput,
    async transcribe(user, file) {
      await authorizeInput(user);
      if (!file?.buffer?.length || file.buffer.length > BRIA_AUDIO_MAX_BYTES || !/^(audio\/(webm|ogg|wav|x-wav|mpeg|mp4)|video\/(webm|mp4))(;.*)?$/.test(file.mimetype || '')) throw knowledgeError('Graba un audio compatible de hasta 20 MB.');
      const client = typeof ai === 'function' ? ai() : ai;
      if (!client?.transcribe) throw knowledgeError('La transcripción no está disponible ahora.', 503);
      let text;
      try { text = await client.transcribe({ buffer: file.buffer, mime: file.mimetype, name: file.originalname }); }
      catch (failure) {
        if (['AI_SCOPE_REQUIRED', 'AI_AUTHORIZATION_REQUIRED', 'AI_DESTINATION_INVALID'].includes(failure.code)) throw failure;
        console.error('[BriaDictation]', failure.code || failure.name);
        throw knowledgeError(failure.code === 'NO_SPEECH' ? 'No se reconocieron palabras. Intenta grabar de nuevo.' : 'No se pudo transcribir el dictado. Intenta nuevamente.', 503);
      }
      await resolveActor(user); return { text };
    },
    async download(user, id, fileId) {
      const actor = await resolveActor(user); await read(user, id);
      const file = await repository.attachment(actor, id, fileId);
      await resolveActor(user); if (!file) throw knowledgeError('No encontramos ese adjunto.', 404);
      return file;
    },
    async send({ user, id, question, files = [] }) {
      if (String(question || '').length > MAX_QUESTION_LENGTH) throw knowledgeError('Divide el mensaje en partes de hasta 12.000 caracteres.');
      const text = normalizeQuestion(question) || (files.length ? 'Analiza los archivos adjuntos.' : ''); if (!text) throw knowledgeError('Escribe un mensaje.');
      const actor = await resolveActor(user), key = `${actor.ref}:${id}`;
      if (pending.has(key)) throw knowledgeError('Bria está respondiendo en esta conversación.', 409);
      pending.add(key);
      try {
        const chat = await read(user, id);
        if (files.length) await authorizeInput(user);
        validateAttachmentSelection(files);
        const prepared = []; for (const file of files) { await resolveActor(user); prepared.push(await prepareAttachment(file)); }
        const previous = repository.attachments ? await repository.attachments(await resolveActor(user), id) : [];
        const relevant = [...prepared, ...previous].slice(0, 5);
        let availableText = 60000;
        const attachments = relevant.map(file => { const content = String(file.text || '').slice(0, availableText); availableText -= content.length; return { id: file.id, name: file.name, text: content, status: file.status, warning: content.length < String(file.text || '').length ? `${file.warning || ''} Contexto parcial del adjunto en esta respuesta.` : file.warning, modelPart: attachmentModelPart(file) }; });
        const revalidateConversation = async () => { if (!await repository.get(await resolveActor(user), id)) throw knowledgeError('La conversación fue eliminada.', 404); };
        let taskDraft = [...chat.turns].reverse().find(turn => turn.role === 'assistant' && turn.taskDraft)?.taskDraft;
        if (taskDrafts && (!taskDraft || ['CREATED','CANCELLED'].includes(taskDraft.status)) && taskCreationIntent(text) && !isTaskConfirmation(text)) {
          taskDraft = await taskDrafts.prepare({ user, question: text, attachments: prepared });
        }
        const stage = taskDraftStage(taskDraft);
        const revalidateTask = async () => {
          await resolveActor(user);
          if (!await authorizeTurn(user, { taskDraft })) throw knowledgeError('Tu acceso al pendiente cambió.', 403);
        };
        const taskResult = draft => ({ ...taskDraftReply(draft), sources: [], failures: [], toolsUsed: ['preparar_pendiente'], taskDraft: draft });
        let result;
        if (taskDrafts && taskDraft && isTaskCancellation(text) && !['CREATED','CANCELLED'].includes(stage)) {
          await revalidateTask(); result = taskResult({ ...taskDraft, status: 'CANCELLED' });
        } else if (taskDrafts && stage === 'CREATED' && isTaskConfirmation(text)) {
          await revalidateTask(); result = { answer: `Este pendiente ya está creado. [Abrir en Gestión](/gestion?taskId=${encodeURIComponent(taskDraft.taskId)})`, taskDraft, sources: [{ kind: 'tarea', id: taskDraft.taskId }], failures: [] };
        } else if (taskDrafts && stage === 'READY' && isTaskConfirmation(text) && !files.length) {
          await revalidateTask();
          // Run the write inside append, after its owned parent lock and revision check.
          result = async () => {
            await revalidateTask();
            const receipt = await taskDrafts.createConfirmedTask({ user, draft: taskDraft, question: text, revalidate: revalidateTask, loadAttachment: async fileId => repository.attachment(await resolveActor(user), id, fileId) });
            return { answer: `${receipt.alreadyCreated ? 'El pendiente ya estaba creado' : 'Pendiente creado'} para ${taskDraft.assignee.name}. Guardé el contexto como comentario${taskDraft.files?.length ? ' y los archivos como insumos' : ''}.\n\n[Abrir en Gestión](/gestion?taskId=${encodeURIComponent(receipt.taskId)})`, sources: [{ kind: 'tarea', id: receipt.taskId }], failures: [], toolsUsed: ['crear_pendiente'], taskDraft: { ...taskDraft, status: 'CREATED', taskId: receipt.taskId } };
          };
        } else if (taskDrafts && taskDraft && !['CREATED','CANCELLED'].includes(stage) && ((stage === 'PRIORITY' && /^(normal|alta|urgente)$/i.test(text)) || (stage === 'DATE' && /^(hoy|mañana|pasado mañana)$/i.test(text)) || (stage === 'MATERIAL' && materialDeclined(text, stage)))) {
          await revalidateTask(); result = taskResult(await taskDrafts.prepare({ user, previous: taskDraft, question: text, attachments: prepared }));
        } else {
          result = await assistant.ask({ user, question: text, history: chat.turns.slice(-10), attachments, taskDraft, taskAttachments: prepared, taskEvidence: [...chat.turns.filter(turn => turn.role === 'user').map(turn => turn.text), text].join('\n'), revalidateConversation });
          if (!result.taskDraft && taskDraft) result.taskDraft = taskDraft;
        }
        const fresh = await resolveActor(user);
        if (!(await Promise.all([...chat.turns.filter(turn => turn.role === 'assistant'), { role: 'assistant', ...(typeof result === 'function' ? { taskDraft } : result) }].map(turn => authorizeTurn(user, turn)))).every(Boolean)) throw knowledgeError('Tu acceso a las fuentes cambió durante la consulta.', 403);
        const saved = await repository.append(fresh, id, chat.revision, text, result, prepared);
        return sanitize(user, saved);
      } finally { pending.delete(key); }
    }
  };
};
