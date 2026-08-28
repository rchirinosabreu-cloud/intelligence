import { confirmExcessiveTaskWork, getMyExcessiveTaskAlerts } from '../services/excessiveTaskAlertService.js';

export const createGetMyExcessiveTaskAlertsHandler = ({ alertLoader = getMyExcessiveTaskAlerts } = {}) => (
  async (req, res) => {
    try {
      const tasks = await alertLoader(req.user?.userId);
      return res.json({ thresholdHours: 15, tasks });
    } catch (error) {
      console.error('[ExcessiveTaskAlert] Failed to load personal alerts:', error?.message || error);
      return res.status(500).json({ error: 'No se pudieron consultar las alertas de tiempo' });
    }
  }
);

export const getMyExcessiveTaskAlertsHandler = createGetMyExcessiveTaskAlertsHandler();

export const createConfirmExcessiveTaskWorkHandler = ({ confirmationWriter = confirmExcessiveTaskWork } = {}) => (
  async (req, res) => {
    try {
      const confirmation = await confirmationWriter(req.user?.userId, req.params.taskId);
      return res.json({ confirmed: true, ...confirmation });
    } catch (error) {
      if (error?.code === 'TASK_NOT_ASSIGNED') {
        return res.status(403).json({ error: 'Solo el responsable puede confirmar esta tarea activa' });
      }
      console.error('[ExcessiveTaskAlert] Failed to confirm continued work:', error?.message || error);
      return res.status(500).json({ error: 'No se pudo confirmar que continúas trabajando' });
    }
  }
);

export const confirmExcessiveTaskWorkHandler = createConfirmExcessiveTaskWorkHandler();
