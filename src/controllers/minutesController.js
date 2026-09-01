import {
  getMeetingMinuteById,
  getMeetingMinutes,
  permanentlyDeleteMeetingMinute,
  restoreMeetingMinute,
  trashMeetingMinute,
  syncFirefliesMinutes
} from '../services/minuteAutomationService.js';

export const list = async (req, res) => {
  try {
    const minutes = await getMeetingMinutes({
      status: req.query.status,
      limit: req.query.limit
    });
    return res.json({ minutes });
  } catch (error) {
    console.error('[MinutesController] Error listando minutas:', error.response?.data || error.message || error);
    return res.status(500).json({ error: 'MINUTES_LIST_FAILED', message: 'No fue posible cargar las minutas.' });
  }
};

export const listTrash = async (req, res) => {
  try {
    const minutes = await getMeetingMinutes({ limit: req.query.limit, includeTrash: true });
    return res.json({ minutes });
  } catch (error) {
    console.error('[MinutesController] Error listando papelera de minutas:', error.response?.data || error.message || error);
    return res.status(500).json({ error: 'MINUTES_TRASH_LIST_FAILED', message: 'No fue posible cargar la Papelera.' });
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

export const trash = async (req, res) => {
  try {
    const minute = await trashMeetingMinute({ id: req.params.id });
    return res.json({ minute });
  } catch (error) {
    console.error('[MinutesController] Error enviando minuta a papelera:', error.response?.data || error.message || error);
    return res.status(error.code === 'P2025' ? 404 : 500).json({
      error: error.code || 'MINUTE_TRASH_FAILED',
      message: error.code === 'P2025' ? 'La minuta no existe.' : 'No fue posible enviar la minuta a la Papelera.'
    });
  }
};

export const restore = async (req, res) => {
  try {
    const minute = await restoreMeetingMinute({ id: req.params.id });
    return res.json({ minute });
  } catch (error) {
    console.error('[MinutesController] Error restaurando minuta:', error.response?.data || error.message || error);
    return res.status(error.code === 'P2025' ? 404 : 500).json({
      error: error.code || 'MINUTE_RESTORE_FAILED',
      message: error.code === 'P2025' ? 'La minuta no existe.' : 'No fue posible restaurar la minuta.'
    });
  }
};

export const removePermanently = async (req, res) => {
  try {
    await permanentlyDeleteMeetingMinute({ id: req.params.id });
    return res.json({ success: true });
  } catch (error) {
    console.error('[MinutesController] Error eliminando minuta permanentemente:', error.response?.data || error.message || error);
    const status = error.code === 'MINUTE_NOT_IN_TRASH' ? 409 : error.code === 'P2025' ? 404 : 500;
    return res.status(status).json({
      error: error.code || 'MINUTE_PERMANENT_DELETE_FAILED',
      message: status === 500 ? 'No fue posible eliminar la minuta del almacenamiento.' : error.message
    });
  }
};
