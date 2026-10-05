import express from 'express';
import * as authController from '../controllers/authController.js';
import * as taskController from '../controllers/taskController.js';
import { taskCollaboratorController } from '../controllers/taskCollaboratorController.js';
import * as clientController from '../controllers/clientController.js';
import * as notificationController from '../controllers/notificationController.js';
import * as pushNotificationController from '../controllers/pushNotificationController.js';
import * as announcementController from '../controllers/announcementController.js';
import * as flowController from '../controllers/flowController.js';
import * as proxyController from '../controllers/proxyController.js';
import * as publicController from '../controllers/publicController.js';
import * as managerTaskAnalyticsController from '../controllers/managerTaskAnalyticsController.js';
import * as briaMemoryController from '../controllers/briaMemoryController.js';
import * as briaObserverController from '../controllers/briaObserverController.js';
import * as commercialRequestController from '../controllers/commercialRequestController.js';
import { authenticateToken, requireManagerRole, requireModulePermission } from '../middlewares/authMiddleware.js';
import { isMfaRequiredForRole } from '../lib/mfaPolicy.js';
import { aiRequestContextMiddleware, runWithAiContext } from '../lib/aiRequestContext.js';
// La cerradura de un pendiente privado: el tablero ya no manda su contenido, y estas
// rutas —comentarios, adjuntos y la propia tarea— tampoco se lo dan a quien no puede
// abrirla. Contrato que vigila que no se olvide ninguna: tests/taskPrivacyRoutes.test.js
import { requireTaskAccess } from '../middlewares/taskPrivacyMiddleware.js';

const guardTask = requireTaskAccess();
import prisma from '../lib/prisma.js';
import multer from 'multer';
import { MAX_COMMENT_FILES, MAX_COMMENT_FILE_BYTES } from '../lib/taskCommentAttachments.js';

// Import existing modular routers
import teamRouter from './api/team.js';
import userRouter from './api/user.js';
import feedbackRouter from './api/feedback.js';
import contentRouter from './api/content.js';
import dbRouter from './api/db.js';
import servicesRouter from './api/services.js';
import clientFileRouter from './api/clientFiles.js';
import talentRadarRouter from './api/talentRadar.js';
import activityRouter from './api/activity.js';
import reportsRouter from './api/reports.js';
import boardsRouter from './api/boards.js';
import quotationsRouter from './api/quotations.js';
import financialsRouter from './api/financials.js';
import dashboardRouter from './api/dashboard.js';
import recognitionRouter from './api/recognitions.js';
import reportPdfRouter from './api/reportPdf.js';
import minutesRouter from './api/minutes.js';
import driveRouter from './api/drive.js';
import crmRouter from './api/crm.js';
import socialPublishingRouter from './api/socialPublishing.js';
import clientOperationsRouter from './api/clientOperations.js';
import { createAiGovernanceRouter } from './api/aiGovernance.js';
import { createServiceHealthRouter } from './api/serviceHealth.js';
import { createTeamChatRouter, createTeamChatMediaRouter } from './api/teamChat.js';
import { handleGoogleCalendarWebhook } from '../services/operationalEventService.js';
import { handleFirefliesWebhook } from '../services/firefliesWebhookService.js';

const router = express.Router();
const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 25 * 1024 * 1024, files: 1 }
});
const commentUpload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: MAX_COMMENT_FILE_BYTES, files: MAX_COMMENT_FILES }
});

// --- Public Routes (No Auth) ---
router.get('/public/parrilla/:token', publicController.getPublicPlan);
router.get('/public/parrilla/:token/items/:id/final-asset', publicController.getPublicFinalAsset);
router.get('/public/parrilla/:token/items/:id/final-assets/:assetId', publicController.getPublicFinalAssetById);
router.post('/public/parrilla/:token/items/:id/approve', publicController.approvePublicItem);
router.post('/public/parrilla/:token/items/:id/comment', publicController.commentPublicItem);
// Public commercial request form → CRM opportunity. Rate limited by the /api/public limiter in server.js.
router.post('/public/commercial-request', express.json({ limit: '200kb' }), commercialRequestController.receive);
router.use('/quotations', quotationsRouter);
router.use('/services', servicesRouter);
// Aliases for services catalog (ensuring compatibility with various frontend versions)
router.get('/services-catalog', (req, res) => res.redirect(307, '/api/services'));

