import { normalizeQuestion, MAX_QUESTION_LENGTH } from '../lib/briaAssistant.js';
import { knowledgeError } from '../lib/briaKnowledge.js';
import { validateAttachmentSelection, BRIA_AUDIO_MAX_BYTES } from '../lib/briaAttachments.js';
import { readBriaAttachment, attachmentModelPart } from './briaAttachmentReader.js';
export const createBriaConversationService = ({ repository, resolveActor, assistant, ai, prepareAttachment = readBriaAttachment, authorizeTurn = async () => true }) => {
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
        const result = await assistant.ask({ user, question: text, history: chat.turns.slice(-10), attachments });
        const fresh = await resolveActor(user);
        if (!(await Promise.all([...chat.turns.filter(turn => turn.role === 'assistant'), { role: 'assistant', ...result }].map(turn => authorizeTurn(user, turn)))).every(Boolean)) throw knowledgeError('Tu acceso a las fuentes cambió durante la consulta.', 403);
        const saved = await repository.append(fresh, id, chat.revision, text, result, prepared);
        return sanitize(user, saved);
      } finally { pending.delete(key); }
    }
  };
};
