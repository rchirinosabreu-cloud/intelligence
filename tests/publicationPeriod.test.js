import test from 'node:test';
import assert from 'node:assert/strict';
import { publicationPeriod, cutDayOn } from '../src/lib/publicationPeriod.js';
import { transferContentPeriod } from '../src/services/contentPeriodTransferService.js';

const day = (key) => new Date(`${key}T00:00:00.000Z`);

test('con corte 10, las piezas del 1 al 9 de diciembre son de la parrilla de noviembre (Bonsai)', () => {
  const contracts = [{ startDate: '2026-01-10', cutDay: 10, createdAt: '2026-01-01' }];
  assert.deepEqual(publicationPeriod(day('2026-12-05'), contracts), { year: 2026, month: 11 });
  assert.deepEqual(publicationPeriod(day('2026-12-09'), contracts), { year: 2026, month: 11 });
  assert.deepEqual(publicationPeriod(day('2026-12-10'), contracts), { year: 2026, month: 12 });
  assert.deepEqual(publicationPeriod(day('2026-11-09'), contracts), { year: 2026, month: 10 });
  assert.deepEqual(publicationPeriod(day('2027-01-04'), contracts), { year: 2026, month: 12 });
});

test('con corte 1, o sin contrato, sigue siendo el mes del calendario', () => {
  assert.deepEqual(publicationPeriod(day('2026-12-05'), [{ startDate: '2026-01-01', cutDay: 1 }]), { year: 2026, month: 12 });
  assert.deepEqual(publicationPeriod(day('2026-12-05'), []), { year: 2026, month: 12 });
  assert.deepEqual(publicationPeriod(day('2026-12-01'), null), { year: 2026, month: 12 });
});

test('el corte es el del contrato vigente ese día; antes del primero, el del primero', () => {
  const contracts = [
    { startDate: '2026-01-01', cutDay: 1, createdAt: '2026-01-01' },
    { startDate: '2026-11-10', cutDay: 10, createdAt: '2026-11-10' }
  ];
  assert.equal(cutDayOn(contracts, '2026-10-20'), 1);
  assert.equal(cutDayOn(contracts, '2026-12-05'), 10);
  assert.equal(cutDayOn([{ startDate: '2027-02-15', cutDay: 15 }], '2026-12-01'), 15);
});

// El traslado real: una pieza de la parrilla de noviembre que se fecha el 5 de diciembre se queda donde está.
const fakeTx = (plans) => {
  const calls = [];
  return {
    calls,
    contentItem: {
      findUnique: async () => ({ id: 'i1', status: 'EN_PRODUCCION', manualPublish: null, plan: plans.source }),
      update: async (args) => calls.push(['item', args]),
      count: async () => 1,
      findMany: async () => []
    },
    contentPlan: {
      findMany: async ({ where }) => (plans.byMonth[`${where.year}-${where.month}`] ? [plans.byMonth[`${where.year}-${where.month}`]] : []),
      findFirst: async () => null,
      create: async ({ data }) => ({ id: 'nuevo', ...data, status: 'PLANIFICACION' }),
      update: async () => null
    },
    contentItemPeriodChange: { create: async (args) => calls.push(['change', args]) },
    clientSuspension: { findFirst: async () => null, findMany: async () => [] },
    $queryRaw: async () => []
  };
};

test('mover una pieza dentro de su ciclo no la cambia de parrilla; salir del ciclo sí', async () => {
  const client = { id: 'c1', name: 'Bonsai', externalPlanUrl: null, contracts: [{ startDate: '2026-01-10', cutDay: 10, createdAt: '2026-01-01' }] };
  const source = { id: 'nov', clientId: 'c1', year: 2026, month: 11, deletedAt: null, client, status: 'ACTIVO' };
  const plans = { source, byMonth: { '2026-11': source, '2026-12': { id: 'dic', clientId: 'c1', year: 2026, month: 12, status: 'ACTIVO' } } };
  const stay = fakeTx(plans);
  assert.equal(await transferContentPeriod(stay, { itemId: 'i1', date: day('2026-12-05') }).catch((error) => error), null);
  assert.equal(stay.calls.length, 0);
  const move = fakeTx(plans);
  const result = await transferContentPeriod(move, { itemId: 'i1', date: day('2026-12-12') });
  assert.deepEqual(result.toPlan, { id: 'dic', year: 2026, month: 12 });
});

