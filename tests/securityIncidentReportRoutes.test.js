import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { readFileSync } from 'node:fs';
import { createIncidentReportRouter } from '../src/routes/api/incidentReports.js';
import { notifyIncidentReportToAdmins } from '../src/services/incidentReportNotifications.js';

// La puerta para reportar un incidente (12 de octubre de 2026): abierta a todo el equipo activo,
// con tope por persona, y sin devolver nada del registro de incidentes.

async function serve({ service, notify, limit }) {
  const app = express(); app.use(express.json());
  app.use((req, res, next) => { if (req.headers['x-user']) req.user = { userId: req.headers['x-user'] }; next(); });
  app.use('/api/incident-reports', createIncidentReportRouter({ service, notify, limit }));
  const server = app.listen(0, '127.0.0.1'); await new Promise((r) => server.once('listening', r));
  const base = `http://127.0.0.1:${server.address().port}/api/incident-reports`;
  const post = (body, user = 'u-ana') => fetch(base, { method: 'POST', headers: { 'content-type': 'application/json', ...(user ? { 'x-user': user } : {}) }, body: JSON.stringify(body) });
  return { post, close: async () => { server.closeAllConnections(); await new Promise((r) => server.close(r)); } };
}

test('reporta con la sesión, responde lo mínimo y avisa a administración después de guardar', async () => {
  const calls = [];
  const service = { report: async (actorId, body) => { calls.push(['report', actorId, body]); return { id: 'inc-1', reportedAt: '2026-10-12T15:42:37.512Z', reporterName: 'Ana Pérez' }; } };
  const notify = async (payload) => { calls.push(['notify', payload]); };
  const { post, close } = await serve({ service, notify });
  try {
    assert.equal((await post({ description: 'x', affectsClient: 'NO' }, null)).status, 401);
    const response = await post({ description: 'Perdí el teléfono', affectsClient: 'NO', actorId: 'forjado' });
    assert.equal(response.status, 201);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.deepEqual(await response.json(), { ok: true, reportedAt: '2026-10-12T15:42:37.512Z' });
    assert.equal(calls[0][0], 'report');
    assert.equal(calls[0][1], 'u-ana', 'la identidad sale de la sesión, nunca del cuerpo');
    assert.equal(calls[1][0], 'notify');
    assert.deepEqual(calls[1][1], { incidentId: 'inc-1', reporterId: 'u-ana', reporterName: 'Ana Pérez' });
  } finally { await close(); }
});

test('un error de validación se explica; uno interno no filtra detalles; un aviso fallido no tumba el reporte', async () => {
  let mode = 'invalid';
  const service = { report: async () => {
    if (mode === 'invalid') throw Object.assign(new Error('Cuéntanos qué pasó.'), { status: 400, code: 'GOVERNANCE_INVALID' });
    if (mode === 'forbidden') throw Object.assign(new Error('Solo el equipo activo puede reportar incidentes.'), { status: 403, code: 'GOVERNANCE_FORBIDDEN' });
    if (mode === 'boom') throw new Error('connection refused at 10.0.0.1');
    return { id: 'inc-2', reportedAt: '2026-10-12T15:42:00.000Z', reporterName: 'Ana' };
  } };
  const notify = async () => { throw new Error('push caído'); };
  const { post, close } = await serve({ service, notify });
  try {
    let res = await post({});
    assert.equal(res.status, 400); assert.equal((await res.json()).error, 'Cuéntanos qué pasó.');
    mode = 'forbidden'; res = await post({ description: 'x', affectsClient: 'NO' });
    assert.equal(res.status, 403);
    mode = 'boom'; res = await post({ description: 'x', affectsClient: 'NO' });
    assert.equal(res.status, 500); assert.doesNotMatch(JSON.stringify(await res.json()), /10\.0\.0\.1/);
    mode = 'ok'; res = await post({ description: 'x', affectsClient: 'NO' });
    assert.equal(res.status, 201, 'el reporte quedó guardado aunque el aviso no saliera');
  } finally { await close(); }
});

test('tiene tope por persona, no global', async () => {
  const service = { report: async () => ({ id: 'i', reportedAt: '2026-10-12T15:42:00.000Z', reporterName: 'A' }) };
  const { post, close } = await serve({ service, notify: async () => {}, limit: { windowMs: 60_000, max: 2 } });
  try {
    assert.equal((await post({ description: 'x', affectsClient: 'NO' })).status, 201);
    assert.equal((await post({ description: 'x', affectsClient: 'NO' })).status, 201);
    const blocked = await post({ description: 'x', affectsClient: 'NO' });
    assert.equal(blocked.status, 429);
    assert.match((await blocked.json()).error, /varios reportes/);
    assert.equal((await post({ description: 'x', affectsClient: 'NO' }, 'u-otro')).status, 201);
  } finally { await close(); }
});

test('el aviso llega a cada administrador activo menos a quien reportó, sin el contenido del reporte', async () => {
  const sent = [];
  const db = { user: { findMany: async ({ where }) => { assert.deepEqual(where, { role: 'ADMIN', isActive: true }); return [{ id: 'u-admin' }, { id: 'u-ana' }, { id: 'u-admin2' }]; } } };
  await notifyIncidentReportToAdmins({ db, incidentId: 'inc-1', reporterId: 'u-ana', reporterName: 'Ana Pérez', notify: async (n) => { sent.push(n); } });
  assert.deepEqual(sent.map((n) => n.userId), ['u-admin', 'u-admin2']);
  for (const n of sent) {
    assert.equal(n.type, 'SECURITY_INCIDENT_REPORTED');
    assert.equal(n.message, 'Ana Pérez reportó un incidente de seguridad. Revísalo en Gobierno de IA.');
    assert.equal(n.relatedId, 'inc-1');
    assert.equal(n.url, '/gobierno-ia?tab=incidents');
    assert.equal(n.actorId, 'u-ana');
  }
});

test('la ruta está montada para todo el equipo autenticado, fuera de la puerta de Gobierno de IA', () => {
  const index = readFileSync(new URL('../src/routes/index.js', import.meta.url), 'utf8');
  assert.match(index, /router\.use\('\/incident-reports', createIncidentReportRouter\(\)\)/);
  assert.ok(index.indexOf("router.use(authenticateToken)") < index.indexOf("'/incident-reports'"), 'requiere sesión');
  const route = readFileSync(new URL('../src/routes/api/incidentReports.js', import.meta.url), 'utf8');
  assert.doesNotMatch(route, /governedFetch|openai|OpenAI/, 'el contenido nunca va a un proveedor de IA');
  assert.doesNotMatch(route, /router\.get/, 'quien reporta no puede leer el registro');
});
