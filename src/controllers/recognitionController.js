import prisma from '../lib/prisma.js';
import { claimRecognition, acknowledgeRecognition } from '../services/recognitionService.js';

const uuid = value => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
export function createRecognitionHandlers(db = prisma) {
  const handler = action => async (req, res) => {
    try {
      const userId = req.user?.userId || req.user?.id;
      if (!userId) return res.status(401).json({ error: 'Usuario no autenticado.' });
      return await action(req, res, userId);
    } catch (error) {
      console.error('[Recognitions API]', error.response?.data || error.message);
      return res.status(error.statusCode || 500).json({ error: error.statusCode ? error.message : 'No se pudo consultar el reconocimiento. Se reintentará.' });
    }
  };
  return {
    claim: handler(async (req, res, userId) => {
      if (Object.keys(req.body || {}).length) return res.status(400).json({ error: 'La persona destinataria se obtiene de la sesión.' });
      res.set?.('Cache-Control', 'no-store');
      return res.json({ recognition: await claimRecognition(db, userId) });
    }),
    acknowledge: handler(async (req, res, userId) => {
      if (!uuid(req.params.id) || !uuid(req.body?.leaseToken) || Object.keys(req.body).some(key => key !== 'leaseToken')) return res.status(400).json({ error: 'Reserva inválida.' });
      return res.json(await acknowledgeRecognition(db, userId, req.params.id, req.body.leaseToken));
    }),
  };
}
