import test from 'node:test';
import assert from 'node:assert/strict';
import { runAssistant } from '../src/lib/briaAssistant.js';
import { optionsMessagePayload } from '../src/lib/whatsappBridge.js';
import { reviewedResponse, hasCurrentApprovalReview } from '../src/lib/briaResponse.js';
import { createBriaConversationService } from '../src/services/briaConversationService.js';

const user = { id: 'owner', role: 'ADMIN' };
const action = { id: 'draft', ownerId: 'owner', type: 'TASK_UPDATE', status: 'DRAFT', title: 'Entrega de Aurora', summary: ['Responsable: Ana', 'Entrega: 28 de octubre'], warnings: [], missing: [] };
const tool = (name, result) => ({ name, allowed: () => true, parameters: {}, run: async () => result });
const run = async (prepared, prose) => {
  const requests = [];
  const ai = { generate: async request => {
    requests.push(request);
    return requests.length === 1 ? { output: [], functionCalls: [{ id: 'call', name: 'cambiar_pendiente', args: {} }] } : { text: prose };
  } };
  const result = await runAssistant({ question: 'Reprograma esa entrega', user, ai, tools: [tool('cambiar_pendiente', prepared)] });
  return { result, requests };
};

test('a missing field is explained by the model, without replacing its answer with a tool template', async () => {
  const prose = 'Conservo a Ana como responsable. Para fijar la entrega me falta el día que acordaste con el cliente.';
  const missing = { ...action, missing: [{ field: 'date', question: 'FORMULARIO FIJO', options: [] }] };
  const { result, requests } = await run({ data: { action: missing, message: 'FORMULARIO FIJO' }, pendingAction: missing, actionReply: { answer: 'FORMULARIO FIJO' } }, prose);
  assert.equal(result.answer, prose);
  assert.equal(result.pendingAction.id, 'draft');
  assert.equal(result.approvalReview, undefined);
  assert.equal(requests.length, 2, 'the existing final generation is reused');
  const output = JSON.parse(requests[1].input.find(row => row.type === 'function_call_output').output);
  assert.equal(output.message, undefined, 'the tool does not dictate conversational copy');
});

test('a ready action preserves model prose and appends the actual review, never its canned invitation', async () => {
  const prose = 'La nueva fecha deja un día para revisar. El cambio está preparado y espera tu aprobación.';
  const { result } = await run({ data: { action, message: 'PLANTILLA' }, pendingAction: action, actionReply: { answer: 'PLANTILLA', quickReplies: ['Confirmar', 'Cancelar'] } }, prose);
  assert.ok(result.answer.startsWith(prose));
  assert.match(result.answer, /Responsable: Ana/);
  assert.match(result.answer, /Entrega: 28 de octubre/);
  assert.doesNotMatch(result.answer, /PLANTILLA|¿Lo hago así/);
  assert.equal(result.approvalReview.actionId, action.id);
});

test('a saved investigation answers in its authored voice without a fixed closing paragraph or a second generation', async () => {
  let calls = 0;
  const prose = 'La entrega sigue abierta porque falta la aprobación. La retomamos cuando llegue; todavía no hay un aviso programado.';
  const record = { id: 'case', estado: 'ABIERTO', relato: [{ texto: prose }], cobertura: [], consultas: [], comprobaciones: [], proximaRevision: 'al recibir la aprobación', sources: [] };
  const result = await runAssistant({ question: 'Guarda lo que encontramos', user,
    ai: { generate: async () => { calls++; return { output: [], functionCalls: [{ id: 'save', name: 'actualizar_seguimiento', args: {} }] }; } },
    tools: [tool('actualizar_seguimiento', { data: { estado: 'ABIERTO' }, investigation: record })],
    context: { inquiryPlanner: async () => ({ plan: { investigar: true, guardarSeguimiento: true, prepararCambios: false, areas: [] } }) }
  });
  assert.equal(result.answer, prose);
  assert.equal(result.investigation.estado, 'ABIERTO');
  assert.equal(calls, 1);
});

test('WhatsApp buttons do not append an instruction to speak naturally to every answer', () => {
  const payload = optionsMessagePayload('573000000000', '¿Cuál de las dos cuentas?', [{ id: 'a', label: 'Cuenta A' }, { id: 'b', label: 'Cuenta B' }]);
  assert.equal(payload.interactive.footer, undefined);
  assert.equal(payload.interactive.body.text, '¿Cuál de las dos cuentas?');
});

