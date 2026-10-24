import test from 'node:test';
import assert from 'node:assert/strict';
import { createConversationContinuityFixture, assertContinuityDraft, assertContinuityClarification, assertContinuityCreated, continuityInitial, CONTINUITY_URL, CONTINUITY_TITLE, CONTINUITY_CLIENT, CONTINUITY_PERSON } from './evals/briaConversationContinuityFixture.js';

const scripted = responses => {
  let round = 0;
  return { generate: async () => {
    assert.ok(round < responses.length, 'confirmar no vuelve al modelo');
    const response = responses[round++];
    return typeof response === 'string' ? { text: response, functionCalls: [] } : { functionCalls: [{ id: `continuity-${round}`, name: response.tool || 'preparar_pendiente', args: response.args || response }], output: [] };
  } };
};
const initialArgs = { request: { intent: 'PREPARE', evidence: continuityInitial }, titulo: CONTINUITY_TITLE, cliente: CONTINUITY_CLIENT, responsable: 'yo', fecha: '2026-10-29' };

test('answering a clarification updates the same draft even when the model paraphrases the human evidence', async () => {
  const fixture = createConversationContinuityFixture({ ai: scripted([
    initialArgs, 'El borrador está listo.',
    '¿Cuál es el enlace completo de la carpeta del encargo?',
    { request: { intent: 'ADJUST', evidence: 'Añade el enlace que faltaba al borrador.' }, insumos: [CONTINUITY_URL] }, 'El insumo está en el resumen.',
    { request: { intent: 'ADJUST', evidence: continuityInitial }, fecha: '2026-10-30' }, 'Queda para el viernes.'
  ]) });
  const first = await fixture.send(continuityInitial);
  await fixture.send('El material está en la carpeta del encargo.');
  const expected = { id: first.pendingAction.draft.id, title: CONTINUITY_TITLE, client: 'aurora', assignee: fixture.person.memberId, dueDate: '2026-10-29', priority: 'NORMAL', inputs: [CONTINUITY_URL], stage: 'READY' };
  assertContinuityDraft(await fixture.send(CONTINUITY_URL), fixture, expected);
  expected.dueDate = '2026-10-30';
  const corrected = await fixture.send('El 30 de octubre de 2026; cambia solo la entrega y adelante.');
  assertContinuityDraft(corrected, fixture, expected);
  assert.ok(corrected.text.includes('30'), 'muestra el resumen nuevo antes de ejecutar');
  assertContinuityCreated(await fixture.send('Confirmar'), fixture, expected);
  assertContinuityCreated(await fixture.send('Confirmar'), fixture, expected);
  assert.equal(fixture.traces[2].before.draft.id, expected.id);
  assert.equal(fixture.traces[2].after.draft.inputs[0].url, CONTINUITY_URL);
  assert.ok(fixture.calls.every(call => call.result && !call.error));
});

test('the fixture records a real validation error without losing the previous draft', async () => {
  const question = 'El enlace es javascript:alert(1), agrégalo como insumo.';
  const fixture = createConversationContinuityFixture({ ai: scripted([
    initialArgs, 'El borrador está listo.',
    { request: { intent: 'ADJUST', evidence: question }, insumos: ['javascript:alert(1)'] }, 'Ese enlace no se admite.'
  ]) });
  const first = await fixture.send(continuityInitial);
  const answer = await fixture.send(question);
  assertContinuityDraft(answer, fixture, { id: first.pendingAction.draft.id, inputs: [], dueDate: '2026-10-29' });
  assert.equal(fixture.calls.at(-1).error.status, 400);
  assert.match(fixture.calls.at(-1).error.message, /enlace/);
  assert.equal(fixture.traces.at(-1).writesAfter, 0);
  assert.deepEqual(fixture.traces.at(-1).after, fixture.traces.at(-1).before);
});

