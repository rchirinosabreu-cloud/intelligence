import { getMeetingTaskInboxService } from '../services/meetingTaskInboxService.js';

const sendError = (res, error, fallback) => {
  console.error('[MeetingTaskInboxController]', error.response?.data || error.message || error);
  if (error.status && error.status < 500) return res.status(error.status).json({ error: 'MEETING_TASKS_REJECTED', message: error.message });
  return res.status(500).json({ error: 'MEETING_TASKS_FAILED', message: fallback });
};

export const createListHandler = (service = getMeetingTaskInboxService) => async (req, res) => {
  try { return res.json(await (await service()).list(req.user)); }
  catch (error) { return sendError(res, error, 'No pude cargar los pendientes de las reuniones.'); }
};

export const createApproveHandler = (service = getMeetingTaskInboxService) => async (req, res) => {
  try {
    const { minuteId, items } = req.body || {};
    return res.json(await (await service()).approve(req.user, { minuteId, items }));
  } catch (error) { return sendError(res, error, 'No pude crear los pendientes.'); }
};

export const createDiscardHandler = (service = getMeetingTaskInboxService) => async (req, res) => {
  try {
    const { minuteId, n, motivo, nota } = req.body || {};
    return res.json(await (await service()).discard(req.user, { minuteId, n, motivo, nota }));
  } catch (error) { return sendError(res, error, 'No pude descartar el compromiso.'); }
};

export const list = createListHandler();
export const approve = createApproveHandler();
export const discard = createDiscardHandler();
