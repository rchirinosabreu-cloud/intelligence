import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createTaskPieceFixture, seedTaskPieceExternalPeriods } from './support/taskPieceFixture.js';

let fixture, external;
before(async () => {
  fixture = await createTaskPieceFixture({ port: 8094 });
  external = await seedTaskPieceExternalPeriods(fixture);
});
after(async () => { await fixture?.close(); });

const stored = async () => ({
  clients: await fixture.db.client.findMany({ where: { id: { in: external.clientIds } }, orderBy: { id: 'asc' } }),
  snapshots: await fixture.db.externalPlanSnapshot.findMany({ where: { clientId: { in: external.clientIds } }, orderBy: { id: 'asc' } }),
  plans: await fixture.db.contentPlan.findMany({ where: { clientId: { in: external.clientIds } }, orderBy: { id: 'asc' } }),
  tasks: await fixture.db.task.findMany({ where: { clientId: { in: external.clientIds } }, orderBy: { id: 'asc' } })
});

test('real MIO period catalogue includes prior years and excludes unread, unnamed and other-client snapshots', async () => {
  const before = await stored();
  const { data } = await fixture.request('ana', `/content/external-plans/${fixture.client.slug}/periods`);
  assert.deepEqual(data.client, { id: fixture.client.id, name: fixture.client.name, slug: fixture.client.slug });
  assert.deepEqual(data.months, [
    { year: 2026, month: 12, label: 'Diciembre', slug: 'diciembre-2026', tabName: 'DICIEMBRE 2026', readAt: '2026-11-05T15:00:00.000Z' },
    { year: 2026, month: 11, label: 'Noviembre', slug: 'noviembre-2026', tabName: 'NOVIEMBRE 2026', readAt: '2026-11-05T15:00:00.000Z' },
    { year: 2025, month: 10, label: 'Octubre', slug: 'octubre-2025', tabName: 'OCTUBRE 2025', readAt: '2025-10-15T15:00:00.000Z' }
  ]);
  assert.deepEqual(await stored(), before, 'GET does not refresh/import snapshots or mutate clients, plans or tasks');
});

test('the real MIO catalogue requires Parrillas access and authentication without writing', async () => {
  const before = await stored();
  await fixture.request('carlos', `/content/external-plans/${fixture.client.slug}/periods`, { expected: 403 });
  await fixture.request('anonymous', `/content/external-plans/${fixture.client.slug}/periods`, { expected: 401 });
  assert.deepEqual(await stored(), before);
});

test('a missing MIO client returns 404 instead of querying Google or creating a period', async () => {
  const before = await stored();
  await fixture.request('ana', `/content/external-plans/missing-${fixture.runId}/periods`, { expected: 404 });
  assert.deepEqual(await stored(), before);
});
