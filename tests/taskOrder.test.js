import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { compareTaskOrder, mergeFilteredTaskOrder, taskEntersNewQueue } from '../src/lib/taskOrder.js';
import { nextTaskOrder, reorderTaskSelection, updateOrderedTask } from '../src/services/taskOrderService.js';
import { checkTaskUpdate } from '../src/services/taskUpdateGate.js';

const task = (id, sortOrder, extra = {}) => ({ id, sortOrder, status: 'PENDIENTE', dueDate: '2026-11-04T12:00:00Z', createdAt: '2026-11-01T12:00:00Z', assigneeId: 'one', clientId: 'client', ...extra });
const ids = rows => rows.map(row => row.id);

// In-memory persistence only; ordering and validation run in the real service.
function database(initial) {
  const rows = structuredClone(initial);
  const matches = (row, where = {}) => (!where.status || row.status === where.status)
    && (!where.id || (typeof where.id === 'string' ? row.id === where.id : where.id.in.includes(row.id)));
  const db = { $executeRaw: async () => {}, $queryRaw: async () => [], task: {
    findFirst: async () => null,
    findMany: async ({ where } = {}) => structuredClone(rows.filter(row => matches(row, where))),
    findUnique: async ({ where }) => structuredClone(rows.find(row => row.id === where.id)),
    aggregate: async ({ where }) => ({ _max: { sortOrder: Math.max(0, ...rows.filter(row => matches(row, where)).map(row => row.sortOrder ?? 0)) } }),
    update: async ({ where, data }) => { const row = rows.find(row => row.id === where.id); Object.assign(row, data); return structuredClone(row); }
  } };
  db.$transaction = async work => work({ ...db, $executeRaw: async () => {} });
  return { db, rows };
}

test('manual order wins over dates and legacy ties are deterministic', () => {
  const rows = [task('newer', 8, { dueDate: '2026-10-01' }), task('second', 2), task('first', 1)];
  assert.deepEqual(ids(rows.sort(compareTaskOrder)), ['first', 'second', 'newer']);
  const tied = [task('b', 0), task('a', null), task('old', 0, { dueDate: '2026-11-03' })];
  assert.deepEqual(ids(tied.sort(compareTaskOrder)), ['old', 'a', 'b']);
  assert.deepEqual(ids([...tied].reverse().sort(compareTaskOrder)), ['old', 'a', 'b']);
});

test('filtered reordering replaces only visible slots, including legacy duplicate ranks', () => {
  const rows = [task('a', 0), task('hidden-person', 0), task('b', 1), task('hidden-date', 2), task('c', 3)];
  const before = structuredClone(rows);
  const reordered = mergeFilteredTaskOrder(rows, ['c', 'a', 'b']);
  assert.deepEqual(ids(reordered), ['c', 'hidden-person', 'a', 'hidden-date', 'b']);
  assert.deepEqual(rows, before, 'the input is not mutated');
  assert.throws(() => mergeFilteredTaskOrder(rows, ['a', 'missing']), /cambi/);
  assert.throws(() => mergeFilteredTaskOrder(rows, ['a', 'a']), /repet/);
});

test('queue entry means changed person, client, status or calendar day, not saving identical values', () => {
  const current = task('a', 2);
  for (const change of [{ assigneeId: 'two' }, { assigneeId: null }, { clientId: 'other' }, { status: 'EN_CURSO' }, { dueDate: '2026-11-05' }, { dueDate: null }]) {
    assert.equal(taskEntersNewQueue(current, change), true, JSON.stringify(change));
  }
  for (const change of [{ title: 'Corregir título' }, { priority: 'URGENTE' }, { focusDeadlineAt: '2026-11-04T23:00:00Z' }, { dueDate: '2026-11-04T00:00:00Z' }, { assigneeId: 'one', clientId: 'client', status: 'PENDIENTE' }]) {
    assert.equal(taskEntersNewQueue(current, change), false, JSON.stringify(change));
  }
  assert.equal(taskEntersNewQueue(task('a', 0, { status: 'REALIZADA' }), { status: 'PENDIENTE' }), true);
});

test('new tasks append after the entire destination column, even when filtered rows are hidden', async () => {
  const { db } = database([task('a', 2), task('hidden', 20, { assigneeId: 'two' }), task('done', 80, { status: 'REALIZADA' })]);
  assert.equal(await nextTaskOrder(db, 'PENDIENTE'), 21);
  assert.equal(await nextTaskOrder(database([]).db, 'PENDIENTE'), 1);
});

