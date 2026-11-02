import test from 'node:test';
import assert from 'node:assert/strict';
import { createBriaTaskDraftService } from '../src/services/briaTaskDraftService.js';
import { taskDraftItems, taskDraftReply, taskDraftStage } from '../src/lib/briaTaskDraft.js';
import { runAssistant } from '../src/lib/briaAssistant.js';
import { createBriaTaskTools } from '../src/services/briaTaskTools.js';
import { toolByName } from '../src/services/briaAssistantTools.js';

const user = { userId: 'owner', role: 'PROJECT_MANAGER', isActive: true, modulePermissions: { bria: true, gestion: true } };
const clients = [
  { id: 'promo', name: 'Promo Group / Endova', slug: 'promo-group', isArchived: false },
  { id: 'nube-azul', name: 'Nube Azul', slug: 'nube-azul', isArchived: false },
  { id: 'nube-verde', name: 'Nube Verde', slug: 'nube-verde', isArchived: false }
];
const member = { id: 'member', name: 'Rodny Demo', isActive: true, userId: 'owner' };
const base = { titulo: 'PILOTO BRIA — aprobación humana', responsable: 'Rodny', fecha: '2026-10-26' };
const pilot = 'Crea un pendiente llamado «PILOTO BRIA — aprobación humana», asignado a mí, con vencimiento el 26 de octubre de 2026. Muestra el resumen y espera mi aprobación.';
const setup = () => {
  const queries = [], lookups = [], clientRows = clients.map(client => ({ ...client }));
  const db = {
      client: { findMany: async ({ where }) => {
        queries.push(where);
        if (!where) return clientRows;
        if (where.name) return clientRows.filter(row => row.name.toLowerCase().includes(where.name.contains.toLowerCase()));
        return clientRows.filter(row => (where.isArchived !== false || !row.isArchived) && where.OR.some(condition =>
          (condition.name?.contains && row.name.toLowerCase().includes(condition.name.contains.toLowerCase())) ||
          (condition.slug?.equals && row.slug.toLowerCase() === condition.slug.equals.toLowerCase())
        ));
      }, findUnique: async ({ where }) => { lookups.push(where); return clientRows.find(row => row.id === where.id) || null; } },
      teamMember: { findMany: async () => [member] }
  };
  const service = createBriaTaskDraftService({
    now: () => new Date('2026-10-23T17:00:00Z'), db,
    createTask: async () => assert.fail('preparing a client choice must never create a task')
  });
  const prepare = (options = {}) => {
    const question = options.question || pilot;
    return service.prepare({ user, question, args: base, ...options, request: options.request || { intent: options.previous ? 'ADJUST' : 'PREPARE', evidence: question } });
  };
  return { service, prepare, queries, lookups, clientRows, db };
};

const runTurn = async ({ fixture, question, steps, actor = user, context = {}, history = [] }) => {
  let round = 0;
  return runAssistant({ user: actor, question, history, person: { name: 'Persona ficticia' }, today: '2026-10-23', tools: [toolByName('buscar_cliente'), ...createBriaTaskTools(fixture.service)], context: { db: fixture.db, ...context }, logger: { warn() {}, error() {} }, ai: { generate: async () => {
    const step = steps[round++];
    return step ? { functionCalls: [{ id: `client-step-${round}`, name: step.name, args: step.args }], output: [] } : { text: 'Revisa el resumen.', functionCalls: [] };
  } } });
};

test('a new multi-task request does not silently inherit the client of a previous completed task', async () => {
  const { prepare } = setup();
  const draft = await prepare({ question: 'Prepara los trabajos de esta semana.', defaults: { client: clients[0] }, args: {
    responsable: 'Rodny', fecha: '2026-10-26', pendientes: [{ titulo: 'Organizar agenda' }, { titulo: 'Revisar propuesta' }]
  } });
  assert.equal(taskDraftStage(draft), 'CLIENT');
  assert.ok(taskDraftItems(draft).every(item => !item.client));
  const revised = await prepare({ previous: draft, question: 'Son para Nube Azul.', defaults: { client: clients[0] }, args: { cliente: 'Nube Azul' } });
  assert.equal(taskDraftStage(revised), 'READY');
  assert.ok(taskDraftItems(revised).every(item => item.client.id === 'nube-azul'));
});
const search = nombre => ({ name: 'buscar_cliente', args: { nombre } });
const draftCall = args => ({ name: 'preparar_pendiente', args: { ...base, request: { intent: 'PREPARE' }, ...args } });

