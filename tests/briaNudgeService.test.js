// «Bria se adelanta» en el servidor y en su ruta (10 de octubre de 2026): lee tareas y relojes, respeta lo oculto,
// nunca habla de quien mira ni de administradores, y la ruta es solo para quien dirige con Bria.
import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { createBriaNudgeService, canSeeNudges } from '../src/services/briaNudgeService.js';
import { createBriaNudgeRouter } from '../src/routes/api/briaNudges.js';

const tuesday1030 = new Date('2026-10-13T15:30:00Z'); // 10:30 de Bogotá
const MIN = 60_000;
const pm = { userId: 'u-kam', role: 'PROJECT_MANAGER', isActive: true, modulePermissions: { bria: true, gestion: true } };
const fakeDb = () => ({
  teamMember: {
    findMany: async () => [
      { id: 'm-kam', name: 'Kamila Pérez', userId: 'u-kam', user: { role: 'PROJECT_MANAGER' }, nativeTasks: [{ id: 'k1', title: 'Plan', status: 'PENDIENTE', dueDate: null }] },
      { id: 'm-mel', name: 'Melissa Castaño', userId: 'u-mel', user: { role: 'EDITOR' }, nativeTasks: [{ id: 't1', title: 'Reel', status: 'PENDIENTE', dueDate: new Date('2026-10-13T12:00:00Z') }, { id: 't2', title: 'Post', status: 'DEVUELTA', dueDate: null }] },
      { id: 'm-bra', name: 'Brayan Torres', userId: 'u-bra', user: { role: 'EDITOR' }, nativeTasks: [{ id: 'b1', title: 'Video', status: 'EN_CURSO', dueDate: null }] },
      { id: 'm-rod', name: 'Rodny Chirinos', userId: 'u-rod', user: { role: 'ADMIN' }, nativeTasks: [{ id: 'r1', title: 'Dirección', status: 'PENDIENTE', dueDate: null }] },
      { id: 'm-hel', name: 'Helen Ruiz', userId: 'u-hel', user: { role: 'EDITOR' }, nativeTasks: [{ id: 'h1', title: 'Guion', status: 'PENDIENTE', dueDate: null }] }
    ],
    findFirst: async () => ({ id: 'm-kam' })
  },
  taskWorkSession: { findMany: async ({ where }) => { assert.deepEqual(Object.keys(where), ['workerId', 'OR']); return [{ workerId: 'm-mel', endedAt: new Date(tuesday1030.getTime() - 45 * MIN) }, { workerId: 'm-hel', endedAt: null }]; } },
  task: { findMany: async () => [{ assigneeId: 'm-mel', completedAt: new Date(tuesday1030.getTime() - 50 * MIN) }] }
});
const memoryRepo = () => {
  const hidden = new Map(), focus = new Map();
  return {
    hidden, focus,
    dismissedKeys: async (userRef, now) => new Set([...hidden.entries()].filter(([k, v]) => k.startsWith(`${userRef}|`) && v > now).map(([k]) => k.split('|')[1])),
    dismiss: async (userRef, key, untilAt) => { hidden.set(`${userRef}|${key}`, untilAt); return { key, untilAt }; },
    focusDelivery: async (weekKey, userRef) => focus.get(`${weekKey}|${userRef}`) || null
  };
};

test('the service reads people from tasks and work sessions: an open collaborator clock counts as working, admins and the viewer are left out', async () => {
  const repository = memoryRepo();
  const service = createBriaNudgeService({ db: fakeDb(), repository, now: () => tuesday1030 });
  const people = await service.readPeople(tuesday1030);
  assert.deepEqual(people.map((p) => p.personId), ['m-kam', 'm-mel', 'm-bra', 'm-hel'], 'Rodny (ADMIN) is never a subject');
  const melissa = people.find((p) => p.personId === 'm-mel');
  assert.deepEqual([melissa.pendingCount, melissa.inProgress, melissa.lastActivityAt.toISOString()], [2, [], new Date(tuesday1030.getTime() - 45 * MIN).toISOString()], 'the latest of session end and task close');
  assert.deepEqual(melissa.dueToday, [{ id: 't1', title: 'Reel', status: 'PENDIENTE' }]);
  assert.deepEqual(people.find((p) => p.personId === 'm-hel').inProgress, [{ id: 'reloj', title: 'Reloj propio en marcha' }]);
  const { nudges } = await service.list(pm);
  assert.deepEqual(nudges.map((n) => n.key), ['SIN_PROCESO:m-mel'], 'Kamila (viewer), Brayan (in progress), Helen (own clock) and Rodny are quiet');
  assert.equal(nudges[0].title, 'Melissa no tiene una tarea en proceso desde las 9:45.');
  assert.deepEqual(nudges[0].actions.map((a) => a.label), ['Ver sus pendientes', 'Resumir sus pendientes']);
});

