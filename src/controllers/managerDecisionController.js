import { getManagerDecisionService } from '../services/managerDecisionService.js';

const sendError = (res, error, fallback) => {
  console.error('[ManagerDecisionController]', error.response?.data || error.message || error);
  if (error.status && error.status < 500) return res.status(error.status).json({ error: 'MANAGER_DECISION_REJECTED', message: error.message });
  // Una lectura que no se puede proyectar con los permisos vigentes dice por qué, no un genérico.
  if (error.status === 503) return res.status(503).json({ error: error.code || 'MANAGER_DECISIONS_UNAVAILABLE', message: error.message });
  return res.status(500).json({ error: 'MANAGER_DECISIONS_FAILED', message: fallback });
};

export const createBoardHandler = (service = getManagerDecisionService) => async (req, res) => {
  try {
    return res.json(await service().board(req.user));
  } catch (error) {
    return sendError(res, error, 'No pude cargar las decisiones de hoy.');
  }
};

export const createRespondHandler = (service = getManagerDecisionService) => async (req, res) => {
  try {
    const { source, id, ids, respuesta, motivo, nota, hasta } = req.body || {};
    return res.json(await service().respond(req.user, { source, id, ids, respuesta, motivo, nota, hasta }));
  } catch (error) {
    return sendError(res, error, 'No pude guardar tu respuesta.');
  }
};

export const board = createBoardHandler();
export const respond = createRespondHandler();
