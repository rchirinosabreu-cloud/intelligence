import express from 'express';
import multer from 'multer';
import {
  getContentPlans,
  getContentPlanById,
  getContentPlanBySlugAndPeriod,
  createContentPlan,
  updateContentPlan,
  deleteContentPlan,
  getContentItemsByPlan,
  createContentItem,
  updateContentItem,
  deleteContentItem,
  sendItemToKanban,
  generateShareToken,
  uploadContentItemFinalAsset,
  uploadContentItemFinalAssets,
  getContentItemFinalAsset,
  getContentItemFinalAssetById,
  deleteContentItemFinalAsset,
  deleteContentItemFinalAssetById,
  addContentItemDriveAsset,
  createFinalAssetUploadTickets,
  confirmContentItemFinalAssets
} from '../../services/contentService.js';
import { getFromS3Stream } from '../../services/s3Service.js';
import { isDriveAsset } from '../../lib/finalAssetShape.js';
import {
  getContentPlanReview,
  updateContentPlanReviewFinding
} from '../../services/briaContentPlanReviewService.js';
import { runContentPlanReviewJob } from '../../services/briaContentPlanReviewScheduler.js';
import { createClientCriteriaRouter } from './clientCriteria.js';
import {
  FINAL_ASSET_MAX_BYTES,
  FINAL_ASSET_MAX_FILES,
  FINAL_ASSET_MAX_TOTAL_BYTES,
  fileTooLargeMessage,
  tooManyFilesMessage,
  tooMuchAtOnceMessage
} from '../../lib/uploadLimits.js';

const router = express.Router();
router.use('/plans/:planId/criteria', createClientCriteriaRouter());
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: FINAL_ASSET_MAX_BYTES, files: 1 }
});
const carouselUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: FINAL_ASSET_MAX_BYTES, files: FINAL_ASSET_MAX_FILES }
});

/**
 * Un archivo demasiado grande no puede contestar con un código: el aviso dice el peso y el límite
 * (Rodny, 24 de septiembre de 2026). Además comprueba el peso total, que multer no sabe sumar.
 */
const receiveFinalAssets = (middleware) => (req, res, next) => middleware(req, res, (error) => {
  if (error?.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({ error: fileTooLargeMessage(null) });
  }
  if (error?.code === 'LIMIT_FILE_COUNT' || error?.code === 'LIMIT_UNEXPECTED_FILE') {
    return res.status(413).json({ error: tooManyFilesMessage() });
  }
  if (error) return next(error);

  const files = req.files || (req.file ? [req.file] : []);
  const total = files.reduce((sum, file) => sum + Number(file?.size || file?.buffer?.length || 0), 0);
  if (total > FINAL_ASSET_MAX_TOTAL_BYTES) {
    return res.status(413).json({ error: tooMuchAtOnceMessage(total) });
  }
  return next();
});

/**
 * ContentPlan Endpoints
 */
router.get('/plans', async (req, res) => {
  try {
    const { clientId } = req.query;
    console.log(`[API] Fetching content plans for clientId: ${clientId || 'ALL'}`);
    const plans = await getContentPlans(clientId);
    return res.json(plans);
  } catch (error) {
    const isPrismaError = error.code && (error.code.startsWith('P') || error.message?.includes('Prisma'));
    console.error('[API] Error fetching content plans:', {
      message: error.message,
      code: error.code,
      meta: error.meta,
      stack: error.stack
    });
    return res.status(500).json({
      error: isPrismaError ? 'Database Error' : 'Failed to fetch content plans',
      details: error.message,
      code: error.code
    });
  }
});

router.get('/plans/:id', async (req, res) => {
  try {
    const plan = await getContentPlanById(req.params.id);
    if (!plan) return res.status(404).json({ error: 'Content plan not found' });
    return res.json(plan);
  } catch (error) {
    console.error('[API] Error fetching content plan:', error);
    return res.status(500).json({ error: 'Failed to fetch content plan', details: error.message });
  }
});

