import {
  assignClientOwner,
  createDashboardAnnouncement,
  deleteDashboardAnnouncement,
  getPersonalDashboard,
  updateDashboardAnnouncement
} from '../services/personalDashboardService.js';

export const getPersonalDashboardHandler = async (req, res) => {
  try {
    const dashboard = await getPersonalDashboard({
      requester: req.user,
      targetUserId: req.params.userId || req.query.userId || req.user?.userId
    });
    return res.json(dashboard);
  } catch (error) {
    const status = error.statusCode || 500;
    if (status >= 500) {
      console.error('[PersonalDashboardController] Error:', error);
    }
    return res.status(status).json({
      error: error.message || 'Error al construir el dashboard personal.'
    });
  }
};

export const createDashboardAnnouncementHandler = async (req, res) => {
  try {
    const announcement = await createDashboardAnnouncement({
      requester: req.user,
      scope: req.body.scope,
      content: req.body.content,
      targetUserId: req.body.targetUserId
    });
    return res.status(201).json(announcement);
  } catch (error) {
    const status = error.statusCode || 500;
    if (status >= 500) {
      console.error('[PersonalDashboardController] Announcement error:', error);
    }
    return res.status(status).json({
      error: error.message || 'Error al crear el anuncio.'
    });
  }
};

export const updateDashboardAnnouncementHandler = async (req, res) => {
  try {
    const announcement = await updateDashboardAnnouncement({
      requester: req.user,
      scope: req.params.scope,
      id: req.params.id,
      content: req.body.content
    });
    return res.json(announcement);
  } catch (error) {
    const status = error.statusCode || 500;
    if (status >= 500) {
      console.error('[PersonalDashboardController] Announcement update error:', error);
    }
    return res.status(status).json({
      error: error.message || 'Error al actualizar el anuncio.'
    });
  }
};

export const deleteDashboardAnnouncementHandler = async (req, res) => {
  try {
    await deleteDashboardAnnouncement({
      requester: req.user,
      scope: req.params.scope,
      id: req.params.id
    });
    return res.status(204).send();
  } catch (error) {
    const status = error.statusCode || 500;
    if (status >= 500) {
      console.error('[PersonalDashboardController] Announcement delete error:', error);
    }
    return res.status(status).json({
      error: error.message || 'Error al eliminar el anuncio.'
    });
  }
};

export const assignClientOwnerHandler = async (req, res) => {
  try {
    const client = await assignClientOwner({
      requester: req.user,
      clientId: req.params.clientId,
      memberId: req.body.memberId
    });
    return res.json(client);
  } catch (error) {
    const status = error.statusCode || 500;
    if (status >= 500) {
      console.error('[PersonalDashboardController] Client assignment error:', error);
    }
    return res.status(status).json({
      error: error.message || 'Error al asignar el cliente.'
    });
  }
};
