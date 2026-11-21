import express from 'express';
import { Readable } from 'node:stream';
import { canUseBria } from '../../lib/briaLivingMemory.js';
import { getBriaVoiceService } from '../../services/briaVoiceService.js';

// La voz de Bria (20 de noviembre de 2026). `GET /` dice si hay voz para esta persona; `POST /speak` devuelve el audio
// de un texto que Bria ya respondió. Quién puede y cuánto lo decide el servicio. Vive bajo /api/bria.
const guard = (req, res, next) => canUseBria(req.user) ? next() : res.status(403).json({ message: 'Bria no está activada para tu cuenta.' });
guard.permission = { modules: ['bria'] };

export const createBriaVoiceRouter = ({ service } = {}) => {
  const router = express.Router();
  const voice = () => service || getBriaVoiceService();
  router.use((_req, res, next) => { res.setHeader('Cache-Control', 'no-store'); next(); });
  router.use(guard);
  router.get('/', (req, res) => res.json(voice().status(req.user)));
  router.post('/speak', async (req, res) => {
    const text = typeof req.body?.text === 'string' ? req.body.text : '';
    if (!text.trim() || text.length > 20000) return res.status(400).json({ message: 'No hay nada que decir.' });
    const abort = new AbortController(); res.on('close', () => { if (!res.writableEnded) abort.abort(); });
    try {
      const upstream = await voice().speak(req.user, { text, signal: abort.signal });
      res.setHeader('Content-Type', 'audio/mpeg');
      Readable.fromWeb(upstream.body).on('error', () => res.destroy()).pipe(res);
    } catch (failure) {
      if (abort.signal.aborted) return;
      if (!failure?.status || failure.status >= 500) console.error('[BriaVoice]', failure?.code || failure?.name || 'error');
      res.status(failure?.status || 502).json({ message: failure?.status ? failure.message : 'No se pudo generar la voz.', code: failure?.code });
    }
  });
  return router;
};
