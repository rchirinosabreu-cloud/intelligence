import {
  getPushStatus,
  removePushSubscription,
  updatePushPreferences,
  upsertPushSubscription
} from '../services/pushNotificationService.js';

const sendError = (res, error, fallback) => {
  console.error('[PushNotificationController]', error?.message || error);
  res.status(error?.statusCode || 500).json({ error: error?.statusCode ? error.message : fallback });
};

export const status = async (req, res) => {
  try {
    res.setHeader('Cache-Control', 'no-store, max-age=0');
    res.json(await getPushStatus(req.user.userId));
  } catch (error) {
    sendError(res, error, 'No fue posible consultar las notificaciones del dispositivo.');
  }
};

export const subscribe = async (req, res) => {
  try {
    const subscription = await upsertPushSubscription(
      req.user.userId,
      req.body?.subscription,
      {
        userAgent: req.get('user-agent'),
        deviceLabel: req.body?.deviceLabel,
        preferences: req.body?.preferences
      }
    );
    res.status(201).json({ success: true, subscription });
  } catch (error) {
    sendError(res, error, 'No fue posible activar las notificaciones del dispositivo.');
  }
};

export const unsubscribe = async (req, res) => {
  try {
    await removePushSubscription(req.user.userId, req.body?.endpoint);
    res.json({ success: true });
  } catch (error) {
    sendError(res, error, 'No fue posible desactivar las notificaciones del dispositivo.');
  }
};

export const updatePreferences = async (req, res) => {
  try {
    const preferences = await updatePushPreferences(
      req.user.userId,
      req.body?.endpoint,
      req.body?.preferences
    );
    res.json({ success: true, preferences });
  } catch (error) {
    sendError(res, error, 'No fue posible actualizar las preferencias de notificacion.');
  }
};