router.get('/plans/:id/bria-review', async (req, res) => {
  try {
    const result = await getContentPlanReview(req.params.id);
    if (!result) return res.status(404).json({ error: 'La parrilla no existe o ya no está disponible.' });
    return res.json(result);
  } catch (error) {
    console.error('[API] Failed to read Bria content-plan review:', error.response?.data || error.message || error);
    return res.status(500).json({ error: 'No fue posible cargar la revisión compartida de Bria.' });
  }
});

// The review ran but could not be completed. That is an outcome the team can
// read, not an internal error: 5xx bodies are reduced to a code in production.
const REVIEW_OUTCOME_CODES = new Set(['BRIA_REVIEW_INCOMPLETE_BATCH', 'BRIA_REVIEW_CONTEXT_TOO_LARGE', 'BRIA_REVIEW_TIMEOUT']);
const reviewOutcomeMessage = error => error.code === 'BRIA_REVIEW_CONTEXT_TOO_LARGE'
  ? error.message
  : 'Bria no pudo completar la revisión en este intento. El motivo queda registrado y lo volverá a intentar automáticamente.';

router.post('/plans/:id/bria-review', async (req, res) => {
  try {
    const outcome = await runContentPlanReviewJob({
      planId: req.params.id,
      trigger: 'MANUAL',
      reviewOptions: { requestedById: req.user.userId, force: true }
    });
    if (outcome.status === 'FAILED') throw outcome.error;
    if (outcome.status !== 'COMPLETED') {
      return res.status(202).json(await getContentPlanReview(req.params.id));
    }
    return res.json(outcome.result);
  } catch (error) {
    console.error('[API] Bria content-plan review failed:', error.response?.data || error.message || error);
    if (error.code === 'CONTENT_PLAN_NOT_FOUND') {
      return res.status(404).json({ error: error.message, code: error.code });
    }
    if (REVIEW_OUTCOME_CODES.has(error.code)) {
      return res.status(422).json({ error: reviewOutcomeMessage(error), code: error.code });
    }
    const upstreamUnavailable = error.code === 'OPENAI_NOT_CONFIGURED' || Number(error.status) >= 400;
    return res.status(upstreamUnavailable ? 502 : 500).json({
      error: upstreamUnavailable ? 'BRIA_UPSTREAM_UNAVAILABLE' : 'BRIA_CONTENT_PLAN_REVIEW_FAILED',
      code: error.code || 'BRIA_CONTENT_PLAN_REVIEW_FAILED'
    });
  }
});

router.patch('/plans/:id/bria-review/findings/:findingId', async (req, res) => {
  try {
    const { action, reason } = req.body || {};
    if (!['MARK_CORRECTED', 'DISMISS', 'UNDO_CORRECTION'].includes(action)) {
      return res.status(400).json({ error: 'Acción de hallazgo no válida.' });
    }
    const finding = await updateContentPlanReviewFinding({
      planId: req.params.id,
      findingId: req.params.findingId,
      action,
      reason,
      actorUserId: req.user.userId
    });
    if (!finding) return res.status(404).json({ error: 'El hallazgo ya no está disponible.' });
    return res.json({ finding });
  } catch (error) {
    console.error('[API] Failed to update Bria finding:', error.response?.data || error.message || error);
    return res.status(400).json({ error: error.message || 'No fue posible actualizar el hallazgo.' });
  }
});

router.get('/plans/:clientSlug/:month-:year', async (req, res) => {
  try {
    const { clientSlug, month, year } = req.params;
    const plan = await getContentPlanBySlugAndPeriod(clientSlug, month, year);
    if (!plan) return res.status(404).json({ error: 'Content plan not found' });
    return res.json(plan);
  } catch (error) {
    console.error('[API] Error fetching content plan by slug:', error);
    return res.status(500).json({ error: 'Failed to fetch content plan', details: error.message });
  }
});

