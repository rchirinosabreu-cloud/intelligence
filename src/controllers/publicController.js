import { getContentPlanByToken, updateContentItem, addClientComment } from '../services/contentService.js';

/**
 * GET /api/public/parrilla/:token
 * Retrieves a shared content plan for public viewing.
 */
export const getPublicPlan = async (req, res) => {
  try {
    const plan = await getContentPlanByToken(req.params.token);
    if (!plan) return res.status(404).json({ error: 'Parrilla no encontrada' });

    // Sanitize for public view: remove internal fields
    const sanitizedPlan = {
      id: plan.id,
      month: plan.month,
      year: plan.year,
      strategicObjectives: plan.strategicObjectives,
      client: {
        name: plan.client.name,
        logoUrl: plan.client.logoUrl
      },
      items: plan.items.map(item => ({
        id: item.id,
        objective: item.objective,
        format: item.format,
        copyText: item.copyText,
        captionText: item.captionText,
        publishDate: item.publishDate,
        mediaUrl: item.mediaUrl,
        status: item.status,
        comments: item.comments
      }))
    };

    return res.json(sanitizedPlan);
  } catch (error) {
    console.error('[API] Public plan error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

/**
 * POST /api/public/items/:id/approve
 * Approves a content item publicly.
 */
export const approvePublicItem = async (req, res) => {
  try {
    const item = await updateContentItem(req.params.id, { status: 'APROBADO' });
    return res.json(item);
  } catch (error) {
    console.error('[API] Public approval error:', error);
    return res.status(500).json({ error: 'Failed to approve item' });
  }
};

/**
 * POST /api/public/items/:id/comment
 * Adds a client comment to a content item publicly.
 */
export const commentPublicItem = async (req, res) => {
  try {
    const { comment } = req.body;
    const updatedItem = await addClientComment(req.params.id, comment);
    return res.json(updatedItem);
  } catch (error) {
    console.error('[API] Public comment error:', error);
    return res.status(500).json({ error: 'Failed to add comment' });
  }
};
