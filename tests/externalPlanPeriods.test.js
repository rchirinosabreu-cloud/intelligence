import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import express from 'express';
import * as externalPlans from '../src/services/externalPlanService.js';
import { createExternalPlansRouter } from '../src/routes/api/externalPlans.js';
import { requireModulePermission } from '../src/middlewares/authMiddleware.js';

const client = { id: 'c1', name: 'Cliente ficticio', slug: 'cliente-ficticio' };

test('MIO ofrece el historial leído del cliente, incluso años anteriores, sin leer Google ni escribir', async () => {
  const calls = [];
  const snapshots = [
    { clientId: 'c1', year: 2026, month: 11, tabName: 'NOVIEMBRE', okAt: new Date('2026-11-02T12:00:00Z'), problem: 'Último intento falló' },
    { clientId: 'c1', year: 2025, month: 12, tabName: 'DICIEMBRE 2025', okAt: new Date('2025-12-20T12:00:00Z') },
    { clientId: 'c1', year: 2027, month: 1, tabName: null, okAt: null },
    { clientId: 'c1', year: 2026, month: 10, tabName: 'OCTUBRE', okAt: null },
    { clientId: 'c2', year: 2026, month: 9, tabName: 'SEPTIEMBRE', okAt: new Date('2026-09-20T12:00:00Z') },
  ];
  const db = {
    client: { findFirst: async args => { calls.push(['client', args]); return client; } },
    externalPlanSnapshot: { findMany: async args => {
      calls.push(['snapshots', args]);
      assert.deepEqual(args.where, { clientId: client.id, okAt: { not: null }, tabName: { not: null } });
      assert.deepEqual(args.orderBy, [{ year: 'desc' }, { month: 'desc' }]);
      assert.deepEqual(Object.keys(args.select).sort(), ['month', 'okAt', 'tabName', 'year']);
      return snapshots.filter(row => row.clientId === args.where.clientId && row.okAt && row.tabName);
    } },
  };
  const result = await externalPlans.listExternalPlanPeriods(db, client.slug);
  assert.deepEqual(calls[0][1], { where: { slug: client.slug, externalPlanUrl: { not: null } }, select: { id: true, name: true, slug: true } });
  assert.deepEqual(result, { client, months: [
    { year: 2026, month: 11, label: 'Noviembre', slug: 'noviembre-2026', tabName: 'NOVIEMBRE', readAt: '2026-11-02T12:00:00.000Z' },
    { year: 2025, month: 12, label: 'Diciembre', slug: 'diciembre-2025', tabName: 'DICIEMBRE 2025', readAt: '2025-12-20T12:00:00.000Z' },
  ] });
  assert.equal(calls.length, 2, 'solo consulta cliente y snapshots; no accede a la hoja ni crea/importa meses');
});

test('un cliente sin hoja y una hoja sin períodos leídos se distinguen', async () => {
  assert.equal(await externalPlans.listExternalPlanPeriods({ client: { findFirst: async () => null } }, 'sin-hoja'), null);
  assert.deepEqual(await externalPlans.listExternalPlanPeriods({
    client: { findFirst: async () => client }, externalPlanSnapshot: { findMany: async () => [] },
  }, client.slug), { client, months: [] });
});

test('la ruta de períodos usa la guarda de Parrillas y no se confunde con la consulta mensual', async () => {
  const calls = [];
  const app = express();
  app.use((req, _res, next) => {
    if (req.headers['x-anonymous'] !== 'yes') req.user = { id: 'user', role: 'USER', modulePermissions: { parrillas: req.headers['x-permit'] === 'yes' } };
    next();
  });
  app.use('/content/external-plans', requireModulePermission('parrillas'), createExternalPlansRouter({
    periods: async (_db, slug) => { calls.push(slug); return slug === client.slug ? { client, months: [] } : null; },
    getMonth: async () => { assert.fail('periods no es un nombre de mes'); },
    refresh: async () => { assert.fail('consultar no refresca Google'); },
  }));
  const server = await new Promise(resolve => { const instance = app.listen(0, '127.0.0.1', () => resolve(instance)); });
  try {
    const base = `http://127.0.0.1:${server.address().port}/content/external-plans`;
    assert.equal((await fetch(`${base}/${client.slug}/periods`, { headers: { 'x-anonymous': 'yes' } })).status, 401);
    assert.equal((await fetch(`${base}/${client.slug}/periods`)).status, 403);
    assert.deepEqual(calls, [], 'sin permiso no llega al servicio');
    const allowed = await fetch(`${base}/${client.slug}/periods`, { headers: { 'x-permit': 'yes' } });
    assert.equal(allowed.status, 200);
    assert.deepEqual(await allowed.json(), { client, months: [] });
    assert.equal((await fetch(`${base}/sin-hoja/periods`, { headers: { 'x-permit': 'yes' } })).status, 404);
  } finally { await new Promise(resolve => server.close(resolve)); }
  const routes = await readFile(new URL('../src/routes/index.js', import.meta.url), 'utf8');
  assert.match(routes, /router\.use\('\/content', requireModulePermission\('parrillas'\), contentRouter\)/,
    'la producción monta la misma guarda que se ejercita por HTTP');
});
