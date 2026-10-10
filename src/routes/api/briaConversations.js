import express from 'express';
import multer from 'multer';
import { BRIA_FILE_MAX_BYTES, BRIA_FILES_MAX_COUNT, BRIA_AUDIO_MAX_BYTES } from '../../lib/briaAttachments.js';
import { canUseBria } from '../../lib/briaLivingMemory.js';
import { createRateLimiter } from '../../config/security.js';
const uuid = value => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value || '');
export const createBriaConversationRouter = ({ service } = {}) => {
  const router = express.Router();
  const resolve = async () => service || (await import('../../services/briaConversationApplication.js')).getApplicationConversationService();
  router.use((_req, res, next) => { res.setHeader('Cache-Control', 'no-store'); next(); });
  router.use((req, res, next) => canUseBria(req.user) ? next() : res.status(403).json({ message: 'Bria no está activada para tu cuenta.' }));
  router.use(createRateLimiter({ windowMs: 60000, max: 40, keyGenerator: req => req.user?.userId || req.user?.id || req.ip }));
  // Preserve provenance in the service for fresh authorization, never expose its catalogue in chat.
  const strip = result => (result?.turns ? { ...result, turns: result.turns.map(({ sources: _sources, ...turn }) => turn) } : result);
  const failureOf = failure => { const status = Number.isInteger(failure.status) ? failure.status : 500; if (status === 500) console.error('[BriaConversation]', failure.code || failure.name); return { status, message: status === 500 ? 'No se pudo abrir o continuar la conversación.' : failure.message }; };
  const handle = work => async (req, res) => {
    try {
      const result = await work(req, await resolve());
      res.status(result?.filesPending ? 202 : 200).json(strip(result));
    }
    catch (failure) { const { status, message } = failureOf(failure); res.status(status).json({ message }); }
  };
  // Respuesta en vivo (9 de octubre de 2026): con `Accept: text/event-stream` se mandan los avances a medida que
  // pasan (qué está haciendo Bria, el texto que va escribiendo, «borra lo escrito») y al final el chat guardado, que
  // es el que manda. Un error que llega después de abrir el flujo va como evento, en palabras.
  const wantsStream = req => String(req.headers.accept || '').includes('text/event-stream');
  const stream = async (req, res, send) => {
    res.status(200);
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store, no-transform');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders?.();
    let open = true;
    res.once('close', () => { open = false; });
    const write = event => { if (open) res.write(`data: ${JSON.stringify(event)}\n\n`); };
    try { write({ type: 'done', chat: strip(await send(write)) }); }
    catch (failure) { write({ type: 'error', ...failureOf(failure) }); }
    res.end();
  };
  const receive = middleware => (req, res, next) => middleware(req, res, error => {
    if (error) return res.status(400).json({ message: error.code === 'LIMIT_FILE_SIZE' ? 'Cada archivo puede pesar hasta 20 MB.' : 'Puedes adjuntar hasta 5 archivos por mensaje.' });
    next();
  });
  const audio = multer({ storage: multer.memoryStorage(), limits: { fileSize: BRIA_AUDIO_MAX_BYTES, files: 1, fields: 0, parts: 2 } });
  const files = multer({ storage: multer.memoryStorage(), limits: { fileSize: BRIA_FILE_MAX_BYTES, files: BRIA_FILES_MAX_COUNT, fields: 4, fieldSize: 48000, parts: BRIA_FILES_MAX_COUNT + 5 } });
  const authorizeInput = async (req, res, next) => { try { const instance = await resolve(); await instance.authorizeInput?.(req.user); next(); } catch (failure) { res.status(failure.status || 500).json({ message: failure.status ? failure.message : 'No se pudo verificar tu acceso.' }); } };
  router.post('/dictation', authorizeInput, receive(audio.single('audio')), handle((req, instance) => instance.transcribe(req.user, req.file)));
  router.use('/:id', (req, res, next) => uuid(req.params.id) ? next() : res.status(400).json({ message: 'Conversación no válida.' }));
  // Check ownership/fresh session before buffering a multipart request.
  router.post('/:id/messages', authorizeInput, async (req, res, next) => {
    try { await (await resolve()).read(req.user, req.params.id); next(); }
    catch (failure) { res.status(failure.status || 500).json({ message: failure.status ? failure.message : 'No se pudo abrir la conversación.' }); }
  }, receive(files.array('files', BRIA_FILES_MAX_COUNT)), async (req, res, next) => {
    if (!wantsStream(req)) return next();
    const instance = await resolve();
    return stream(req, res, onEvent => instance.send({ user: req.user, id: req.params.id, question: req.body?.question, files: req.files || [], onEvent }));
  }, handle((req, instance) => instance.send({ user: req.user, id: req.params.id, question: req.body?.question, files: req.files || [] })));
  router.get('/:id/attachments/:fileId', async (req, res) => {
    try {
      if (!uuid(req.params.fileId)) return res.status(400).json({ message: 'Adjunto no válido.' });
      const file = await (await resolve()).download(req.user, req.params.id, req.params.fileId);
      res.setHeader('X-Content-Type-Options', 'nosniff'); res.setHeader('Cache-Control', 'no-store');
      res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(file.name)}`);
      res.type('application/octet-stream').send(file.buffer);
    } catch (failure) { console.error('[BriaAttachment]', failure.code || failure.name); res.status(failure.status || 500).json({ message: failure.status ? failure.message : 'No se pudo descargar el adjunto.' }); }
  });
  router.get('/', handle((req, instance) => instance.list(req.user)));
  router.post('/', handle((req, instance) => instance.create(req.user)));
  router.get('/:id', handle((req, instance) => instance.read(req.user, req.params.id)));
  router.delete('/:id', handle((req, instance) => instance.remove(req.user, req.params.id, req.body?.expectedRevision)));
  return router;
};
