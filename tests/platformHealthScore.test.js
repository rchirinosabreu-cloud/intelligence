// El health score en Salud operativa (Rodny, 14 de noviembre de 2026: «ponlo en Salud operativa»): la misma
// regla del medidor (`scripts/health-score.mjs`), servida solo a administradores y pintada bajo el semáforo.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import express from 'express';
import { readFileSync } from 'node:fs';
import { createPlatformHealthScoreService } from '../src/services/platformHealthScoreService.js';
import { createPlatformHealthRouter } from '../src/routes/api/platformHealth.js';

const facts = (overrides = {}) => ({
  files: 900, oversized: { 'src/A.jsx': 3000 }, brand: ['src/a.js'], timezone: [], agentsChars: 20000, ensureScripts: 0,
  migrationsOnStart: true, browserTestsInCi: true, testsInCi: true, coverage: 85, permissionMatrix: true,
  moduleList: true, demoSeed: true, platformMap: true, securityExceptions: 0, vulnerabilities: null, routes: null,
  present: { mfa: true, vault: true, auditImmutable: true, rateLimit: true, aiLog: true, taskPrivacy: true, serviceHealth: true, clientErrors: true, demoInstance: true, legalEntity: true, welcome: true, browserTests: true },
  ci: { audit: true, licenses: true, lint: true, deadCode: true, build: true, postgres: true },
  ...overrides
});

const emptyRoot = () => fs.mkdtempSync(path.join(os.tmpdir(), 'health-score-'));

test('el servicio entrega la nota de cada área con sus criterios, el promedio y cuántos se cumplen', async () => {
  const service = createPlatformHealthScoreService({
    root: emptyRoot(), readFacts: () => facts(), routes: () => ({ total: 400, unguarded: 12 }), now: () => new Date('2026-11-14T15:00:00Z')
  });
  const score = await service.read();
  assert.equal(score.areas.length, 7);
  assert.ok(score.average > 0 && score.average < 10);
  assert.equal(score.total, score.areas.reduce((sum, area) => sum + area.total, 0));
  assert.equal(score.met, score.areas.reduce((sum, area) => sum + area.met, 0));
  const permissions = score.areas.find((area) => area.id === 'permisos');
  const routes = permissions.criteria.find((criterion) => criterion.id === 'guardian-por-ruta');
  assert.equal(routes.met, false);
  assert.match(routes.detail, /12 de 400 rutas/, 'las rutas se leen del servidor que está corriendo');
  const code = score.areas.find((area) => area.id === 'codigo');
  assert.match(code.criteria.find((criterion) => criterion.id === 'sin-archivos-gigantes').detail, /1 archivos/);
  assert.equal(score.measuredAt, '2026-11-14T15:00:00.000Z');
});

test('si la versión publicada trae su medición, se usa esa: incluye las vulnerabilidades leídas al construirla', async () => {
  const root = emptyRoot();
  fs.writeFileSync(path.join(root, 'health-score-snapshot.json'), JSON.stringify({
    generatedAt: '2026-11-13T10:00:00.000Z', facts: facts({ vulnerabilities: { high: 0, critical: 0 } })
  }));
  const service = createPlatformHealthScoreService({ root, readFacts: () => { throw new Error('no debe volver a leer el código'); }, routes: () => null });
  const score = await service.read();
  assert.equal(score.measuredAt, '2026-11-13T10:00:00.000Z');
  const security = score.areas.find((area) => area.id === 'seguridad');
  assert.equal(security.criteria.find((criterion) => criterion.id === 'sin-vulnerabilidades-altas').met, true);
});

