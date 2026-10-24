import { normalizeQuestion, MAX_QUESTION_LENGTH } from '../lib/briaAssistant.js';
import { knowledgeError } from '../lib/briaKnowledge.js';
import { validateAttachmentSelection, BRIA_AUDIO_MAX_BYTES } from '../lib/briaAttachments.js';
import { readBriaAttachment, attachmentModelPart } from './briaAttachmentReader.js';
import { isTaskDraftStarter, materialDeclined } from '../lib/briaTaskDraft.js';
import { DELETE_REASON_OPTIONS } from '../lib/briaDeleteDraft.js';
import { actionReply, actionStage, confirmsAction, cancelsAction, alreadyDoneReply, pendingActionOf, wrapLegacyAction, isLegacyAction, LEGACY_ACTIONS } from '../lib/briaActions.js';
import { createBriaActionService } from './briaActionService.js';
import { normalizeRating, turnPosition } from '../lib/briaRating.js';
// Una sola base (10 de octubre de 2026): crear pendiente, despachar y eliminar se resuelven aquí como cualquier otra
// acción. Sin `actions` propio, la base se arma con los tres servicios que lleguen (las vistas de prueba y de muestra).
const LEGACY_TOOL = { TASK_CREATE: 'preparar_pendiente', DISPATCH: 'preparar_despacho', TASK_DELETE: 'preparar_eliminacion' };
// Solo categorías conocidas, nunca texto, identificadores, argumentos ni títulos del chat.
const deniedTurnDiagnostic = (turn, phase) => ({
  phase,
  sourceKinds: [...new Set((turn.sources || []).map(source => ['tarea', 'tarea_resumen', 'documento', 'pieza', 'parrilla', 'minuta', 'ritmo', 'aprendizaje', 'cliente'].includes(source.kind) ? source.kind : 'otra'))],
  actionType: turn.pendingAction ? (Object.hasOwn(LEGACY_ACTIONS, turn.pendingAction.type) ? turn.pendingAction.type : 'OTHER') : null,
  toolsUsed: [...new Set((turn.toolsUsed || []).map(name => ['mis_tareas', 'buscar_pendientes', 'tareas_de_cliente', 'preparar_pendiente', 'preparar_despacho', 'preparar_eliminacion'].includes(name) ? name : 'otra'))]
});
/** El cliente del último pendiente creado en este chat (o del lote, si todos eran del mismo), leído de los turnos guardados. */
export const lastCreatedTaskClient = (turns = []) => {
  for (const turn of [...turns].reverse()) {
    const action = turn?.pendingAction || (turn?.taskDraft ? { type: 'TASK_CREATE', status: turn.taskDraft.status === 'CREATED' ? 'DONE' : 'DRAFT', draft: turn.taskDraft } : null);
    if (action?.type !== 'TASK_CREATE' || action.status !== 'DONE' || !action.draft) continue;
    const clients = (Array.isArray(action.draft.items) && action.draft.items.length ? action.draft.items.map((item) => item.client || action.draft.client) : [action.draft.client]).filter((client) => client?.id);
    if (!clients.length || clients.some((client) => client.id !== clients[0].id)) return null;
    return { id: clients[0].id, name: clients[0].name, slug: clients[0].slug || null };
  }
  return null;
};
export const createBriaConversationService = ({ repository, resolveActor, assistant, ai, taskDrafts, dispatchDrafts, deleteDrafts, actions = createBriaActionService({ taskDrafts, dispatchDrafts, deleteDrafts }), prepareAttachment = readBriaAttachment, authorizeTurn = async () => true, logger = console }) => {
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
    // Que Bria se mida (14 de octubre de 2026): la persona valora una respuesta de Bria de su propio chat. Solo un turno
    // de Bria; la pregunta de la persona no se valora. Devuelve el chat con la valoración puesta.
    async rate({ user, id, turnId, rating, note }) {
      const value = normalizeRating({ rating, note });
      const chat = await read(user, id);
      const turn = chat.turns.find(item => item.id === turnId);
      if (!turn) throw knowledgeError('No encontramos esa respuesta de Bria.', 404);
      if (turn.role !== 'assistant') throw knowledgeError('Solo se valora una respuesta de Bria.');
      const position = turnPosition(id, turnId);
      if (position == null) throw knowledgeError('No encontramos esa respuesta de Bria.', 404);
      const actor = await resolveActor(user);
      return sanitize(user, await repository.rateTurn(actor, id, position, { ...value, at: new Date().toISOString() }));
    },
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
    async send({ user, id, question, files = [], onEvent, session = null, expectedRevision }) {
      if (String(question || '').length > MAX_QUESTION_LENGTH) throw knowledgeError('Divide el mensaje en partes de hasta 12.000 caracteres.');
      if (expectedRevision !== undefined && (!Number.isSafeInteger(expectedRevision) || expectedRevision < 0)) throw knowledgeError('La revisión de la conversación no es válida.');
      const text = normalizeQuestion(question) || (files.length ? 'Analiza los archivos adjuntos.' : ''); if (!text) throw knowledgeError('Escribe un mensaje.');
      const actor = await resolveActor(user), key = `${actor.ref}:${id}`;
      if (pending.has(key)) throw knowledgeError('Bria está respondiendo en esta conversación.', 409);
      pending.add(key);
      try {
        const chat = await read(user, id);
        // WhatsApp ya leyó el turno al resolver un botón o un mensaje. No interpretar su respuesta sobre otra
        // revisión que haya llegado desde la plataforma entretanto; append vuelve a comprobarla al guardar.
        if (expectedRevision !== undefined && chat.revision !== expectedRevision) throw knowledgeError('La conversación cambió. Revisa su última respuesta antes de confirmar.', 409, 'BRIA_CONVERSATION_STALE');
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
        // El cliente del último pendiente creado en este chat se asume para el siguiente si la persona no nombra otro
        // (Rodny, 20 de octubre de 2026): la plataforma lo lee de los turnos guardados, nunca lo adivina el modelo.
        const taskDefaults = { client: lastCreatedTaskClient(chat.turns) };
        // «Crear un pendiente» arranca el borrador sin pasar por el modelo, como siempre.
        if (taskDrafts && !(open(pendingAction) && pendingAction.type === 'TASK_CREATE') && isTaskDraftStarter(text)) {
          pendingAction = wrapLegacyAction('TASK_CREATE', await taskDrafts.prepare({ user, question: text, request: { intent: 'PREPARE', evidence: text }, attachments: prepared, defaults: taskDefaults }));
        }
        const actionState = actionStage(pendingAction);
        const legacyStage = isLegacyAction(pendingAction) && open(pendingAction) ? LEGACY_ACTIONS[pendingAction.type].stage(pendingAction.draft) : null;
        const revalidateAction = async () => {
          await resolveActor(user);
          if (!await authorizeTurn(user, { pendingAction })) throw knowledgeError('Tu acceso para esta acción cambió.', 403);
        };
        const closeAction = (action, status) => ({ ...action, status, ...(action.draft ? { draft: { ...action.draft, status } } : {}) });
        const prepared_ = action => ({ ...actionReply(action), sources: [], failures: [], toolsUsed: [LEGACY_TOOL[action.type] || `accion:${action.type}`], pendingAction: action });
        // Un sí o un no dicho con naturalidad («dale, así está bien») solo cuenta si lo último que dijo Bria es el
        // resumen de esta acción. Un borrador de pendiente sobrevive a preguntas sueltas, y un «ok, gracias» varios
        // mensajes después no puede crear nada.
        const lastAssistant = [...chat.turns].reverse().find(turn => turn.role === 'assistant');
        const naturalReply = actionState === 'READY' && open(pendingAction) && Boolean(lastAssistant) && String(lastAssistant.text || '').trim() === String(actionReply(pendingAction).answer || '').trim();
        let result;
        if (pendingAction && cancelsAction(pendingAction, text, { natural: naturalReply }) && open(pendingAction)) {
          await revalidateAction();
          const cancelled = closeAction(pendingAction, 'CANCELLED');
          result = { ...actionReply(cancelled), sources: [], failures: [], toolsUsed: [], pendingAction: cancelled };
        } else if (actionState === 'DONE' && confirmsAction(pendingAction, text)) {
          await revalidateAction();
          result = { answer: alreadyDoneReply(pendingAction), sources: pendingAction.type === 'TASK_CREATE' && pendingAction.draft?.taskId ? [{ kind: 'tarea', id: pendingAction.draft.taskId }] : [], failures: [], pendingAction };
        } else if (actionState === 'READY' && confirmsAction(pendingAction, text, { natural: naturalReply }) && !files.length) {
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
          result = prepared_(wrapLegacyAction('TASK_CREATE', await taskDrafts.prepare({ user, previous: pendingAction.draft, question: text, request: { intent: 'ADJUST', evidence: text }, attachments: prepared, defaults: taskDefaults })));
        } else if (deleteDrafts && legacyStage === 'REASON' && pendingAction.type === 'TASK_DELETE' && DELETE_REASON_OPTIONS.some(option => option.toLowerCase() === text.toLowerCase())) {
          await revalidateAction();
          result = prepared_(wrapLegacyAction('TASK_DELETE', await deleteDrafts.prepare({ user, previous: pendingAction.draft, question: text, args: { tareas: [], motivo: text } }), { title: pendingAction.title }));
        } else {
          // Los archivos del chat, del más reciente al más viejo: el comprobante de un movimiento puede haber llegado antes.
          // Con su tipo: la pieza final de una pieza solo puede ser una foto o un video.
          const chatAttachments = [...prepared.map(file => ({ id: file.id, name: file.name, mime: file.mime, status: file.status, current: true })), ...previous.map(file => ({ id: file.id, name: file.name, mime: file.mime, status: file.status, current: false }))];
          // La lectura pertenece a una fecha concreta, aunque su nota ya no quepa en los últimos diez turnos.
          // `read` saneó antes los turnos: una nota que perdió acceso no puede aportar este contexto.
          const readingDay = chat.turns.find(turn => turn.role === 'assistant' && turn.note === 'LECTURA_MANANA')?.dayKey || null;
          result = await assistant.ask({ user, question: text, history: chat.turns.slice(-10), readingDay, attachments, chatAttachments, pendingAction: open(pendingAction) ? pendingAction : null, session, taskAttachments: prepared, taskDefaults, taskEvidence: [...chat.turns.filter(turn => turn.role === 'user').map(turn => turn.text), text].join('\n'), revalidateConversation, ...(onEvent ? { onEvent } : {}) });
          // Un borrador de pendiente, despacho o eliminación sobrevive a una pregunta suelta, como siempre; las demás
          // acciones solo valen sobre la respuesta inmediatamente anterior.
          if (!result.pendingAction && open(pendingAction) && isLegacyAction(pendingAction)) result.pendingAction = pendingAction;
        }
        const fresh = await resolveActor(user);
        const authorizedHistory = chat.turns.filter(turn => turn.role === 'assistant');
        const checks = [...authorizedHistory, { role: 'assistant', ...(typeof result === 'function' ? { pendingAction } : result) }];
        const deniedIndex = (await Promise.all(checks.map(turn => authorizeTurn(user, turn)))).findIndex(allowed => !allowed);
        if (deniedIndex !== -1) {
          logger.warn?.('[BriaConversation] BRIA_SOURCE_ACCESS_CHANGED', deniedTurnDiagnostic(checks[deniedIndex], deniedIndex < authorizedHistory.length ? 'history' : 'response'));
          throw knowledgeError('Tu acceso a las fuentes cambió durante la consulta.', 403, 'BRIA_SOURCE_ACCESS_CHANGED');
        }
        const saved = await repository.append(fresh, id, chat.revision, text, result, prepared);
        return sanitize(user, saved);
      } finally { pending.delete(key); }
    }
  };
};
