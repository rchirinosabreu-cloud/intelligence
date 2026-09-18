import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import express from 'express';
import { once } from 'node:events';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('the CRM router is mounted behind authentication and the crm module permission', async () => {
  const routes = await read('src/routes/index.js');
  const protectedBlock = routes.slice(routes.indexOf('// --- Protected Routes'));
  assert.match(protectedBlock, /router\.use\('\/crm',\s*requireModulePermission\('crm'\),\s*crmRouter\)/);
  const app = await read('src/App.jsx');
  assert.match(app, /path="\/crm"[\s\S]{0,180}<ModuleGuard module="crm">/);
  assert.match(app, /path="\/crm\/oportunidades\/:leadId"[\s\S]{0,180}<ModuleGuard module="crm">/);
});

test('the CRM router exposes the phase-1 endpoints and maps validation errors to 400', async () => {
  const { createCrmRouter } = await import('../src/routes/api/crm.js');
  const { CrmValidationError } = await import('../src/services/crmService.js');
  const calls = [];
  const service = {
    listLeads: async (_db, query) => { calls.push(['list', query]); return { items: [], total: 0 }; },
    createLead: async (_db, payload) => { if (!payload.company) throw new CrmValidationError('Indica la empresa'); return { id: 'new', ...payload }; },
    getLead: async (_db, id) => (id === 'L1' ? { id: 'L1' } : null),
    updateLead: async (_db, id, payload) => ({ id, ...payload }),
    changeStage: async (_db, id, payload) => ({ id, stage: payload.stage }),
    addActivity: async (_db, id, payload) => ({ lead: { id }, activity: { id: 'a1', ...payload } }),
    updateActivity: async () => ({ id: 'a1' }),
    setTrafficLight: async (_db, id, payload) => ({ id, trafficLight: { value: payload.value, mode: 'MANUAL' } }),
    archiveLead: async (_db, id) => ({ id, archivedAt: new Date() }),
    followUps: async () => ({ buckets: {}, counts: {} }),
    metricsFor: async (_db, query) => { calls.push(['metrics', query]); return { total: 0 }; },
    catalogs: () => ({ stages: [] })
  };
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => { req.user = { userId: 'u1', role: 'EDITOR' }; next(); });
  app.use('/api/crm', createCrmRouter({ service, db: {} }));
  const server = app.listen(0);
  await once(server, 'listening');
  const base = `http://127.0.0.1:${server.address().port}/api/crm`;
  const json = async (path, init) => {
    const response = await fetch(`${base}${path}`, { headers: { 'content-type': 'application/json' }, ...init });
    return { status: response.status, body: await response.json() };
  };
  try {
    assert.equal((await json('/leads?stage=CONTACTADO')).status, 200);
    assert.equal(calls.find(([name]) => name === 'list')[1].stage, 'CONTACTADO');
    assert.equal((await json('/leads', { method: 'POST', body: JSON.stringify({}) })).status, 400);
    assert.equal((await json('/leads', { method: 'POST', body: JSON.stringify({ company: 'ACME' }) })).status, 201);
    assert.equal((await json('/leads/L1')).status, 200);
    assert.equal((await json('/leads/nope')).status, 404);
    assert.equal((await json('/leads/L1', { method: 'PATCH', body: JSON.stringify({ company: 'X' }) })).status, 200);
    assert.equal((await json('/leads/L1/stage', { method: 'POST', body: JSON.stringify({ stage: 'GANADO' }) })).body.stage, 'GANADO');
    assert.equal((await json('/leads/L1/activities', { method: 'POST', body: JSON.stringify({ type: 'LLAMADA' }) })).status, 201);
    assert.equal((await json('/leads/L1/activities/a1', { method: 'PATCH', body: JSON.stringify({ note: 'x' }) })).status, 200);
    assert.equal((await json('/leads/L1/traffic-light', { method: 'POST', body: JSON.stringify({ value: 'VERDE', reason: 'ok' }) })).body.trafficLight.mode, 'MANUAL');
    assert.equal((await json('/leads/L1/archive', { method: 'POST' })).status, 200);
    assert.equal((await json('/followups')).status, 200);
    assert.equal((await json('/metrics?from=2026-09-01')).status, 200);
    assert.equal(calls.find(([name]) => name === 'metrics')[1].from, '2026-09-01');
    assert.equal((await json('/catalogs')).status, 200);
  } finally {
    server.close();
  }
});
