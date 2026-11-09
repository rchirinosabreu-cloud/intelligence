import test from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';
import { createSharedTaskApiFixture } from './support/sharedTaskApiFixture.js';
import { SHARED_TEST_DATABASE_URL } from './support/sharedTaskSandbox.js';
import { ensureTaskCardOrderSchema } from '../scripts/ensure-task-card-order-schema.js';
import { projectTaskParticipations } from '../src/lib/taskParticipationBoard.js';
import { compareTaskBoardOrder } from '../src/lib/taskOrder.js';
import { taskOrderKey, taskOrderDescriptor } from '../src/lib/taskCardOrder.js';

let f;
test.before(async () => {
  const db = new pg.Client({ connectionString: SHARED_TEST_DATABASE_URL });
  await db.connect(); try { await ensureTaskCardOrderSchema(db); await ensureTaskCardOrderSchema(db); } finally { await db.end(); }
  f = await createSharedTaskApiFixture();
});
test.after(async () => { await f?.close(); });
const cards = async status => projectTaskParticipations((await f.request('manager', `/tasks?clientId=${f.client.id}`)).data)
  .filter(c => c.status === status).sort(compareTaskBoardOrder);
const reorder = (before, after, actor = 'manager', expected = 200) => f.request(actor, '/tasks/reorder', {
  method: 'POST', expected, body: { cards: after.map(taskOrderDescriptor), previousCards: before.map(taskOrderDescriptor) },
});
const history = async ids => ({
  tasks: await f.db.task.findMany({ where: { id: { in: ids } }, orderBy: { id: 'asc' } }),
  sessions: await f.db.taskWorkSession.findMany({ where: { taskId: { in: ids } }, orderBy: { id: 'asc' } }),
  cycles: await f.db.taskWorkCycle.findMany({ where: { taskId: { in: ids } }, orderBy: { id: 'asc' } }),
  comments: await f.db.taskComment.findMany({ where: { taskId: { in: ids } }, orderBy: { id: 'asc' } }),
});

test('admin y PM ordenan tarjetas mixtas y dos partes del mismo ID; filtros, recarga e historia intactos', async () => {
  let shared = await f.createTask('Orden · compartida');
  shared = (await f.move(shared, 'ana', 'EN_CURSO')).data;
  const hidden = await f.createTask('Orden · fuera del filtro', { collaboratorIds: [] });
  const individual = await f.createTask('Orden · individual', { collaboratorIds: [] });
  const ids = [shared.id, hidden.id, individual.id];
  const original = await history(ids);
  for (const role of ['ADMIN', 'PROJECT_MANAGER']) {
    await f.db.user.update({ where: { id: f.actors.manager.id }, data: { role, modulePermissions: { gestion: true } } });
    const all = await cards('PENDIENTE');
    const selected = all.filter(c => c.id === shared.id || c.id === individual.id);
    const remaining = all.filter(c => !selected.includes(c)).map(taskOrderKey);
    const response = await reorder(selected, [...selected].reverse());
    assert.equal(response.data.order.length, selected.length);
    assert.ok(!response.data.order.some(row => row.id === hidden.id));
    const saved = await cards('PENDIENTE');
    assert.deepEqual(saved.filter(c => c.id === shared.id || c.id === individual.id).map(taskOrderKey), selected.map(taskOrderKey).reverse());
    assert.deepEqual(saved.filter(c => c.id !== shared.id && c.id !== individual.id).map(taskOrderKey), remaining);
    assert.deepEqual(await history(ids), original);
    await reorder(selected, [...selected].reverse(), 'manager', 409);
  }
  const newcomer = await f.createTask('Orden · llegada posterior', { collaboratorIds: [] });
  assert.equal((await cards('PENDIENTE')).at(-1).id, newcomer.id);
  const selection = (await cards('PENDIENTE')).filter(c => ids.includes(c.id));
  await reorder(selection, [...selection].reverse(), 'ana', 403);
});