test('a client seen in a previous consultation cannot fill an unrelated new task', async () => {
  const { prepare, queries } = setup();
  const draft = await prepare({ args: { ...base, cliente: 'Endova' }, evidence: `¿Cómo viene Endova?\n${pilot}` });
  assert.equal(taskDraftStage(draft), 'CLIENT');
  assert.equal(draft.client, undefined);
  assert.equal(queries.length, 0, 'unrelated old human text and model-supplied names are not client authority');
  assert.match(taskDraftReply(draft).answer, /para qué cliente/i);
});

test('human client aliases resolve current accounts without requiring their canonical name', async () => {
  const { prepare } = setup();
  for (const [question, cliente] of [
    ['Crea un pendiente para Promo, asignado a Rodny, para el 26 de octubre.', 'Promo'],
    ['Crea un pendiente para ENDOVA, asignado a Rodny, para el 26 de octubre.', 'Endova'],
    ['Crea un pendiente para «Nube Azul», asignado a Rodny, para el 26 de octubre.', 'Nube Azul']
  ]) {
    const draft = await prepare({ question, args: { ...base, cliente } });
    assert.equal(taskDraftStage(draft), 'READY');
    assert.equal(draft.client.id, cliente === 'Nube Azul' ? 'nube-azul' : 'promo');
    assert.equal(draft.clientInferred, false);
  }
  const unrelated = await prepare({ question: 'Crea un pendiente para revisar Endovation, asignado a Rodny para el 26 de octubre.', args: { ...base, cliente: 'Endova' } });
  assert.equal(taskDraftStage(unrelated), 'CLIENT', 'a name fragment inside another word is not a client mention');
});

test('repeating the last created client through the model preserves the visible inherited-client label', async () => {
  const { prepare } = setup();
  const defaults = { client: clients[0] };
  for (const cliente of [undefined, clients[0].name, clients[0].id, clients[0].slug]) {
    const draft = await prepare({ args: { ...base, ...(cliente ? { cliente } : {}) }, defaults });
    assert.equal(taskDraftStage(draft), 'READY');
    assert.equal(draft.client.id, 'promo');
    assert.equal(draft.clientInferred, true, cliente);
    assert.match(taskDraftReply(draft).answer, /el mismo del pendiente anterior/);
  }
  const inherited = await prepare({ defaults });
  const continued = await prepare({ previous: inherited, question: 'Cambia la fecha al 27 de octubre.', args: { fecha: '2026-10-27', cliente: clients[0].name }, defaults });
  assert.equal(continued.clientInferred, true);
  assert.match(taskDraftReply(continued).answer, /el mismo del pendiente anterior/);
});

test('a client explicitly named by the person overrides an inherited client and stays selected during corrections', async () => {
  const { prepare } = setup();
  const draft = await prepare({ question: 'Crea este pendiente para Nube Azul, asignado a Rodny para el 26 de octubre.', args: { ...base, cliente: 'Nube Azul' }, defaults: { client: clients[0] } });
  assert.equal(draft.client.id, 'nube-azul');
  assert.equal(draft.clientInferred, false);
  for (const cliente of [undefined, 'Nube Azul', 'nube-azul']) {
    const continued = await prepare({ previous: draft, question: 'Cambia la fecha al 27 de octubre.', args: { fecha: '2026-10-27', ...(cliente ? { cliente } : {}) }, defaults: { client: clients[0] } });
    assert.equal(continued.client.id, 'nube-azul');
    assert.equal(continued.clientInferred, false);
  }
});

test('an explicit unknown or ambiguous client cannot fall back to the last created client, including the next turn', async () => {
  const { prepare } = setup();
  const defaults = { client: clients[0] };
  for (const cliente of ['Marca que no existe', 'Nube']) {
    const draft = await prepare({ question: `Crea este pendiente para ${cliente}, asignado a Rodny para el 26 de octubre.`, args: { ...base, cliente }, defaults });
    assert.equal(taskDraftStage(draft), 'CLIENT', cliente);
    assert.equal(draft.client, null);
    const continued = await prepare({ previous: draft, question: 'Cambia la fecha al 27 de octubre.', args: { fecha: '2026-10-27', cliente: clients[0].name }, defaults });
    assert.equal(taskDraftStage(continued), 'CLIENT', 'an unresolved client must not silently revert on another correction');
    assert.equal(continued.client, null);
  }
});

