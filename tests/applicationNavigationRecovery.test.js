import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import {
  PRELOAD_RECOVERY_KEY,
  createVitePreloadErrorHandler
} from '../src/pwa/preloadRecovery.js';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

const createStorage = () => {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key)
  };
};

test('a stale Vite chunk triggers one controlled application refresh', () => {
  const storage = createStorage();
  let reloads = 0;
  let prevented = 0;
  const handler = createVitePreloadErrorHandler({
    buildVersion: 'build-123',
    storage,
    location: { pathname: '/actividad', search: '?vista=calendario' },
    reload: () => { reloads += 1; }
  });

  handler({ preventDefault: () => { prevented += 1; } });

  assert.equal(reloads, 1);
  assert.equal(prevented, 1);
  assert.equal(storage.getItem(PRELOAD_RECOVERY_KEY), 'build-123:/actividad?vista=calendario');
});

test('a repeated chunk failure reaches the error boundary instead of reloading forever', () => {
  const storage = createStorage();
  storage.setItem(PRELOAD_RECOVERY_KEY, 'build-123:/actividad');
  let reloads = 0;
  let prevented = 0;
  const handler = createVitePreloadErrorHandler({
    buildVersion: 'build-123',
    storage,
    location: { pathname: '/actividad', search: '' },
    reload: () => { reloads += 1; }
  });

  handler({ preventDefault: () => { prevented += 1; } });

  assert.equal(reloads, 0);
  assert.equal(prevented, 0);
});

test('chunk recovery still reloads when session storage is unavailable', () => {
  let reloads = 0;
  let prevented = 0;
  const unavailableStorage = {
    getItem: () => { throw new Error('storage disabled'); },
    setItem: () => { throw new Error('storage disabled'); }
  };
  const handler = createVitePreloadErrorHandler({
    buildVersion: 'build-123',
    storage: unavailableStorage,
    location: { pathname: '/actividad', search: '' },
    reload: () => { reloads += 1; }
  });

  assert.doesNotThrow(() => handler({ preventDefault: () => { prevented += 1; } }));
  assert.equal(reloads, 1);
  assert.equal(prevented, 1);
});

test('the application installs global navigation recovery before rendering', async () => {
  const [main, boundary, server] = await Promise.all([
    read('src/main.jsx'),
    read('src/components/errors/ApplicationErrorBoundary.jsx'),
    read('server.js')
  ]);

  assert.match(main, /installVitePreloadRecovery\(\)/);
  assert.match(main, /<ApplicationErrorBoundary>/);
  assert.match(boundary, /componentDidCatch/);
  assert.match(boundary, /No pudimos cargar esta secci\S*n/);
  assert.match(boundary, /Actualizar aplicaci\S*n/);
  assert.match(boundary, /dark:/);
  assert.match(boundary, /min-h-11/);
  assert.match(server, /app\.get\('\/assets\/\*'/);
  assert.ok(
    server.indexOf("app.get('/assets/*'") < server.indexOf("app.get('*'"),
    'missing static assets must return 404 before the SPA fallback'
  );
});
