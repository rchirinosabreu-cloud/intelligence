import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('push subscriptions are user-owned, unique per endpoint and indexed for active delivery', async () => {
  const schema = await read('prisma/schema.prisma');
  const userModel = schema.match(/model User \{[\s\S]*?\n\}/)?.[0] || '';
  const subscriptionModel = schema.match(/model PushSubscription \{[\s\S]*?\n\}/)?.[0] || '';

  assert.match(userModel, /pushSubscriptions\s+PushSubscription\[\]/);
  assert.match(subscriptionModel, /endpoint\s+String\s+@unique/);
  assert.match(subscriptionModel, /user\s+User\s+@relation\(fields: \[userId\], references: \[id\], onDelete: Cascade\)/);
  assert.match(subscriptionModel, /@@index\(\[userId, isActive\]\)/);
});

test('push endpoints remain behind authentication and never accept a user id from the client', async () => {
  const routes = await read('src/routes/index.js');
  const controller = await read('src/controllers/pushNotificationController.js');
  const authBoundary = routes.indexOf('router.use(authenticateToken)');
  const pushBoundary = routes.indexOf("router.get('/push/status'");

  assert.ok(authBoundary > -1 && pushBoundary > authBoundary);
  assert.match(controller, /req\.user\.userId/);
  assert.doesNotMatch(controller, /req\.body\.userId/);
  assert.match(controller, /Cache-Control', 'no-store/);
});

test('the service worker displays push messages and opens only same-origin app destinations', async () => {
  const worker = await read('public/sw.js');

  assert.match(worker, /addEventListener\('push'/);
  assert.match(worker, /showNotification/);
  assert.match(worker, /addEventListener\('notificationclick'/);
  assert.match(worker, /clients\.openWindow/);
  assert.match(worker, /targetUrl\.origin === self\.location\.origin/);
});

test('the mobile notification prompt is user initiated and reports blocked permissions', async () => {
  const helper = await read('src/pwa/pushNotifications.js');
  const control = await read('src/components/notifications/PushNotificationControl.jsx');
  const shell = await read('src/components/layout/AppLayout.jsx');

  assert.match(helper, /Notification\.requestPermission\(\)/);
  assert.match(control, /onClick=\{handleEnable\}/);
  assert.match(control, /Permiso bloqueado/);
  assert.match(shell, /<PushNotificationControl/);
});

test('service worker updates never cache authenticated notification API responses', async () => {
  const worker = await read('public/sw.js');

  assert.match(worker, /url\.pathname\.startsWith\('\/api\/'\)/);
  assert.doesNotMatch(worker, /cache\.put\([^)]*\/api/s);
});
