// El medidor del health score (fase 0, 14 de noviembre de 2026): mide con hechos lo que antes era opinión y
// frena lo que empeora. Aquí se comprueba la regla pura; los números reales los da `npm run health`.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  LINE_LIMIT, stripComments, scanSource, compareToBaseline, shrinkBaseline, manualCriterionState, evaluateAreas, collectFacts
} from '../scripts/health-score.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('un comentario no cuenta: solo el código que corre o que se lee en pantalla', () => {
  const source = [
    '// Brain Studio pidió esto el 3 de noviembre',
    'const zona = "America/Bogota"; // hora de Bogotá',
    '/* Francisco Villa firma',
    '   las cuentas de cobro */',
    'const enlace = "https://brainstudioagencia.com/portal";',
    '{/* Brain Studio en un comentario de JSX */}'
  ].join('\n');
  const clean = stripComments(source);
  assert.ok(!clean.includes('pidió esto'));
  assert.ok(!clean.includes('Francisco Villa'));
  assert.ok(!clean.includes('comentario de JSX'));
  assert.ok(clean.includes('America/Bogota'), 'el código antes de un comentario de final de línea se conserva');
  assert.ok(clean.includes('https://brainstudioagencia.com/portal'), 'las dos barras de una dirección no son un comentario');
});

test('cada archivo dice sus líneas y si lleva la marca o la zona horaria escritas a mano', () => {
  assert.deepEqual(scanSource('const a = 1;\nconst b = 2;\n'), { lines: 2, brand: false, timezone: false });
  assert.equal(scanSource('const firma = "Francisco Villa";').brand, true);
  assert.equal(scanSource('const pie = "BRAIN STUDIO AGENCIA CREATIVA S.A.S.";').brand, true);
  assert.equal(scanSource('const sitio = "propuesta.brainstudioagencia.com";').brand, true);
  assert.equal(scanSource('const clave = "brainstudio:sidebar-collapsed";').brand, false, 'una clave técnica en minúsculas no es texto de marca');
  assert.equal(scanSource('new Intl.DateTimeFormat("es", { timeZone: "America/Bogota" })').timezone, true);
  assert.equal(scanSource('// timeZone: America/Bogota\nconst x = 1;').timezone, false);
});

const baseline = {
  oversized: { 'src/Grande.jsx': 3000 },
  brand: ['src/legal.js'],
  timezone: ['src/fechas.js']
};
const state = (overrides = {}) => ({
  oversized: { 'src/Grande.jsx': 3000 },
  brand: ['src/legal.js'],
  timezone: ['src/fechas.js'],
  ...overrides
});

test('sin cambios, la línea base se cumple', () => {
  assert.deepEqual(compareToBaseline(state(), baseline), { failures: [], warnings: [], improvements: [] });
});

test('lo que empeora se frena diciendo el archivo y qué hacer', () => {
  const result = compareToBaseline(state({
    oversized: { 'src/Grande.jsx': 3000, 'src/Nuevo.jsx': LINE_LIMIT + 1 },
    brand: ['src/legal.js', 'src/pantalla.jsx'],
    timezone: ['src/fechas.js', 'src/reloj.js']
  }), baseline);
  assert.equal(result.failures.length, 3);
  assert.match(result.failures[0], /src\/Nuevo\.jsx/);
  assert.match(result.failures[0], new RegExp(String(LINE_LIMIT)));
  assert.match(result.failures[1], /src\/pantalla\.jsx/);
  assert.match(result.failures[2], /src\/reloj\.js/);
});

test('un archivo grande que sigue creciendo avisa, pero todavía no frena (eso llega al partirlos)', () => {
  const result = compareToBaseline(state({ oversized: { 'src/Grande.jsx': 3050 } }), baseline);
  assert.deepEqual(result.failures, []);
  assert.equal(result.warnings.length, 1);
  assert.match(result.warnings[0], /src\/Grande\.jsx.*3000.*3050/);
});

test('lo que mejora se dice y la línea base solo puede encogerse', () => {
  const better = state({ oversized: {}, brand: [], timezone: ['src/fechas.js'] });
  const result = compareToBaseline(better, baseline);
  assert.deepEqual(result.failures, []);
  assert.equal(result.improvements.length, 2);

  const next = shrinkBaseline(state({
    oversized: { 'src/Grande.jsx': 2500, 'src/Nuevo.jsx': 900 },
    brand: ['src/pantalla.jsx'],
    timezone: ['src/fechas.js', 'src/reloj.js']
  }), baseline);
  assert.deepEqual(next.oversized, { 'src/Grande.jsx': 2500 }, 'baja el tamaño anotado y no admite archivos nuevos');
  assert.deepEqual(next.brand, [], 'el que ya no la lleva sale; uno nuevo no entra');
  assert.deepEqual(next.timezone, ['src/fechas.js']);
});

