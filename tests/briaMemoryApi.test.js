import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createBriaMemoryOverviewHandler,
  createBriaMemorySearchHandler,
  createBriaMemorySyncHandler
} from '../src/controllers/briaMemoryController.js';
import {
  BRIA_MEMORY_INTERVAL_MS,
  initBriaMemoryScheduler
} from '../src/services/briaMemoryScheduler.js';

const createResponse = () => ({
  statusCode: 200,
  body: null,
  status(code) { this.statusCode = code; return this; },
  json(body) { this.body = body; return this; }
});

test('memory overview and search handlers expose traceable data', async () => {
  const overviewResponse = createResponse();
  await createBriaMemoryOverviewHandler(async () => ({ summary: { sourceCount: 3 } }))({}, overviewResponse);
  assert.equal(overviewResponse.statusCode, 200);
  assert.equal(overviewResponse.body.summary.sourceCount, 3);

  const searchResponse = createResponse();
  await createBriaMemorySearchHandler(async ({ query }) => [{ title: 'Minuta', sourceUrl: '/minutas', content: query }])(
    { query: { q: '¿Qué aprobó el cliente?' } },
    searchResponse
  );
  assert.equal(searchResponse.statusCode, 200);
  assert.equal(searchResponse.body.results[0].sourceUrl, '/minutas');
});

test('memory search rejects an empty question before calling embeddings', async () => {
  let calls = 0;
  const response = createResponse();
  await createBriaMemorySearchHandler(async () => { calls += 1; return []; })({ query: {} }, response);
  assert.equal(response.statusCode, 400);
  assert.equal(response.body.error, 'BRIA_MEMORY_QUERY_REQUIRED');
  assert.equal(calls, 0);
});

test('manual reconciliation only reports success after the backend finishes', async () => {
  const response = createResponse();
  await createBriaMemorySyncHandler(async () => ({ reviewed: 8, indexed: 3, failed: 0 }))({}, response);
  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.body, { reviewed: 8, indexed: 3, failed: 0 });
});

test('Bria memory reconciles automatically every ten minutes without overlapping runs', async () => {
  const timers = [];
  let runs = 0;
  let release;
  const pending = new Promise((resolve) => { release = resolve; });
  const scheduler = initBriaMemoryScheduler({
    reconcile: async () => { runs += 1; await pending; return { indexed: 0 }; },
    setTimeoutFn: (fn, delay) => { timers.push({ type: 'timeout', fn, delay }); return { unref() {} }; },
    setIntervalFn: (fn, delay) => { timers.push({ type: 'interval', fn, delay }); return { unref() {} }; },
    logger: { info() {}, error() {} }
  });

  assert.equal(BRIA_MEMORY_INTERVAL_MS, 10 * 60 * 1000);
  assert.equal(timers.find((timer) => timer.type === 'interval').delay, BRIA_MEMORY_INTERVAL_MS);
  const first = scheduler.run();
  const second = await scheduler.run();
  assert.deepEqual(second, { skipped: true });
  release();
  await first;
  assert.equal(runs, 1);
});