// --- Auth Routes ---
router.post('/login', authController.login);
// Segundo paso del inicio de sesión; comparte el límite de intentos de /api/login.
router.post('/login/mfa', authController.loginWithMfa);
router.post('/password-reset/request', authController.sendPasswordReset);
router.post('/password-reset/confirm', authController.resetPasswordWithCode);
router.post('/users', authenticateToken, authController.createUser);

// Public by design: Fireflies cannot authenticate, so the HMAC signature is the
// door. Answers 202 immediately and analyses afterwards.
router.post('/minutes/fireflies/webhook', async (req, res) => {
    try {
        // Sin persona detrás: el registro de uso de IA lo anota como minutas automáticas.
        const outcome = await runWithAiContext({ module: 'minutes-automatic', route: 'POST /api/minutes/fireflies/webhook' }, () => handleFirefliesWebhook({
            rawBody: req.rawBody,
            signature: req.headers['x-hub-signature'] || req.headers['x-hub-signature-256'],
            body: req.body
        }));
        return res.status(outcome.status).json(outcome.body);
    } catch (error) {
        console.error('[FirefliesWebhook] Error procesando el aviso:', error.response?.data || error.message || error);
        return res.status(500).json({ error: 'FIREFLIES_WEBHOOK_FAILED' });
    }
});

router.post('/activity/google-calendar/webhook', async (req, res) => {
    try {
        const result = await handleGoogleCalendarWebhook(req.headers);
        if (!result.accepted) return res.status(404).json({ accepted: false });
        return res.status(202).json({ accepted: true });
    } catch (error) {
        console.error('[GoogleCalendarWebhook] Error procesando notificación:', error.response?.data || error);
        return res.status(500).json({ accepted: false });
    }
});

// --- Protected Routes ---
// Scoped media tickets validate user, session and exact message/attachment on every request.
router.use('/team-chat-media', createTeamChatMediaRouter());
router.use(authenticateToken);
// Quién y desde qué módulo, para el registro de uso de IA del control de salida.
router.use(aiRequestContextMiddleware);
router.use('/team-chat', createTeamChatRouter());

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
                modulePermissions: true,
                mfaEnabledAt: true
            }
        });
        if (user) {
            user.mfaEnabled = Boolean(user.mfaEnabledAt);
            user.mfaEnrollmentRequired = !user.mfaEnabledAt && isMfaRequiredForRole(user.role);
            delete user.mfaEnabledAt;
        }
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

// Manager descriptive task intelligence. Keep this restricted to operational leaders.
router.get(
    '/manager/task-analytics',
    requireModulePermission('manager'),
    requireManagerRole,
    managerTaskAnalyticsController.getTaskAnalytics
);
router.get(
    '/manager/bria-memory',
    requireModulePermission('manager'),
    requireManagerRole,
    briaMemoryController.overview
);
router.get(
    '/manager/bria-memory/search',
    requireModulePermission('manager'),
    requireManagerRole,
    briaMemoryController.search
);
router.post(
    '/manager/bria-memory/sync',
    requireModulePermission('manager'),
    requireManagerRole,
    briaMemoryController.sync
);
router.get(
    '/manager/observer-signals',
    requireModulePermission('manager'),
    requireManagerRole,
    briaObserverController.inbox
);
router.post(
    '/manager/observer-signals/sync',
    requireModulePermission('manager'),
    requireManagerRole,
    briaObserverController.sync
);
router.patch(
    '/manager/observer-signals/:id',
    requireModulePermission('manager'),
    requireManagerRole,
    briaObserverController.transition
);