test('a date-only answer is not rejected because the model cites the earlier request', async () => {
  const question = `Prepara «${CONTINUITY_TITLE}» para ${CONTINUITY_CLIENT}, a mi cargo. Te daré la fecha cuando la preguntes.`;
  const args = { ...initialArgs, request: { intent: 'PREPARE', evidence: question } };
  delete args.fecha;
  const fixture = createConversationContinuityFixture({ ai: scripted([
    args, '¿Para cuándo lo necesitas?',
    { request: { intent: 'ADJUST', evidence: question }, fecha: '2026-10-30' }, 'Queda listo para revisar.'
  ]) });
  const first = await fixture.send(question);
  assertContinuityDraft(first, fixture, { stage: 'DATE' });
  assertContinuityDraft(await fixture.send('30 de octubre de 2026'), fixture, { id: first.pendingAction.draft.id, title: CONTINUITY_TITLE, client: 'aurora', assignee: fixture.person.memberId, dueDate: '2026-10-30', stage: 'READY' });
});

test('omitting the partial draft is a model protocol failure: historical client text cannot authorize the final draft', async () => {
  const fixture = createConversationContinuityFixture({ ai: scripted([
    '¿Quién será responsable de revisar la composición del folleto y para qué fecha lo dejamos previsto?',
    '¿Para qué fecha dejamos el pendiente de Nora?',
    { ...initialArgs, responsable: CONTINUITY_PERSON, fecha: '2026-10-30' }, 'Revisa el resumen antes de crearlo.'
  ]) });
  const question = `Vamos a dejar preparado «${CONTINUITY_TITLE}» para ${CONTINUITY_CLIENT}. Te digo quién lo hará y la fecha cuando me preguntes; no lo crees todavía.`;
  const first = await fixture.send(question);
  assertContinuityClarification(first, fixture, { title: CONTINUITY_TITLE, client: 'aurora', assignee: null, stage: 'ASSIGNEE' }, /qui[eé]n|responsable|asign/i);
  assert.equal(first.pendingAction, undefined, 'el evaluador deja continuar esta pregunta y comprobará el resultado completo');
  assertContinuityClarification(await fixture.send(CONTINUITY_PERSON), fixture, { title: CONTINUITY_TITLE, client: 'aurora', assignee: 'continuity-nora', stage: 'DATE' }, /cu[aá]ndo|fecha|d[ií]a/i);
  const complete = await fixture.send('30 de octubre de 2026');
  const expected = { title: CONTINUITY_TITLE, client: 'aurora', assignee: 'continuity-nora', dueDate: '2026-10-30', priority: 'NORMAL', inputs: [], references: [], stage: 'READY' };
  // El modelo no acreditó el cliente cuando la persona lo nombró. El motor conserva esa frontera;
  // el evaluador real debe rechazar el recorrido final, aunque haya aceptado las preguntas iniciales.
  assertContinuityDraft(complete, fixture, { ...expected, client: null, stage: 'CLIENT' });
  assert.throws(() => assertContinuityDraft(complete, fixture, expected), /CLIENT.*READY|READY/s);
});

test('accepting a clarification never hides writes, lost draft data or a missing completed draft', () => {
  const fixture = { created: [], platformAttempts: [] };
  const answer = { text: '¿Para qué fecha dejamos el pendiente?' };
  const expected = { title: CONTINUITY_TITLE, client: 'aurora', assignee: 'continuity-nora', stage: 'DATE' };
  assertContinuityClarification(answer, fixture, expected, /fecha/i);
  assert.throws(() => assertContinuityClarification(answer, { ...fixture, created: [{ id: 'premature' }] }, expected, /fecha/i), /no crea/);
  assert.throws(() => assertContinuityClarification(answer, { ...fixture, platformAttempts: [{}] }, expected, /fecha/i), /otra escritura/);
  assert.throws(() => assertContinuityClarification({ text: 'Queda listo.' }, fixture, expected, /fecha/i), /aclaración/);
  const partial = { ...answer, pendingAction: { type: 'TASK_CREATE', status: 'DRAFT', draft: { title: CONTINUITY_TITLE, client: { id: 'aurora' }, assignee: { id: 'continuity-nora' }, priority: 'NORMAL' } } };
  assertContinuityClarification(partial, fixture, expected, /fecha/i);
  const lost = structuredClone(partial); lost.pendingAction.draft.assignee = null;
  assert.throws(() => assertContinuityClarification(lost, fixture, expected, /fecha/i));
  const changed = structuredClone(partial); changed.pendingAction.draft.client.id = 'bosque';
  assert.throws(() => assertContinuityClarification(changed, fixture, expected, /fecha/i), /client/);
  assert.throws(() => assertContinuityDraft(answer, fixture, { ...expected, dueDate: '2026-10-30', stage: 'READY' }), /TASK_CREATE/);
  assert.throws(() => assertContinuityDraft(partial, fixture, { ...expected, dueDate: '2026-10-30', stage: 'READY' }));
});