test('realizadas y devueltas se ordenan sin reabrir, reintegrar, conceder logros ni cambiar relojes', async () => {
  let shared = await f.createTask('Orden · estados');
  shared = (await f.move(shared, 'ana', 'REALIZADA')).data;
  shared = (await f.move(shared, 'bea', 'REALIZADA')).data;
  const initial = await history([shared.id]);
  const completed = (await cards('REALIZADA')).filter(c => c.id === shared.id);
  await reorder(completed, [...completed].reverse());
  assert.deepEqual((await cards('REALIZADA')).filter(c => c.id === shared.id).map(taskOrderKey), completed.map(taskOrderKey).reverse());
  assert.deepEqual(await history([shared.id]), initial);
  shared = (await f.move(shared, 'ana', 'DEVUELTA', { returnReason: 'BRIEF_MISMATCH', returnNote: 'Corregir la parte de prueba' })).data;
  shared = (await f.move(shared, 'bea', 'DEVUELTA', { returnReason: 'BRIEF_MISMATCH', returnNote: 'Corregir la otra parte' })).data;
  const returned = (await cards('DEVUELTA')).filter(c => c.id === shared.id);
  const beforeReturnOrder = await history([shared.id]);
  await reorder(returned, [...returned].reverse());
  assert.deepEqual(await history([shared.id]), beforeReturnOrder);
});

test('priorizar una tarjeta privada no concede lectura ni permite cambiar estado; permisos se revalidan', async () => {
  const task = await f.createTask('Orden · privada', { collaboratorIds: [], isPrivate: true });
  await f.db.user.update({ where: { id: f.actors.outside.id }, data: { role: 'ADMIN', modulePermissions: { gestion: true } } });
  // La sesión se renueva para ejercer el rol vigente.
  const login = await f.request('outside', '/login', { method: 'POST', body: { email: f.actors.outside.email, password: f.actors.outside.password } });
  const send = async body => {
    const r = await fetch(`${f.api.origin}/api/tasks/reorder`, { method: 'POST', headers: { Authorization: `Bearer ${login.data.token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    return { status: r.status, data: await r.json() };
  };
  const listResponse = await fetch(`${f.api.origin}/api/tasks?clientId=${f.client.id}`, { headers: { Authorization: `Bearer ${login.data.token}` } });
  const before = projectTaskParticipations(await listResponse.json()).filter(c => c.id === task.id);
  assert.equal(before[0].isLocked, true);
  const body = { cards: before.map(taskOrderDescriptor), previousCards: before.map(taskOrderDescriptor) };
  assert.equal((await send(body)).status, 200);
  const detail = await fetch(`${f.api.origin}/api/tasks/${task.id}`, { headers: { Authorization: `Bearer ${login.data.token}` } });
  assert.equal(detail.status, 403);
  await f.db.user.update({ where: { id: f.actors.outside.id }, data: { role: 'EDITOR' } });
  assert.equal((await send(body)).status, 403);
});

test('mover una individual a otra columna respeta el destino entre tarjetas ya priorizadas', async () => {
  const first = await f.createTask('Orden · destino primero', { collaboratorIds: [] });
  const second = await f.createTask('Orden · destino segundo', { collaboratorIds: [] });
  const moving = await f.createTask('Orden · cambiar columna', { collaboratorIds: [] });
  await f.request('manager', `/tasks/${moving.id}`, { method: 'PATCH', body: { status: 'EN_CURSO' } });
  let selected = (await cards('PENDIENTE')).filter(c => [first.id, second.id].includes(c.id));
  await reorder(selected, [...selected].reverse());
  await f.request('manager', `/tasks/${moving.id}`, { method: 'PATCH', body: { status: 'PENDIENTE', orderBeforeId: first.id } });
  const saved = (await cards('PENDIENTE')).filter(c => [first.id, second.id, moving.id].includes(c.id));
  assert.deepEqual(saved.map(c => c.id), [second.id, moving.id, first.id]);
});

test('dos prioridades simultáneas no se sobrescriben y salir de columna retira solo la posición personal', async () => {
  let shared = await f.createTask('Orden · concurrencia');
  const selected = (await cards('PENDIENTE')).filter(c => c.id === shared.id);
  const body = { cards: [...selected].reverse().map(taskOrderDescriptor), previousCards: selected.map(taskOrderDescriptor) };
  const responses = await Promise.all([0,1].map(() => fetch(`${f.api.origin}/api/tasks/reorder`, { method: 'POST',
    headers: { Authorization: `Bearer ${f.sessions.manager.token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) })));
  assert.deepEqual(responses.map(r => r.status).sort(), [200,409]);
  const before = (await cards('PENDIENTE')).filter(c => c.id === shared.id);
  shared = (await f.move(shared, 'ana', 'EN_CURSO')).data;
  const after = (await cards('PENDIENTE')).filter(c => c.id === shared.id);
  for (const card of after) assert.deepEqual(card.boardOrder, before.find(c => taskOrderKey(c) === taskOrderKey(card)).boardOrder);
  assert.equal((await cards('EN_CURSO')).find(c => c.id === shared.id).boardOrder, undefined);
});
