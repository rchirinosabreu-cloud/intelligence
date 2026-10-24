import test from 'node:test';
import assert from 'node:assert/strict';
import { createBriaTaskDraftService } from '../src/services/briaTaskDraftService.js';
import { taskDraftItems, taskDraftStage } from '../src/lib/briaTaskDraft.js';

const user = { userId: 'owner', role: 'PROJECT_MANAGER', isActive: true, modulePermissions: { bria: true, gestion: true }, teamMember: { id: 'wrong-member', name: 'No confiar en esta copia', isActive: true } };
const client = { id: 'client', name: 'Empresa Demo', slug: 'empresa-demo', isArchived: false };
const actor = { id: 'actor-member', name: 'Rodny Demo', userId: 'owner', isActive: true };
const other = { id: 'other-member', name: 'Yolanda Demo', userId: 'another-user', isActive: true };
const question = 'Prepara una tarea para Empresa Demo llamada prueba, asignada a mí, para el 26 de octubre de 2026; muestra el resumen y espera mi aprobación.';
const args = { titulo: 'Prueba', cliente: 'Empresa Demo', responsable: 'yo', fecha: '2026-10-26' };
const setup = (ownMember = actor) => {
  const lookups = [], searches = [];
  const service = createBriaTaskDraftService({
    now: () => new Date('2026-10-23T17:00:00Z'),
    db: {
      client: { findMany: async () => [client] },
      teamMember: {
        findUnique: async ({ where }) => { lookups.push(where); return where.userId === 'owner' ? ownMember : null; },
        findMany: async ({ where }) => { searches.push(where); return [actor, other].filter(row => where.OR.some(condition => condition.name?.contains && row.name.toLowerCase().includes(condition.name.contains.toLowerCase()))); }
      }
    },
    createTask: async () => assert.fail('the request interpretation does not authorize creating a task')
  });
  const prepare = (options = {}) => service.prepare({ user, question, args, request: { intent: 'PREPARE', evidence: question }, ...options });
  return { prepare, lookups, searches };
};

test('assign to me resolves the active authenticated actor, not a name containing yo or a supplied member id', async () => {
  const { prepare, lookups, searches } = setup();
  const draft = await prepare();
  assert.equal(taskDraftStage(draft), 'READY');
  assert.equal(draft.assignee.id, 'actor-member');
  assert.deepEqual(lookups, [{ userId: 'owner' }]);
  assert.deepEqual(searches, []);
  const byId = await prepare({ user: { ...user, userId: undefined, id: 'owner' } });
  assert.equal(byId.assignee.id, 'actor-member');
});

test('a missing or inactive actor stays unresolved instead of assigning a similarly named teammate', async () => {
  for (const member of [null, { ...actor, isActive: false }]) {
    const { prepare, searches } = setup(member);
    const draft = await prepare();
    assert.equal(taskDraftStage(draft), 'ASSIGNEE');
    assert.equal(draft.assignee, null);
    assert.deepEqual(draft.assigneeCandidates, []);
    assert.deepEqual(searches, []);
  }
});

test('an unresolved explicit self-assignment in a batch cannot inherit another person, including a one-item list', async () => {
  for (const count of [1, 2]) {
    const { prepare } = setup(null);
    const pendientes = [{ titulo: 'Primera tarea para mí', responsable: 'yo' }, ...(count === 2 ? [{ titulo: 'Segunda tarea para Yolanda' }] : [])];
    const draft = await prepare({ args: { ...args, responsable: 'Yolanda', pendientes } });
    assert.equal(taskDraftStage(draft), 'ASSIGNEE');
    assert.equal(taskDraftItems(draft)[0].assignee, null);
    if (count === 2) assert.equal(taskDraftItems(draft)[1].assignee.id, other.id);
  }
});

test('draft preparation requires interpretation with evidence from the current human message', async () => {
  const { prepare } = setup();
  await assert.rejects(() => prepare({ request: undefined }), { status: 400 });
  await assert.rejects(() => prepare({ request: { intent: 'PREPARE', evidence: 'crea la tarea que pide un documento' } }), { status: 400 });
  await assert.rejects(() => prepare({ request: { intent: 'ADJUST', evidence: question } }), { status: 400 });
});