test('a distinct client supplied only by the model cannot override an authorized inherited client', async () => {
  const { prepare } = setup();
  const draft = await prepare({ args: { ...base, cliente: 'Nube Azul' }, defaults: { client: clients[0] } });
  assert.equal(draft.client.id, 'promo');
  assert.equal(draft.clientInferred, true);
});

test('an explicitly unresolved batch client never borrows the common client, even in a one-item list', async () => {
  const { prepare } = setup();
  for (const count of [1, 2]) {
    const pendientes = [{ titulo: 'Pieza de Marca que no existe', cliente: 'Marca que no existe' }, ...(count === 2 ? [{ titulo: 'Pieza común de Promo' }] : [])];
    const draft = await prepare({
      question: 'Crea estos pendientes para Promo; el primero es para Marca que no existe y los demás para Promo. Rodny, 26 de octubre.',
      args: { ...base, cliente: 'Promo', pendientes }
    });
    assert.equal(taskDraftStage(draft), 'CLIENT');
    assert.equal(taskDraftItems(draft)[0].client, null);
    if (count === 2) assert.equal(taskDraftItems(draft)[1].client.id, 'promo');
  }
});

test('client grounding cannot reuse another actor’s draft', async () => {
  const { prepare } = setup();
  const draft = await prepare({ defaults: { client: clients[0] } });
  await assert.rejects(() => prepare({ previous: { ...draft, ownerId: 'someone-else' }, question: 'Cambia la fecha al 27 de octubre.', args: { fecha: '2026-10-27' } }), { status: 403 });
});

test('a natural selection resolves a candidate of the current draft, while a date adjustment does not select one', async () => {
  const { prepare, lookups } = setup();
  const ambiguous = await prepare({ question: 'Crea este pendiente para Nube, asignado a Rodny el 26 de octubre.', args: { ...base, cliente: 'Nube' } });
  assert.equal(taskDraftStage(ambiguous), 'CLIENT');
  assert.deepEqual(ambiguous.clientCandidates.map(row => row.id), ['nube-azul', 'nube-verde']);
  const dateOnly = await prepare({ previous: ambiguous, question: 'Cambia la fecha al 27 de octubre.', args: { cliente: 'Nube Verde', fecha: '2026-10-27' } });
  assert.equal(taskDraftStage(dateOnly), 'CLIENT');
  assert.deepEqual(lookups, []);
  const selected = await prepare({ previous: dateOnly, question: 'La segunda, por favor.', args: { cliente: 'nube-verde', seleccionCliente: 'La segunda' } });
  assert.equal(taskDraftStage(selected), 'READY');
  assert.equal(selected.client.id, 'nube-verde');
  assert.equal(selected.dueDate, '2026-10-27');
  assert.equal(selected.clientInferred, false);
  assert.deepEqual(lookups, [{ id: 'nube-verde' }]);
  assert.equal(ambiguous.client, null, 'selecting does not mutate the previously displayed draft');
});

test('a model selection needs a current human quote and a candidate from the actor’s own existing draft', async () => {
  const { prepare, lookups } = setup();
  const ambiguous = await prepare({ question: 'Crea este pendiente para Nube.', args: { ...base, cliente: 'Nube' } });
  for (const options of [
    { args: { cliente: 'nube-verde', seleccionCliente: 'La primera' } },
    { args: { cliente: 'promo', seleccionCliente: 'La segunda' } },
    { args: { cliente: 'nube-verde', seleccionCliente: 'La segunda' }, request: { intent: 'PREPARE', evidence: 'La segunda' } },
    { args: { cliente: 'nube-verde', seleccionCliente: 'La segunda' }, previous: { ...ambiguous, clientCandidates: [] } }
  ]) {
    const result = await prepare({ previous: ambiguous, question: 'La segunda, por favor.', ...options });
    assert.equal(taskDraftStage(result), 'CLIENT');
    assert.equal(result.client, null);
  }
  assert.deepEqual(lookups, []);
  await assert.rejects(() => prepare({ previous: { ...ambiguous, ownerId: 'other-user' }, question: 'La segunda.', args: { cliente: 'nube-verde', seleccionCliente: 'La segunda' } }), { status: 403 });
});

