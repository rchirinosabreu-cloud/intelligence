// `POST /api/bria/ask`: la puerta de la asistente. Quien pregunta es quien está en la sesión (nunca un
// usuario del cuerpo), la pregunta es obligatoria, hay un tope por persona y minuto, y un fallo del
// servidor nunca cuenta detalles técnicos. Un bloqueo de Gobierno de IA llega con su mensaje tal cual.

import express from 'express';
import { createRateLimiter } from '../../config/security.js';

const defaultRateLimiter = () => createRateLimiter({ windowMs: 60_000, max: 20, keyGenerator: (req) => req.user?.userId || req.ip });

export const createBriaAssistantRouter = ({ service, rateLimiter = defaultRateLimiter(), logger = console } = {}) => {
  const router = express.Router();
  const resolveService = async () => service || (await import('../../services/briaAssistantService.js')).briaAssistantService;

  router.post('/ask', rateLimiter, async (req, res) => {
    try {
      const assistant = await resolveService();
      const result = await assistant.ask({ user: req.user, question: req.body?.question, history: req.body?.history });
      return res.json(result);
    } catch (error) {
      // Un error con estado propio (pregunta vacía, Bria apagada, Gobierno de IA) se explica tal cual; lo
      // inesperado se registra entero en el servidor y al navegador va solo que no se pudo.
      const status = Number.isInteger(error?.status) ? error.status : 500;
      if (!Number.isInteger(error?.status)) {
        logger.error('[BriaAssistant] No se pudo responder:', error?.response?.data || error?.message || error);
        return res.status(500).json({ error: 'BRIA_ASSISTANT_FAILED', message: 'Bria no pudo responder. Intenta de nuevo en un momento.' });
      }
      return res.status(status).json({ error: error.code || 'BRIA_ASSISTANT_ERROR', message: error.message });
    }
  });

  return router;
};
