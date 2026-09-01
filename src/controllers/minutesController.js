import {
  getMeetingMinuteById,
  getMeetingMinutes,
  syncFirefliesMinutes
} from '../services/minuteAutomationService.js';

export const list = async (req, res) => {
  try {
    const minutes = await getMeetingMinutes({ status: req.query.status, limit: req.query.limit });
    return res.json({ minutes });
  } catch (error) {
    console.error('[MinutesController] Error listando minutas:', error.response?.data || error.message || error);
    return res.status(500).json({ error: 'MINUTES_LIST_FAILED', message: 'No fue posible cargar las minutas.' });
  }
};

export const detail = async (req, res) => {
  try {
    const minute = await getMeetingMinuteById({ id: req.params.id });
    if (!minute) return res.status(404).json({ error: 'MINUTE_NOT_FOUND' });
    return res.json({ minute });
  } catch (error) {
    console.error('[MinutesController] Error cargando minuta:', error.response?.data || error.message || error);
    return res.status(500).json({ error: 'MINUTE_DETAIL_FAILED', message: 'No fue posible cargar la minuta.' });
  }
};

export const sync = async (_req, res) => {
  try {
    const result = await syncFirefliesMinutes({ limit: 50 });
    return res.json(result);
  } catch (error) {
    console.error('[MinutesController] Error sincronizando Fireflies:', error.response?.data || error.message || error);
    return res.status(502).json({ error: 'MINUTES_SYNC_FAILED', message: 'Fireflies no pudo sincronizarse.' });
  }
};
