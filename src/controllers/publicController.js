import { getContentPlanByToken, updateContentItem, addClientComment, getContentItemFinalAsset, getContentItemFinalAssetById } from '../services/contentService.js';
import { getFromS3Stream } from '../services/s3Service.js';

const getAuthorizedPublicItem = async (token, itemId) => {
  const plan = await getContentPlanByToken(token);
  if (!plan) return null;
  return plan.items.find((item) => item.id === itemId) || null;
};

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
        finalAsset: item.finalAssetKey ? {
          name: item.finalAssetName,
          mimeType: item.finalAssetMimeType,
          size: item.finalAssetSize,
          version: item.finalAssetKey,
          url: `/api/public/parrilla/${encodeURIComponent(req.params.token)}/items/${item.id}/final-asset`
        } : null,
        finalAssets: (item.finalAssets || []).map(asset => ({
          id: asset.id,
          name: asset.name,
          mimeType: asset.mimeType,
          size: asset.size,
          position: asset.position,
          version: asset.storageKey,
          url: `/api/public/parrilla/${encodeURIComponent(req.params.token)}/items/${item.id}/final-assets/${asset.id}`
        })),
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
    const authorizedItem = await getAuthorizedPublicItem(req.params.token, req.params.id);
    if (!authorizedItem) return res.status(404).json({ error: 'Pieza no encontrada' });
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
    const normalizedComment = typeof comment === 'string' ? comment.trim() : '';
    if (!normalizedComment || normalizedComment.length > 2000) {
      return res.status(400).json({ error: 'El comentario debe tener entre 1 y 2000 caracteres' });
    }
    const authorizedItem = await getAuthorizedPublicItem(req.params.token, req.params.id);
    if (!authorizedItem) return res.status(404).json({ error: 'Pieza no encontrada' });
    const updatedItem = await addClientComment(req.params.id, normalizedComment);
    return res.json(updatedItem);
  } catch (error) {
    console.error('[API] Public comment error:', error);
    return res.status(500).json({ error: 'Failed to add comment' });
  }
};

/**
 * GET /api/public/items/:id/final-asset
 * Streams the final image/video for client preview without exposing bucket URLs.
 */
export const getPublicFinalAsset = async (req, res) => {
  try {
    const authorizedItem = await getAuthorizedPublicItem(req.params.token, req.params.id);
    if (!authorizedItem) return res.status(404).json({ error: 'Archivo final no encontrado' });
    const item = await getContentItemFinalAsset(req.params.id);
    if (!item) return res.status(404).json({ error: 'Archivo final no encontrado' });

    const object = await getFromS3Stream(item.finalAssetKey);
    res.setHeader('Content-Type', item.finalAssetMimeType || object.ContentType || 'application/octet-stream');
    res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(item.finalAssetName || 'pieza-final')}"`);
    res.setHeader('Cache-Control', 'private, max-age=300');

    return object.Body.pipe(res);
  } catch (error) {
    console.error('[API] Public final asset error:', error);
    return res.status(500).json({ error: 'Failed to load final asset' });
  }
};

export const getPublicFinalAssetById = async (req, res) => {
  try {
    const authorizedItem = await getAuthorizedPublicItem(req.params.token, req.params.id);
    if (!authorizedItem) return res.status(404).json({ error: 'Archivo final no encontrado' });
    const asset = await getContentItemFinalAssetById(req.params.id, req.params.assetId);
    if (!asset) return res.status(404).json({ error: 'Archivo final no encontrado' });

    const object = await getFromS3Stream(asset.storageKey || asset.finalAssetKey);
    res.setHeader('Content-Type', asset.mimeType || asset.finalAssetMimeType || object.ContentType || 'application/octet-stream');
    res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(asset.name || asset.finalAssetName || 'pieza-final')}"`);
    res.setHeader('Cache-Control', 'private, max-age=300');
    return object.Body.pipe(res);
  } catch (error) {
    console.error('[API] Public carousel asset error:', error.response?.data || error);
    return res.status(500).json({ error: 'Failed to load final asset' });
  }
};
