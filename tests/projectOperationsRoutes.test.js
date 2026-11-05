import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { createClientOperationsRouter } from '../src/routes/api/clientOperations.js';

const run = async (role, visit) => {
  const calls = [];
  const projectService = {
    async listClientProjects(clientId, actor) {
      calls.push(['list', clientId, actor]);
      return [{ id: 'project-a', formalizationStatus: 'PENDIENTE', title: 'Campaña de lanzamiento' }];
    },
    async updateProjectOperation(clientId, projectId, input, actor) {
      calls.push(['update', clientId, projectId, input, actor]);
      if (input.expectedRevision === 1) throw Object.assign(new Error('La ficha cambió. Recarga la versión actual antes de guardar.'), { status: 409, code: 'PROJECT_OPERATION_CONFLICT' });
      if (projectId === 'internal-error') throw new Error('postgres://secret');
      return { id: projectId, revision: 3, reviewStatus: 'REVISADO' };
    },
  };
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => { if (role) req.user = { userId: 'session-user', role }; next(); });
  app.use('/ops', createClientOperationsRouter({ service: {}, projectService, logger: { error() {} } }));
  const server = await new Promise((resolve) => { const instance = app.listen(0, '127.0.0.1', () => resolve(instance)); });
  try { await visit(`http://127.0.0.1:${server.address().port}/ops`, calls); }
  finally { await new Promise((resolve) => server.close(resolve)); }
};
const put = (body) => ({ method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

test('los proyectos de Operación exigen sesión y rol de manager', async () => {
  for (const [role, status] of [[null, 401], ['EDITOR', 403]]) {
    await run(role, async (base, calls) => {
      assert.equal((await fetch(`${base}/client-a/projects`)).status, status);
      assert.equal((await fetch(`${base}/client-a/projects/project-a`, put({}))).status, status);
      assert.deepEqual(calls, []);
    });
  }
});

test('el PM consulta los proyectos de ese cliente con su identidad de sesión', async () => {
  await run('PROJECT_MANAGER', async (base, calls) => {
    const response = await fetch(`${base}/client-a/projects`);
    assert.equal(response.status, 200);
    assert.equal((await response.json())[0].formalizationStatus, 'PENDIENTE');
    assert.deepEqual(calls, [['list', 'client-a', { userId: 'session-user', role: 'PROJECT_MANAGER' }]]);
  });
});

test('revisar una ficha filtra propiedades financieras, fuente, estado y actor del cuerpo', async () => {
  await run('ADMIN', async (base, calls) => {
    const input = { title: 'Lanzamiento', modality: 'PUNTUAL', startDate: '2026-11-09', endDate: null, projectManagerId: 'member-a', deliverables: [{ id: 'd1', label: 'Video', quantity: 2, unit: 'piezas' }], productionDays: 0, productionHours: null, reportRequired: false, notes: 'Inicio acordado', expectedRevision: 2, review: true };
    const response = await fetch(`${base}/client-a/projects/project-a`, put({ ...input, actor: { userId: 'other' }, clientId: 'other', quotationId: 'other', source: { total: 10 }, formalizationStatus: 'HABILITADO', amount: 5, reviewStatus: 'REVISADO', reviewedById: 'other' }));
    assert.equal(response.status, 200);
    assert.deepEqual(calls, [['update', 'client-a', 'project-a', input, { userId: 'session-user', role: 'ADMIN' }]]);
  });
});

test('conflictos de revisión conservan 409 y fallos internos no exponen secretos', async () => {
  await run('ADMIN', async (base) => {
    const conflict = await fetch(`${base}/client-a/projects/project-a`, put({ expectedRevision: 1 }));
    assert.equal(conflict.status, 409);
    assert.equal((await conflict.json()).code, 'PROJECT_OPERATION_CONFLICT');
    const failure = await fetch(`${base}/client-a/projects/internal-error`, put({ expectedRevision: 2 }));
    assert.equal(failure.status, 500);
    assert.doesNotMatch(await failure.text(), /postgres|secret/);
  });
});
