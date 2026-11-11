import express from 'express';
import { productionDayService } from '../../services/productionDayService.js';

// Jornadas de producción con evidencia (10 de noviembre de 2026), colgadas del evento de Producción del calendario.
// Ver: cualquiera con Actividad. Ligar a un cliente: administradores y project managers. Subir la evidencia: quien estuvo
// en la jornada, quien la agendó o un project manager. Las puertas las comprueba el servicio.

const reply = (res, error, logger) => {
  const status = Number(error?.status) || 500;
  if (status >= 500) {
    logger.error('[ProductionDays] Error de ruta:', error.response?.data || error.message || error);
    return res.status(status).json({ error: 'No se pudo completar la operación. Inténtalo de nuevo en un momento.' });
  }
  return res.status(status).json({ error: error.message, ...(error.code ? { code: error.code } : {}) });
};

export const createProductionDaysRouter = ({ service = productionDayService, logger = console } = {}) => {
  const router = express.Router();

  router.get('/by-event/:eventId', async (req, res) => {
    try { return res.json(await service.getByEvent(req.params.eventId, req.user)); } catch (error) { return reply(res, error, logger); }
  });

  router.put('/by-event/:eventId/client', async (req, res) => {
    try { return res.json(await service.linkClient(req.params.eventId, req.body?.clientId || null, req.user)); } catch (error) { return reply(res, error, logger); }
  });

  router.put('/by-event/:eventId/evidence', async (req, res) => {
    try { return res.json(await service.setEvidence(req.params.eventId, { url: req.body?.url, note: req.body?.note }, req.user)); } catch (error) { return reply(res, error, logger); }
  });

  return router;
};

export default createProductionDaysRouter();
