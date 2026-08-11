import webpush from 'web-push';
import prisma from '../lib/prisma.js';
import { getNotificationDisplayParts } from '../utils/notificationUtils.js';

const DEFAULT_PREFERENCES = Object.freeze({
  tasks: true,
  mentions: true,
  announcements: true
});

const VAPID_PUBLIC_KEY = String(process.env.WEB_PUSH_PUBLIC_KEY || '').trim();
const VAPID_PRIVATE_KEY = String(process.env.WEB_PUSH_PRIVATE_KEY || '').trim();
const VAPID_SUBJECT = String(process.env.WEB_PUSH_SUBJECT || '').trim();
let vapidConfigured = false;

export const isPushConfigured = () => Boolean(
  VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY && /^(mailto:|https?:\/\/)/i.test(VAPID_SUBJECT)
);

const configureWebPush = () => {
  if (!isPushConfigured()) return false;
  if (!vapidConfigured) {
    webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
    vapidConfigured = true;
  }
  return true;
};

const createValidationError = () => {
  const error = new Error('La suscripcion push no es valida.');
  error.statusCode = 400;
  return error;
};

export const normalizePushSubscription = (subscription = {}) => {
  let endpointUrl;
  try {
    endpointUrl = new URL(String(subscription.endpoint || ''));
  } catch {
    throw createValidationError();
  }

  const p256dh = String(subscription.keys?.p256dh || '').trim();
  const auth = String(subscription.keys?.auth || '').trim();
  if (
    endpointUrl.protocol !== 'https:' ||
    endpointUrl.href.length > 4096 ||
    !p256dh || p256dh.length > 1024 ||
    !auth || auth.length > 1024
  ) {
    throw createValidationError();
  }

  return { endpoint: endpointUrl.href, p256dh, auth };
};

const normalizePreferences = (preferences) => ({
  tasks: preferences?.tasks !== false,
  mentions: preferences?.mentions !== false,
  announcements: preferences?.announcements !== false
});

const getCategory = (type = '') => {
  if (type.includes('MENTION') || type === 'TASK_COMMENT_REPLY') return 'mentions';
  if (type.startsWith('TASK_')) return 'tasks';
  if (type.includes('ANNOUNCEMENT')) return 'announcements';
  return 'tasks';
};

const safeRelativeUrl = (candidate) => {
  if (!candidate || typeof candidate !== 'string') return null;
  try {
    const base = new URL('https://brainstudio.local');
    const targetUrl = new URL(candidate, base);
    if (targetUrl.origin !== base.origin || !candidate.startsWith('/')) return null;
    return `${targetUrl.pathname}${targetUrl.search}${targetUrl.hash}`;
  } catch {
    return null;
  }
};

export const getPushDestination = (notification = {}) => {
  const explicitUrl = safeRelativeUrl(notification.url);
  if (explicitUrl) return explicitUrl;

  const taskId = notification.taskId || notification.relatedId;
  if (notification.type === 'TASK_RETURNED' && taskId) {
    return `/gestion?showReturned=true&taskId=${encodeURIComponent(taskId)}`;
  }
  if (notification.type?.startsWith('TASK_') && taskId) {
    return `/gestion?taskId=${encodeURIComponent(taskId)}`;
  }
  if (notification.type === 'CAMPFIRE_MENTION' && notification.relatedId) {
    return `/cliente/${encodeURIComponent(notification.relatedId)}?openChat=true`;
  }
  if (notification.type === 'ANNOUNCEMENT_CLIENT' && notification.relatedId) {
    return `/cliente/${encodeURIComponent(notification.relatedId)}`;
  }
  return '/';
};

export const buildPushPayload = (notification, badgeCount = 1) => {
  const display = getNotificationDisplayParts(notification);
  const fallbackBody = display.context || display.title || 'Tienes una novedad en Brainstudio.';
  const hasSeparateBody = Boolean(display.body || display.context);

  return {
    title: hasSeparateBody ? display.title : 'Brainstudio Intelligence',
    body: display.body || display.context || fallbackBody,
    url: getPushDestination(notification),
    tag: notification.taskId ? `task-${notification.taskId}` : `notification-${notification.id}`,
    notificationId: notification.id,
    badgeCount: Math.max(1, Number(badgeCount) || 1),
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-192.png'
  };
};

