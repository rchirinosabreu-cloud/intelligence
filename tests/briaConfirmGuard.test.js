import test from 'node:test';
import assert from 'node:assert/strict';
import { runAssistant, asksToConfirm } from '../src/lib/briaAssistant.js';

// Rodny, 22 de octubre de 2026: «por qué preguntó dos veces?». Bria escribió su propio «El evento está preparado…
// confirma con «Confirmar»» sin preparar la acción; el primer «Confirmar» no tenía nada que confirmar. La plataforma
// ya no deja salir ese mensaje: le pide a Bria preparar la acción en el mismo turno.

const user = { userId: 'u', role: 'ADMIN', modulePermissions: { bria: true } };
const actionReply = { answer: 'Creo la ausencia de Helen para hoy.\n\n¿Lo hago así? También puedes pedirme cualquier ajuste.', quickReplies: ['Confirmar', 'Cancelar'] };
const operar = { name: 'operar_en_plataforma', description: 'x', parameters: { type: 'object', properties: {} }, allowed: () => true, run: async () => ({ data: { stage: 'READY' }, pendingAction: { id: 'a1', type: 'PLATFORM', status: 'DRAFT' }, actionReply, quickReplies: actionReply.quickReplies }) };

test('qué cuenta como pedir confirmación', () => {
  for (const text of ['Para crearlo, confirma con «Confirmar».', '¿Lo hago así?', 'Escribe Confirmar y lo creo', 'Confírmame y lo registro']) assert.equal(asksToConfirm(text), true, text);
  for (const text of ['Listo, quedó hecho.', '¿Para qué fecha lo necesitas?', 'Hay dos calendarios conectados.']) assert.equal(asksToConfirm(text), false, text);
});

test('un «confirma» sin acción preparada no sale: Bria la prepara en el mismo turno y la persona confirma una sola vez', async () => {
  const requests = [];
  const answers = [
    { text: 'El evento está preparado para hoy. Para crearlo, confirma con «Confirmar».', output: [] },
    { functionCalls: [{ id: 'c1', name: 'operar_en_plataforma', args: {} }], output: [] },
    { text: 'Te dejo el resumen.' }
  ];
  const result = await runAssistant({ question: 'Crea un evento de todo el día de hoy con Helen ausente', user, person: { name: 'Rodny' }, tools: [operar], today: '2026-10-22', ai: { generate: async (request) => { requests.push(request); return answers.shift(); } }, logger: { error() {}, warn() {} } });
  assert.equal(requests.length, 3);
  assert.match(JSON.stringify(requests[1].input), /sin preparar la acción/);
  assert.equal(result.answer, actionReply.answer, 'lo que sale es el resumen de la plataforma, con sus botones');
  assert.deepEqual(result.quickReplies, ['Confirmar', 'Cancelar']);
});

test('se le pide una sola vez, y sin herramientas que preparen acciones no se le pide nada', async () => {
  let calls = 0;
  const stubborn = await runAssistant({ question: 'x', user, person: { name: 'Rodny' }, tools: [operar], today: '2026-10-22', ai: { generate: async () => { calls += 1; return { text: 'Confirma con «Confirmar».', output: [] }; } }, logger: { error() {}, warn() {} } });
  assert.equal(calls, 2, 'una segunda vez ya no se insiste');
  assert.equal(stubborn.answer, 'Confirma con «Confirmar».');
  // Con una acción ya preparada en un mensaje anterior, recordar que falta confirmarla es legítimo.
  let waiting = 0;
  await runAssistant({ question: '¿y eso a qué hora queda?', user, person: { name: 'Rodny' }, tools: [operar], today: '2026-10-22', context: { pendingAction: { id: 'a0', type: 'PLATFORM', status: 'DRAFT' } }, ai: { generate: async () => { waiting += 1; return { text: 'Todo el día. Cuando quieras, confírmalo.' }; } }, logger: { error() {}, warn() {} } });
  assert.equal(waiting, 1);
  let plain = 0;
  await runAssistant({ question: 'x', user, person: { name: 'Rodny' }, tools: [], today: '2026-10-22', ai: { generate: async () => { plain += 1; return { text: '¿Lo hago así?' }; } }, logger: { error() {}, warn() {} } });
  assert.equal(plain, 1);
});
