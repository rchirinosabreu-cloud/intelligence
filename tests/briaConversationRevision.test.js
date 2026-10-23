import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { createBriaConversationRouter } from '../src/routes/api/briaConversations.js';
import { createBriaConversationService } from '../src/services/briaConversationService.js';

const id = '0b9f4a52-1c3e-4d8e-9f00-123456789abc';
const user = { userId: 'owner', role: 'ADMIN', isActive: true, modulePermissions: { bria: true, gestion: true } };
const serve = async service => {
  const app = express(); app.use(express.json());
  app.use((req, _res, next) => { req.user = user; next(); });
  app.use('/c', createBriaConversationRouter({ service }));
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  return { url: `http://127.0.0.1:${server.address().port}/c/${id}/messages`, close: () => new Promise(resolve => server.close(resolve)) };
};
const post = async (url, { revision, multipart = false, stream = false, duplicate = false } = {}) => {
  let body = { question: 'Confirmar', ...(revision !== undefined ? { expectedRevision: revision } : {}) };
  if (multipart) {
    body = new FormData(); body.append('question', 'Confirmar');
    if (revision !== undefined) body.append('expectedRevision', revision);
    if (duplicate) body.append('expectedRevision', revision);
    body.append('files', new Blob(['prueba']), 'prueba.txt');
  } else body = JSON.stringify(body);
  const response = await fetch(url, { method: 'POST', headers: { ...(!multipart ? { 'Content-Type': 'application/json' } : {}), ...(stream ? { Accept: 'text/event-stream' } : {}) }, body });
  const data = response.headers.get('content-type')?.includes('text/event-stream')
    ? JSON.parse((await response.text()).trim().split('\n\n').at(-1).replace(/^data: /, '')) : await response.json();
  return { response, data };
};

test('la ruta exige revisión válida y no convierte JSON ambiguo ni campos multipart duplicados', async () => {
  let sent = 0;
  const app = await serve({ read: async () => ({}), send: async () => { sent++; return {}; } });
  try {
    for (const revision of [undefined, null, '1', -1, 1.5, true, [], {}, Number.MAX_SAFE_INTEGER + 1]) {
      const { response } = await post(app.url, { revision, stream: true });
      assert.equal(response.status, 400, `JSON ${JSON.stringify(revision)}`);
    }
    for (const revision of [undefined, '', '01', ' 1', '1.0', '1e1', '-1', '9007199254740992']) {
      const { response } = await post(app.url, { revision, multipart: true });
      assert.equal(response.status, 400, `multipart ${revision}`);
    }
    assert.equal((await post(app.url, { revision: '1', multipart: true, duplicate: true })).response.status, 400);
    assert.equal(sent, 0);
  } finally { await app.close(); }
});

test('JSON, SSE y multipart pasan al motor la revisión exacta que vio la persona, incluida cero', async () => {
  const seen = [];
  const app = await serve({ read: async () => ({ revision: 99 }), send: async args => { seen.push(args); return { id, revision: args.expectedRevision + 1, turns: [] }; } });
  try {
    for (const multipart of [false, true]) for (const stream of [false, true]) {
      const { response } = await post(app.url, { revision: 0, multipart, stream });
      assert.equal(response.status, 200);
    }
    assert.deepEqual(seen.map(args => args.expectedRevision), [0, 0, 0, 0]);
    assert.equal(seen[2].files[0].originalname, 'prueba.txt');
  } finally { await app.close(); }
});

test('el motor real bloquea confirmar desde una pestaña vieja por JSON, SSE y multipart antes de cualquier efecto', async () => {
  let actions = 0, ai = 0, attachments = 0, appended = 0;
  const stored = { id, revision: 2, turns: [{ role: 'assistant', text: '¿Lo hago así?', pendingAction: { id: 'a2', ownerId: 'owner', type: 'TASK_UPDATE', status: 'DRAFT', title: 'Mover la fecha cambiada', summary: [], missing: [] } }] };
  const service = createBriaConversationService({
    repository: { get: async () => stored, append: async () => { appended++; throw new Error('No se debe guardar'); } },
    resolveActor: async () => ({ ref: 'owner', role: 'ADMIN' }),
    prepareAttachment: async () => { attachments++; throw new Error('No se debe leer el adjunto'); },
    assistant: { ask: async () => { ai++; throw new Error('No se debe preguntar'); } },
    actions: { execute: async () => { actions++; throw new Error('No se debe ejecutar'); } }
  });
  const app = await serve(service);
  try {
    for (const multipart of [false, true]) for (const stream of [false, true]) {
      const { response, data } = await post(app.url, { revision: 1, multipart, stream });
      assert.equal(stream ? data.status : response.status, 409);
      assert.equal(data.code, 'BRIA_CONVERSATION_STALE');
      assert.match(data.message, /Revisa su última respuesta/);
    }
    assert.deepEqual({ actions, ai, attachments, appended }, { actions: 0, ai: 0, attachments: 0, appended: 0 });
  } finally { await app.close(); }
});