export const getPushStatus = async (userId, { db = prisma } = {}) => {
  const activeDeviceCount = await db.pushSubscription.count({
    where: { userId, isActive: true }
  });
  return {
    enabled: isPushConfigured(),
    publicKey: isPushConfigured() ? VAPID_PUBLIC_KEY : null,
    activeDeviceCount
  };
};

export const upsertPushSubscription = async (
  userId,
  subscription,
  metadata = {},
  { db = prisma } = {}
) => {
  const normalized = normalizePushSubscription(subscription);
  const userAgent = String(metadata.userAgent || '').slice(0, 512) || null;
  const deviceLabel = String(metadata.deviceLabel || '').slice(0, 120) || null;
  const preferences = normalizePreferences(metadata.preferences || DEFAULT_PREFERENCES);

  return db.pushSubscription.upsert({
    where: { endpoint: normalized.endpoint },
    update: {
      userId,
      p256dh: normalized.p256dh,
      auth: normalized.auth,
      userAgent,
      deviceLabel,
      preferences,
      isActive: true,
      failureCount: 0
    },
    create: {
      userId,
      ...normalized,
      userAgent,
      deviceLabel,
      preferences
    },
    select: { id: true, deviceLabel: true, preferences: true, createdAt: true }
  });
};

export const removePushSubscription = async (userId, endpoint, { db = prisma } = {}) => {
  if (!endpoint || typeof endpoint !== 'string') {
    throw createValidationError();
  }
  return db.pushSubscription.deleteMany({ where: { userId, endpoint } });
};

export const updatePushPreferences = async (userId, endpoint, preferences, { db = prisma } = {}) => {
  if (!endpoint || typeof endpoint !== 'string') throw createValidationError();
  const result = await db.pushSubscription.updateMany({
    where: { userId, endpoint, isActive: true },
    data: { preferences: normalizePreferences(preferences) }
  });
  if (result.count === 0) {
    const error = new Error('El dispositivo no tiene una suscripcion activa.');
    error.statusCode = 404;
    throw error;
  }
  return normalizePreferences(preferences);
};

const isExpiredSubscriptionError = (error) => [404, 410].includes(Number(error?.statusCode));

export const sendPushForNotification = async (
  notification,
  {
    db = prisma,
    configured = isPushConfigured(),
    sendNotification = (subscription, payload) => {
      configureWebPush();
      return webpush.sendNotification(subscription, payload, { TTL: 60 * 60 * 24 });
    }
  } = {}
) => {
  if (!configured || !notification?.userId) {
    return { attempted: 0, delivered: 0, removed: 0 };
  }

  const subscriptions = await db.pushSubscription.findMany({
    where: { userId: notification.userId, isActive: true },
    select: { id: true, endpoint: true, p256dh: true, auth: true, preferences: true }
  });
  const category = getCategory(notification.type);
  const eligible = subscriptions.filter((subscription) => normalizePreferences(subscription.preferences)[category]);
  if (eligible.length === 0) return { attempted: 0, delivered: 0, removed: 0 };

  const unreadCount = await db.notification.count({
    where: { userId: notification.userId, isRead: false }
  });
  const payload = JSON.stringify(buildPushPayload(notification, unreadCount));
  let delivered = 0;
  let removed = 0;

  await Promise.all(eligible.map(async (subscription) => {
    const browserSubscription = {
      endpoint: subscription.endpoint,
      keys: { p256dh: subscription.p256dh, auth: subscription.auth }
    };
    try {
      await sendNotification(browserSubscription, payload);
      delivered += 1;
      await db.pushSubscription.update({
        where: { id: subscription.id },
        data: { lastUsedAt: new Date(), failureCount: 0 }
      });
    } catch (error) {
      if (isExpiredSubscriptionError(error)) {
        removed += 1;
        await db.pushSubscription.deleteMany({
          where: { id: subscription.id, userId: notification.userId }
        });
        return;
      }
      await db.pushSubscription.update({
        where: { id: subscription.id },
        data: { failureCount: { increment: 1 } }
      }).catch((updateError) => {
        console.error('[PushNotificationService] Could not record delivery failure:', updateError?.message || updateError);
      });
      console.error('[PushNotificationService] Delivery failed:', error?.statusCode || error?.message || 'Unknown provider error');
    }
  }));

  return { attempted: eligible.length, delivered, removed };
};