test('lo que confirmó una persona se lee de su archivo y un fallo al leer rutas no tumba el informe', async () => {
  const root = emptyRoot();
  fs.mkdirSync(path.join(root, 'scripts'));
  fs.writeFileSync(path.join(root, 'scripts', 'health-score-manual.json'), JSON.stringify({ 'vigilante-externo': { fecha: '2026-11-10' } }));
  const service = createPlatformHealthScoreService({
    root, readFacts: () => facts(), routes: () => { throw new Error('router sin armar'); }, now: () => new Date('2026-11-14T15:00:00Z'), logger: { error() {} }
  });
  const score = await service.read();
  const operation = score.areas.find((area) => area.id === 'operacion');
  assert.equal(operation.criteria.find((criterion) => criterion.id === 'vigilante-externo').met, true);
  const permissions = score.areas.find((area) => area.id === 'permisos');
  assert.match(permissions.criteria.find((criterion) => criterion.id === 'guardian-por-ruta').detail, /sin medir/i);
});

const serve = async (user, service) => {
  const app = express();
  app.use((req, _res, next) => { req.user = user; next(); });
  app.use('/api/platform-health', createPlatformHealthRouter({ service, logger: { error() {} } }));
  const server = await new Promise((resolve) => { const listening = app.listen(0, '127.0.0.1', () => resolve(listening)); });
  const response = await fetch(`http://127.0.0.1:${server.address().port}/api/platform-health`);
  const body = await response.json();
  await new Promise((resolve) => server.close(resolve));
  return { status: response.status, body, cache: response.headers.get('cache-control') };
};

test('la ruta es solo de administradores, lo dice con su etiqueta y un fallo responde un mensaje claro', async () => {
  const service = { read: async () => ({ average: 4.7, areas: [] }) };
  const denied = await serve({ userId: 'u1', role: 'EDITOR' }, service);
  assert.equal(denied.status, 403);
  assert.match(denied.body.error, /administradores/);

  const allowed = await serve({ userId: 'u2', role: 'ADMIN' }, service);
  assert.equal(allowed.status, 200);
  assert.equal(allowed.body.average, 4.7);
  assert.equal(allowed.cache, 'no-store');

  const broken = await serve({ userId: 'u2', role: 'ADMIN' }, { read: async () => { throw new Error('disco'); } });
  assert.equal(broken.status, 500);
  assert.match(broken.body.error, /No fue posible/);

  const router = createPlatformHealthRouter({ service });
  assert.deepEqual(router.stack[0].handle.permission, { role: 'ADMIN' });
});

const panel = readFileSync(new URL('../src/components/modules/PlatformHealthScorePanel.jsx', import.meta.url), 'utf8');
const page = readFileSync(new URL('../src/components/modules/OperationalHealth.jsx', import.meta.url), 'utf8');

test('el panel vive en Salud operativa, debajo del semáforo, y solo lo pide un administrador', () => {
  assert.match(page, /import PlatformHealthScorePanel from '\.\/PlatformHealthScorePanel'/);
  assert.ok(page.indexOf('<ServiceHealthPanel') < page.indexOf('<PlatformHealthScorePanel'));
  assert.ok(page.indexOf('<PlatformHealthScorePanel') < page.indexOf('<ScorePanel'));
  assert.match(panel, /\/api\/platform-health/);
  assert.match(panel, /enabled: isAdmin/);
  assert.match(panel, /if \(!isAdmin\) return null/);
});

test('el panel sigue el diseño de la plataforma: tokens compartidos, los dos temas y nada escrito a mano', () => {
  assert.doesNotMatch(panel, /\b(?:bg|text|border)-(?:red|rose|purple|violet|indigo|fuchsia|sky|teal|emerald)-/);
  assert.doesNotMatch(panel, /#[0-9a-fA-F]{6}\b/);
  assert.match(panel, /dark:bg-zinc-900/);
  assert.match(panel, /dark:text-zinc-400/);
  assert.match(panel, /text-status-positive-fg/);
  assert.doesNotMatch(panel, /America\/Bogota|Brain ?Studio/, 'un archivo nuevo no escribe la zona horaria ni la marca');
  assert.match(panel, /aria-expanded/);
  assert.match(panel, /console\.error/);
});

test('cada criterio se dice en palabras: cumplido o pendiente, nunca solo con un color', () => {
  assert.match(panel, /Cumplido/);
  assert.match(panel, /Pendiente/);
  assert.match(panel, /Lo confirma una persona/);
});
