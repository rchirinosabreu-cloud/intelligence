import test from 'node:test';
import assert from 'node:assert/strict';
import { taskDeliverableUploadPlan, uploadTaskDeliverables, reorderTaskDeliverables } from '../src/lib/taskDeliverableClient.js';

const MB = 1024 * 1024;
const limits = { maxFiles: 20, maxServerBytes: 200 * MB, maxServerTotalBytes: 200 * MB, maxDirectBytes: 2048 * MB };
const options = { apiBase: '', token: 'test-token', expectedRevision: 4, requestId: 'attempt-one', limits };

test('los entregables aceptan varios tipos y eligen directo también por la suma del conjunto', () => {
  assert.equal(taskDeliverableUploadPlan([{ size: 10, type: 'application/pdf' }, { size: 20, type: 'application/zip' }], limits).mode, 'server');
  assert.equal(taskDeliverableUploadPlan([{ size: 120 * MB }, { size: 100 * MB }], limits).mode, 'direct');
  assert.match(taskDeliverableUploadPlan([], limits).problem, /archivo/);
  assert.match(taskDeliverableUploadPlan(Array.from({ length: 21 }, () => ({ size: 1 })), limits).problem, /20/);
  assert.match(taskDeliverableUploadPlan([{ size: 2048 * MB + 1 }], limits).problem, /límite/);
});

test('multipart entrega el conjunto completo con revisión e identidad del intento, sin comandos de tarea', async () => {
  const calls = [];
  const file = new File(['pdf'], 'resultado.pdf', { type: 'application/pdf' });
  const expected = { revision: 5, files: [{ id: 'new' }], history: [] };
  const client = { post: async (...args) => { calls.push(args); return { data: expected }; } };
  assert.equal(await uploadTaskDeliverables('task/id', [file], { ...options, client }), expected);
  assert.equal(calls.length, 1);
  const [url, body, config] = calls[0];
  assert.equal(url, '/api/tasks/task%2Fid/deliverables');
  assert.equal(body.getAll('files').length, 1);
  assert.equal(body.get('expectedRevision'), '4');
  assert.equal(body.get('requestId'), 'attempt-one');
  assert.equal(config.headers.Authorization, 'Bearer test-token');
});

test('subida directa conserva token, revisión y requestId al confirmar, sin confirmar antes de subir', async () => {
  const calls = [];
  const uploads = [{ token: 'signed-token', url: 'https://storage.invalid/upload', key: 'private-key', name: 'video.mp4', mimeType: 'video/mp4' }];
  const result = { revision: 5, files: [], history: [] };
  const client = {
    post: async (url, body) => { calls.push([url, body]); return { data: url.endsWith('/direct-upload') ? { uploads, expectedRevision: 4 } : result }; },
    put: async (url, file) => { calls.push([url, file]); },
  };
  const files = [{ name: 'video.mp4', size: 201 * MB, type: 'video/mp4' }];
  assert.equal(await uploadTaskDeliverables('task', files, { ...options, client }), result);
  assert.match(calls[0][0], /\/direct-upload$/);
  assert.equal(calls[0][1].requestId, 'attempt-one');
  assert.equal(calls[1][0], uploads[0].url);
  assert.deepEqual(calls[2], ['/api/tasks/task/deliverables/confirm', { uploads, expectedRevision: 4, requestId: 'attempt-one' }]);
});

test('un intento directo ya confirmado recupera el recibo sin volver a subir ni confirmar', async () => {
  const result = { alreadyCommitted: true, revision: 5, files: [], receipt: { duplicate: true } };
  let calls = 0;
  const client = { post: async () => { calls++; return { data: result }; }, put: async () => assert.fail('no debe subir otra vez') };
  assert.equal(await uploadTaskDeliverables('task', [{ name: 'large.pdf', type: 'application/pdf', size: 201 * MB }], { ...options, client }), result);
  assert.equal(calls, 1);
});

test('ordenar envía todos los ids, la revisión leída y el mismo requestId que aporta el intento', async () => {
  const calls = [];
  const client = { put: async (...args) => { calls.push(args); return { data: { revision: 5 } }; } };
  assert.deepEqual(await reorderTaskDeliverables('task', ['b', 'a'], { ...options, client }), { revision: 5 });
  assert.equal(calls[0][0], '/api/tasks/task/deliverables/order');
  assert.deepEqual(calls[0][1], { order: ['b', 'a'], expectedRevision: 4, requestId: 'attempt-one' });
});
