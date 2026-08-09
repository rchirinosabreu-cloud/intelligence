import { getPersonalDashboard } from '../services/personalDashboardService.js';

export const getPersonalDashboardHandler = async (req, res) => {
  try {
    const dashboard = await getPersonalDashboard({
      requester: req.user,
      targetUserId: req.params.userId || req.query.userId || req.user?.userId
    });
    return res.json(dashboard);
  } catch (error) {
    const status = error.statusCode || 500;
    if (status >= 500) {
      console.error('[PersonalDashboardController] Error:', error);
    }
    return res.status(status).json({
      error: error.message || 'Error al construir el dashboard personal.'
    });
  }
};
