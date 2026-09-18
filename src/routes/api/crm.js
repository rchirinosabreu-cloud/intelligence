import express from 'express';
import prisma from '../../lib/prisma.js';
import * as crmService from '../../services/crmService.js';

// Mounted in src/routes/index.js behind authenticateToken + requireModulePermission('crm').
export const createCrmRouter = ({ service = crmService, db = prisma } = {}) => {
  const router = express.Router();

  const send = (res, error, fallback) => {
    if (error?.statusCode) return res.status(error.statusCode).json({ error: error.message });
    if (error?.code === 'P2025') return res.status(404).json({ error: 'Oportunidad no encontrada.' });
    if (error?.code === 'P2002') return res.status(409).json({ error: 'Ya existe un registro con esos datos.' });
    console.error('[CRM]', fallback, error);
    return res.status(500).json({ error: fallback });
  };

  const handle = (fallback, run) => async (req, res) => {
    try {
      await run(req, res);
    } catch (error) {
      send(res, error, fallback);
    }
  };

  router.get('/catalogs', (_req, res) => res.json(service.catalogs()));

  router.get('/metrics', handle('No pudimos calcular las métricas.', async (req, res) => {
    res.json(await service.metricsFor(db, req.query));
  }));

  router.get('/followups', handle('No pudimos cargar los seguimientos.', async (req, res) => {
    res.json(await service.followUps(db, req.query));
  }));

  router.get('/leads', handle('No pudimos cargar las oportunidades.', async (req, res) => {
    res.json(await service.listLeads(db, req.query));
  }));

  router.post('/leads', handle('No pudimos crear la oportunidad.', async (req, res) => {
    res.status(201).json(await service.createLead(db, req.body || {}, req.user));
  }));

  router.get('/leads/:leadId', handle('No pudimos cargar la oportunidad.', async (req, res) => {
    const lead = await service.getLead(db, req.params.leadId);
    if (!lead) return res.status(404).json({ error: 'Oportunidad no encontrada.' });
    return res.json(lead);
  }));

  router.patch('/leads/:leadId', handle('No pudimos guardar la oportunidad.', async (req, res) => {
    res.json(await service.updateLead(db, req.params.leadId, req.body || {}, req.user));
  }));

  router.post('/leads/:leadId/stage', handle('No pudimos cambiar la etapa.', async (req, res) => {
    res.json(await service.changeStage(db, req.params.leadId, req.body || {}, req.user));
  }));

  router.post('/leads/:leadId/activities', handle('No pudimos registrar la gestión.', async (req, res) => {
    res.status(201).json(await service.addActivity(db, req.params.leadId, req.body || {}, req.user));
  }));

  router.patch('/leads/:leadId/activities/:activityId', handle('No pudimos corregir la gestión.', async (req, res) => {
    res.json(await service.updateActivity(db, req.params.leadId, req.params.activityId, req.body || {}, req.user));
  }));

  router.post('/leads/:leadId/traffic-light', handle('No pudimos actualizar el semáforo.', async (req, res) => {
    res.json(await service.setTrafficLight(db, req.params.leadId, req.body || {}, req.user));
  }));

  router.post('/leads/:leadId/archive', handle('No pudimos archivar la oportunidad.', async (req, res) => {
    res.json(await service.archiveLead(db, req.params.leadId, req.user));
  }));

  return router;
};

export default createCrmRouter();
