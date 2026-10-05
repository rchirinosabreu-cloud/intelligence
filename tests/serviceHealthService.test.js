import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { createServiceHealthService } from '../src/services/serviceHealthService.js';
import { createServiceHealthRouter } from '../src/routes/api/serviceHealth.js';
import { initServiceHealthScheduler } from '../src/services/serviceHealthScheduler.js';
import { LIGHTS } from '../src/lib/serviceHealth.js';

const MIN = 60 * 1000;
const NOW = new Date('2026-10-04T15:00:00.000Z');

const catalog = [
  { id: 'database', label: 'Base de datos', purpose: 'p', impact: 'i', intervalMs: 5 * MIN },
  { id: 'email', label: 'Correo', purpose: 'p', impact: 'i', intervalMs: 30 * MIN }
];

const memoryDb = (rows = []) => {
  const store = [...rows];
  return {
    store,
    serviceHealthCheck: {
      async groupBy() {
        const latest = new Map();
        for (const row of store) {
          if (!latest.has(row.serviceId) || row.checkedAt > latest.get(row.serviceId)) latest.set(row.serviceId, row.checkedAt);
        }
        return [...latest].map(([serviceId, checkedAt]) => ({ serviceId, _max: { checkedAt } }));
      },
      async createMany({ data }) {
        store.push(...data);
        return { count: data.length };
      },
      async findMany({ where }) {
        return store
          .filter((row) => row.checkedAt >= where.checkedAt.gte)
          .sort((a, b) => b.checkedAt - a.checkedAt);
      },
      async deleteMany({ where }) {
        const before = store.length;
        for (let index = store.length - 1; index >= 0; index -= 1) {
          if (store[index].checkedAt < where.checkedAt.lt) store.splice(index, 1);
        }
        return { count: before - store.length };
      }
    }
  };
};

const row = (serviceId, status, minutesAgo, extra = {}) => ({
  id: `${serviceId}-${minutesAgo}`,
  serviceId,
  status,
  critical: false,
  latencyMs: 50,
  message: null,
  errorCode: null,
  checkedAt: new Date(NOW.getTime() - minutesAgo * MIN),
  ...extra
});

test('only the services whose interval passed are checked, and every check is stored', async () => {
  const db = memoryDb([row('database', 'OK', 6), row('email', 'OK', 10)]);
  const calls = [];
  const service = createServiceHealthService({
    db, catalog, now: () => NOW,
    probes: {
      database: async () => { calls.push('database'); return { status: 'OK', message: 'bien', critical: false, errorCode: null, latencyMs: 12 }; },
      email: async () => { calls.push('email'); return { status: 'OK', message: 'bien', critical: false, errorCode: null }; }
    }
  });
  const ran = await service.runDueChecks();
  assert.deepEqual(calls, ['database']);
  assert.equal(ran.length, 1);
  const stored = db.store.at(-1);
  assert.equal(stored.serviceId, 'database');
  assert.equal(stored.latencyMs, 12);
  assert.ok(stored.id);

  await service.runDueChecks({ force: true });
  assert.deepEqual(calls, ['database', 'database', 'email']);
});

test('a probe that is missing or throws is stored as a failure, never lost', async () => {
  const db = memoryDb();
  const service = createServiceHealthService({ db, catalog, now: () => NOW, probes: { database: async () => { throw new Error('boom'); } } });
  await service.runDueChecks();
  assert.equal(db.store.length, 2);
  assert.ok(db.store.every((item) => item.status === 'FAIL'));
});

test('checks older than 30 days are purged', async () => {
  const db = memoryDb([row('database', 'OK', 31 * 24 * 60), row('database', 'OK', 60)]);
  const service = createServiceHealthService({ db, catalog, now: () => NOW, probes: {} });
  await service.purgeOldChecks();
  assert.equal(db.store.length, 1);
});

