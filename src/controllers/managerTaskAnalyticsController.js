import { getManagerTaskAnalytics } from '../services/managerTaskAnalyticsService.js';

export const createManagerTaskAnalyticsHandler = (loadAnalytics = getManagerTaskAnalytics) => async (req, res) => {
  const requestedDays = Number(req.query?.days);
  const periodDays = [7, 30, 90].includes(requestedDays) ? requestedDays : 30;
  try {
    const analytics = await loadAnalytics({ periodDays });
    return res.json(analytics);
  } catch (error) {
    console.error('[ManagerTaskAnalytics] Failed to build descriptive panel:', error);
    return res.status(500).json({
      error: 'No fue posible cargar el panel descriptivo de tareas',
      details: error.message,
    });
  }
};

export const getTaskAnalytics = createManagerTaskAnalyticsHandler();
