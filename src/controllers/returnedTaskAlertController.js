import {
  getMyReturnedTaskAlerts,
  snoozeReturnedTaskReminder,
} from '../services/returnedTaskAlertService.js';

export const createGetMyReturnedTaskAlertsHandler = ({ alertLoader = getMyReturnedTaskAlerts } = {}) => (
  async (req, res) => {
    try {
      const tasks = await alertLoader(req.user?.userId);
      return res.json({ thresholdMinutes: 60, tasks });
    } catch (error) {
      console.error('[ReturnedTaskAlert] Failed to load personal alerts:', error?.response?.data || error);
      return res.status(500).json({ error: 'No se pudieron consultar las tareas devueltas pendientes' });
    }
  }
);

export const getMyReturnedTaskAlertsHandler = createGetMyReturnedTaskAlertsHandler();

export const createSnoozeReturnedTaskReminderHandler = ({ snoozeWriter = snoozeReturnedTaskReminder } = {}) => (
  async (req, res) => {
    try {
      const reminder = await snoozeWriter(req.user?.userId, req.params.taskId);
      return res.json({ snoozed: true, ...reminder });
    } catch (error) {
      if (error?.code === 'RETURNED_TASK_NOT_OWNED') {
        return res.status(403).json({ error: 'Solo quien creó la tarea puede posponer este recordatorio' });
      }
      console.error('[ReturnedTaskAlert] Failed to snooze reminder:', error?.response?.data || error);
      return res.status(500).json({ error: 'No se pudo posponer el recordatorio' });
    }
  }
);

export const snoozeReturnedTaskReminderHandler = createSnoozeReturnedTaskReminderHandler();
