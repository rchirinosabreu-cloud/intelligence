// El navegador lee la respuesta de Bria en vivo (9 de octubre de 2026). Si el servidor contesta con el JSON de
// siempre (una versión anterior o una prueba simulada), funciona igual.
import test from 'node:test';
import assert from 'node:assert/strict';
import { streamBriaChat } from '../src/lib/briaChatRequest.js';

const sseResponse = (events) => new Response(new ReadableStream({
  start(controller) {
    const text = events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join('');
    const encoder = new TextEncoder();
    for (let i = 0; i < text.length; i += 11) controller.enqueue(encoder.encode(text.slice(i, i + 11)));
    controller.close();
  }
}), { headers: { 'content-type': 'text/event-stream; charset=utf-8' } });
const withFetch = async (response, work) => {
  const original = globalThis.fetch, calls = [];
  globalThis.fetch = async (url, options) => { calls.push({ url, options }); return response; };
  try { return await work(calls); } finally { globalThis.fetch = original; }
};

test('progress is handed over as it arrives and the saved chat is returned', async () => {
  const seen = [];
  const chat = { id: 'c1', turns: [{ id: 'c1:1', role: 'assistant', text: 'Hola' }] };
  await withFetch(sseResponse([{ type: 'status', label: 'Buscando en la bóveda…' }, { type: 'delta', text: 'Ho' }, { type: 'delta', text: 'la' }, { type: 'done', chat }]), async (calls) => {
    const saved = await streamBriaChat('/c1/messages', { body: { question: 'hola' }, onEvent: (event) => seen.push(event) });
    assert.deepEqual(saved, chat);
    assert.equal(calls[0].options.headers.Accept, 'text/event-stream');
    assert.equal(calls[0].options.method, 'POST');
  });
  assert.deepEqual(seen.map((event) => event.type), ['status', 'delta', 'delta']);
});

test('an error event becomes an error with its words', async () => {
  const original = console.error; console.error = () => {};
  try {
    await withFetch(sseResponse([{ type: 'delta', text: 'Ho' }, { type: 'error', status: 409, message: 'Bria está respondiendo en esta conversación.' }]), async () => {
      await assert.rejects(() => streamBriaChat('/c1/messages', { body: { question: 'hola' }, onEvent: () => {} }), /Bria está respondiendo/);
    });
  } finally { console.error = original; }
});

test('a plain JSON answer still works, and a stream cut before the end is an error', async () => {
  const chat = { id: 'c1', turns: [] };
  await withFetch(new Response(JSON.stringify(chat), { headers: { 'content-type': 'application/json' } }), async () => {
    assert.deepEqual(await streamBriaChat('/c1/messages', { body: { question: 'hola' } }), chat);
  });
  const original = console.error; console.error = () => {};
  try {
    await withFetch(sseResponse([{ type: 'delta', text: 'Ho' }]), async () => {
      await assert.rejects(() => streamBriaChat('/c1/messages', { body: { question: 'hola' } }), /se cortó/);
    });
  } finally { console.error = original; }
});
