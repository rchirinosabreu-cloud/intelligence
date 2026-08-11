import { getOperationalHealth } from '../services/operationalHealthService.js';

export const getOperationalHealthHandler = async (req, res) => {
  try {
    const snapshot = await getOperationalHealth({ requester: req.user });
    res.setHeader('Cache-Control', 'private, max-age=60');
    return res.json(snapshot);
  } catch (error) {
    const status = error.statusCode || 500;
    if (status >= 500) {
      console.error('[OperationalHealthController] Error:', error);
    }
    return res.status(status).json({
      error: error.message || 'No fue posible calcular la salud operativa.'
    });
  }
};