test('platform discovery uses the real tool with fictional reads and cannot write outside the draft', async () => {
  const fixture = createConversationContinuityFixture({ ai: scripted([
    { tool: 'mapa_de_plataforma', args: { busqueda: 'clientes' } },
    { tool: 'consultar_plataforma', args: { ruta: '/clients' } },
    'Hay dos cuentas ficticias.'
  ]) });
  const answer = await fixture.send('¿Qué cuentas hay en esta plataforma de ejemplo?');
  assert.equal(answer.pendingAction, undefined);
  assert.equal(fixture.created.length, 0);
  assert.deepEqual(fixture.apiReads, ['/clients']);
  assert.ok(fixture.calls[0].result.data.operaciones.length > 0);
  assert.equal(fixture.calls[1].result.data.respuesta[0].name, CONTINUITY_CLIENT);
});

test('the continuity checker rejects data loss, a wrong field and a claim with no saved value', () => {
  const action = { type: 'TASK_CREATE', status: 'DRAFT', draft: { id: 'd', title: CONTINUITY_TITLE, client: { id: 'aurora' }, assignee: { id: 'owner' }, dueDate: '2026-10-29', inputs: [{ url: CONTINUITY_URL }], references: [], priority: 'NORMAL' } };
  const answer = { pendingAction: action, text: 'Actualizado.' };
  const fixture = { created: [], platformAttempts: [] };
  const expected = { id: 'd', title: CONTINUITY_TITLE, client: 'aurora', assignee: 'owner', dueDate: '2026-10-29', priority: 'NORMAL', inputs: [CONTINUITY_URL], references: [], stage: 'READY' };
  assertContinuityDraft(answer, fixture, expected);
  const lost = structuredClone(answer); lost.pendingAction.draft.inputs = [];
  assert.throws(() => assertContinuityDraft(lost, fixture, expected));
  const wrong = structuredClone(answer); wrong.pendingAction.draft.references = wrong.pendingAction.draft.inputs; wrong.pendingAction.draft.inputs = [];
  assert.throws(() => assertContinuityDraft(wrong, fixture, expected));
  const changed = structuredClone(answer); changed.pendingAction.draft.dueDate = '2026-10-30';
  assert.throws(() => assertContinuityDraft(changed, fixture, expected));
  const priorityChanged = structuredClone(answer); priorityChanged.pendingAction.draft.priority = 'URGENTE';
  assert.throws(() => assertContinuityDraft(priorityChanged, fixture, expected), /priority/);
});

test('the created-task checker rejects an unrequested priority change', () => {
  const expected = { id: 'd', title: CONTINUITY_TITLE, client: 'aurora', assignee: 'owner', dueDate: '2026-10-29', priority: 'NORMAL', inputs: [CONTINUITY_URL], references: [] };
  const answer = { pendingAction: { status: 'DONE' } };
  const row = { id: 'd', title: CONTINUITY_TITLE, clientId: 'aurora', assigneeId: 'owner', dueDate: '2026-10-29T12:00:00.000Z', priority: 'NORMAL', initial_inputs: [{ url: CONTINUITY_URL }], initial_references: [] };
  const fixture = { created: [row], platformAttempts: [] };
  assertContinuityCreated(answer, fixture, expected);
  row.priority = 'ALTA';
  assert.throws(() => assertContinuityCreated(answer, fixture, expected), /priority/);
});
