import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { Readable } from 'node:stream';
import { randomUUID } from 'node:crypto';
import { createTaskDeliverableRouter } from '../src/routes/api/taskDeliverables.js';

async function fixture() {
  const calls = [], result = { taskId: 'task', revision: 1, files: [], history: [], canUpload: true, canReorder: true };
  const service = Object.fromEntries(['get', 'replace', 'prepare', 'confirm', 'reorder'].map(name => [name, async (...args) => { calls.push([name, ...args]); return result; }]));
  const prepare = service.prepare;
  service.prepare = async (...args) => { if (args[1]?.id === 'no-storage') throw Object.assign(new Error('El almacenamiento de entregables no está configurado.'), { status: 503 }); return prepare(...args); };
  service.authorize = async (_id, actor) => { if (actor.id === 'reader') throw Object.assign(new Error('Sin permiso de entrega.'), { status: 403 }); };
  service.file = async (_id, id) => {
    if (id === 'old') throw Object.assign(new Error('No vigente.'), { status: 404 });
    return { id, name: 'Entrega.pdf', mimeType: 'application/pdf', size: 12n, storageKey: 'internal/key' };
  };
  const app = express(); app.use(express.json());
  app.use((req, _res, next) => { req.user = { id: req.headers['x-actor'] || 'ana' }; next(); });
  app.use('/api/tasks/:taskId/deliverables', createTaskDeliverableRouter({ service, storage: { getFromS3Stream: async (_key, options) => {
    calls.push(['stream', options]); return { Body: Readable.from(options?.range ? Buffer.from('%PDF') : Buffer.from('%PDF example')) };
  } } }));
  const server = await new Promise(resolve => { const running = app.listen(0, '127.0.0.1', () => resolve(running)); });
  return { calls, base: `http://127.0.0.1:${server.address().port}/api/tasks/task/deliverables`, close: () => new Promise(resolve => server.close(resolve)) };
}

test('task delivery routes preserve multipart identity, guard writes and return their agreed status codes', async () => {
  const f = await fixture();
  try {
    const body = () => { const form = new FormData(); form.append('expectedRevision', '0'); form.append('requestId', randomUUID()); form.append('files', new Blob(['%PDF example'], { type: 'application/pdf' }), 'Entrega.pdf'); return form; };
    assert.equal((await fetch(f.base, { method: 'POST', headers: { 'x-actor': 'reader' }, body: body() })).status, 403);
    assert.equal(f.calls.length, 0);
    const unavailable = await fetch(f.base + '/direct-upload', { method: 'POST', headers: { 'x-actor': 'no-storage', 'Content-Type': 'application/json' }, body: '{}' });
    assert.equal(unavailable.status, 503);
    assert.match((await unavailable.json()).error, /no está configurado/);
    assert.equal((await fetch(f.base, { method: 'POST', body: body() })).status, 201);
    const saved = f.calls[0]; assert.equal(saved[0], 'replace'); assert.equal(saved[1], 'task'); assert.equal(saved[3][0].originalname, 'Entrega.pdf'); assert.equal(saved[4].expectedRevision, '0');
    for (const [route, method, expected] of [['/direct-upload', 'POST', 200], ['/confirm', 'POST', 201], ['/order', 'PUT', 200]]) {
      assert.equal((await fetch(f.base + route, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ expectedRevision: 1, requestId: randomUUID(), files: [], uploads: [], order: [] }) })).status, expected);
    }
  } finally { await f.close(); }
});

test('only current files are streamed through the authenticated route with safe headers and bounded ranges', async () => {
  const f = await fixture();
  try {
    assert.equal((await fetch(f.base + '/old/file')).status, 404);
    assert.equal(f.calls.length, 0);
    const response = await fetch(f.base + '/new/file', { headers: { Range: 'bytes=0-3' } });
    assert.equal(response.status, 206); assert.equal(await response.text(), '%PDF');
    assert.equal(response.headers.get('content-range'), 'bytes 0-3/12');
    assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
    assert.match(response.headers.get('content-security-policy'), /sandbox/);
    assert.deepEqual(f.calls.at(-1), ['stream', { range: 'bytes=0-3' }]);
    assert.equal((await fetch(f.base + '/new/file', { headers: { Range: 'bytes=100-200' } })).status, 416);
    const download = await fetch(f.base + '/new/download');
    assert.match(download.headers.get('content-disposition'), /^attachment;/);
  } finally { await f.close(); }
});
