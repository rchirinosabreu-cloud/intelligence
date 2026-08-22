import express from 'express';
import * as authController from '../controllers/authController.js';
import * as chatController from '../controllers/chatController.js';
import * as taskController from '../controllers/taskController.js';
import * as clientController from '../controllers/clientController.js';
import * as notificationController from '../controllers/notificationController.js';
import * as pushNotificationController from '../controllers/pushNotificationController.js';
import * as announcementController from '../controllers/announcementController.js';
import * as flowController from '../controllers/flowController.js';
import * as proxyController from '../controllers/proxyController.js';
import * as publicController from '../controllers/publicController.js';
import { authenticateToken, requireManagerRole, requireModulePermission } from '../middlewares/authMiddleware.js';
import prisma from '../lib/prisma.js';
import multer from 'multer';

// Import existing modular routers
import teamRouter from './api/team.js';
import userRouter from './api/user.js';
import feedbackRouter from './api/feedback.js';
import integrationsRouter from './api/integrations.js';
import contentRouter from './api/content.js';
import dbRouter from './api/db.js';
import servicesRouter from './api/services.js';
import clientFileRouter from './api/clientFiles.js';
import talentRadarRouter from './api/talentRadar.js';
import activityRouter from './api/activity.js';
import { handleGoogleCalendarWebhook } from '../services/operationalEventService.js';
import reportsRouter from './api/reports.js';
import brainCoreRouter from './api/brainCore.js';
import boardsRouter from './api/boards.js';
import quotationsRouter from './api/quotations.js';
import operativeIntelligenceRouter from './api/operativeIntelligence.js';
import financialsRouter from './api/financials.js';
import dashboardRouter from './api/dashboard.js';
import growthRouter from './api/growth.js';
import { getUpcomingEvents } from '../services/calendarService.js';
import { collectServiceStatuses } from '../services/serviceStatusService.js';

const router = express.Router();
const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 25 * 1024 * 1024, files: 1 }
});

// --- Public Routes (No Auth) ---
router.get('/public/parrilla/:token', publicController.getPublicPlan);
router.get('/public/parrilla/:token/items/:id/final-asset', publicController.getPublicFinalAsset);
router.get('/public/parrilla/:token/items/:id/final-assets/:assetId', publicController.getPublicFinalAssetById);
router.post('/public/parrilla/:token/items/:id/approve', publicController.approvePublicItem);
router.post('/public/parrilla/:token/items/:id/comment', publicController.commentPublicItem);
router.use('/quotations', quotationsRouter);
router.use('/services', servicesRouter);
// Aliases for services catalog (ensuring compatibility with various frontend versions)
router.get('/services-catalog', (req, res) => res.redirect(307, '/api/services'));

// --- Auth Routes ---
router.post('/login', authController.login);
router.post('/password-reset/request', authController.sendPasswordReset);
router.post('/password-reset/confirm', authController.resetPasswordWithCode);
router.post('/users', authenticateToken, authController.createUser);

// --- Protected Routes ---
router.post('/activity/google-calendar/webhook', async (req, res) => {
  try {
    const result = await handleGoogleCalendarWebhook(req.headers);
    res.sendStatus(result.accepted ? 200 : 404);
  } catch (error) {
    console.error('[Google Calendar] Error procesando notificación:', error.response?.data || error.message);
    res.sendStatus(500);
  }
});

router.use(authenticateToken);

router.post('/sync-users', requireManagerRole, authController.syncUsers);

router.get('/auth/me', async (req, res) => {
    try {
        const user = await prisma.user.findUnique({
            where: { id: req.user.userId },
            select: {
                id: true,
                name: true,
                email: true,
                bio: true,
                avatarUrl: true,
                role: true,
                hasFinancialAccess: true,
                financialRole: true,
                mustChangePassword: true,
                sessionVersion: true,
                createdAt: true,
                modulePermissions: true
            }
        });
        if (user && user.modulePermissions) {
            if (typeof user.modulePermissions === 'string') {
                try {
                    user.modulePermissions = JSON.parse(user.modulePermissions);
                } catch(e) {}
            }
        }
        res.json(user);
    } catch(err) {
        res.status(500).json({ error: err.message });
    }
});

// System Health
router.get('/health', (req, res) => res.json({ status: 'ok', timestamp: new Date().toISOString() }));
router.get('/system/services-status', async (_req, res) => {
    try {
        const services = await collectServiceStatuses();
        res.json({ services });
    } catch (error) {
        console.error('[ServiceStatus] Unable to collect service statuses:', error.message);
        res.status(500).json({ error: 'No fue posible consultar el estado de los servicios.' });
    }
});
// Chat
router.post('/chat', requireModulePermission('manager'), chatController.handleChat);

