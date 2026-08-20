import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

const loadService = async () => {
  try {
    return await import('../src/services/serviceStatusService.js');
  } catch (error) {
    assert.fail(`serviceStatusService is not implemented: ${error.message}`);
  }
};

test('service status collector reports each real probe independently without leaking errors', async () => {
  const { collectServiceStatuses, clearServiceStatusCache } = await loadService();
  clearServiceStatusCache();
  const services = await collectServiceStatuses({
    probes: [
      { id: 'database', name: 'Base de datos', check: async () => true },
      { id: 'openai', name: 'OpenAI', check: async () => { throw new Error('secret upstream detail'); } }
    ],
    cacheMs: 0,
    timeoutMs: 100
  });

  assert.deepEqual(services.map(({ id, name, status }) => ({ id, name, status })), [
    { id: 'database', name: 'Base de datos', status: 'operational' },
    { id: 'openai', name: 'OpenAI', status: 'unavailable' }
  ]);
  assert.equal(JSON.stringify(services).includes('secret upstream detail'), false);
});

test('service status collector distinguishes missing configuration from an outage', async () => {
  const { collectServiceStatuses, clearServiceStatusCache } = await loadService();
  clearServiceStatusCache();
  const services = await collectServiceStatuses({
    probes: [{ id: 'push', name: 'Notificaciones push', configured: false, check: async () => true }],
    cacheMs: 0
  });
  assert.equal(services[0].status, 'not_configured');
});

test('service status collector returns cached results within the refresh window', async () => {
  const { collectServiceStatuses, clearServiceStatusCache } = await loadService();
  clearServiceStatusCache();
  let calls = 0;
  const options = {
    probes: [{ id: 'api', name: 'Aplicación', check: async () => { calls += 1; return true; } }],
    cacheMs: 60_000
  };
  const first = await collectServiceStatuses(options);
  const second = await collectServiceStatuses(options);
  assert.equal(calls, 1);
  assert.deepEqual(second, first);
});

test('Google Workspace probe uses the same delegated scopes as production operations', async () => {
  const source = await fs.readFile('src/services/serviceStatusService.js', 'utf8');
  assert.match(source, /googleapis\.com\/auth\/gmail\.readonly/);
  assert.match(source, /googleapis\.com\/auth\/calendar'/);
  assert.match(source, /googleapis\.com\/auth\/spreadsheets'/);
});

test('dashboard exposes a compact accessible service status footer for every user', async () => {
  const [dashboard, routes] = await Promise.all([
    fs.readFile('src/components/modules/Dashboard.jsx', 'utf8'),
    fs.readFile('src/routes/index.js', 'utf8')
  ]);
  assert.match(routes, /router\.get\('\/system\/services-status'/);
  assert.match(dashboard, /Estado de servicios/);
  assert.match(dashboard, /service\.status === 'operational'/);
  assert.match(dashboard, /aria-label=.*service\.name/);
  assert.match(dashboard, /No se pudo comprobar/);
});