test('hiding is per viewer and per key until the day ends; the weekly focus shows up as the first nudge', async () => {
  const repository = memoryRepo();
  const service = createBriaNudgeService({ db: fakeDb(), repository, now: () => tuesday1030 });
  const hidden = await service.dismiss(pm, 'SIN_PROCESO:m-mel');
  assert.equal(hidden.untilAt.toISOString(), '2026-10-14T05:00:00.000Z');
  assert.deepEqual((await service.list(pm)).nudges, []);
  assert.equal((await service.list({ ...pm, userId: 'u-otro' })).nudges.length, 1, 'another viewer still sees it');
  repository.focus.set('2026-W42|u-kam', { weekKey: '2026-W42', userRef: 'u-kam', conversationId: 'c-focus' });
  const { nudges } = await service.list(pm);
  assert.deepEqual([nudges[0].kind, nudges[0].conversationId], ['FOCO_SEMANAL', 'c-focus']);
  await assert.rejects(() => service.dismiss(pm, 'OTRA:cosa'), { status: 400 });
  await assert.rejects(() => service.dismiss({ ...pm, role: 'EDITOR' }, 'SIN_PROCESO:m-mel'), { status: 403 });
  assert.deepEqual(await service.list({ ...pm, modulePermissions: {} }), { nudges: [] }, 'without Bria there is nothing to show');
});

test('the route is for admins and project managers with Bria, lists and hides, and hides server causes', async () => {
  assert.equal(canSeeNudges(pm), true);
  assert.equal(canSeeNudges({ ...pm, role: 'EDITOR', modulePermissions: { bria: true } }), false);
  const calls = [];
  const serve = (user, service) => {
    const app = express(); app.use(express.json()); app.use((req, _res, next) => { req.user = user; next(); }); app.use('/n', createBriaNudgeRouter({ service }));
    return new Promise((resolve) => { const server = app.listen(0, () => resolve({ url: `http://127.0.0.1:${server.address().port}/n`, close: () => new Promise((done) => server.close(done)) })); });
  };
  const service = { list: async () => ({ nudges: [{ key: 'SIN_PROCESO:m-mel', title: 'x' }] }), dismiss: async (user, key) => { calls.push(key); if (key === 'boom') throw new Error('pg down'); return { key, untilAt: new Date() }; } };
  const ok = await serve(pm, service);
  try {
    const list = await fetch(ok.url); assert.equal(list.status, 200); assert.equal(list.headers.get('cache-control'), 'no-store');
    assert.deepEqual((await list.json()).nudges[0].key, 'SIN_PROCESO:m-mel');
    const hide = await fetch(`${ok.url}/dismiss`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key: 'SIN_PROCESO:m-mel' }) });
    assert.equal(hide.status, 200); assert.deepEqual(calls, ['SIN_PROCESO:m-mel']);
    const original = console.error; console.error = () => {};
    try { const broken = await fetch(`${ok.url}/dismiss`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key: 'boom' }) }); assert.equal(broken.status, 500); assert.equal((await broken.json()).message, 'No se pudieron leer los avisos de Bria.'); }
    finally { console.error = original; }
  } finally { await ok.close(); }
  const denied = await serve({ ...pm, role: 'EDITOR' }, service);
  try { assert.equal((await fetch(denied.url)).status, 403); } finally { await denied.close(); }
});