test('the board gives each service its light, reason, last check and 24 hours of history', async () => {
  const db = memoryDb([
    row('database', 'FAIL', 1, { message: 'No respondió a tiempo.' }),
    row('database', 'FAIL', 6),
    row('database', 'OK', 11),
    row('email', 'OK', 20)
  ]);
  const service = createServiceHealthService({ db, catalog, now: () => NOW, probes: {} });
  const board = await service.getBoard();
  assert.equal(board.overall, LIGHTS.RED);
  const database = board.services.find((item) => item.id === 'database');
  assert.equal(database.light, LIGHTS.RED);
  assert.equal(database.reason, 'No respondió a tiempo.');
  assert.equal(database.history.length, 24);
  assert.equal(database.lastCheck.status, 'FAIL');
  assert.equal(database.uptime24h, 33);
  assert.equal(board.services.find((item) => item.id === 'email').light, LIGHTS.GREEN);
  assert.equal(board.counts.RED, 1);
});

const withServer = async (app, run) => {
  const server = await new Promise((resolve) => { const running = app.listen(0, '127.0.0.1', () => resolve(running)); });
  try {
    await run(`http://127.0.0.1:${server.address().port}/service-health`);
  } finally {
    server.close();
  }
};

const buildApp = ({ role = 'ADMIN', service }) => {
  const app = express();
  app.use((req, _res, next) => { req.user = { userId: 'u1', role }; next(); });
  app.use('/service-health', createServiceHealthRouter({ service, logger: { error() {} } }));
  return app;
};

test('only administrators read the board or force a check', async () => {
  const service = { getBoard: async () => ({ overall: 'GREEN' }), runDueChecks: async () => [] };
  await withServer(buildApp({ role: 'EDITOR', service }), async (base) => {
    assert.equal((await fetch(base)).status, 403);
    assert.equal((await fetch(`${base}/run`, { method: 'POST' })).status, 403);
  });
  await withServer(buildApp({ role: 'ADMIN', service }), async (base) => {
    const response = await fetch(base);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.deepEqual(await response.json(), { overall: 'GREEN' });
  });
});

test('a forced check runs every service once and refuses to be hammered', async () => {
  let forced = 0;
  const service = { getBoard: async () => ({ overall: 'GREEN' }), runDueChecks: async ({ force }) => { if (force) forced += 1; return []; } };
  await withServer(buildApp({ service }), async (base) => {
    assert.equal((await fetch(`${base}/run`, { method: 'POST' })).status, 200);
    const again = await fetch(`${base}/run`, { method: 'POST' });
    assert.equal(again.status, 429);
    assert.match((await again.json()).error, /espera/i);
  });
  assert.equal(forced, 1);
});

test('a failing board answers with a human message, never internals', async () => {
  const service = { getBoard: async () => { throw new Error('postgres://secret'); }, runDueChecks: async () => [] };
  await withServer(buildApp({ service }), async (base) => {
    const response = await fetch(base);
    assert.equal(response.status, 500);
    assert.doesNotMatch(await response.text(), /postgres/);
  });
});

test('the scheduler ticks every minute, never overlaps and survives a failing run', async () => {
  const timers = [];
  let running = 0;
  let maxRunning = 0;
  let calls = 0;
  const scheduler = initServiceHealthScheduler({
    run: async () => {
      calls += 1;
      running += 1;
      maxRunning = Math.max(maxRunning, running);
      await new Promise((resolve) => setImmediate(resolve));
      running -= 1;
      if (calls === 2) throw new Error('fallo');
    },
    setTimeoutFn: (fn, ms) => { timers.push(['timeout', ms]); return { unref() {} }; },
    setIntervalFn: (fn, ms) => { timers.push(['interval', ms]); return { unref() {} }; },
    logger: { info() {}, error() {} }
  });
  assert.deepEqual(timers.map(([kind]) => kind), ['timeout', 'interval']);
  assert.equal(timers[1][1], 60 * 1000);
  await Promise.all([scheduler.tick(), scheduler.tick()]);
  assert.equal(maxRunning, 1);
  await scheduler.tick();
  assert.equal(calls, 2);
});