test('Promogroup, corte 15: la parrilla de noviembre admite del 15 de noviembre al 14 de diciembre', async () => {
  const { outOfPeriodItems, defaultPieceDay, planCycle } = await import('../src/lib/publicationPeriod.js');
  const contracts = [{ startDate: '2026-05-15', cutDay: 15, createdAt: '2026-05-15' }];
  const noon = (key) => new Date(`${key}T12:00:00.000Z`);
  const november = { year: 2026, month: 11 }, december = { year: 2026, month: 12 };
  const items = [
    { id: 'a', publishDate: noon('2026-11-15') }, { id: 'b', publishDate: noon('2026-12-14') },
    { id: 'c', publishDate: noon('2026-12-15') }, { id: 'd', publishDate: noon('2026-11-14') }, { id: 'e', publishDate: null }
  ];
  const out = outOfPeriodItems(november, items, contracts);
  assert.deepEqual(out.map(row => [row.id, row.to.year, row.to.month]), [['c', 2026, 12], ['d', 2026, 10]]);
  assert.equal(out[0].to.start, '2026-12-15');
  assert.equal(out[0].publishDate, '2026-12-15T12:00:00.000Z');
  // Lo que quedó en la parrilla de diciembre por el mes calendario vuelve a la de noviembre.
  assert.deepEqual(outOfPeriodItems(december, [{ id: 'x', publishDate: noon('2026-12-05') }], contracts).map(row => row.to.month), [11]);
  assert.deepEqual(outOfPeriodItems(december, [{ id: 'x', publishDate: noon('2026-12-05') }], []), []);

  const cycle = planCycle(november, contracts);
  assert.equal(defaultPieceDay(cycle, '2026-11-20'), '2026-11-20');
  assert.equal(defaultPieceDay(cycle, '2026-11-12'), '2026-11-15');
  assert.equal(defaultPieceDay(cycle, '2026-12-20'), '2026-11-15');
  assert.equal(defaultPieceDay(null, '2026-12-20'), '2026-12-20');
});

test('al arrancar solo se reubican las parrillas con piezas sin publicar fuera de su ciclo', async () => {
  process.env.DATABASE_URL ||= 'postgresql://x:x@localhost:5432/x';
  const { realignPendingContentItems } = await import('../src/services/contentService.js');
  const noon = (key) => new Date(`${key}T12:00:00.000Z`);
  const db = {
    contentPlan: { findMany: async ({ where }) => {
      assert.equal(where.contentItems.some.status.not, 'PUBLICADO');
      return [
        { id: 'dic', clientId: 'promo', year: 2026, month: 12, contentItems: [{ id: 'x', publishDate: noon('2026-12-05') }, { id: 'y', publishDate: noon('2026-12-20') }] },
        { id: 'nov', clientId: 'promo', year: 2026, month: 11, contentItems: [{ id: 'z', publishDate: noon('2026-11-20') }] },
        { id: 'otro', clientId: 'mensual', year: 2026, month: 12, contentItems: [{ id: 'w', publishDate: noon('2026-12-05') }] }
      ];
    } },
    clientContract: { findMany: async () => [{ clientId: 'promo', startDate: '2026-05-15', cutDay: 15, createdAt: '2026-05-15' }] }
  };
  const calls = [];
  const summary = await realignPendingContentItems({ db, realign: async (planId, options) => { calls.push([planId, options.onlyIds]); return { moved: [{ id: 'x' }], failed: [] }; } });
  assert.deepEqual(calls, [['dic', ['x']]]);
  assert.deepEqual(summary, { moved: 1, failed: [] });
});
