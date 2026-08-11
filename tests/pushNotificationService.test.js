import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildPushPayload,
  normalizePushSubscription,
  sendPushForNotification
} from '../src/services/pushNotificationService.js';
import { createNotification } from '../src/services/notificationService.js';

test('push payloads keep navigation on Brainstudio and expose readable notification content', () => {
  const taskPayload = buildPushPayload({
    id: 'notification-1',
    userId: 'user-1',
    type: 'TASK_ASSIGNED',
    message: 'Se te ha asignado una tarea PRIORITARIA: Preparar parrilla de agosto',
    taskId: 'task-1',
    relatedId: 'task-1'
  }, 3);

  assert.equal(taskPayload.title, 'Se te ha asignado una tarea PRIORITARIA');
  assert.equal(taskPayload.body, 'Preparar parrilla de agosto');
  assert.equal(taskPayload.url, '/gestion?taskId=task-1');
  assert.equal(taskPayload.badgeCount, 3);

  const unsafePayload = buildPushPayload({
    id: 'notification-2',
    userId: 'user-1',
    type: 'TEAM_ANNOUNCEMENT',
    message: '<p>Revisa el anuncio del equipo</p>',
    url: 'https://attacker.example/steal'
  }, 1);

  assert.equal(unsafePayload.title, 'Tienes un nuevo anuncio');
  assert.equal(unsafePayload.body, 'Revisa el anuncio del equipo');
  assert.equal(unsafePayload.url, '/');
});

test('push subscriptions require an HTTPS endpoint and both browser encryption keys', () => {
  assert.deepEqual(normalizePushSubscription({
    endpoint: 'https://push.example/subscription-1',
    expirationTime: null,
    keys: { p256dh: 'public-key', auth: 'auth-secret' }
  }), {
    endpoint: 'https://push.example/subscription-1',
    p256dh: 'public-key',
    auth: 'auth-secret'
  });

  assert.throws(
    () => normalizePushSubscription({
      endpoint: 'http://push.example/subscription-1',
      keys: { p256dh: 'public-key', auth: 'auth-secret' }
    }),
    /suscripcion push no es valida/i
  );
  assert.throws(
    () => normalizePushSubscription({ endpoint: 'https://push.example/subscription-1', keys: {} }),
    /suscripcion push no es valida/i
  );
});

test('push delivery respects preferences and removes expired browser subscriptions', async () => {
  const sends = [];
  const deletes = [];
  const updates = [];
  const db = {
    pushSubscription: {
      findMany: async () => [
        {
          id: 'active-1',
          endpoint: 'https://push.example/active',
          p256dh: 'active-key',
          auth: 'active-auth',
          preferences: { tasks: true, mentions: true, announcements: true }
        },
        {
          id: 'disabled-1',
          endpoint: 'https://push.example/disabled',
          p256dh: 'disabled-key',
          auth: 'disabled-auth',
          preferences: { tasks: false, mentions: true, announcements: true }
        },
        {
          id: 'expired-1',
          endpoint: 'https://push.example/expired',
          p256dh: 'expired-key',
          auth: 'expired-auth',
          preferences: null
        }
      ],
      update: async (payload) => updates.push(payload),
      deleteMany: async (payload) => deletes.push(payload)
    },
    notification: {
      count: async () => 4
    }
  };

  const result = await sendPushForNotification({
    id: 'notification-1',
    userId: 'user-1',
    type: 'TASK_ASSIGNED',
    message: 'Nueva tarea: Preparar propuesta',
    taskId: 'task-1'
  }, {
    db,
    configured: true,
    sendNotification: async (subscription, payload) => {
      sends.push({ subscription, payload: JSON.parse(payload) });
      if (subscription.endpoint.endsWith('/expired')) {
        const error = new Error('Gone');
        error.statusCode = 410;
        throw error;
      }
      return { statusCode: 201 };
    }
  });

  assert.equal(sends.length, 2);
  assert.equal(sends.some(({ subscription }) => subscription.endpoint.endsWith('/disabled')), false);
  assert.equal(updates.length, 1);
  assert.deepEqual(deletes[0].where, { id: 'expired-1', userId: 'user-1' });
  assert.deepEqual(result, { attempted: 2, delivered: 1, removed: 1 });
});

test('internal notification persistence succeeds even if external push delivery fails', async () => {
  const created = {
    id: 'notification-1',
    userId: 'user-1',
    type: 'TASK_ASSIGNED',
    message: 'Nueva tarea: Preparar propuesta',
    taskId: 'task-1'
  };
  let pushAttempts = 0;
  const db = {
    notification: {
      create: async () => created
    }
  };

  const notification = await createNotification(created, {
    db,
    traceRecorder: async () => {},
    pushSender: async () => {
      pushAttempts += 1;
      throw new Error('Push provider unavailable');
    }
  });

  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(notification, created);
  assert.equal(pushAttempts, 1);
});
