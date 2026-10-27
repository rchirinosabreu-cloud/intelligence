import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { readFileSync } from 'node:fs';
import { createImportantNoticeRouter } from '../src/routes/api/importantNotices.js';

// Las rutas de la banda: siempre a nombre de quien pregunta, nunca de un id que venga en el cuerpo.

async function serve(service) {
  const app = express(); app.use(express.json());
  app.use((req, res, next) => { if (req.headers['x-user']) req.user = { userId: req.headers['x-user'], modulePermissions: { crm: true } }; next(); });
  app.use('/api/important-notices', createImportantNoticeRouter({ service, db: {}, clock: () => new Date('2026-10-26T15:00:00Z') }));
  const server = app.listen(0, '127.0.0.1'); await new Promise((r) => server.once('listening', r));
  const base = `http://127.0.0.1:${server.address().port}/api/important-notices`;
  const call = (method, path, body, user = 'u-francys') => fetch(`${base}${path}`, {
    method, headers: { 'content-type': 'application/json', ...(user ? { 'x-user': user } : {}) }, body: body ? JSON.stringify(body) : undefined
  });
  return { call, close: async () => { server.closeAllConnections(); await new Promise((r) => server.close(r)); } };
}

test('el aviso actual, y las tres decisiones, con la identidad de la sesión', async () => {
  const calls = [];
  const service = {
    currentImportantNotice: async (_db, userId) => { calls.push(['current', userId]); return { notice: { id: 'n1' }, nextAt: new Date('2026-10-26T15:05:00Z') }; },
    followUpNotice: async (_db, id, body, actor) => { calls.push(['follow-up', id, body.channel, actor.userId]); return { ok: true }; },
    snoozeNotice: async (_db, id, body, actor) => { calls.push(['snooze', id, body.option, actor.userId]); return { ok: true }; },
    closeNoticeAsLost: async (_db, id, actor) => { calls.push(['close-lost', id, actor.userId]); return { ok: true }; }
  };
  const { call, close } = await serve(service);
  try {
    assert.equal((await call('GET', '/current', null, null)).status, 401);
    const current = await call('GET', '/current');
    assert.equal(current.headers.get('cache-control'), 'no-store');
    assert.deepEqual(await current.json(), { notice: { id: 'n1' }, nextAt: '2026-10-26T15:05:00.000Z' });
    assert.equal((await call('POST', '/n1/follow-up', { channel: 'LLAMADA', userId: 'forjado' })).status, 200);
    assert.equal((await call('POST', '/n1/snooze', { option: '1h' })).status, 200);
    assert.equal((await call('POST', '/n1/close-lost')).status, 200);
    assert.deepEqual(calls, [
      ['current', 'u-francys'], ['follow-up', 'n1', 'LLAMADA', 'u-francys'], ['snooze', 'n1', '1h', 'u-francys'], ['close-lost', 'n1', 'u-francys']
    ]);
  } finally { await close(); }
});

test('los errores se dicen en palabras y uno interno no filtra detalles', async () => {
  const fail = (error) => async () => { throw error; };
  const service = {
    currentImportantNotice: fail(new Error('pg caído')),
    followUpNotice: fail(Object.assign(new Error('Para registrar la gestión necesitas acceso al CRM.'), { statusCode: 403 })),
    snoozeNotice: fail(Object.assign(new Error('Ese aviso ya no está.'), { statusCode: 404 })),
    closeNoticeAsLost: fail(Object.assign(new Error('x'), { statusCode: 409 }))
  };
  const { call, close } = await serve(service);
  const originalError = console.error; console.error = () => {};
  try {
    const current = await call('GET', '/current');
    assert.equal(current.status, 500);
    assert.deepEqual(await current.json(), { error: 'No pudimos cargar el aviso.' });
    const follow = await call('POST', '/n1/follow-up', { channel: 'LLAMADA' });
    assert.equal(follow.status, 403);
    assert.deepEqual(await follow.json(), { error: 'Para registrar la gestión necesitas acceso al CRM.' });
    assert.equal((await call('POST', '/n1/snooze', { option: '1h' })).status, 404);
  } finally { console.error = originalError; await close(); }
});

test('la banda está montada para todo el equipo y descrita en el mapa de la plataforma', () => {
  const routes = readFileSync(new URL('../src/routes/index.js', import.meta.url), 'utf8');
  assert.match(routes, /router\.use\('\/important-notices', createImportantNoticeRouter\(\)\)/);
  const catalog = readFileSync(new URL('../src/lib/platformCatalog.js', import.meta.url), 'utf8');
  assert.match(catalog, /'GET \/important-notices\/current'/);
});
