const buildVersion = new URL(self.location.href).searchParams.get('v') || 'development';
const shellCache = `brainstudio-shell-${buildVersion}`;
const shellFiles = [
  '/offline.html',
  '/manifest.webmanifest',
  '/icons/icon-192.png',
  '/icons/icon-512.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(shellCache).then((cache) => cache.addAll(shellFiles)));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys
        .filter((key) => key.startsWith('brainstudio-shell-') && key !== shellCache)
        .map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  if (request.method !== 'GET' || url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api/')) return;

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(async () => {
        const cache = await caches.open(shellCache);
        return cache.match('/offline.html');
      })
    );
  }
});

self.addEventListener('push', (event) => {
  let payload = {};
  try {
    payload = event.data?.json() || {};
  } catch {
    payload = { body: event.data?.text() || 'Tienes una novedad en Brainstudio.' };
  }

  const title = payload.title || 'Brainstudio Intelligence';
  const options = {
    body: payload.body || 'Tienes una novedad en Brainstudio.',
    icon: payload.icon || '/icons/icon-192.png',
    badge: payload.badge || '/icons/icon-192.png',
    tag: payload.tag || 'brainstudio-notification',
    renotify: true,
    data: {
      url: payload.url || '/',
      notificationId: payload.notificationId || null
    }
  };

  const updateBadge = typeof self.navigator?.setAppBadge === 'function'
    ? self.navigator.setAppBadge(payload.badgeCount || 1)
    : Promise.resolve();
  event.waitUntil(Promise.all([
    self.registration.showNotification(title, options),
    updateBadge
  ]));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const targetUrl = new URL(event.notification.data?.url || '/', self.location.origin);
  const isSafeTarget = targetUrl.origin === self.location.origin;
  if (!isSafeTarget) {
    targetUrl.href = new URL('/', self.location.origin).href;
  }
  const notificationId = event.notification.data?.notificationId;
  if (notificationId) targetUrl.searchParams.set('pushNotificationId', notificationId);

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(async (windowClients) => {
      const appClient = windowClients.find((client) => new URL(client.url).origin === self.location.origin);
      if (appClient) {
        await appClient.navigate(targetUrl.href);
        return appClient.focus();
      }
      return self.clients.openWindow(targetUrl.href);
    })
  );
});