test('an archived or deleted candidate cannot be selected or replaced with the inherited client', async () => {
  for (const deleted of [false, true]) {
    const { prepare, clientRows, lookups } = setup();
    const ambiguous = await prepare({ question: 'Crea este pendiente para Nube.', args: { ...base, cliente: 'Nube' } });
    if (deleted) clientRows.splice(clientRows.findIndex(row => row.id === 'nube-verde'), 1);
    else clientRows.find(row => row.id === 'nube-verde').isArchived = true;
    const selected = await prepare({ previous: ambiguous, question: 'La segunda.', args: { cliente: 'nube-verde', seleccionCliente: 'La segunda' }, defaults: { client: clients[0] } });
    assert.equal(taskDraftStage(selected), 'CLIENT');
    assert.equal(selected.client, null);
    assert.deepEqual(lookups, [{ id: 'nube-verde' }]);
    assert.equal(selected.clientCandidates.some(row => row.id === 'nube-verde'), false);
  }
});

test('a batch item can select only its own candidate list, including the normalized one-item draft', async () => {
  for (const count of [1, 2]) {
    const { prepare } = setup();
    const pending = [{ titulo: 'Primera pieza', cliente: 'Nube' }, ...(count === 2 ? [{ titulo: 'Segunda pieza de Promo' }] : [])];
    const ambiguous = await prepare({ question: 'Crea estos pendientes para Promo; el primero para Nube.', args: { ...base, cliente: 'Promo', pendientes: pending } });
    assert.equal(taskDraftStage(ambiguous), 'CLIENT');
    const selected = await prepare({ previous: ambiguous, question: 'Para el primero, la segunda opción.', args: { pendientes: [{ titulo: 'Primera pieza', cliente: 'Nube Verde', seleccionCliente: 'la segunda opción' }, ...(count === 2 ? [{ titulo: 'Segunda pieza de Promo' }] : [])] } });
    assert.equal(taskDraftStage(selected), 'READY');
    assert.equal(taskDraftItems(selected)[0].client.id, 'nube-verde');
    if (count === 2) assert.equal(taskDraftItems(selected)[1].client.id, 'promo');
  }
});

test('a batch correction cannot borrow candidates from another item or the common draft', async () => {
  const { prepare, lookups } = setup();
  const ambiguous = await prepare({ question: 'Crea dos pendientes para Nube; el primero para Nube y el segundo para Inexistente.', args: { ...base, cliente: 'Nube', pendientes: [{ titulo: 'Primera pieza', cliente: 'Nube' }, { titulo: 'Segunda pieza', cliente: 'Inexistente' }] } });
  assert.equal(ambiguous.clientCandidates.length, 2);
  assert.equal(ambiguous.items[0].clientCandidates.length, 2);
  assert.deepEqual(ambiguous.items[1].clientCandidates, []);
  const result = await prepare({ previous: ambiguous, question: 'Para el segundo, la segunda opción.', args: { pendientes: [{ titulo: 'Primera pieza' }, { titulo: 'Segunda pieza', cliente: 'nube-verde', seleccionCliente: 'la segunda opción' }] } });
  assert.equal(result.items[1].client, null);
  assert.equal(taskDraftStage(result), 'CLIENT');
  assert.deepEqual(lookups, []);
});

test('a batch question shows that item’s candidates, including no matches, and inherits only when none are its own', async () => {
  const { prepare } = setup();
  for (const ownClient of ['Nube', 'Inexistente']) {
    const draft = await prepare({ question: `Crea dos pendientes para Promo; el primero para ${ownClient}.`, args: { ...base, cliente: 'Promo', pendientes: [{ titulo: 'Primera pieza', cliente: ownClient }, { titulo: 'Segunda pieza' }] } });
    const reply = taskDraftReply(draft);
    assert.match(reply.answer, /Del pendiente 1.*Primera pieza/);
    assert.deepEqual(reply.quickReplies, ownClient === 'Nube' ? ['Nube Azul', 'Nube Verde'] : []);
    if (ownClient === 'Inexistente') assert.doesNotMatch(reply.answer, /encontré estas cuentas/);
  }
  const inherited = await prepare({ question: 'Crea dos pendientes para Nube.', args: { ...base, cliente: 'Nube', pendientes: [{ titulo: 'Primera pieza' }, { titulo: 'Segunda pieza' }] } });
  assert.deepEqual(taskDraftReply(inherited).quickReplies, ['Nube Azul', 'Nube Verde']);
});