test('a missing-field form does not impose choices but the model can offer useful alternatives', async () => {
  const missing = { ...action, missing: [{ field: 'date' }] };
  for (const offer of [false, true]) {
    let step = 0;
    const result = await runAssistant({ question: 'Ayúdame con la entrega', user,
      ai: { generate: async () => step++ === 0 ? { output: [], functionCalls: [{ id: 'prepare', name: 'cambiar_pendiente', args: {} }, ...(offer ? [{ id: 'offer', name: 'ofrecer_opciones', args: {} }] : [])] } : { text: 'Podemos elegir la fecha según el tiempo de revisión.' } },
      tools: [tool('cambiar_pendiente', { data: { action: missing }, pendingAction: missing, quickReplies: ['Hoy', 'Mañana'] }), tool('ofrecer_opciones', { data: {}, quickReplies: ['Después de revisar', 'Antes del viernes'] })]
    });
    assert.deepEqual(result.quickReplies || [], offer ? ['Después de revisar', 'Antes del viernes'] : []);
  }
});

test('approval belongs to the displayed version, survives storage, and is not inherited by an interruption', async () => {
  const response = reviewedResponse('Podemos dejarlo para ese día.', action);
  const turn = { role: 'assistant', text: response.answer, pendingAction: action, approvalReview: response.approvalReview };
  assert.equal(hasCurrentApprovalReview(JSON.parse(JSON.stringify(turn)), action), true);
  const reordered = Object.fromEntries(Object.entries(action).reverse());
  assert.equal(hasCurrentApprovalReview({ ...turn, pendingAction: reordered }, reordered), true, 'JSONB can reorder object keys without changing the action');
  assert.equal(hasCurrentApprovalReview(turn, { ...action, summary: ['Otra fecha'] }), false);
  assert.equal(hasCurrentApprovalReview({ ...turn, text: '¿Qué duda tienes?' }, action), false);
  assert.equal(hasCurrentApprovalReview({ ...turn, approvalReview: null }, action), false);
  let stored = { revision: 1, turns: [turn] }, writes = 0;
  const service = createBriaConversationService({
    repository: { get: async () => stored, append: async (_actor, _id, _revision, question, result) => {
      const reply = typeof result === 'function' ? await result() : result;
      stored = { revision: stored.revision + 1, turns: [...stored.turns, { role: 'user', text: question }, { role: 'assistant', text: reply.answer, ...reply }] }; return stored;
    } }, resolveActor: async () => ({ ref: 'owner', role: 'ADMIN' }),
    actions: { execute: async () => { writes++; return { text: 'Fecha actualizada.' }; } },
    assistant: { ask: async () => ({ answer: 'El día es miércoles.', pendingAction: action, sources: [] }) }
  });
  await service.send({ user, id: 'chat', question: '¿Qué día cae?' });
  await service.send({ user, id: 'chat', question: 'Confirmar' });
  assert.equal(writes, 0, 'a new-style approval cannot execute after an intervening answer without its review');
  stored.turns.push(turn);
  await service.send({ user, id: 'chat', question: 'dale, así está bien' });
  assert.equal(writes, 1, 'natural approval of the displayed data executes');
  await service.send({ user, id: 'chat', question: 'Confirmar' });
  assert.equal(writes, 1, 'a repeated approval cannot execute twice');
});

test('an incomplete non-task request survives a detour without becoming confirmable', async () => {
  const incomplete = { ...action, missing: [{ field: 'date' }] };
  let stored = { revision: 1, turns: [{ role: 'assistant', text: 'Falta la fecha.', pendingAction: incomplete }] };
  let received;
  const service = createBriaConversationService({
    repository: { get: async () => stored, append: async (_actor, _id, _revision, question, result) => {
      stored = { revision: stored.revision + 1, turns: [...stored.turns, { role: 'user', text: question }, { role: 'assistant', text: result.answer, ...result }] }; return stored;
    } }, resolveActor: async () => ({ ref: 'owner', role: 'ADMIN' }),
    actions: { execute: async () => assert.fail('an incomplete request cannot execute') },
    assistant: { ask: async request => { received = request.pendingAction; return { answer: 'La fecha marca el compromiso de entrega.', sources: [] }; } }
  });
  await service.send({ user, id: 'chat', question: 'Explícame para qué sirve esa fecha' });
  assert.deepEqual(stored.turns.at(-1).pendingAction, incomplete);
  assert.equal(stored.turns.at(-1).approvalReview, undefined);
  await service.send({ user, id: 'chat', question: 'Lo necesito el jueves' });
  assert.deepEqual(received, incomplete);
});
