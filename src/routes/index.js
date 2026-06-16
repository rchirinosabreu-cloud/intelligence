import express from 'express';
import * as authController from '../controllers/authController.js';
import * as chatController from '../controllers/chatController.js';
import * as taskController from '../controllers/taskController.js';
import * as clientController from '../controllers/clientController.js';
import * as notificationController from '../controllers/notificationController.js';
import * as announcementController from '../controllers/announcementController.js';
import * as flowController from '../controllers/flowController.js';
import * as proxyController from '../controllers/proxyController.js';
import * as publicController from '../controllers/publicController.js';
import { authenticateToken } from '../middlewares/authMiddleware.js';

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
import reportsRouter from './api/reports.js';
import brainCoreRouter from './api/brainCore.js';
import boardsRouter from './api/boards.js';
import quotationsRouter from './api/quotations.js';
import { getUpcomingEvents } from '../services/calendarService.js';

const router = express.Router();

// --- Public Routes (No Auth) ---
router.get('/public/parrilla/:token', publicController.getPublicPlan);
router.post('/public/items/:id/approve', publicController.approvePublicItem);
router.post('/public/items/:id/comment', publicController.commentPublicItem);
router.use('/quotations', quotationsRouter);
router.use('/services', servicesRouter);

// Aliases for services catalog (ensuring compatibility with various frontend versions)
router.get('/services-catalog', (req, res) => res.redirect(307, '/api/services'));

// --- Auth Routes ---
router.post('/login', authController.login);
router.get('/sync-users', authController.syncUsers);
router.post('/users', authenticateToken, authController.createUser);

// --- Protected Routes ---
router.use(authenticateToken);

// System Health
router.get('/health', (req, res) => res.json({ status: 'ok', timestamp: new Date().toISOString() }));

// Chat
router.post('/chat', chatController.handleChat);

// Tasks
router.get('/metrics/tasks', taskController.getMetrics);
router.get('/metrics/quality-streak', taskController.getStreak);
router.get('/tasks/completed', taskController.getCompleted);
router.get('/tasks', taskController.getAllTasks);
router.post('/tasks', taskController.createNewTask);
router.patch('/tasks/:taskId', taskController.updateExistingTask);
router.delete('/tasks/:taskId', taskController.deleteExistingTask);

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
router.get('/clients', clientController.getHealth);
router.get('/db/clients', clientController.listClients);
router.get('/clients/health', clientController.getHealth);
router.post('/clients', clientController.createNewClient);
router.patch('/clients/:id', clientController.updateClient);

// Notifications
router.get('/notifications', notificationController.listNotifications);
router.get('/notifications/unread-count', notificationController.getUnreadCount);
router.post('/notifications', notificationController.addNotification);
router.patch('/notifications/:id/read', notificationController.markRead);
router.post('/notifications/read-all', notificationController.markAllRead);

// Announcements
router.get('/global-announcements', announcementController.listGlobal);
router.post('/global-announcements', announcementController.addGlobal);
router.delete('/global-announcements/:id', announcementController.deleteGlobal);

router.get('/clients/:clientId/announcements', announcementController.listClient);
router.post('/clients/:clientId/announcements', announcementController.addClient);

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
router.post('/openai/v1/chat/completions', proxyController.openaiProxy);
router.post('/fireflies/graphql', proxyController.firefliesProxy);

// Re-mount existing routers
router.use('/user', userRouter);
router.use('/team', teamRouter);
router.use('/feedback', feedbackRouter);
router.use('/integrations', integrationsRouter);
router.use('/content', contentRouter);
router.use('/db', dbRouter);
router.use('/clients/:clientId', clientFileRouter);
router.use('/talent-radar', talentRadarRouter);
router.use('/activity', activityRouter);
router.use('/reports', reportsRouter);
router.use('/brain-core', brainCoreRouter);
router.use('/boards', boardsRouter);

export default router;
