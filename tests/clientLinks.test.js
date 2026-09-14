import test from 'node:test';
import assert from 'node:assert/strict';
import prisma from '../src/lib/prisma.js';
import { addClientLink, getClientLinks, removeClientLink } from '../src/services/clientService.js';

function mockLinkMethod(t, method, implementation) {
  const original = prisma.clientLink[method];
  prisma.clientLink[method] = implementation;
  t.after(() => { prisma.clientLink[method] = original; });
}

const clientId = 'client-links-test';
const existingLinks = (count) => Array.from({ length: count }, (_, index) => ({
  id: `link-${index + 1}`,
  clientId,
  title: `Entrega ${index + 1}`,
  url: `https://example.com/entregas/${index + 1}`,
  createdAt: new Date(Date.UTC(2026, 8, 1, 0, index)),
}));

for (const count of [5, 25, 100]) {
  test(`adds a link with ${count} existing links without changing them`, async (t) => {
    const links = existingLinks(count);
    const before = structuredClone(links);
    const created = { id: 'new-link', clientId, title: 'Nueva entrega', url: 'https://example.com/nueva', createdAt: new Date('2026-09-14T15:00:00Z') };
    mockLinkMethod(t, 'count', async () => links.length);
    mockLinkMethod(t, 'create', async ({ data }) => {
      assert.deepEqual(data, { clientId, title: created.title, url: created.url });
      links.push(created);
      return created;
    });

    const result = await addClientLink(clientId, created.title, created.url);

    assert.deepEqual(result, created);
    assert.equal(links.length, count + 1);
    assert.deepEqual(links.slice(0, count), before);
  });
}

test('reads every client link in creation order without a hidden list cap', async (t) => {
  const links = existingLinks(101);
  mockLinkMethod(t, 'findMany', async (query) => {
    assert.deepEqual(query.where, { clientId });
    assert.deepEqual(query.orderBy, { createdAt: 'asc' });
    const ordered = [...links].sort((a, b) => a.createdAt - b.createdAt);
    return query.take === undefined ? ordered : ordered.slice(0, query.take);
  });

  assert.deepEqual(await getClientLinks(clientId), links);
});

test('required link fields are still checked before persistence', async (t) => {
  mockLinkMethod(t, 'create', async () => assert.fail('must not persist incomplete links'));
  for (const args of [
    ['', 'Entrega', 'https://example.com'],
    [clientId, '', 'https://example.com'],
    [clientId, 'Entrega', ''],
  ]) {
    await assert.rejects(addClientLink(...args), /Missing required fields/);
  }
  await assert.rejects(getClientLinks(''), /Client ID required/);
  await assert.rejects(removeClientLink(''), /Link ID required/);
});

test('a failed write stays an error and logs the original database failure', async (t) => {
  const databaseError = new Error('Database unavailable');
  mockLinkMethod(t, 'count', async () => 0);
  mockLinkMethod(t, 'create', async () => { throw databaseError; });
  const log = t.mock.method(console, 'error', () => {});

  await assert.rejects(addClientLink(clientId, 'Entrega', 'https://example.com'), /Failed to create link/);
  assert.equal(log.mock.calls.length, 1);
  assert.equal(log.mock.calls[0].arguments[1], databaseError);
});

test('removing a link targets only its identity and preserves the other links', async (t) => {
  const links = existingLinks(6);
  const expected = links.filter(({ id }) => id !== 'link-3');
  mockLinkMethod(t, 'delete', async ({ where }) => {
    assert.deepEqual(where, { id: 'link-3' });
    return links.splice(links.findIndex(({ id }) => id === where.id), 1)[0];
  });

  assert.equal(await removeClientLink('link-3'), true);
  assert.deepEqual(links, expected);
});