// Tasks
router.use('/tasks', requireModulePermission('gestion'));
router.get('/metrics/tasks', taskController.getMetrics);
router.get('/metrics/quality-streak', taskController.getStreak);
router.get('/tasks/completed', taskController.getCompleted);
router.get('/tasks', taskController.getAllTasks);
router.post('/tasks', taskController.createNewTask);
router.post('/tasks/upload-temp', upload.single('file'), taskController.uploadTempFile);
router.post('/tasks/reorder', taskController.reorderTasks);
router.patch('/tasks/:taskId', taskController.updateExistingTask);
router.delete('/tasks/:taskId', taskController.deleteExistingTask);
router.post('/tasks/:taskId/toggle-follow', taskController.toggleFollow);
router.get('/tasks/:taskId/follow-status', taskController.getFollowStatus);
router.post('/tasks/:taskId/trace-open', taskController.traceTaskOpen);
router.get('/tasks/:taskId/attachments/:attachmentId/file', taskController.getTaskAttachmentFileProxy);
router.get('/tasks/:taskId/attachments/:attachmentId/download', taskController.getTaskAttachmentDownloadProxy);
router.get('/tasks/:taskId/comments', taskController.getTaskComments);
router.post('/tasks/:taskId/comments', upload.single('file'), taskController.addTaskComment);
router.get('/tasks/:taskId/comments/:commentId/file', taskController.getCommentFileProxy);
router.get('/tasks/:taskId/comments/:commentId/download', taskController.getCommentFileDownloadProxy);
router.post('/tasks/:taskId/comments/:commentId/reactions', taskController.toggleCommentReaction);
router.patch('/tasks/:taskId/comments/:commentId', taskController.updateTaskComment);
router.delete('/tasks/:taskId/comments/:commentId', taskController.deleteTaskComment);

// Client Specific (Tasks, Links, Logo)
router.get('/db/clients/:clientId/tasks', taskController.getClientTasksHandler);
router.post('/db/clients/:clientId/tasks', taskController.createClientTaskHandler);
router.patch('/db/tasks/:taskId', taskController.updateClientTaskHandler);
router.delete('/db/tasks/:taskId', taskController.deleteClientTaskHandler);

router.get('/db/clients/:clientId/links', clientController.getLinks);
router.post('/db/clients/:clientId/links', clientController.addLink);
router.delete('/db/links/:linkId', clientController.deleteLink);

router.get('/clients/:clientId/logo-image', clientController.getLogoProxy);

// Clients
router.get('/clients', clientController.listClients);
router.get('/db/clients', clientController.listClients);
router.get('/clients/health', clientController.getHealth);
router.post('/clients', requireManagerRole, clientController.createNewClient);
router.patch('/clients/:id', requireManagerRole, clientController.updateClient);
router.patch('/clients/:id/archive', requireManagerRole, clientController.archiveClientHandler);
router.post('/clients/:id/health', clientController.updateHealthHandler);
router.post('/clients/:id/health-comment', clientController.addHealthCommentHandler);

// Notifications
router.get('/notifications', notificationController.listNotifications);
router.get('/notifications/unread-count', notificationController.getUnreadCount);
router.post('/notifications', requireManagerRole, notificationController.addNotification);
router.patch('/notifications/:id/read', notificationController.markRead);
router.post('/notifications/read-all', notificationController.markAllRead);

// Native device notifications. All ownership comes from the authenticated session.
router.get('/push/status', pushNotificationController.status);
router.post('/push/subscriptions', pushNotificationController.subscribe);
router.delete('/push/subscriptions', pushNotificationController.unsubscribe);
router.patch('/push/subscriptions/preferences', pushNotificationController.updatePreferences);

// Announcements
router.get('/global-announcements', announcementController.listGlobal);
router.post('/global-announcements', requireManagerRole, announcementController.addGlobal);
router.delete('/global-announcements/:id', requireManagerRole, announcementController.deleteGlobal);

router.get('/clients/:clientId/announcements', announcementController.listClient);
router.post('/clients/:clientId/announcements', requireManagerRole, announcementController.addClient);

// Flow / Chat
router.get('/clients/:clientId/flow', flowController.listFlow);
router.post('/clients/:clientId/flow', flowController.addFlow);
router.get('/general-chat', flowController.listGeneral);
router.post('/general-chat', flowController.addGeneral);

// Calendar
router.get('/calendar/upcoming', async (req, res) => {
    try {
        const events = await getUpcomingEvents();
        res.json(events);
    } catch (error) {
        res.status(500).json({ error: "Failed to fetch calendar events" });
    }
});

// Proxies
router.post('/openai/v1/chat/completions', requireModulePermission('manager'), proxyController.openaiProxy);
router.post('/fireflies/graphql', requireModulePermission('minutas'), proxyController.firefliesProxy);

// Re-mount existing routers
router.use('/user', userRouter);
router.use('/team', teamRouter);
router.use('/feedback', feedbackRouter);
router.use('/integrations', integrationsRouter);
router.use('/content', requireModulePermission('parrillas'), contentRouter);
router.use('/db', dbRouter);
router.use('/clients/:clientId', requireModulePermission('clientes'), clientFileRouter);
router.use('/talent-radar', talentRadarRouter);
router.use('/activity', requireModulePermission('actividad'), activityRouter);
router.use('/dashboard', dashboardRouter);
router.use('/reports', requireModulePermission('reportes'), reportsRouter);
router.use('/brain-core', brainCoreRouter);
router.use('/boards', requireModulePermission('inspiracion'), boardsRouter);
router.use('/operative-intelligence', operativeIntelligenceRouter);
router.use('/financials', financialsRouter);
router.use('/growth', requireModulePermission('crecimiento'), growthRouter);

export default router;
