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
  deleteContentItemFinalAssetById
} from '../../services/contentService.js';
import { getFromS3Stream } from '../../services/s3Service.js';
import { reviewContentPlanWithBria } from '../../services/briaContentPlanReviewService.js';

const router = express.Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024, files: 1 }
});
const carouselUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024, files: 10 }
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

router.post('/plans/:id/bria-review', async (req, res) => {
  try {
    const result = await reviewContentPlanWithBria({ planId: req.params.id });
    return res.json(result);
  } catch (error) {
    console.error('[API] Bria content-plan review failed:', error.response?.data || error.message || error);
    if (error.code === 'CONTENT_PLAN_NOT_FOUND') {
      return res.status(404).json({ error: error.message, code: error.code });
    }
    const upstreamUnavailable = error.code === 'OPENAI_NOT_CONFIGURED' || Number(error.status) >= 400;
    return res.status(upstreamUnavailable ? 502 : 500).json({
      error: upstreamUnavailable
        ? 'Bria no pudo completar la revisión en este momento.'
        : 'No fue posible revisar esta parrilla.',
      code: error.code || 'BRIA_CONTENT_PLAN_REVIEW_FAILED'
    });
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

router.post('/items/:id/final-asset', upload.single('file'), async (req, res) => {
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

router.post('/items/:id/final-assets', carouselUpload.array('files', 10), async (req, res) => {
  try {
    const assets = await uploadContentItemFinalAssets(req.params.id, req.files);
    return res.status(201).json(assets);
  } catch (error) {
    console.error('[API] Error uploading final carousel assets:', error.response?.data || error);
    return res.status(500).json({ error: error.message || 'Failed to upload final assets', details: error.message });
  }
});

router.get('/items/:id/final-assets/:assetId', async (req, res) => {
  try {
    const asset = await getContentItemFinalAssetById(req.params.id, req.params.assetId);
    if (!asset) return res.status(404).json({ error: 'Final asset not found' });
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
