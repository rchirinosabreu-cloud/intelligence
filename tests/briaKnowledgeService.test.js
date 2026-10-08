import test from 'node:test';
import assert from 'node:assert/strict';
import { createBriaKnowledgeService } from '../src/services/briaKnowledgeService.js';
const actor = { ref: 'p', name: 'PM', role: 'PROJECT_MANAGER', accountIds: ['Endova'] };
const input = { scope: 'ACCOUNT', entity: 'Endova', topic: 'Revisión', text: 'Propuesta de revisión.', kind: 'PROPOSAL', validFrom: '2026-10-07' };
test('authorization is server-side and unknown accounts cannot be taught', async () => {
  let writes = 0;
  const service = createBriaKnowledgeService({ resolveActor: async () => actor, repository: { save: async row => { writes++; return row; } } });
  await assert.rejects(() => service.save({}, { ...input, entity: 'Otra cuenta', role: 'ADMIN' }), { status: 403 });
  await assert.rejects(() => service.save({}, { ...input, scope: 'AGENCY' }), { status: 403 });
  assert.equal(writes, 0);
  const saved = await service.save({}, input); assert.equal(saved.actor.ref, 'p');
});
test('personal learning is tied to the session', async () => {
  const service = createBriaKnowledgeService({ resolveActor: async () => actor, repository: { save: async row => row } });
  assert.equal((await service.save({}, { ...input, scope: 'PERSONAL', subjectRef: 'victim' })).actor.ref, 'p');
});

test('reads recheck account access after the database finishes', async () => {
  let calls = 0;
  const current = () => ({ ...actor, accountIds: ++calls === 1 ? ['Endova'] : [] });
  const record = { ...input, subjectRef: '*' };
  const service = createBriaKnowledgeService({ resolveActor: async () => current(), repository: { list: async () => [record], history: async () => [{ after: record }] } });
  assert.deepEqual(await service.list({}), []);
  calls = 0;
  await assert.rejects(() => service.history({}, 'id'), { status: 403 });
});
