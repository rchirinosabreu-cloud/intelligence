import test from 'node:test';
import assert from 'node:assert/strict';
import { readCrmFilters, writeCrmFilters, CRM_FILTERS_KEY, defaultCrmFilters } from '../src/lib/crmFilterSession.js';

const memoryStorage = () => {
  const map = new Map();
  return { getItem: key => map.get(key) ?? null, setItem: (key, value) => map.set(key, value), removeItem: key => map.delete(key) };
};

test('CRM filters persist per user for the session and fall back to defaults', () => {
  const storage = memoryStorage();
  const user = { id: 'u1' };
  assert.deepEqual(readCrmFilters(storage, user), defaultCrmFilters());
  writeCrmFilters(storage, user, { ...defaultCrmFilters(), stage: 'CONTACTADO', ownerId: 'tm1', search: 'acme' });
  assert.equal(readCrmFilters(storage, user).stage, 'CONTACTADO');
  assert.equal(readCrmFilters(storage, user).search, 'acme');
  assert.deepEqual(readCrmFilters(storage, { id: 'u2' }), defaultCrmFilters(), 'another user does not inherit the filters');
  storage.setItem(CRM_FILTERS_KEY, '{broken');
  assert.deepEqual(readCrmFilters(storage, user), defaultCrmFilters());
  assert.deepEqual(readCrmFilters(null, user), defaultCrmFilters());
});

test('unknown filter keys are dropped when reading', () => {
  const storage = memoryStorage();
  storage.setItem(CRM_FILTERS_KEY, JSON.stringify({ userId: 'u1', filters: { stage: 'X', evil: 'y', from: '2026-09-01' } }));
  const filters = readCrmFilters(storage, { id: 'u1' });
  assert.equal(filters.stage, 'X');
  assert.equal(filters.from, '2026-09-01');
  assert.equal('evil' in filters, false);
});

test('a view only applies and counts the filters it shows', async () => {
  const { readFile } = await import('node:fs/promises');
  const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');
  const [bar, dashboard, followUps] = await Promise.all([
    read('src/components/modules/Crm/CrmFilters.jsx'), read('src/components/modules/Crm/CrmDashboard.jsx'), read('src/components/modules/Crm/CrmFollowUps.jsx')
  ]);
  assert.match(dashboard, /useCrmMetrics\(visibleCrmFilters\(filters, DASHBOARD_FILTERS\)\)/);
  assert.match(dashboard, /show=\{DASHBOARD_FILTERS\}/);
  assert.doesNotMatch(dashboard.match(/const DASHBOARD_FILTERS = \[[^\]]*\]/)[0], /search|request|silence|archived/);
  assert.match(followUps, /useCrmFollowUps\(visibleCrmFilters\(filters, \['ownerId', 'priority', 'origin'\]\)\)/);
  assert.match(bar, /const shown = visibleCrmFilters\(filters, show\)/);
  assert.match(bar, /Object\.entries\(shown\)[\s\S]*Object\.entries\(shown\)/);
});
