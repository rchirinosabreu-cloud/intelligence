import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { activeTaskSourceWhere } from '../src/lib/taskRetirement.js';
import { financialPartyChoices, resolveFinancialParty } from '../src/services/financialPartySelection.js';

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
