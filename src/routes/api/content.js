import express from 'express';
import {
  getContentPlans,
  getContentPlanById,
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
    const plans = await getContentPlans(clientId);
    res.json(plans);
  } catch (error) {
    console.error('[API] Error fetching content plans:', error);
    res.status(500).json({ error: 'Failed to fetch content plans' });
  }
});

router.get('/plans/:id', async (req, res) => {
  try {
    const plan = await getContentPlanById(req.params.id);
    if (!plan) return res.status(404).json({ error: 'Content plan not found' });
    res.json(plan);
  } catch (error) {
    console.error('[API] Error fetching content plan:', error);
    res.status(500).json({ error: 'Failed to fetch content plan' });
  }
});

router.post('/plans', async (req, res) => {
  try {
    const plan = await createContentPlan(req.body);
    res.status(201).json(plan);
  } catch (error) {
    console.error('[API] Error creating content plan:', error);
    res.status(500).json({ error: 'Failed to create content plan' });
  }
});

router.patch('/plans/:id', async (req, res) => {
  try {
    const plan = await updateContentPlan(req.params.id, req.body);
    res.json(plan);
  } catch (error) {
    console.error('[API] Error updating content plan:', error);
    res.status(500).json({ error: 'Failed to update content plan' });
  }
});

router.delete('/plans/:id', async (req, res) => {
  try {
    await deleteContentPlan(req.params.id);
    res.json({ success: true });
  } catch (error) {
    console.error('[API] Error deleting content plan:', error);
    res.status(500).json({ error: 'Failed to delete content plan' });
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
    res.json(items);
  } catch (error) {
    console.error('[API] Error fetching content items:', error);
    res.status(500).json({ error: 'Failed to fetch content items' });
  }
});

router.post('/items', async (req, res) => {
  try {
    const item = await createContentItem(req.body);
    res.status(201).json(item);
  } catch (error) {
    console.error('[API] Error creating content item:', error);
    res.status(500).json({ error: 'Failed to create content item' });
  }
});

router.patch('/items/:id', async (req, res) => {
  try {
    const item = await updateContentItem(req.params.id, req.body);
    res.json(item);
  } catch (error) {
    console.error('[API] Error updating content item:', error);
    res.status(500).json({ error: 'Failed to update content item' });
  }
});

router.delete('/items/:id', async (req, res) => {
  try {
    await deleteContentItem(req.params.id);
    res.json({ success: true });
  } catch (error) {
    console.error('[API] Error deleting content item:', error);
    res.status(500).json({ error: 'Failed to delete content item' });
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
    res.json(item);
  } catch (error) {
    console.error('[API] Error sending item to kanban:', error);
    res.status(500).json({ error: error.message || 'Failed to send item to kanban' });
  }
});

export default router;
