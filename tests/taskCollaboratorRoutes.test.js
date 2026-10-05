import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { createTaskCollaboratorController } from '../src/controllers/taskCollaboratorController.js';

// El reloj propio de un colaborador: la identidad sale de la sesión y un error nunca enseña internos.

const buildApp = (overrides = {}) => {
  const calls = [];
  const controller = createTaskCollaboratorController({
    start: async (args) => { calls.push(['start', args]); },
    pause: async (args) => { calls.push(['pause', args]); },
    teamTime: async ({ taskId }) => [{ memberId: 'm-melissa', taskId }],
    ...overrides
  });
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => { req.user = { userId: 'u-melissa' }; next(); });
  app.get('/tasks/:taskId/work/team', controller.getTeamTime);
  app.post('/tasks/:taskId/work/start', controller.startWork);
  app.post('/tasks/:taskId/work/pause', controller.pauseWork);
  return { app, calls };
};

const withServer = async (app, run) => {
  const server = await new Promise((resolve) => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
  try { await run(`http://127.0.0.1:${server.address().port}`); } finally { server.close(); }
};

test('start and pause use the session identity and answer with the team time', async () => {
  const { app, calls } = buildApp();
  await withServer(app, async (base) => {
    const started = await fetch(`${base}/tasks/t-1/work/start`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userId: 'u-spoofed' }) });
    assert.equal(started.status, 200);
    assert.deepEqual(await started.json(), [{ memberId: 'm-melissa', taskId: 't-1' }]);
    await fetch(`${base}/tasks/t-1/work/pause`, { method: 'POST' });
  });
  assert.deepEqual(calls, [['start', { taskId: 't-1', userId: 'u-melissa' }], ['pause', { taskId: 't-1', userId: 'u-melissa' }]]);
});

test('a refusal says why in Spanish; an internal failure never leaks', async () => {
  const refused = buildApp({ start: async () => { throw Object.assign(new Error('Solo los colaboradores de la tarea registran tiempo aquí.'), { statusCode: 403, code: 'TASK_NOT_COLLABORATOR' }); } });
  await withServer(refused.app, async (base) => {
    const response = await fetch(`${base}/tasks/t-1/work/start`, { method: 'POST' });
    assert.equal(response.status, 403);
    assert.match((await response.json()).error, /colaboradores/);
  });
  const broken = buildApp({ teamTime: async () => { throw new Error('postgres://secret'); } });
  await withServer(broken.app, async (base) => {
    const response = await fetch(`${base}/tasks/t-1/work/team`);
    assert.equal(response.status, 500);
    assert.doesNotMatch(await response.text(), /postgres/);
  });
});
