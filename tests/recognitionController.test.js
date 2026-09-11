import test from 'node:test';
import assert from 'node:assert/strict';
import { createRecognitionHandlers } from '../src/controllers/recognitionController.js';
const response = () => ({ code: 200, status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; } });
test('recognition endpoints require an authenticated user and never accept a recipient from the body', async () => {
  const handlers = createRecognitionHandlers({});
  const missing = response(); await handlers.claim({ body: {} }, missing); assert.equal(missing.code, 401);
  const spoofed = response(); await handlers.claim({ user: { userId: 'u' }, body: { userId: 'someone-else' } }, spoofed); assert.equal(spoofed.code, 400);
});
test('acknowledgement validates its reservation token before accessing persistence', async () => {
  const handlers = createRecognitionHandlers({});
  const res = response(); await handlers.acknowledge({ user: { userId: 'u' }, params: { id: 'invalid' }, body: { leaseToken: 'invalid' } }, res); assert.equal(res.code, 400);
});
