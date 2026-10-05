import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SERVICE_CATALOG,
  LIGHTS,
  resolveServiceLight,
  overallLight,
  isServiceDue,
  hourlyHistory,
  classifyHttpFailure,
  classifyNetworkFailure
} from '../src/lib/serviceHealth.js';

// Semáforo de servicios (4 de octubre de 2026): la regla vive aquí una vez y la leen el servidor y la pantalla.

const MIN = 60 * 1000;
const now = new Date('2026-10-04T15:00:00.000Z');
const check = (status, minutesAgo, extra = {}) => ({
  status,
  checkedAt: new Date(now.getTime() - minutesAgo * MIN).toISOString(),
  message: extra.message || null,
  critical: extra.critical || false,
  latencyMs: extra.latencyMs ?? 120
});

test('the catalog names every service once, in Spanish, with what breaks when it falls', () => {
  const ids = SERVICE_CATALOG.map((service) => service.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const id of ['database', 'openai', 'fireflies', 'google-calendar', 'google-storage', 'meta', 'storage-chat', 'storage-memory', 'storage-financial', 'email', 'push', 'trm']) {
    assert.ok(ids.includes(id), `falta ${id}`);
  }
  for (const service of SERVICE_CATALOG) {
    assert.ok(service.label && service.purpose && service.impact, service.id);
    assert.ok(service.intervalMs >= 5 * MIN, service.id);
    assert.doesNotMatch(`${service.purpose} ${service.impact}`, /\b(vosotros|podéis|tenéis|veis)\b/);
  }
  assert.ok(!ids.includes('gemini'), 'Gemini ya no se usa');
});

test('a single failure is yellow and only two in a row turn red', () => {
  assert.equal(resolveServiceLight([check('OK', 1)], { now }).light, LIGHTS.GREEN);
  const once = resolveServiceLight([check('FAIL', 1), check('OK', 6)], { now });
  assert.equal(once.light, LIGHTS.YELLOW);
  assert.match(once.reason, /una vez/);
  assert.equal(resolveServiceLight([check('FAIL', 1), check('FAIL', 6)], { now }).light, LIGHTS.RED);
});

test('a failure that does not fix itself (credentials, no credit) is red at once', () => {
  const result = resolveServiceLight([check('FAIL', 1, { critical: true, message: 'Sin crédito' }), check('OK', 6)], { now });
  assert.equal(result.light, LIGHTS.RED);
  assert.equal(result.reason, 'Sin crédito');
});

test('slow or degraded answers are yellow with their reason', () => {
  const result = resolveServiceLight([check('WARN', 1, { message: 'Una cuenta pide reconectar' })], { now });
  assert.equal(result.light, LIGHTS.YELLOW);
  assert.equal(result.reason, 'Una cuenta pide reconectar');
});

test('a service that is not configured is gray, never red', () => {
  const result = resolveServiceLight([check('NOT_CONFIGURED', 1, { message: 'Falta el token de Meta' })], { now });
  assert.equal(result.light, LIGHTS.GRAY);
});

test('no checks yet is gray, and a stale last check is yellow because the checker stopped', () => {
  assert.equal(resolveServiceLight([], { now }).light, LIGHTS.GRAY);
  const stale = resolveServiceLight([check('OK', 40)], { now, intervalMs: 5 * MIN });
  assert.equal(stale.light, LIGHTS.YELLOW);
  assert.match(stale.reason, /no se comprueba/i);
});

test('the overall light is the worst configured service', () => {
  assert.equal(overallLight([LIGHTS.GREEN, LIGHTS.GRAY, LIGHTS.GREEN]), LIGHTS.GREEN);
  assert.equal(overallLight([LIGHTS.GREEN, LIGHTS.YELLOW]), LIGHTS.YELLOW);
  assert.equal(overallLight([LIGHTS.YELLOW, LIGHTS.RED, LIGHTS.GREEN]), LIGHTS.RED);
  assert.equal(overallLight([LIGHTS.GRAY]), LIGHTS.GRAY);
});

test('a service is due when its interval passed since the last check', () => {
  const service = { intervalMs: 5 * MIN };
  assert.equal(isServiceDue(service, null, now), true);
  assert.equal(isServiceDue(service, new Date(now.getTime() - 2 * MIN), now), false);
  // Medio minuto de margen: el reloj del cron no cae exacto.
  assert.equal(isServiceDue(service, new Date(now.getTime() - 4.6 * MIN), now), true);
});

test('the history keeps the worst status of each hour for the last 24 hours', () => {
  const history = hourlyHistory([
    check('OK', 5), check('FAIL', 10), check('OK', 70), check('WARN', 130), check('OK', 60 * 30)
  ], { now });
  assert.equal(history.length, 24);
  assert.equal(history.at(-1).status, 'FAIL');
  assert.equal(history.at(-2).status, 'OK');
  assert.equal(history.at(-3).status, 'WARN');
  assert.equal(history[0].status, null);
});

test('only going red and leaving red are worth an alert', async () => {
  const { lightTransition } = await import('../src/lib/serviceHealth.js');
  assert.equal(lightTransition(LIGHTS.GREEN, LIGHTS.RED), 'DOWN');
  assert.equal(lightTransition(LIGHTS.YELLOW, LIGHTS.RED), 'DOWN');
  assert.equal(lightTransition(LIGHTS.GRAY, LIGHTS.RED), 'DOWN');
  assert.equal(lightTransition(LIGHTS.RED, LIGHTS.GREEN), 'RECOVERED');
  assert.equal(lightTransition(LIGHTS.RED, LIGHTS.YELLOW), 'RECOVERED');
  assert.equal(lightTransition(LIGHTS.RED, LIGHTS.RED), null);
  assert.equal(lightTransition(LIGHTS.GREEN, LIGHTS.YELLOW), null);
  assert.equal(lightTransition(LIGHTS.RED, LIGHTS.GRAY), null);
});

test('HTTP failures are explained in plain Spanish and marked critical when they will not heal', () => {
  assert.deepEqual(classifyHttpFailure(401), { critical: true, errorCode: 'HTTP_401', message: 'La clave fue rechazada: hay que revisar la credencial.' });
  assert.equal(classifyHttpFailure(403).critical, true);
  assert.equal(classifyHttpFailure(429, { code: 'insufficient_quota' }).critical, true);
  assert.match(classifyHttpFailure(429, { code: 'insufficient_quota' }).message, /crédito/);
  assert.equal(classifyHttpFailure(429).critical, false);
  assert.equal(classifyHttpFailure(503).critical, false);
  assert.match(classifyHttpFailure(503).message, /proveedor/);
  assert.equal(classifyNetworkFailure({ name: 'TimeoutError' }).errorCode, 'TIMEOUT');
  assert.equal(classifyNetworkFailure(new Error('getaddrinfo ENOTFOUND')).errorCode, 'NETWORK');
});
