import express from 'express';
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
  sendItemToKanban
} from '../../services/contentService.js';

const router = express.Router();

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

router.delete('/plans/:id', async (req, res) => {
  try {
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