// Tasks
router.use('/tasks', requireModulePermission('gestion'));
router.get('/metrics/quality-streak', taskController.getStreak);
router.get('/tasks/completed', taskController.getCompleted);
router.get('/tasks/work-alerts', taskController.getMyExcessiveTaskAlerts);
router.get('/tasks/returned-alerts', taskController.getMyReturnedTaskAlerts);
router.get('/tasks', taskController.getAllTasks);
router.post('/tasks', taskController.createNewTask);
router.post('/tasks/upload-temp', upload.single('file'), taskController.uploadTempFile);
router.post('/tasks/reorder', taskController.reorderTasks);
router.post('/tasks/:taskId/work-confirmation', taskController.confirmExcessiveTaskWork);
router.post('/tasks/:taskId/alert-interaction', taskController.taskAlertInteractionHandler);
router.post('/tasks/:taskId/returned-reminder/snooze', taskController.snoozeReturnedTaskReminder);
router.post('/tasks/:taskId/focus-extension', taskController.requestTaskFocusExtension);
router.patch('/tasks/:taskId', guardTask, taskController.updateExistingTask);
router.delete('/tasks/:taskId', guardTask, taskController.deleteExistingTask);
router.post('/tasks/:taskId/toggle-follow', taskController.toggleFollow);
router.get('/tasks/:taskId/follow-status', taskController.getFollowStatus);
router.post('/tasks/:taskId/trace-open', taskController.traceTaskOpen);
router.get('/tasks/:taskId/work-history', guardTask, taskController.getTaskWorkHistory);
// Colaboradores (5 de octubre de 2026): el tiempo del equipo y el reloj propio de cada colaborador.
router.get('/tasks/:taskId/work/team', guardTask, taskCollaboratorController.getTeamTime);
router.post('/tasks/:taskId/work/start', guardTask, taskCollaboratorController.startWork);
router.post('/tasks/:taskId/work/pause', guardTask, taskCollaboratorController.pauseWork);
router.get('/tasks/:taskId/attachments/:attachmentId/file', guardTask, taskController.getTaskAttachmentFileProxy);
router.get('/tasks/:taskId/attachments/:attachmentId/download', guardTask, taskController.getTaskAttachmentDownloadProxy);
router.get('/tasks/:taskId/comments', guardTask, taskController.getTaskComments);
router.post('/tasks/:taskId/comments', guardTask, commentUpload.array('file', MAX_COMMENT_FILES), taskController.addTaskComment);
router.get('/tasks/:taskId/comments/:commentId/file', guardTask, taskController.getCommentFileProxy);
router.get('/tasks/:taskId/comments/:commentId/download', guardTask, taskController.getCommentFileDownloadProxy);
router.post('/tasks/:taskId/comments/:commentId/reactions', guardTask, taskController.toggleCommentReaction);
router.patch('/tasks/:taskId/comments/:commentId', guardTask, taskController.updateTaskComment);
router.delete('/tasks/:taskId/comments/:commentId', guardTask, taskController.deleteTaskComment);

// Client Specific (Links, Logo)
router.get('/db/clients/:clientId/links', clientController.getLinks);
router.post('/db/clients/:clientId/links', clientController.addLink);
router.delete('/db/links/:linkId', clientController.deleteLink);

router.get('/clients/:clientId/logo-image', clientController.getLogoProxy);

// Clients
router.get('/clients', clientController.listClients);
router.get('/db/clients', clientController.listClients);
router.post('/clients', requireManagerRole, clientController.createNewClient);
router.patch('/clients/:id', requireManagerRole, clientController.updateClient);
router.patch('/clients/:id/archive', requireManagerRole, clientController.archiveClientHandler);

// Notifications
router.get('/notifications', notificationController.listNotifications);
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

// Proxies
router.post('/openai/v1/chat/completions', requireModulePermission('manager'), proxyController.openaiProxy);
router.post('/fireflies/graphql', requireModulePermission('minutas'), proxyController.firefliesProxy);
router.use('/report-pdf', requireModulePermission('minutas'), reportPdfRouter);
router.use('/minutes', requireModulePermission('minutas'), minutesRouter);
router.use('/drive', requireModulePermission('minutas'), driveRouter);

// Re-mount existing routers
router.use('/user', userRouter);
router.use('/team', teamRouter);
router.use('/feedback', feedbackRouter);
router.use('/content', requireModulePermission('parrillas'), contentRouter);
router.use('/social', requireModulePermission('parrillas'), socialPublishingRouter);
router.use('/db', dbRouter);
router.use('/clients/:clientId', requireModulePermission('clientes'), clientFileRouter);
router.use('/client-operations', requireModulePermission('clientes'), clientOperationsRouter);
router.use('/talent-radar', talentRadarRouter);
router.use('/activity', requireModulePermission('actividad'), activityRouter);
router.use('/dashboard', dashboardRouter);
router.use('/recognitions', recognitionRouter);
router.use('/reports', requireModulePermission('reportes'), reportsRouter);
router.use('/boards', requireModulePermission('inspiracion'), boardsRouter);
router.use('/financials', financialsRouter);
router.use('/crm', requireModulePermission('crm'), crmRouter);
router.use('/ai-governance', createAiGovernanceRouter());
router.use('/service-health', createServiceHealthRouter());

export default router;