test('un criterio que confirma una persona vale mientras no venza', () => {
  const rule = { validDays: 90 };
  assert.equal(manualCriterionState(rule, undefined, '2026-11-14').met, false);
  assert.equal(manualCriterionState(rule, { fecha: '2026-10-01' }, '2026-11-14').met, true);
  const expired = manualCriterionState(rule, { fecha: '2026-06-01' }, '2026-11-14');
  assert.equal(expired.met, false);
  assert.match(expired.detail, /venció/);
  assert.equal(manualCriterionState({}, { fecha: '2020-01-01' }, '2026-11-14').met, true, 'sin vigencia no vence');
  assert.equal(manualCriterionState(rule, { fecha: 'pronto' }, '2026-11-14').met, false, 'una fecha que no es fecha no confirma nada');
});

const facts = (overrides = {}) => ({
  oversized: {}, brand: [], timezone: [], agentsChars: 20000, ensureScripts: 0, migrationsOnStart: true,
  healthcheck: true, browserTestsInCi: true, testsInCi: true, coverage: 85, permissionMatrix: true,
  moduleList: true, demoSeed: true, platformMap: true, securityExceptions: 0, vulnerabilities: { high: 0, critical: 0 },
  routes: { total: 400, unguarded: 0 },
  present: { mfa: true, vault: true, auditImmutable: true, rateLimit: true, aiLog: true, taskPrivacy: true, serviceHealth: true, clientErrors: true, demoInstance: true, legalEntity: true, welcome: true, browserTests: true },
  ci: { audit: true, licenses: true, lint: true, deadCode: true, build: true, postgres: true },
  ...overrides
});
const allManual = (today) => Object.fromEntries([
  'revision-externa', 'restauracion-probada', 'despliegue-automatico', 'vigilante-externo', 'procesos-separados',
  'dos-servidores', 'entorno-de-pruebas', 'plantilla-cliente-nuevo', 'segunda-instancia-sin-codigo', 'guia-de-uso',
  'instalacion-en-un-dia', 'prueba-de-permiso-por-ruta'
].map((id) => [id, { fecha: today }]));

test('con todo cumplido cada área da 10; con lo de hoy, cada criterio pendiente se nombra', () => {
  const today = '2026-11-14';
  const perfect = evaluateAreas(facts(), allManual(today), today);
  assert.equal(perfect.length, 7);
  for (const area of perfect) assert.equal(area.score, 10, `${area.name}: ${JSON.stringify(area.criteria.filter((c) => !c.met))}`);

  const real = evaluateAreas(facts({
    oversized: { 'src/A.jsx': 3000 }, brand: ['src/a.js'], timezone: ['src/b.js'], agentsChars: 478000, ensureScripts: 68,
    migrationsOnStart: false, healthcheck: false, browserTestsInCi: false, coverage: null, permissionMatrix: false,
    securityExceptions: 1, vulnerabilities: { high: 3, critical: 0 }, routes: { total: 400, unguarded: 120 }
  }), {}, today);
  const code = real.find((area) => area.id === 'codigo');
  const pending = code.criteria.filter((criterion) => !criterion.met);
  assert.deepEqual(pending.map((criterion) => criterion.id), ['sin-archivos-gigantes', 'reglas-en-indice-corto', 'migraciones-con-version', 'sin-scripts-de-arranque']);
  assert.ok(pending.every((criterion) => criterion.detail), 'cada pendiente dice qué falta');
  assert.ok(code.score > 0 && code.score < 10, 'lo que ya se tiene cuenta: la nota no parte de cero');
  for (const area of real) assert.ok(area.score < 10, `${area.name} no puede dar 10 con pendientes`);

  const gone = evaluateAreas(facts({ present: {}, ci: {} }), allManual(today), today);
  const security = gone.find((area) => area.id === 'seguridad');
  assert.equal(security.criteria.find((criterion) => criterion.id === 'verificacion-en-dos-pasos').met, false, 'una pieza que se quita deja de contar');
});

test('lo que no se pudo medir no se da por cumplido', () => {
  const areas = evaluateAreas(facts({ vulnerabilities: null, routes: null }), allManual('2026-11-14'), '2026-11-14');
  const security = areas.find((area) => area.id === 'seguridad');
  const unmeasured = security.criteria.find((criterion) => criterion.id === 'sin-vulnerabilidades-altas');
  assert.equal(unmeasured.met, false);
  assert.match(unmeasured.detail, /sin medir/i);
});

test('la línea base guardada coincide con el código: nada empeoró sin anotarse', () => {
  const stored = JSON.parse(fs.readFileSync(path.join(ROOT, 'scripts', 'health-score-baseline.json'), 'utf8'));
  const current = collectFacts(ROOT);
  const { failures } = compareToBaseline(current, stored);
  assert.deepEqual(failures, []);
});
