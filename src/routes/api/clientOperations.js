import express from 'express';
import { canSeeClientOperations } from '../../lib/clientOperations.js';
import { clientOperationsService } from '../../services/clientOperationsService.js';
import { projectOperationsService } from '../../services/projectOperationsService.js';
import { productionDayService } from '../../services/productionDayService.js';

// Operación de clientes (2 de octubre de 2026): el tablero global, la página de cada cliente, su ficha
// operativa y el informe del mes. Solo administradores y project managers (Rodny, 1 de octubre de 2026).

const PROFILE_FIELDS = ['description', 'instagramUrl', 'agency', 'complexity', 'projectManagerId', 'communityManagerId', 'externalPlanUrl', 'contract', 'renew'];
const PROJECT_FIELDS = ['expectedRevision', 'title', 'modality', 'startDate', 'endDate', 'projectManagerId', 'deliverables', 'productionDays', 'productionHours', 'reportRequired', 'notes', 'review'];

// La operación de clientes: dirección y project managers por su cargo, y quien tenga marcada su casilla en
// Equipo (Rodny, 12 de noviembre de 2026: «un permiso para que quien yo quiera vea los clientes completos»).
//
// **Ver y editar van juntos** (Rodny, 13 de noviembre de 2026: «el community manager también debe tener la
// opción de editar si le activo el permiso de ver la operación de los clientes, necesito que puedan editar
// la ficha»): quien entra, entra a trabajar. Lo que no abre esta puerta son las decisiones que ya tienen su
// propia regla en el servicio y no dependen de ella: suspender por cartera y autorizar trabajo sin propuesta
// son de Dirección o Administrativa, la no renovación es del project manager asignado o un administrador, y
// la ficha del proyecto exige el cargo. Crear, renombrar y desactivar un cliente sigue en `/api/clients`,
// que pide `requireManagerRole`.
const requireClientOperations = (req, res, next) => {
  if (!req.user) return res.status(401).json({ error: 'Usuario no autenticado' });
  if (!canSeeClientOperations(req.user)) return res.status(403).json({ error: 'No tienes permiso para la operación de clientes.' });
  return next();
};
// A propósito sin etiqueta `permission` para el mapa de Bria: la etiqueta es plana («pide este rol y este
// módulo») y aquí la puerta es una *o* —el cargo o la casilla—. Etiquetarla haría que Bria le negara a un
// project manager una operación que sí puede hacer; la cerradura de verdad es esta función.
requireClientOperations.permission = { role: 'MANAGER' };

const reply = (res, error, logger) => {
  const status = Number(error?.status) || 500;
  if (status >= 500) {
    logger.error('[ClientOperations] Error de ruta:', error.response?.data || error.message || error);
    return res.status(status).json({ error: 'No se pudo completar la operación. Inténtalo de nuevo en un momento.' });
  }
  return res.status(status).json({ error: error.message, ...(error.code ? { code: error.code } : {}), ...(error.errors ? { errors: error.errors } : {}) });
};

