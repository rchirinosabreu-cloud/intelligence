import test from 'node:test';
import assert from 'node:assert/strict';
import { createManagerTaskAnalyticsHandler } from '../src/controllers/managerTaskAnalyticsController.js';

const createResponse = () => ({
  statusCode: 200,
  payload: null,
  status(code) { this.statusCode = code; return this; },
  json(payload) { this.payload = payload; return this; },
});

test('manager analytics handler accepts only the supported periods', async () => {
  let received;
  const handler = createManagerTaskAnalyticsHandler(async (options) => {
    received = options;
    return { overview: { sessionCount: 4 } };
  });
  const res = createResponse();

  await handler({ query: { days: '90' } }, res);

  assert.equal(received.periodDays, 90);
  assert.equal(res.statusCode, 200);
  assert.equal(res.payload.overview.sessionCount, 4);
});

test('manager analytics handler falls back to 30 days', async () => {
  let received;
  const handler = createManagerTaskAnalyticsHandler(async (options) => {
    received = options;
    return { ok: true };
  });

  await handler({ query: { days: '365' } }, createResponse());
  assert.equal(received.periodDays, 30);
});

test('manager analytics handler returns a useful server error', async () => {
  const handler = createManagerTaskAnalyticsHandler(async () => {
    throw new Error('database unavailable');
  });
  const res = createResponse();

  await handler({ query: {} }, res);

  assert.equal(res.statusCode, 500);
  assert.match(res.payload.error, /panel descriptivo/i);
  assert.equal(res.payload.details, 'database unavailable');
});
