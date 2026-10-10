// «Pedírselo a Bria» desde Ritmo (10 de octubre de 2026): el mensaje queda escrito en el chat y el panel se abre;
// nunca se envía solo.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { askBria, onBriaAsk, BRIA_ASK_EVENT } from '../src/lib/briaAsk.js';

test('askBria dispatches the message and listeners receive it trimmed; empty messages do nothing', () => {
  const listeners = new Map();
  globalThis.window = {
    addEventListener: (name, fn) => listeners.set(name, fn), removeEventListener: (name) => listeners.delete(name),
    dispatchEvent: (event) => listeners.get(event.type)?.(event)
  };
  globalThis.CustomEvent = class { constructor(type, init) { this.type = type; this.detail = init?.detail; } };
  const received = [];
  const stop = onBriaAsk((message) => received.push(message));
  assert.equal(askBria('  Crea un pendiente para Helen: medir el tiempo  '), true);
  assert.equal(askBria(''), false);
  assert.deepEqual(received, ['Crea un pendiente para Helen: medir el tiempo']);
  stop();
  assert.equal(listeners.has(BRIA_ASK_EVENT), false);
  delete globalThis.window; delete globalThis.CustomEvent;
});

test('the assistant opens on a request and the conversation prefills the question without sending', () => {
  const assistant = readFileSync('src/components/bria/BriaAssistant.jsx', 'utf8');
  const conversation = readFileSync('src/components/bria/BriaConversation.jsx', 'utf8');
  assert.match(assistant, /onBriaAsk\(\(\) => \{ setOpen\(true\)/);
  assert.match(conversation, /onBriaAsk\(message => \{ setQuestion\(message\)/);
  assert.doesNotMatch(conversation, /onBriaAsk\([^)]*send\(/, 'a request from another screen is never sent by itself');
});