router.post('/plans', async (req, res) => {
  try {
    const plan = await createContentPlan(req.body);
    return res.status(201).json(plan);
  } catch (error) {
    console.error('[API] Error creating content plan:', error);
    return res.status(500).json({ error: 'Failed to create content plan', details: error.message });
  }
});

router.patch('/plans/:id', async (req, res) => {
  try {
    const plan = await updateContentPlan(req.params.id, req.body);
    return res.json(plan);
  } catch (error) {
    console.error('[API] Error updating content plan:', error);
    return res.status(500).json({ error: 'Failed to update content plan', details: error.message });
  }
});

router.post('/plans/:id/share-token', async (req, res) => {
  try {
    const plan = await generateShareToken(req.params.id);
    return res.json({ shareToken: plan.shareToken });
  } catch (error) {
    console.error('[API] Error generating share token:', error);
    return res.status(500).json({ error: 'Failed to generate share token' });
  }
});

router.delete('/plans/:id', async (req, res) => {
  try {
    // RBAC: Only ADMIN can delete content plans
    if (req.user?.role !== 'ADMIN') {
      return res.status(403).json({ error: 'Forbidden: Only administrators can delete content plans' });
    }

    await deleteContentPlan(req.params.id);
    return res.json({ success: true });
  } catch (error) {
    console.error('[API] Error deleting content plan:', error);
    return res.status(500).json({ error: 'Failed to delete content plan', details: error.message });
  }
});

/**
 * ContentItem Endpoints
 */
router.get('/items', async (req, res) => {
  try {
    const { planId } = req.query;
    if (!planId) return res.status(400).json({ error: 'planId is required' });
    const items = await getContentItemsByPlan(planId);
    return res.json(items);
  } catch (error) {
    console.error('[API] Error fetching content items:', error);
    return res.status(500).json({ error: 'Failed to fetch content items', details: error.message });
  }
});

router.post('/items', async (req, res) => {
  try {
    const item = await createContentItem(req.body);
    return res.status(201).json(item);
  } catch (error) {
    console.error('[API] Error creating content item:', error);
    return res.status(500).json({ error: 'Failed to create content item', details: error.message });
  }
});

router.patch('/items/:id', async (req, res) => {
  try {
    const item = await updateContentItem(req.params.id, req.body);
    return res.json(item);
  } catch (error) {
    console.error('[API] Error updating content item:', error);
    return res.status(500).json({ error: 'Failed to update content item', details: error.message });
  }
});

router.post('/items/:id/final-asset', receiveFinalAssets(upload.single('file')), async (req, res) => {
  try {
    const item = await uploadContentItemFinalAsset(req.params.id, req.file);
    return res.json(item);
  } catch (error) {
    console.error('[API] Error uploading final content asset:', error.response?.data || error);
    return res.status(500).json({ error: error.message || 'Failed to upload final asset', details: error.message });
  }
});

router.get('/items/:id/final-asset', async (req, res) => {
  try {
    const item = await getContentItemFinalAsset(req.params.id);
    if (!item) return res.status(404).json({ error: 'Final asset not found' });

    const object = await getFromS3Stream(item.finalAssetKey);
    res.setHeader('Content-Type', item.finalAssetMimeType || object.ContentType || 'application/octet-stream');
    res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(item.finalAssetName || 'pieza-final')}"`);
    res.setHeader('Cache-Control', 'private, max-age=300');
    return object.Body.pipe(res);
  } catch (error) {
    console.error('[API] Error streaming final content asset:', error.response?.data || error);
    return res.status(500).json({ error: 'Failed to load final asset', details: error.message });
  }
});

router.delete('/items/:id/final-asset', async (req, res) => {
  try {
    const item = await deleteContentItemFinalAsset(req.params.id);
    return res.json(item);
  } catch (error) {
    console.error('[API] Error deleting final content asset:', error.response?.data || error);
    return res.status(500).json({ error: error.message || 'Failed to delete final asset', details: error.message });
  }
});

