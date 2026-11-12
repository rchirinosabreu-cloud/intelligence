import express from 'express';
import { adBudgetService } from '../../services/adBudgetService.js';
import { adBudgetMetaService } from '../../services/adBudgetMetaService.js';
import { AD_BUDGET_EDIT_KEY, canEditAdBudgets } from '../../lib/platformModules.js';

// Pautas (reunión del 6 de noviembre de 2026). El módulo lo protege `requireModulePermission('pautas')` en el índice de
// rutas: con ella se ve. Todo lo que escribe pide además «Editar pautas» (`edit`), comprobado aquí y no solo en la
// pantalla. Un error de validación responde con su frase en español; nunca un código.
/** «Editar pautas»: la casilla del módulo más la de editar. La etiqueta permission la lee el mapa de Bria. */
export const requireAdBudgetEdit = (req, res, next) => (canEditAdBudgets(req.user)
  ? next()
  : res.status(403).json({ error: 'Para esto necesitas «Editar pautas». Pídeselo a un administrador en Equipo.' }));
requireAdBudgetEdit.permission = { module: AD_BUDGET_EDIT_KEY };

export const createAdBudgetRouter = ({ service = null, metaService = null } = {}) => {
  const router = express.Router();
  const edit = requireAdBudgetEdit;
  const read = () => service || adBudgetService();
  const meta = () => metaService || adBudgetMetaService();
  const handle = (work, status = 200) => async (req, res) => {
    try {
      return res.status(status).json(await work(req));
    } catch (error) {
      if (error.statusCode) return res.status(error.statusCode).json({ error: error.message });
      console.error('[Ad budgets API] No se pudo completar:', error.response?.data || error);
      return res.status(500).json({ error: 'No se pudo completar la operación. Inténtalo de nuevo.' });
    }
  };

  router.get('/', handle(async (req) => ({ ...(await read().list({ clientId: req.query.clientId || null, includeFinished: req.query.terminadas === '1' })), canEdit: canEditAdBudgets(req.user) })));
  router.get('/options', handle(() => read().options()));
  // Meta. Va antes de '/:id' para que «meta» no se tome por una pauta.
  router.get('/meta', handle(() => meta().overview()));
  router.post('/meta/sync', handle(() => meta().syncNow()));
  router.post('/meta/campaigns/:campaignId/ignore', edit, handle((req) => meta().setIgnored(req.params.campaignId, req.body?.ignored !== false, req.user)));
  router.post('/', edit, handle((req) => read().create(req.body || {}, req.user), 201));
  router.get('/:id', handle((req) => read().detail(req.params.id)));
  router.patch('/:id', edit, handle((req) => read().update(req.params.id, req.body || {}, req.user)));
  router.delete('/:id', edit, handle((req) => read().remove(req.params.id, req.user)));
  router.get('/:id/meta-suggestions', handle((req) => meta().suggestions(req.params.id)));
  router.put('/:id/meta-campaigns', edit, handle((req) => meta().assign(req.params.id, req.body?.campaignIds, req.user)));
  // El presupuesto en Meta: verlo es de quien ve la pauta; cambiarlo, de quien edita, con el tope de lo aprobado.
  router.get('/:id/meta-budgets', handle((req) => meta().metaBudgets(req.params.id)));
  router.post('/:id/meta-budget', edit, handle((req) => meta().adjustBudget(req.params.id, req.body || {}, req.user)));
  router.post('/:id/spend', edit, handle((req) => read().recordSpend(req.params.id, req.body || {}, req.user), 201));
  router.patch('/:id/readings/:readingId', edit, handle((req) => read().updateReading(req.params.id, req.params.readingId, req.body || {}, req.user)));
  router.delete('/:id/readings/:readingId', edit, handle((req) => read().deleteReading(req.params.id, req.params.readingId, req.user)));
  router.patch('/:id/cycles/:cycleKey', edit, handle((req) => read().updateCycle(req.params.id, req.params.cycleKey, req.body || {}, req.user)));
  router.post('/:id/cycles/:cycleKey/reopen', edit, handle((req) => read().reopenCycle(req.params.id, req.params.cycleKey, req.user)));
  router.put('/:id/carry-over', edit, handle((req) => read().adjustCarryOver(req.params.id, req.body || {}, req.user)));
  router.delete('/:id/carry-over', edit, handle((req) => read().clearCarryOver(req.params.id, { cycleKey: req.query.cycleKey || null }, req.user)));
  router.post('/:id/campaigns', edit, handle((req) => read().createCampaign(req.params.id, req.body || {}, req.user), 201));
  router.patch('/:id/campaigns/:campaignId', edit, handle((req) => read().updateCampaign(req.params.id, req.params.campaignId, req.body || {}, req.user)));
  router.delete('/:id/campaigns/:campaignId', edit, handle((req) => read().deleteCampaign(req.params.id, req.params.campaignId, req.user)));
  return router;
};
