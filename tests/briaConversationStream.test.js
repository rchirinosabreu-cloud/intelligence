// La ruta de mensajes de Bria en vivo (9 de octubre de 2026): con `Accept: text/event-stream` manda los avances a
// medida que pasan y al final el chat guardado, que es el que manda. Sin ese encabezado, todo sigue igual.
import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { createBriaConversationRouter } from '../src/routes/api/briaConversations.js';

const CHAT_ID = '0b9f4a52-1c3e-4d8e-9f00-123456789abc';
const user = { userId: 'u1', role: 'ADMIN', isActive: true, modulePermissions: { bria: true } };
const serve = async (service) => {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => { req.user = user; next(); });
  app.use('/c', createBriaConversationRouter({ service }));
  const server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  return { url: `http://127.0.0.1:${server.address().port}/c/${CHAT_ID}/messages`, close: () => new Promise((resolve) => server.close(resolve)) };
};
const events = (body) => body.split('\n\n').filter(Boolean).map((block) => JSON.parse(block.replace(/^data: /, '')));
const saved = { id: CHAT_ID, revision: 2, turns: [{ id: `${CHAT_ID}:0`, role: 'user', text: 'hola' }, { id: `${CHAT_ID}:1`, role: 'assistant', text: 'Hola, Rodny.', sources: [{ kind: 'tarea', id: 't1' }] }] };

test('streaming: progress as it happens, then the saved chat without its sources', async () => {
  const service = { read: async () => ({}), authorizeInput: async () => {}, send: async ({ onEvent }) => {
    onEvent({ type: 'status', label: 'Revisando tus tareas…' });
    onEvent({ type: 'delta', text: 'Hola, ' }); onEvent({ type: 'delta', text: 'Rodny.' });
    return saved;
  } };
  const app = await serve(service);
  try {
    const response = await fetch(app.url, { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' }, body: JSON.stringify({ question: 'hola' }) });
    assert.match(response.headers.get('content-type'), /text\/event-stream/);
    assert.match(response.headers.get('cache-control'), /no-store/);
    const list = events(await response.text());
    assert.deepEqual(list.slice(0, 3).map((e) => e.type), ['status', 'delta', 'delta']);
    const done = list.at(-1);
    assert.equal(done.type, 'done');
    assert.equal(done.chat.turns[1].text, 'Hola, Rodny.');
    assert.equal('sources' in done.chat.turns[1], false, 'the catalogue of sources never reaches the browser');
  } finally { await app.close(); }
});

test('streaming: a failure arrives as words, and an unexpected one never shows its cause', async () => {
  const original = console.error; console.error = () => {};
  const failing = (error) => ({ read: async () => ({}), authorizeInput: async () => {}, send: async () => { throw error; } });
  try {
    for (const [error, expected] of [[Object.assign(new Error('Bria está respondiendo en esta conversación.'), { status: 409 }), { status: 409, message: 'Bria está respondiendo en esta conversación.' }], [new Error('connect ECONNREFUSED 10.0.0.5'), { status: 500, message: 'No se pudo abrir o continuar la conversación.' }]]) {
      const app = await serve(failing(error));
      try {
        const response = await fetch(app.url, { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' }, body: JSON.stringify({ question: 'hola' }) });
        const last = events(await response.text()).at(-1);
        assert.deepEqual({ status: last.status, message: last.message }, expected);
        assert.equal(last.type, 'error');
      } finally { await app.close(); }
    }
  } finally { console.error = original; }
});

test('without the header the answer is the same single JSON as before', async () => {
  const app = await serve({ read: async () => ({}), authorizeInput: async () => {}, send: async ({ onEvent }) => { assert.equal(onEvent, undefined); return saved; } });
  try {
    const response = await fetch(app.url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ question: 'hola' }) });
    const body = await response.json();
    assert.equal(body.turns[1].text, 'Hola, Rodny.');
  } finally { await app.close(); }
});