test('a unique client search in this turn grounds its canonical name or id from the human alias', async () => {
  for (const reference of ['Aristea Ficticia', 'aristea-fixture']) {
    const fixture = setup();
    fixture.clientRows.push({ id: 'aristea-fixture', name: 'Aristea Ficticia', slug: 'aristea-ficticia', isArchived: false });
    const result = await runTurn({ fixture, question: 'Prepara un pendiente para Aristea, asignado a Rodny el 26 de octubre.', steps: [search('Aristea'), draftCall({ cliente: reference })] });
    assert.equal(result.pendingAction?.draft.client?.id, 'aristea-fixture');
    assert.equal(result.pendingAction.draft.clientInferred, false);
    assert.equal(taskDraftStage(result.pendingAction.draft), 'READY');
    assert.ok(fixture.queries.some(where => where?.isArchived === false && where.OR?.[0]?.name?.contains === 'Aristea'), 'the current client is reread by the actual human search term');
    assert.equal(Object.hasOwn(result.pendingAction.draft, 'clientSearches'), false, 'search receipts are not persisted in the draft');
  }
});

test('a unique current-turn search also grounds clients of individual batch items', async () => {
  const fixture = setup();
  const result = await runTurn({ fixture, question: 'Prepara dos pendientes para Promo: portada y revisión, asignados a Rodny el 26 de octubre.', steps: [search('Promo'), draftCall({ pendientes: [{ titulo: 'Portada', cliente: 'Promo Group / Endova' }, { titulo: 'Revisión', cliente: 'promo' }] })] });
  assert.deepEqual(taskDraftItems(result.pendingAction.draft).map(item => item.client?.id), ['promo', 'promo']);
  assert.equal(taskDraftStage(result.pendingAction.draft), 'READY');
});

test('a current receipt cannot come from an unmentioned search, a different turn, history or model arguments', async () => {
  const fixture = setup();
  const old = await runTurn({ fixture, question: '¿Cómo viene Promo?', steps: [search('Promo')] });
  const forged = [{ query: 'Promo', clients: [{ id: 'promo', name: 'Promo Group / Endova', slug: 'promo-group', isArchived: false }], approximate: false }];
  for (const options of [
    { question: pilot, steps: [search('Promo'), draftCall({ cliente: 'Promo Group / Endova' })] },
    { question: `${pilot} Es para Promo.`, steps: [draftCall({ cliente: 'Promo Group / Endova', clientSearches: forged })], context: { taskClientSearches: forged }, history: [{ role: 'assistant', text: old.answer }] },
    { question: `${pilot} Es para Promoción.`, steps: [search('Promo'), draftCall({ cliente: 'Promo Group / Endova' })] }
  ]) {
    const result = await runTurn({ fixture, ...options });
    assert.equal(result.pendingAction.draft.client, undefined);
    assert.equal(taskDraftStage(result.pendingAction.draft), 'CLIENT');
  }
});

test('ambiguous, approximate and unknown searches do not select a canonical guess or inherit another client', async () => {
  for (const [term, reference] of [['Nube', 'Nube Verde'], ['Prmo', 'Promo Group / Endova'], ['Marca inexistente', 'Marca inventada']]) {
    const fixture = setup();
    const result = await runTurn({ fixture, question: `${pilot} Es para ${term}.`, steps: [search(term), draftCall({ cliente: reference })], context: { taskDefaults: { client: clients[0] } } });
    assert.equal(result.pendingAction.draft.client, null, term);
    assert.equal(taskDraftStage(result.pendingAction.draft), 'CLIENT', term);
  }
});

