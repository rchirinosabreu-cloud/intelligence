import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { activeTaskSourceWhere } from '../src/lib/taskRetirement.js';
import { financialPartyChoices, resolveFinancialParty } from '../src/services/financialPartySelection.js';
import { progressPercent, nextCycle } from '../src/lib/clientOperations.js';

// Reunión de Rodny con su jefe (10 de noviembre de 2026): «tiene cuatro acciones, si tiene una acción un 25 %».
// `reached` es acumulado: una pieza programada cuenta también como redactada, diseñada y aprobada.
const reached = (redactada, disenada, aprobada, programada, publicada = 0) => ({ redactada, disenada, aprobada, programada, publicada });
test('each contracted piece is four steps of 25 %, and a missing piece is 0', () => {
  assert.equal(progressPercent({ quota: 4, reached: reached(1, 0, 0, 0) }), 6, 'one piece written of four: 25 % of a quarter');
  assert.equal(progressPercent({ quota: 4, reached: reached(4, 0, 0, 0) }), 25);
  assert.equal(progressPercent({ quota: 4, reached: reached(4, 4, 4, 4, 2) }), 100, 'programmed is the fourth step, published or not');
  assert.equal(progressPercent({ quota: 12, reached: reached(12, 12, 12, 0) }), 75);
  assert.equal(progressPercent({ quota: 4, reached: reached(6, 6, 6, 6, 6) }), 100, 'more pieces than contracted is not more progress');
  assert.equal(progressPercent({ quota: 0, reached: reached(2, 2, 2, 2) }), null, 'no quota, no percentage');
  assert.equal(progressPercent(null), null);
});

test('the next cycle keeps the cut and crosses the year', () => {
  assert.deepEqual(nextCycle({ year: 2026, month: 11 }, 1), { year: 2026, month: 12, start: '2026-12-01', end: '2026-12-31', label: 'Diciembre', shortLabel: 'Dic' });
  assert.equal(nextCycle({ year: 2026, month: 12 }, 15).start, '2027-01-15');
});

// Rodny, 10 de noviembre de 2026: «si yo archivo un cliente se archiva de operación y de todo,
// excepto, por supuesto, de la cartera, y menos si debe plata».

const source = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('the operational task filter leaves out tasks of archived clients', () => {
  assert.deepEqual(activeTaskSourceWhere.client, { is: { isArchived: false } });
  assert.ok(Array.isArray(activeTaskSourceWhere.OR), 'the retired-piece rule is still there');
});

test('the Parrillas list and Bria reviews skip archived clients', () => {
  assert.match(source('src/services/contentService.js'), /else where\.client = \{ is: \{ isArchived: false \} \}/);
  assert.match(source('src/services/briaContentPlanReviewScheduler.js'), /client: \{ is: \{ isArchived: false \} \}/);
});

const fakeTx = ({ clients }) => {
  const created = [];
  return {
    created,
    thirdParty: {
      findMany: async () => [],
      findFirst: async () => null,
      create: async ({ data }) => { const party = { id: 'party-1', isActive: true, ...data }; created.push(party); return party; },
    },
    client: {
      findMany: async ({ where } = {}) => clients.filter((client) => !where || where.isArchived === undefined || client.isArchived === where.isArchived),
      findUnique: async ({ where }) => clients.find((client) => client.id === where.id) || null,
    },
    teamMember: { findMany: async () => [], findUnique: async () => null },
    financialCollaborator: { findMany: async () => [] },
    financialAuditEvent: { create: async () => ({}) },
  };
};

test('Financiero still offers an archived client: it may owe money or close a barter', async () => {
  const tx = fakeTx({ clients: [{ id: 'c-1', name: 'Activo', isArchived: false }, { id: 'c-2', name: 'Tambores', isArchived: true }] });
  const names = (await financialPartyChoices(tx)).map((party) => party.name);
  assert.deepEqual(names, ['Activo', 'Tambores']);
  const party = await resolveFinancialParty(tx, 'client:c-2', { id: 'user-1' });
  assert.equal(party.clientId, 'c-2');
  assert.equal(tx.created.length, 1);
});
