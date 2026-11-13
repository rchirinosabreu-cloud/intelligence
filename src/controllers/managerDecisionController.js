import { getManagerDecisionService } from '../services/managerDecisionService.js';
import { getMeetingTaskInboxService } from '../services/meetingTaskInboxService.js';

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

// El punto del menú reúne las decisiones y los pendientes de reuniones (13 de noviembre de 2026): una bandeja que no
// se pueda leer no apaga la otra.
export const createPulseHandler = (service = getManagerDecisionService, inbox = getMeetingTaskInboxService) => async (req, res) => {
  const meetings = async () => {
    try { return (await (await inbox()).pulse(req.user)).keys || []; }
    catch (error) { console.error('[ManagerDecisionController] Sin los pendientes de reuniones en el pulso:', error.response?.data || error.message || error); return []; }
  };
  try {
    const decisions = await service().pulse(req.user);
    return res.json({ keys: [...decisions.keys, ...await meetings()] });
  } catch (error) {
    // Sin Bria no hay decisiones que avisar (12 de noviembre de 2026): «nada nuevo», no «sin permiso». Un 403 aquí
    // hacía saltar el aviso global en cada pantalla a quien tiene Manager pero no Bria.
    if (error.code === 'BRIA_DISABLED') return res.json({ keys: await meetings() });
    return sendError(res, error, 'No pude saber si hay decisiones nuevas.');
  }
};

export const board = createBoardHandler();
export const pulse = createPulseHandler();
export const respond = createRespondHandler();
