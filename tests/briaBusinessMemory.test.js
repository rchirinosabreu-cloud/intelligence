import test from 'node:test';
import assert from 'node:assert/strict';
import { createBriaKnowledgeService } from '../src/services/briaKnowledgeService.js';
import { createBriaKnowledgeRepository } from '../src/services/briaKnowledgeRepository.js';

const clients = [{ id: 'c-faro', name: 'Cuenta Faro', slug: 'cuenta-faro' }, { id: 'c-luna', name: 'Cuenta Luna', slug: 'cuenta-luna' }];
const admin = { ref: 'u-admin', role: 'ADMIN', accountIds: [] };
const pm = { ref: 'u-pm', role: 'PROJECT_MANAGER', accountIds: ['c-faro', 'Cuenta Faro', 'cuenta-faro'] };
const row = (id, overrides = {}) => ({ id, scope: 'ACCOUNT', entity: 'Cuenta Faro', topic: 'compromiso', text: 'Octubre fue exploratorio.', kind: 'CONFIRMED', status: 'ACTIVE', validFrom: '2026-10-01', validUntil: '2026-10-31', revision: 2, author: 'Persona ficticia', updatedAt: '2026-10-26T12:00:00Z', contextClientId: 'c-faro', ...overrides });

test('legacy business memory is read-only evidence with its original certainty, interval and author', async () => {
  const stored = [row('f'), row('a', { scope: 'AGENCY', entity: 'Brainstudio', contextClientId: null, kind: 'PROPOSAL' })];
  let reads = 0;
  const service = createBriaKnowledgeService({ repository: { businessContext: async (actor, selection, limit) => { reads++; assert.equal(actor.ref, admin.ref); assert.deepEqual(selection, clients); assert.equal(limit, 7); return stored; } }, resolveActor: async () => admin });
  const result = await service.businessContext({}, clients);
  assert.equal(reads, 1);
  assert.deepEqual(result.accounts[0].learnings[0], { ...stored[0], source: { kind: 'aprendizaje', id: 'f' } });
  assert.equal(result.agency.learnings[0].kind, 'PROPOSAL');
  assert.equal(result.agency.learnings[0].source.kind, 'aprendizaje');
  assert.equal(result.accounts[1].learnings.length, 0);
  assert.equal('purpose' in result.accounts[0].learnings[0], false, 'no fabricated agency-fact permissions or certainty');
});

test('legacy context revalidates account access and never includes personal or retired learning', async () => {
  let reads = 0;
  const rows = [row('f'), row('l', { entity: 'Cuenta Luna', contextClientId: 'c-luna' }), row('p', { scope: 'PERSONAL', subjectRef: admin.ref }), row('r', { status: 'REVOKED' })];
  const service = createBriaKnowledgeService({ repository: { businessContext: async () => rows, getBusinessMany: async () => rows }, resolveActor: async () => (++reads % 2 ? admin : pm) });
  const result = await service.businessContext({}, clients);
  assert.deepEqual(result.accounts.flatMap(client => client.learnings.map(learning => learning.id)), ['f']);
  assert.deepEqual(await service.readableBusinessIds({}, rows.map(learning => learning.id)), ['f']);
});

test('legacy truncation is explicit per account and does not hide another account or agency lesson', async () => {
  const service = createBriaKnowledgeService({ repository: { businessContext: async () => [
    ...Array.from({ length: 7 }, (_, i) => row(`f${i}`)), row('l', { entity: 'Cuenta Luna', contextClientId: 'c-luna' }), row('a', { scope: 'AGENCY', contextClientId: null })
  ] }, resolveActor: async () => admin });
  const result = await service.businessContext({}, clients);
  assert.equal(result.accounts[0].learnings.length, 6);
  assert.equal(result.accounts[0].partial, true);
  assert.equal(result.accounts[1].learnings.length, 1);
  assert.equal(result.accounts[1].partial, false);
  assert.equal(result.agency.learnings.length, 1);
});

test('repository resolves legacy names against the complete native catalog, never a selected homonym', async () => {
  const queries = [];
  const catalog = [...clients, { id: 'c-old', name: 'Cuenta Faro', slug: 'otra-faro' }];
  const repository = createBriaKnowledgeRepository({ workspace: 'application', pool: { query: async (sql, args) => {
    queries.push([sql, args]);
    return { rows: sql.includes('FROM public."Client"') ? catalog : [] };
  } } });
  await repository.businessContext(pm, [clients[0]], 7);
  const [sql, args] = queries[1];
  const selection = JSON.parse(args[3]);
  assert.deepEqual(selection[0].keys.sort(), ['c-faro', 'cuenta-faro']);
  assert.match(sql, /scope='ACCOUNT'/);
  assert.match(sql, /scope='AGENCY'/);
  assert.match(sql, /status='ACTIVE'/);
  assert.ok(sql.indexOf('l.entity=ANY($3') < sql.indexOf('LIMIT $5'), 'original account ACL is checked before the per-account limit');
  assert.equal(args[1], false);
  assert.deepEqual(args[2], pm.accountIds);
});