router.post('/items/:id/final-assets', receiveFinalAssets(carouselUpload.array('files', FINAL_ASSET_MAX_FILES)), async (req, res) => {
  try {
    const assets = await uploadContentItemFinalAssets(req.params.id, req.files);
    return res.status(201).json(assets);
  } catch (error) {
    console.error('[API] Error uploading final carousel assets:', error.response?.data || error);
    return res.status(500).json({ error: error.message || 'Failed to upload final assets', details: error.message });
  }
});

/**
 * Un video pesado se entrega como enlace de Drive en vez de subirlo (Rodny, 24 de septiembre de 2026).
 */
router.post('/items/:id/final-assets/drive', async (req, res) => {
  try {
    const assets = await addContentItemDriveAsset(req.params.id, req.body || {});
    return res.status(201).json(assets);
  } catch (error) {
    console.error('[API] Error adding a Drive final asset:', error.response?.data || error.message);
    return res.status(400).json({ error: error.message });
  }
});

/**
 * Subida directa: el navegador pide permisos firmados, sube al almacenamiento y después confirma.
 * Son dos pasos a propósito — hasta que no se confirma, en la parrilla no aparece nada a medias.
 */
router.post('/items/:id/final-assets/direct-upload', async (req, res) => {
  try {
    const tickets = await createFinalAssetUploadTickets(req.params.id, req.body?.files);
    return res.json(tickets);
  } catch (error) {
    console.error('[API] Error signing a direct upload:', error.response?.data || error.message);
    return res.status(400).json({ error: error.message });
  }
});

router.post('/items/:id/final-assets/confirm', async (req, res) => {
  try {
    const assets = await confirmContentItemFinalAssets(req.params.id, req.body?.uploads);
    return res.status(201).json(assets);
  } catch (error) {
    console.error('[API] Error confirming a direct upload:', error.response?.data || error.message);
    return res.status(400).json({ error: error.message });
  }
});

router.get('/items/:id/final-assets/:assetId', async (req, res) => {
  try {
    const asset = await getContentItemFinalAssetById(req.params.id, req.params.assetId);
    if (!asset) return res.status(404).json({ error: 'Final asset not found' });
    // Un enlace de Drive no tiene bytes nuestros que servir: se abre en Drive, no por aquí.
    if (isDriveAsset(asset)) return res.status(409).json({ error: 'Esa pieza final es un enlace de Drive.' });
    const object = await getFromS3Stream(asset.storageKey || asset.finalAssetKey);
    res.setHeader('Content-Type', asset.mimeType || asset.finalAssetMimeType || object.ContentType || 'application/octet-stream');
    res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(asset.name || asset.finalAssetName || 'pieza-final')}"`);
    res.setHeader('Cache-Control', 'private, max-age=300');
    return object.Body.pipe(res);
  } catch (error) {
    console.error('[API] Error streaming final carousel asset:', error.response?.data || error);
    return res.status(500).json({ error: 'Failed to load final asset', details: error.message });
  }
});

router.delete('/items/:id/final-assets/:assetId', async (req, res) => {
  try {
    return res.json(await deleteContentItemFinalAssetById(req.params.id, req.params.assetId));
  } catch (error) {
    console.error('[API] Error deleting final carousel asset:', error.response?.data || error);
    return res.status(500).json({ error: error.message || 'Failed to delete final asset', details: error.message });
  }
});

router.delete('/items/:id', async (req, res) => {
  try {
    await deleteContentItem(req.params.id);
    return res.json({ success: true });
  } catch (error) {
    console.error('[API] Error deleting content item:', error);
    return res.status(500).json({ error: 'Failed to delete content item', details: error.message });
  }
});

/**
 * Kanban Integration
 */
router.post('/items/:id/send-to-kanban', async (req, res) => {
  try {
    const creatorId = req.user.userId;
    const executionData = req.body;
    const item = await sendItemToKanban(req.params.id, creatorId, executionData);
    return res.json(item);
  } catch (error) {
    console.error('[API] Error sending item to kanban:', error);
    return res.status(500).json({ error: error.message || 'Failed to send item to kanban', details: error.message });
  }
});

export default router;
