import { normalizeQuestion, MAX_QUESTION_LENGTH } from '../lib/briaAssistant.js';
import { knowledgeError } from '../lib/briaKnowledge.js';
import { validateAttachmentSelection, BRIA_AUDIO_MAX_BYTES } from '../lib/briaAttachments.js';
import { readBriaAttachment, attachmentModelPart } from './briaAttachmentReader.js';
import { taskCreationIntent, isTaskConfirmation, materialDeclined } from '../lib/briaTaskDraft.js';
import { DELETE_REASON_OPTIONS } from '../lib/briaDeleteDraft.js';
import { actionReply, actionStage, confirmsAction, cancelsAction, alreadyDoneReply, pendingActionOf, wrapLegacyAction, isLegacyAction, LEGACY_ACTIONS } from '../lib/briaActions.js';
import { createBriaActionService } from './briaActionService.js';
// Una sola base (10 de octubre de 2026): crear pendiente, despachar y eliminar se resuelven aquí como cualquier otra
// acción. Sin `actions` propio, la base se arma con los tres servicios que lleguen (las vistas de prueba y de muestra).
const LEGACY_TOOL = { TASK_CREATE: 'preparar_pendiente', DISPATCH: 'preparar_despacho', TASK_DELETE: 'preparar_eliminacion' };
export const createBriaConversationService = ({ repository, resolveActor, assistant, ai, taskDrafts, dispatchDrafts, deleteDrafts, actions = createBriaActionService({ taskDrafts, dispatchDrafts, deleteDrafts }), prepareAttachment = readBriaAttachment, authorizeTurn = async () => true }) => {
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
    // `session` trae el token con el que la persona abrió el chat: Bria lo usa para hablar con la API como ella
    // (10 de octubre de 2026). Vive en esta petición y nunca se guarda en la conversación.
    async send({ user, id, question, files = [], onEvent, session = null }) {
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
        // Acciones de Bria en la plataforma (10 de octubre de 2026): solo la de la respuesta inmediatamente anterior se
        // puede confirmar o cancelar, y se ejecuta dentro de append, con la conversación bloqueada y su revisión comprobada.
        // Crear pendiente, despachar y eliminar viajan por esta misma base: conservan sus frases («Crear pendiente»,
        // «Despachar a producción», «Eliminar pendiente»), sus atajos y su borrador, y además aceptan «Confirmar».
        let pendingAction = pendingActionOf(chat.turns);
        const open = action => action && !['DONE', 'CANCELLED'].includes(action.status);
        // «Crear un pendiente» arranca el borrador sin pasar por el modelo, como siempre.
        if (taskDrafts && !(open(pendingAction) && pendingAction.type === 'TASK_CREATE') && taskCreationIntent(text) && !isTaskConfirmation(text)) {
          pendingAction = wrapLegacyAction('TASK_CREATE', await taskDrafts.prepare({ user, question: text, attachments: prepared }));
        }
        const actionState = actionStage(pendingAction);
        const legacyStage = isLegacyAction(pendingAction) && open(pendingAction) ? LEGACY_ACTIONS[pendingAction.type].stage(pendingAction.draft) : null;
        const revalidateAction = async () => {
          await resolveActor(user);
          if (!await authorizeTurn(user, { pendingAction })) throw knowledgeError('Tu acceso para esta acción cambió.', 403);
        };
        const closeAction = (action, status) => ({ ...action, status, ...(action.draft ? { draft: { ...action.draft, status } } : {}) });
        const prepared_ = action => ({ ...actionReply(action), sources: [], failures: [], toolsUsed: [LEGACY_TOOL[action.type] || `accion:${action.type}`], pendingAction: action });
        let result;
        if (pendingAction && cancelsAction(pendingAction, text) && open(pendingAction)) {
          await revalidateAction();
          const cancelled = closeAction(pendingAction, 'CANCELLED');
          result = { ...actionReply(cancelled), sources: [], failures: [], toolsUsed: [], pendingAction: cancelled };
        } else if (actionState === 'DONE' && confirmsAction(pendingAction, text)) {
          await revalidateAction();
          result = { answer: alreadyDoneReply(pendingAction), sources: pendingAction.type === 'TASK_CREATE' && pendingAction.draft?.taskId ? [{ kind: 'tarea', id: pendingAction.draft.taskId }] : [], failures: [], pendingAction };
        } else if (actionState === 'READY' && confirmsAction(pendingAction, text) && !files.length) {
          await revalidateAction();
          // La escritura corre dentro de append, después del bloqueo de la conversación y de comprobar su revisión.
          result = async () => {
            await revalidateAction();
            const outcome = await actions.execute({ user, action: pendingAction, revalidate: revalidateAction, session, loadAttachment: async fileId => repository.attachment(await resolveActor(user), id, fileId) });
            const done = { ...pendingAction, status: 'DONE', result: outcome.text, ...(outcome.patch || {}) };
            return { answer: outcome.text, sources: outcome.sources || [], failures: [], toolsUsed: outcome.toolsUsed || [`accion:${pendingAction.type}`], pendingAction: done };
          };
        } else if (taskDrafts && legacyStage && pendingAction.type === 'TASK_CREATE' && ((legacyStage === 'PRIORITY' && /^(normal|alta|urgente)$/i.test(text)) || (legacyStage === 'DATE' && /^(hoy|mañana|pasado mañana)$/i.test(text)) || (legacyStage === 'MATERIAL' && materialDeclined(text, legacyStage)))) {
          // Los botones del borrador se responden sin pasar por el modelo.
          await revalidateAction();
          result = prepared_(wrapLegacyAction('TASK_CREATE', await taskDrafts.prepare({ user, previous: pendingAction.draft, question: text, attachments: prepared })));
        } else if (deleteDrafts && legacyStage === 'REASON' && pendingAction.type === 'TASK_DELETE' && DELETE_REASON_OPTIONS.some(option => option.toLowerCase() === text.toLowerCase())) {
          await revalidateAction();
          result = prepared_(wrapLegacyAction('TASK_DELETE', await deleteDrafts.prepare({ user, previous: pendingAction.draft, question: text, args: { tareas: [], motivo: text } }), { title: pendingAction.title }));
        } else {
          result = await assistant.ask({ user, question: text, history: chat.turns.slice(-10), attachments, pendingAction: open(pendingAction) ? pendingAction : null, session, taskAttachments: prepared, taskEvidence: [...chat.turns.filter(turn => turn.role === 'user').map(turn => turn.text), text].join('\n'), revalidateConversation, ...(onEvent ? { onEvent } : {}) });
          // Un borrador de pendiente, despacho o eliminación sobrevive a una pregunta suelta, como siempre; las demás
          // acciones solo valen sobre la respuesta inmediatamente anterior.
          if (!result.pendingAction && open(pendingAction) && isLegacyAction(pendingAction)) result.pendingAction = pendingAction;
        }
        const fresh = await resolveActor(user);
        if (!(await Promise.all([...chat.turns.filter(turn => turn.role === 'assistant'), { role: 'assistant', ...(typeof result === 'function' ? { pendingAction } : result) }].map(turn => authorizeTurn(user, turn)))).every(Boolean)) throw knowledgeError('Tu acceso a las fuentes cambió durante la consulta.', 403);
        const saved = await repository.append(fresh, id, chat.revision, text, result, prepared);
        return sanitize(user, saved);
      } finally { pending.delete(key); }
    }
  };
};
