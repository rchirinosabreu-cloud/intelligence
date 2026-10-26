import test from 'node:test';
import assert from 'node:assert/strict';
import { createBriaKnowledgeService } from '../src/services/briaKnowledgeService.js';
import { createBriaKnowledgeRepository } from '../src/services/briaKnowledgeRepository.js';
import { createBriaTurnAuthorizer } from '../src/services/briaTurnAuthorization.js';

const owner = { ref: 'owner', name: 'Persona ficticia', role: 'ADMIN', accountIds: ['Account'] };
const memory = (id, extra = {}) => ({ id, scope: 'ACCOUNT', entity: 'Account', kind: 'CONFIRMED', status: 'ACTIVE', subjectRef: '*', ...extra });
const turnFor = (...ids) => ({ sources: ids.map(id => ({ kind: 'aprendizaje', id })) });
const authorizer = knowledge => createBriaTurnAuthorizer({ db: {}, knowledge: () => knowledge });

test('a cited memory older than the first hundred search results is authorized by id in one batch', async () => {
  const rows = Array.from({ length: 101 }, (_, index) => memory(`memory-${index}`));
  const reads = [];
  const service = createBriaKnowledgeService({ resolveActor: async () => owner, repository: {
    list: async () => rows.slice(0, 100),
    getMany: async (_actor, ids) => { reads.push(ids); return rows.filter(row => ids.includes(row.id)); }
  } });
  const turn = { ...turnFor('memory-100'), investigation: { sources: turnFor('memory-100', 'memory-0').sources } };
  assert.equal(await authorizer(service)({ role: 'ADMIN' }, turn), true);
  assert.deepEqual(reads, [['memory-100', 'memory-0']]);
});

test('permission removed while reading memory invalidates the source before returning it', async () => {
  let actor = { ...owner, role: 'PROJECT_MANAGER' };
  const service = createBriaKnowledgeService({ resolveActor: async () => actor, repository: {
    list: async () => [memory('account')],
    getMany: async () => { actor = { ...actor, accountIds: [] }; return [memory('account')]; }
  } });
  assert.equal(await authorizer(service)({ role: 'PROJECT_MANAGER' }, turnFor('account')), false);
});

test('personal chat sources remain author-only even for another administrator, while revoked records keep their history readable', async () => {
  let actor = owner;
  const personal = memory('private', { scope: 'PERSONAL', entity: 'Personal', subjectRef: owner.ref, status: 'REVOKED' });
  const service = createBriaKnowledgeService({ resolveActor: async () => actor, repository: {
    list: async () => [personal], getMany: async () => [personal]
  } });
  assert.equal(await authorizer(service)({ role: 'ADMIN' }, turnFor('private')), true);
  actor = { ...owner, ref: 'another-admin' };
  assert.equal(await authorizer(service)({ role: 'ADMIN' }, turnFor('private')), false);
});

test('id lookup preserves original account and personal visibility without a search result cap', async () => {
  const calls = [];
  const repo = createBriaKnowledgeRepository({ workspace: 'fictional', pool: { query: async (sql, values) => {
    calls.push({ sql, values });
    return { rows: [
      { id: 'owned', scope: 'PERSONAL', entity: 'Personal', subject_ref: owner.ref },
      { id: 'foreign', scope: 'PERSONAL', entity: 'Personal', subject_ref: 'another-admin' },
      { id: 'account', scope: 'ACCOUNT', entity: 'Account' },
      { id: 'denied', scope: 'ACCOUNT', entity: 'Other account' }
    ] };
  } } });
  assert.deepEqual((await repo.getMany({ ...owner, role: 'PROJECT_MANAGER' }, ['owned', 'foreign', 'account', 'denied'])).map(row => row.id), ['owned', 'account']);
  assert.doesNotMatch(calls[0].sql, /\bLIMIT\b/i);
  assert.match(calls[0].sql, /subject_ref/);
  assert.match(calls[0].sql, /id=ANY/);
});