test('reordering a filtered selection preserves hidden tasks and a concurrently added task at the end', async () => {
  const { db, rows } = database([task('a', 0), task('hidden', 1), task('b', 2), task('new', 3)]);
  await reorderTaskSelection({ db, user: { role: 'PROJECT_MANAGER' }, reorderList: [{ id: 'b', sortOrder: 0 }, { id: 'a', sortOrder: 1 }], previousIds: ['a', 'b'] });
  assert.deepEqual(ids(rows.sort(compareTaskOrder)), ['b', 'hidden', 'a', 'new']);
  assert.equal(new Set(rows.map(row => row.sortOrder)).size, 4);
});

test('invalid or stale reorder requests do not write, and only managers reorder', async () => {
  for (const request of [
    { user: { role: 'EDITOR' }, statusCode: 403 },
    { reorderList: [{ id: 'a', sortOrder: 0 }, { id: 'a', sortOrder: 1 }], statusCode: 400 },
    { reorderList: [{ id: 'a', sortOrder: -1 }], statusCode: 400 },
    { reorderList: [{ id: 'a', sortOrder: 0 }, { id: 'done', sortOrder: 1 }], statusCode: 409 },
    { reorderList: [{ id: 'missing', sortOrder: 0 }], statusCode: 409 },
    { previousIds: ['b', 'a'], statusCode: 409 }
  ]) {
    const initial = [task('a', 0), task('b', 1), task('done', 2, { status: 'REALIZADA' })];
    const { db, rows } = database(initial);
    await assert.rejects(reorderTaskSelection({ db, user: { role: 'ADMIN' }, reorderList: [{ id: 'b', sortOrder: 0 }, { id: 'a', sortOrder: 1 }], ...request }), { statusCode: request.statusCode });
    assert.deepEqual(rows, initial);
  }
});

test('reassignment, date change and reopening append; unrelated edits keep the saved rank', async () => {
  for (const data of [{ assigneeId: 'two' }, { dueDate: '2026-11-05' }, { clientId: 'other' }, { status: 'PENDIENTE' }]) {
    const current = task('moving', 0, { status: 'status' in data ? 'REALIZADA' : 'PENDIENTE' });
    const { db, rows } = database([current, task('a', 1), task('b', 2)]);
    const updated = await updateOrderedTask(db, { where: { id: current.id }, data }, current);
    assert.equal(updated.sortOrder, 3);
    assert.deepEqual(ids(rows.sort(compareTaskOrder)), ['a', 'b', 'moving']);
  }
  const current = task('a', 4);
  const { db } = database([current, task('b', 8)]);
  assert.equal((await updateOrderedTask(db, { where: { id: 'a' }, data: { title: 'Nuevo título', dueDate: '2026-11-04T00:00:00Z' } }, current)).sortOrder, 4);
});

test('deliberate manager placement across columns uses the visible anchor instead of a filtered index', async () => {
  const current = task('moving', 0, { status: 'EN_CURSO' });
  const { db, rows } = database([current, task('hidden', 0), task('a', 1), task('b', 2)]);
  const updated = await updateOrderedTask(db, { where: { id: 'moving' }, data: { status: 'PENDIENTE', orderBeforeId: 'b' } }, current);
  assert.deepEqual(ids(rows.sort(compareTaskOrder)), ['hidden', 'a', 'moving', 'b']);
  assert.equal(updated.sortOrder, 2);
  await assert.rejects(updateOrderedTask(db, { where: { id: 'moving' }, data: { orderBeforeId: 'missing' } }, updated), { statusCode: 409 });
});

test('an ordinary user cannot sneak a manual anchor into an otherwise allowed edit', async () => {
  await assert.rejects(checkTaskUpdate({ user: { role: 'EDITOR', userId: 'author' }, taskId: 'a', payload: { orderBeforeId: null }, db: database([task('a', 0, { creatorId: 'author' })]).db }), { gateStatus: 403 });
});

test('all live task creation and queue mutations use the shared order service', async () => {
  const native = await readFile(new URL('../src/services/nativeTaskService.js', import.meta.url), 'utf8');
  const content = await readFile(new URL('../src/services/contentService.js', import.meta.url), 'utf8');
  const controller = await readFile(new URL('../src/controllers/taskController.js', import.meta.url), 'utf8');
  assert.match(native, /sortOrder: await nextTaskOrder\(tx, mappedStatus\)/);
  assert.match(native, /sortOrder: await nextTaskOrder\(tx, 'PENDIENTE'\)/, 'automatic publication tasks also append');
  assert.equal((native.match(/updateOrderedTask\(tx,/g) || []).length, 2, 'native update and sibling date reciprocity');
  assert.match(content, /updateOrderedTask\(tx,/);
  assert.match(controller, /await reorderTaskSelection\(/);
});
