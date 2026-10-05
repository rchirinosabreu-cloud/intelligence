import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { readFileSync } from 'node:fs';
import { createReadinessHandler } from '../src/routes/healthReadiness.js';

// La dirección que mira el vigilante externo (Rodny, 5 de octubre de 2026). `/api/health` responde
// «ok» aunque la base esté caída; esta pregunta de verdad, en poco tiempo, y no cuenta nada interno.

const withServer = async (handler, run) => {
  const app = express();
  app.get('/api/health/ready', handler);
  const server = await new Promise((resolve) => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
  try { await run(`http://127.0.0.1:${server.address().port}/api/health/ready`); } finally { server.close(); }
};

test('answers 200 ok when the database answers', async () => {
  await withServer(createReadinessHandler({ check: async () => true }), async (url) => {
    const response = await fetch(url);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.deepEqual(await response.json(), { status: 'ok' });
  });
});

test('answers 503 when the database fails, without leaking the error', async () => {
  const handler = createReadinessHandler({ check: async () => { throw new Error('postgres://user:secret@host'); }, logger: { error() {} } });
  await withServer(handler, async (url) => {
    const response = await fetch(url);
    assert.equal(response.status, 503);
    const text = await response.text();
    assert.doesNotMatch(text, /postgres|secret/);
    assert.deepEqual(JSON.parse(text), { status: 'unavailable' });
  });
});

test('answers 503 when the database hangs, instead of hanging the monitor', async () => {
  const handler = createReadinessHandler({ check: () => new Promise(() => {}), timeoutMs: 50, logger: { error() {} } });
  await withServer(handler, async (url) => {
    const started = Date.now();
    const response = await fetch(url);
    assert.equal(response.status, 503);
    assert.ok(Date.now() - started < 2000);
  });
});

test('the server exposes it before authentication and rate limits', () => {
  const server = readFileSync(new URL('../server.js', import.meta.url), 'utf8');
  const ready = server.indexOf("app.get('/api/health/ready'");
  assert.ok(ready > 0, 'existe la ruta');
  assert.ok(ready < server.indexOf("app.use('/api', apiRateLimiter)"), 'antes del límite de peticiones');
  assert.ok(ready < server.indexOf("app.use('/api', apiRouter)"), 'antes de la autenticación');
});