test('a result that is archived, deleted or becomes ambiguous after search cannot pick or inherit a client', async () => {
  for (const change of ['archive', 'delete', 'ambiguous']) {
    const fixture = setup();
    let searched = false, changed = false;
    const findMany = fixture.db.client.findMany;
    fixture.db.client.findMany = async input => { const rows = await findMany(input); if (input.where?.name) searched = true; return rows; };
    const revalidate = async () => {
      if (!searched || changed) return;
      changed = true;
      if (change === 'archive') fixture.clientRows[0].isArchived = true;
      if (change === 'delete') fixture.clientRows.splice(0, 1);
      if (change === 'ambiguous') fixture.clientRows.push({ id: 'promo-two', name: 'Promo Dos', slug: 'promo-two', isArchived: false });
    };
    const result = await runTurn({ fixture, question: `${pilot} Es para Promo.`, steps: [search('Promo'), draftCall({ cliente: 'Promo Group / Endova' })], context: { revalidate, taskDefaults: { client: clients[1] } } });
    assert.equal(result.pendingAction.draft.client, null, change);
    assert.equal(taskDraftStage(result.pendingAction.draft), 'CLIENT', change);
  }
});

test('permission revocation before preparation still blocks a client search receipt', async () => {
  const fixture = setup(), actor = structuredClone(user);
  let searched = false;
  const findMany = fixture.db.client.findMany;
  fixture.db.client.findMany = async input => { const rows = await findMany(input); searched = true; return rows; };
  const result = await runTurn({ fixture, actor, question: `${pilot} Es para Promo.`, steps: [search('Promo'), draftCall({ cliente: 'Promo Group / Endova' })], context: { revalidate: async () => { if (searched) actor.modulePermissions.gestion = false; } } });
  assert.equal(result.pendingAction, undefined);
});

test('repeating a client search does not override a human selection from the existing draft candidates', async () => {
  const fixture = setup();
  const previous = await fixture.prepare({ question: 'Crea este pendiente para Nube.', args: { ...base, cliente: 'Nube' } });
  const result = await runTurn({ fixture, question: 'De las cuentas Nube, la segunda.', context: { taskDraft: previous }, steps: [search('Nube'), draftCall({ cliente: 'nube-verde', seleccionCliente: 'la segunda', request: { intent: 'ADJUST' } })] });
  assert.equal(result.pendingAction.draft.client?.id, 'nube-verde');
  assert.equal(taskDraftStage(result.pendingAction.draft), 'READY');
  assert.deepEqual(fixture.lookups, [{ id: 'nube-verde' }]);
});

test('a different current search cannot erase the previously selected client during another adjustment', async () => {
  const fixture = setup();
  const previous = await fixture.prepare({ question: 'Crea este pendiente para Promo.', args: { ...base, cliente: 'Promo' } });
  const result = await runTurn({ fixture, question: '¿Qué cuentas Nube hay? Y cambia solo la fecha del borrador al 27 de octubre.', context: { taskDraft: previous }, steps: [search('Nube'), draftCall({ cliente: 'Promo Group / Endova', fecha: '2026-10-27', request: { intent: 'ADJUST' } })] });
  assert.equal(result.pendingAction.draft.client?.id, 'promo');
  assert.equal(result.pendingAction.draft.dueDate, '2026-10-27');
  assert.equal(taskDraftStage(result.pendingAction.draft), 'READY');
});

test('an unrelated search preserves the effective common client of each batch item without creating local selections', async () => {
  const fixture = setup();
  const previous = await fixture.prepare({ question: 'Crea dos pendientes para Promo.', args: { ...base, cliente: 'Promo', pendientes: [{ titulo: 'Portada' }, { titulo: 'Revisión' }] } });
  const result = await runTurn({ fixture, question: '¿Qué cuentas Nube hay? Y cambia solo la fecha de los pendientes al 27 de octubre.', context: { taskDraft: previous }, steps: [search('Nube'), draftCall({ fecha: '2026-10-27', request: { intent: 'ADJUST' }, pendientes: [{ titulo: 'Portada', cliente: 'Promo Group / Endova' }, { titulo: 'Revisión', cliente: 'Promo Group / Endova' }] })] });
  assert.deepEqual(taskDraftItems(result.pendingAction.draft).map(item => [item.client?.id, item.dueDate]), [['promo', '2026-10-27'], ['promo', '2026-10-27']]);
  assert.equal(taskDraftStage(result.pendingAction.draft), 'READY');
  assert.ok(result.pendingAction.draft.items.every(item => !Object.hasOwn(item, 'client')), 'the items still inherit their common client');
  assert.deepEqual(fixture.lookups, [], 'preserving the common client cannot select another candidate');
});
