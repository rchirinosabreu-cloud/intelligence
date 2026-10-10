// Bria escribe en vivo y dice qué está haciendo (Rodny, 9 de octubre de 2026: «siento que es súper lento … cómo
// hace uno para que sea como cuando uno habla con Claude o ChatGPT, que responde rápido»).
import test from 'node:test';
import assert from 'node:assert/strict';
import { runAssistant, toolProgressLabel } from '../src/lib/briaAssistant.js';
import { createBriaModelRuntime } from '../src/services/briaModelRuntime.js';

const user = { userId: 'u1', role: 'ADMIN', modulePermissions: { bria: true } };
const person = { name: 'Rodny' };
const vaultTool = { name: 'buscar_acceso', description: 'Busca accesos', parameters: { type: 'object', properties: {} }, allowed: () => true, run: async () => ({ data: { accesos: [] } }) };

test('text arrives as it is written; what came before a tool call is wiped; each tool says what it is doing', async () => {
  const events = [];
  let round = 0;
  const ai = { generate: async ({ onTextDelta }) => {
    round += 1;
    if (round === 1) { onTextDelta('Déjame buscar'); return { text: 'Déjame buscar', functionCalls: [{ id: 'c1', name: 'buscar_acceso', args: {} }], output: [] }; }
    onTextDelta('Aquí '); onTextDelta('está.');
    return { text: 'Aquí está.', functionCalls: [], output: [] };
  } };
  const result = await runAssistant({ question: 'la clave de capcut', user, person, tools: [vaultTool], ai, today: '2026-10-09', onEvent: (event) => events.push(event) });
  assert.equal(result.answer, 'Aquí está.');
  assert.deepEqual(events, [
    { type: 'delta', text: 'Déjame buscar' },
    { type: 'reset' },
    { type: 'status', label: 'Buscando en la bóveda…' },
    { type: 'delta', text: 'Aquí ' },
    { type: 'delta', text: 'está.' }
  ]);
});

test('without a listener nothing is streamed and the answer is the same', async () => {
  let asked;
  const ai = { generate: async (request) => { asked = request; return { text: 'Hola', functionCalls: [], output: [] }; } };
  const result = await runAssistant({ question: 'hola', user, person, tools: [], ai, today: '2026-10-09' });
  assert.equal(result.answer, 'Hola');
  assert.equal(asked.onTextDelta, undefined);
});

test('a listener that breaks never breaks the answer', async () => {
  const ai = { generate: async ({ onTextDelta }) => { onTextDelta('Hola'); return { text: 'Hola', functionCalls: [], output: [] }; } };
  const result = await runAssistant({ question: 'hola', user, person, tools: [], ai, today: '2026-10-09', onEvent: () => { throw new Error('socket closed'); }, logger: { error: () => {}, warn: () => {} } });
  assert.equal(result.answer, 'Hola');
});

test('a retry after half an answer wipes what was already shown', async () => {
  let attempt = 0, resets = 0;
  const runtime = createBriaModelRuntime({ user, env: {}, ai: { generate: async ({ onTextDelta }) => {
    attempt += 1;
    onTextDelta(attempt === 1 ? 'Medio' : 'Completo');
    if (attempt === 1) throw Object.assign(new Error('upstream'), { status: 502 });
    return { text: 'Completo', raw: { status: 'completed' } };
  } } });
  const result = await runtime.generate({ input: [], onTextDelta: () => {}, onRetry: () => { resets += 1; } });
  assert.equal(result.text, 'Completo');
  assert.equal(resets, 1);
});

test('every tool has words for what it is doing, and unknown ones a generic phrase', () => {
  assert.equal(toolProgressLabel('mis_tareas'), 'Revisando tus tareas…');
  assert.equal(toolProgressLabel('herramienta_nueva'), 'Revisando la plataforma…');
});