export const createClientOperationsRouter = ({ service = clientOperationsService, projectService = projectOperationsService, productionDays = productionDayService, logger = console } = {}) => {
  const router = express.Router();
  router.use(requireClientOperations);

  router.get('/', async (_req, res) => {
    try { return res.json(await service.listOperations()); } catch (error) { return reply(res, error, logger); }
  });

  // Las jornadas de producción de un mes, de todos los clientes (reemplaza el Excel de jornadas, 12 de noviembre de 2026).
  // Va antes de `/:slug`, que si no la tomaría por un cliente.
  router.get('/jornadas', async (req, res) => {
    try { return res.json(await productionDays.listMonth({ year: req.query.year, month: req.query.month }, req.user)); } catch (error) { return reply(res, error, logger); }
  });

  router.get('/:clientId/projects', async (req, res) => {
    try {
      return res.json(await projectService.listClientProjects(req.params.clientId, { userId: req.user.userId, role: req.user.role }));
    } catch (error) { return reply(res, error, logger); }
  });

  router.put('/:clientId/projects/:projectId', async (req, res) => {
    try {
      const body = req.body || {};
      const input = Object.fromEntries(PROJECT_FIELDS.filter((key) => Object.hasOwn(body, key)).map((key) => [key, body[key]]));
      return res.json(await projectService.updateProjectOperation(req.params.clientId, req.params.projectId, input, { userId: req.user.userId, role: req.user.role }));
    } catch (error) { return reply(res, error, logger); }
  });

  router.get('/:slug', async (req, res) => {
    try { return res.json(await service.getOperation(req.params.slug, { viewerUserId: req.user.userId })); } catch (error) { return reply(res, error, logger); }
  });

  // Seguir trabajando sin propuesta aprobada hasta una fecha (Dirección o Administración; lo comprueba el servicio).
  router.post('/:clientId/work-authorizations', async (req, res) => {
    try {
      return res.status(201).json(await service.authorizeWork({ clientId: req.params.clientId, until: req.body?.until, reason: req.body?.reason, actorUserId: req.user.userId }));
    } catch (error) { return reply(res, error, logger); }
  });

  // Suspender por cartera y levantarla (Administración o Dirección; lo comprueba el servicio). Suspender exige quién
  // lo autorizó —la regla de la empresa es que lo autoriza Francisco— y por qué.
  router.post('/:clientId/suspension', async (req, res) => {
    try {
      return res.status(201).json(await service.suspendClient({
        clientId: req.params.clientId, authorizedBy: req.body?.authorizedBy, reason: req.body?.reason, actorUserId: req.user.userId
      }));
    } catch (error) { return reply(res, error, logger); }
  });

  router.delete('/:clientId/suspension', async (req, res) => {
    try {
      return res.json(await service.liftSuspension({ clientId: req.params.clientId, reason: req.body?.reason, actorUserId: req.user.userId }));
    } catch (error) { return reply(res, error, logger); }
  });

  router.put('/:clientId/profile', async (req, res) => {
    try {
      const body = req.body || {};
      const input = Object.fromEntries(PROFILE_FIELDS.filter((key) => Object.hasOwn(body, key)).map((key) => [key, body[key]]));
      return res.json(await service.saveProfile({ clientId: req.params.clientId, actorUserId: req.user.userId, input }));
    } catch (error) { return reply(res, error, logger); }
  });

  router.post('/:clientId/continuity', async (req, res) => {
    try {
      return res.json(await service.decideContinuity({ clientId: req.params.clientId, input: req.body || {}, actorUserId: req.user.userId }));
    } catch (error) { return reply(res, error, logger); }
  });

  // El informe del mes: su estado (pendiente, en elaboración, en revisión, enviado), el enlace y una nota. `delivered`
  // sigue valiendo para quien lo marcaba como entregado.
  router.put('/:clientId/reports/:year/:month', async (req, res) => {
    try {
      const body = req.body || {};
      if (body.status === undefined && typeof body.delivered !== 'boolean') return res.status(400).json({ error: 'Falta el estado del informe.' });
      return res.json(await service.setMonthlyReport({
        clientId: req.params.clientId, year: Number(req.params.year), month: Number(req.params.month),
        delivered: body.delivered, status: body.status, link: body.link, note: body.note, actorUserId: req.user.userId,
      }));
    } catch (error) { return reply(res, error, logger); }
  });

  // Reabrir un cierre confirmado por error.
  router.delete('/:clientId/closes/:year/:month', async (req, res) => {
    try {
      return res.json(await service.reopenMonthlyClose({ clientId: req.params.clientId, year: Number(req.params.year), month: Number(req.params.month), viewerUserId: req.user.userId }));
    } catch (error) { return reply(res, error, logger); }
  });

  // Leer ahora la parrilla de MIO del cliente desde su hoja de Google.
  router.post('/:clientId/external-plan/refresh', async (req, res) => {
    try {
      return res.json(await service.refreshExternalPlan({ clientId: req.params.clientId, viewerUserId: req.user.userId }));
    } catch (error) { return reply(res, error, logger); }
  });

  // El project manager confirma el cierre del mes; lo pendiente se conserva.
  router.post('/:clientId/closes/:year/:month', async (req, res) => {
    try {
      return res.status(201).json(await service.confirmMonthlyClose({
        clientId: req.params.clientId, year: Number(req.params.year), month: Number(req.params.month), note: req.body?.note, actorUserId: req.user.userId,
      }));
    } catch (error) { return reply(res, error, logger); }
  });

  // Observaciones del cliente: el autor es siempre quien tiene la sesión.
  router.post('/:clientId/observations', async (req, res) => {
    try {
      return res.status(201).json(await service.addObservation({ clientId: req.params.clientId, text: req.body?.text, actorUserId: req.user.userId }));
    } catch (error) { return reply(res, error, logger); }
  });

  router.delete('/:clientId/observations/:observationId', async (req, res) => {
    try {
      return res.json(await service.deleteObservation({ clientId: req.params.clientId, observationId: req.params.observationId, actor: { userId: req.user.userId, role: req.user.role } }));
    } catch (error) { return reply(res, error, logger); }
  });

  router.put('/team/:memberId/highlight', async (req, res) => {
    try { return res.json(await service.setTeamHighlight({ memberId: req.params.memberId, text: req.body?.text })); } catch (error) { return reply(res, error, logger); }
  });

  router.post('/:clientId/pieces/:itemId/published', async (req, res) => {
    try { return res.json(await service.markPiecePublished({ clientId: req.params.clientId, itemId: req.params.itemId, actorUserId: req.user.userId })); } catch (error) { return reply(res, error, logger); }
  });

  // Deshacer «Ya se publicó».
  router.delete('/:clientId/pieces/:itemId/published', async (req, res) => {
    try { return res.json(await service.undoPiecePublished({ clientId: req.params.clientId, itemId: req.params.itemId })); } catch (error) { return reply(res, error, logger); }
  });

  return router;
};

export default createClientOperationsRouter();
