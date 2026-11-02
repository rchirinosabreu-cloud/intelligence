import assert from 'node:assert/strict';
import { briaAssistantTools } from '../../src/services/briaAssistantTools.js';
import { createBriaAgencyFactService } from '../../src/services/briaAgencyFactService.js';
import { factKey } from '../../src/lib/briaAgencyFacts.js';
import { createTaskLifecycleFixture } from './briaTaskLifecycleFixture.js';
import { checkEvalAnswer } from './briaCases.js';
import { createTeamLoadService } from '../../src/services/teamLoadService.js';
import { getFinancialDashboard, getFinancialReceivablesLedger } from '../../src/controllers/financialController.js';
import { listFinancialRecords } from '../../src/services/financialRecordService.js';
import { listPayablesLedger } from '../../src/services/accountsPayableService.js';

export const GROUNDED_NOW = '2026-10-26T14:00:00.000Z';
export const GROUNDED_QUESTIONS = [
  'Tengo 30 minutos ahora. ¿Los usarías para revisar la publicación de Cometa o para sacar la entrega de Cobalto? Mira la situación real de las dos opciones antes de recomendarme una; recuerdo que el mes de Cometa estaba listo. Explícame brevemente qué ganamos y qué dejamos esperando. No prepares ni ejecutes cambios ni contactes a nadie.',
  'Antes, cambiemos a cobros. ¿Cuánto tenemos por cobrar en las seis cuentas? Dame el total exacto en pesos colombianos y, por separado, el subtotal de Cometa y Órbita. ¿Se puede decir que están vencidas con las fechas disponibles? Solo revisa, sin registrar pagos ni contactar a nadie.',
  'Volvamos a la decisión anterior. Sigo teniendo solo 30 minutos; comprueba si algo cambió en las dos opciones y dime por dónde empezarías ahora. No prepares ni ejecutes nada.'
];
export const GROUNDED_RECOVERY_QUESTION = '¿Cuánto suman Cometa y Órbita juntas? Después volvamos a la decisión anterior: sigo teniendo 30 minutos. Comprueba la situación actual de ambas opciones y dime por dónde empezarías ahora. No prepares ni ejecutes cambios ni contactes a nadie.';

// The model and production tools choose the investigation. This fixture closes
// every storage/network boundary and logs actual calls, outputs and their order.
// Passing a real client requires the caller's budget guard; no retry is added.
export const createGroundedAnswersFixture = (ai, { initialTurns = [], maxCalls = 24, maxOutputTokens = 2800 } = {}) => {
  const reads = [], writes = [], calls = [], requests = [], outcomes = [];
  let turn = initialTurns.filter(row => row.role === 'user').length - 1, order = 0;
  const now = () => new Date(GROUNDED_NOW);
  const clients = [
    { id: 'cometa', name: 'Estudio Cometa Ficticio', slug: 'cometa', isArchived: false },
    { id: 'cobalto', name: 'Taller Cobalto Ficticio', slug: 'cobalto', isArchived: false },
    { id: 'orbita', name: 'Galería Órbita Ficticia', slug: 'orbita', isArchived: false },
    { id: 'nimbo', name: 'Casa Nimbo Ficticia', slug: 'nimbo', isArchived: false },
    { id: 'cauce', name: 'Teatro Cauce Ficticio', slug: 'cauce', isArchived: false },
    { id: 'tinta', name: 'Atelier Tinta Ficticio', slug: 'tinta', isArchived: false }
  ];
  const operationalClients = clients.slice(0, 2);
  const person = { id: 'lifecycle-member', userId: 'lifecycle-user', name: 'Marina Duarte', isActive: true };
  const user = { id: person.userId, userId: person.userId, name: person.name, role: 'ADMIN', sessionVersion: 0, isActive: true, modulePermissions: { bria: true, gestion: true, parrillas: true, financiero: true }, teamMember: person };
  const record = (name, args, result) => { reads.push({ order: ++order, turn, name, args: structuredClone(args), result: structuredClone(result) }); return structuredClone(result); };
  const forbidden = name => async () => { writes.push({ order: ++order, turn, name }); throw new Error(`Fictional boundary forbids ${name}`); };
  const boundary = methods => new Proxy(methods, { get: (object, key) => key in object ? object[key] : forbidden(String(key)) });
  const facts = [{ id: 'cometa-ready', clientId: 'cometa', entity: clients[0].name, statement: 'El mes de octubre quedó listo según la coordinación del 22 de octubre.', validFrom: '2026-10-01', validUntil: '2026-10-31', topic: 'estado del mes', entityType: 'cliente', certainty: 'CONFIRMADO', purpose: 'operacion', sensitivity: 'normal', origin: 'EQUIPO', actorName: person.name, updatedAt: '2026-10-22T17:00:00Z', status: 'ACTIVE', revision: 1, sources: [] }];
  const pieces = operationalClients.map((client, index) => ({ id: `${client.id}-piece`, planId: `${client.id}-plan`, objective: index ? 'Entrega de ficha Cobalto' : 'Campaña Cometa', format: 'Post', publishDate: new Date(index ? '2026-10-28T12:00:00Z' : '2026-10-27T12:00:00Z'), publishTime: '15:00', status: 'APROBADO', revisionRequestedAt: null, finalAssetKey: `fictional-${client.id}`, _count: { finalAssets: 1 }, copyText: 'Texto ficticio aprobado.', captionText: 'Contenido ficticio.', internalNotes: index ? 'La entrega interna requiere revisar una cifra con el documento actualizado antes de las 11:00 de hoy.' : 'Diseño y texto listos. No hay comprobante ni registro de publicación; listo se refiere al material.', comments: '', assetsLinks: [], publications: [], deletedAt: null, plan: { id: `${client.id}-plan`, clientId: client.id, client, deletedAt: null, strategicObjectives: 'Entregar la versión validada dentro del compromiso acordado.' } }));
  const tasks = operationalClients.map((client, index) => ({ id: `${client.id}-task`, title: index ? 'Validar entrega Cobalto' : 'Revisar publicación Cometa', clientId: client.id, client, assigneeId: person.id, assignee: person, status: 'PENDIENTE', dueDate: new Date(index ? '2026-10-26T17:00:00Z' : '2026-10-23T17:00:00Z'), focusDeadlineAt: index ? new Date('2026-10-26T16:00:00Z') : null, accumulatedWorkMs: index ? 0 : 7200000, isPrivate: false, creatorId: user.id, collaborators: [], viewers: [], contentItemId: pieces[index].id, contentItem: pieces[index], comments: index ? 'Entrega interna comprometida hoy a las 11:00. Revisar el cuadro actualizado; no es una fecha de publicación.' : 'Comprobar que la pieza llegue a publicarse. La tarea interna era para el 23; la publicación está prevista para el 27.', updatedAt: new Date('2026-10-26T13:40:00Z'), taskComments: [{ id: `${client.id}-detail`, author: { name: person.name }, createdAt: new Date('2026-10-26T13:40:00Z'), content: index ? 'Ya llegó el cuadro actualizado. Falta una revisión de aproximadamente 20 minutos; desbloquea una entrega que el cliente espera hoy a las 11:00. No falta otro insumo ni hay que diseñar de nuevo.' : 'La memoria de mes listo describía materiales preparados. No se ha comprobado la publicación; no hay enlace publicado ni confirmación del canal. Aún falta revisar programación.' }] }));
  const plans = operationalClients.map((client, index) => ({ id: `${client.id}-plan`, clientId: client.id, client, deletedAt: null, month: 10, year: 2026, status: 'EN_PROCESO', contentItems: [pieces[index]], strategicObjectives: 'Cumplir el compromiso aprobado.' }));
  pieces.forEach((piece, index) => { piece.tasks = [{ id: tasks[index].id, status: tasks[index].status, dueDate: tasks[index].dueDate, assignee: person }]; });
  const operations = operationalClients.map((client, index) => ({ ...client, agency: 'BRAIN', contract: { status: 'ACTIVO', startDate: '2026-10-01', endDate: '2026-10-31', deliverables: [{ format: 'Post', quantity: 1 }] }, evaluation: { level: index ? 'yellow' : 'red', reasons: [{ text: index ? 'Entrega interna prevista para hoy.' : 'Tarea interna con fecha pasada.' }] }, cycles: { current: { label: 'Octubre de 2026', quota: 1, created: 1, reached: { aprobada: 1, publicada: 0 }, overdueItems: 0 } }, openTasks: [tasks[index]] }));
  const matches = (row, where = {}) => Object.entries(where).every(([key, value]) => {
    if (key === 'OR') return value.some(condition => matches(row, condition));
    if (key === 'AND') return [value].flat().every(condition => matches(row, condition));
    if (key === 'NOT') return !matches(row, value);
    const actual = row?.[key];
    if (value == null || typeof value !== 'object' || value instanceof Date) return value instanceof Date ? +new Date(actual) === +value : actual === value;
    if ('in' in value) return value.in.includes(actual);
    if ('not' in value) return actual !== value.not;
    if ('is' in value) return matches(actual, value.is);
    if ('contains' in value) return factKey(actual).includes(factKey(value.contains.replace(/\\([\\%_])/gu, '$1')));
    if ('equals' in value) return factKey(actual) === factKey(value.equals);
    const compare = input => typeof input === 'number' ? input : +new Date(input);
    if (['lt', 'lte', 'gt', 'gte'].some(operator => operator in value)) return actual != null &&
      (!('lt' in value) || compare(actual) < compare(value.lt)) && (!('lte' in value) || compare(actual) <= compare(value.lte)) &&
      (!('gt' in value) || compare(actual) > compare(value.gt)) && (!('gte' in value) || compare(actual) >= compare(value.gte));
    if ('some' in value) return (actual || []).some(item => matches(item, value.some));
    return matches(actual, value);
  });
  const records = (rows, name) => boundary({
    findMany: async ({ where = {}, skip = 0, take = rows.length } = {}) => record(name, where, rows.filter(row => matches(row, where)).slice(skip, skip + take)),
    findUnique: async ({ where }) => record(`${name}-detail`, where, rows.find(row => matches(row, where)) || null),
    findFirst: async ({ where }) => record(`${name}-detail`, where, rows.find(row => matches(row, where)) || null),
    count: async ({ where = {} } = {}) => rows.filter(row => matches(row, where)).length
  });
  const clientDb = records(clients, 'client'), taskDb = records(tasks, 'task'), memberDb = records([person], 'member');
  const factsService = createBriaAgencyFactService({ db: { user: { findUnique: async () => user }, client: clientDb, teamMember: memberDb }, repository: boundary({
    searchClients: async (_access, selected, limit) => record('account-memory', selected, selected.flatMap(client => facts.filter(row => row.clientId === client.id).slice(0, limit))),
    search: async (_access, args) => record('memory', args, facts.filter(row => (!args.clientId || row.clientId === args.clientId) && (!args.entity || factKey(row.entity) === factKey(args.entity)))),
    getMany: async (_access, ids) => facts.filter(row => ids.includes(row.id)), openQuestions: async () => []
  }) });
  const amounts = [1275500, 840750, 2300000, 615250, 1125000, 455500];
  const ledger = { year: 2026, items: amounts.map((amount, index) => ({ id: `receivable-${index}`, clientId: clients[index].id, client: { name: clients[index].name, slug: clients[index].slug }, year: 2026, month: 10, sourceLabel: 'Servicio creativo de octubre', concept: 'Servicio creativo de octubre', currency: 'COP', amount, paidAmount: 0, settledAmount: 0, retainedAmount: 0, outstanding: amount, documentTotal: amount, issuedAt: new Date(`2026-10-${String(8 + index).padStart(2, '0')}T17:00:00Z`), period: new Date('2026-10-01T12:00:00Z'), dueDate: null, status: 'DEBE', payments: [], balanceReviewRequired: false })), totals: { originalTotal: 6612000, paidTotal: 0, settledTotal: 0, retainedTotal: 0, outstandingTotal: 6612000 } };
  const financial = { ledger, expectedTotal: Number(amounts.reduce((sum, amount) => sum + BigInt(amount) * 100n, 0n) / 100n), expectedSubset: amounts[0] + amounts[2], expectedSubsetIds: ['receivable-0', 'receivable-2'] };
  // Actual cash entries are separate from the six unpaid October obligations.
  // The supplier payment below is already one expense, never a second cash sum.
  const cash = [
    { id: 'cash-income', type: 'INCOME', category: 'SERVICIO', amount: 900000, clientId: ledger.items[0].clientId, client: ledger.items[0].client, description: 'Pago recibido por servicio de septiembre de Cometa' },
    { id: 'cash-supplier', type: 'EXPENSE', category: 'SERVICIO', amount: 100000, description: 'Pago a Taller Pliegue Ficticio' },
    { id: 'cash-admin', type: 'EXPENSE', category: 'ADMINISTRATIVO', amount: 150000, description: 'Servicio administrativo pagado' }
  ].map(row => ({ ...row, year: 2026, month: 10, date: new Date('2026-10-25T17:00:00Z'), createdAt: new Date('2026-10-25T17:00:00Z'), status: 'POSTED', scenario: 'ACTUAL', origin: 'MANUAL', isProjection: false, accountId: 'cash-account', account: { id: 'cash-account', name: 'Cuenta ficticia', type: 'BANK' }, allocations: [], documents: [] }));
  const suppliers = [
    { id: 'payable-marea', thirdPartyId: 'vendor-marea', thirdParty: { id: 'vendor-marea', name: 'Papelería Marea Ficticia' }, amount: 500000, status: 'POR_PAGAR', payments: [] },
    { id: 'payable-azul', thirdPartyId: 'vendor-azul', thirdParty: { id: 'vendor-azul', name: 'Estudio Azul Ficticio' }, amount: 275000, status: 'POR_PAGAR', payments: [] },
    { id: 'payable-pliegue', thirdPartyId: 'vendor-pliegue', thirdParty: { id: 'vendor-pliegue', name: 'Taller Pliegue Ficticio' }, amount: 100000, status: 'PAGADA', payments: [{ id: 'supplier-paid', amount: 100000, paidAt: new Date('2026-10-25T17:00:00Z'), reversedAt: null, financialRecord: cash[1] }] }
  ].map(row => ({ ...row, year: 2026, month: 10, concept: 'Servicio de proveedor de octubre', currency: 'COP', receivedAt: new Date('2026-10-20T17:00:00Z'), dueDate: null, documents: [] }));
  const cashRepository = records(cash, 'financial-record');
  const financialDb = {
    financialRecord: { findMany: cashRepository.findMany, count: cashRepository.count, groupBy: async ({ where }) => {
      const selected = cash.filter(row => matches(row, where));
      return record('cash-totals', where, ['INCOME', 'EXPENSE'].map(type => ({ type, _sum: { amount: selected.filter(row => row.type === type).reduce((sum, row) => sum + row.amount, 0) } })));
    } },
    accountsReceivable: records(ledger.items, 'receivable'), accountsPayable: records(suppliers, 'payable'),
    payrollTransaction: records([], 'payroll-transaction'), payrollContract: records([], 'payroll-contract')
  };
  const nativeFinancialResponse = async (controller, query) => {
    const response = { statusCode: 200, payload: null, status(code) { this.statusCode = code; return this; }, json(data) { this.payload = data; return this; } };
    await controller({ query }, response, { prismaClient: financialDb });
    if (response.statusCode >= 400) throw new Error(`Fictional native financial read failed: ${response.payload?.error}`);
    return response.payload;
  };
  const rhythm = boundary({ get: async ({ days = 30 } = {}) => record('rhythm', { days }, {
    period: { days }, team: { closed: 0, measured: 0, coverage: 0 },
    people: [{ personId: person.id, personName: person.name, closed: 0, measured: 0, coverage: 0, byType: [], findings: [] }],
    profiles: [], tasks: {}, hours: [{ personId: person.id, personName: person.name,
      days: [{ day: '2026-10-23', measuredMs: tasks[0].accumulatedWorkMs, declaredMs: 0 }],
      weeks: [{ week: '2026-10-19', measuredMs: tasks[0].accumulatedWorkMs, declaredMs: 0 }] }], historyIncomplete: false, hoursIncomplete: false
  }) });
  const load = createTeamLoadService({ db: { teamMember: memberDb, task: taskDb }, rhythm, now });
  const model = { generate: async original => {
    for (const output of original.input || []) if (output.type === 'function_call_output') {
      const call = calls.find(row => row.id === output.call_id);
      if (call && !Object.hasOwn(call, 'result')) { call.result = JSON.parse(output.output); call.resultOrder = ++order; }
    }
    if (requests.length >= maxCalls) throw Object.assign(new Error('Fictional evaluation call limit reached before provider'), { code: 'EVAL_CALL_LIMIT' });
    const request = { ...original, maxOutputTokens: Math.min(original.maxOutputTokens || maxOutputTokens, maxOutputTokens) };
    requests.push({ order: ++order, turn, planning: Boolean(request.responseSchema), tools: request.tools?.map(tool => tool.name) || [], maxOutputTokens: request.maxOutputTokens, bytes: Buffer.byteLength(JSON.stringify(request), 'utf8') });
    const response = await ai.generate(request);
    for (const call of response.functionCalls || []) calls.push({ order: ++order, turn, id: call.id, name: call.name, args: structuredClone(call.args) });
    return response;
  } };
  const knowledge = boundary({ list: async () => [], readableIds: async () => [], readableBusinessIds: async () => [], businessContext: async (_actor, selected) => ({ agency: { state: 'CONSULTADO', partial: false, learnings: [] }, accounts: selected.map(client => ({ clientId: client.id, state: 'CONSULTADO', partial: false, learnings: [] })) }) });
  const fixture = createTaskLifecycleFixture(model, { initialTurns, session: { token: 'fictional-session-no-network' }, assistantTools: briaAssistantTools, knowledge,
    assistantOptions: { now, agencyFacts: factsService, taskDrafts: boundary({}), dispatchDrafts: boundary({}), deleteDrafts: boundary({}), actions: boundary({}), platform: boundary({ call: async ({ method, path }) => {
      if (method !== 'GET') return forbidden(`platform:${method}`)();
      const route = path.split('?')[0], query = Object.fromEntries(new URLSearchParams(path.split('?')[1] || ''));
      const readers = {
        '/financials/receivables-ledger': () => nativeFinancialResponse(getFinancialReceivablesLedger, query),
        '/financials/dashboard': () => nativeFinancialResponse(getFinancialDashboard, query),
        '/financials/records': () => listFinancialRecords(financialDb, query),
        '/financials/payables-ledger': () => listPayablesLedger(financialDb, query)
      };
      if (!readers[route]) throw new Error(`Unmodeled fictional GET route: ${path}`);
      return record(route.slice('/financials/'.length), { method, path }, { ok: true, data: await readers[route](), truncated: false });
    } }), dailyReading: null },
    assistantContext: {
      getTasks: async id => record('tasks', { clientId: id }, tasks.filter(task => task.clientId === id)),
      operations: boundary({ listOperations: async () => record('portfolio', {}, operations), getOperation: async slug => record('operation', { slug }, operations.find(row => row.slug === slug)) }),
      readActivity: async () => record('activity', {}, []),
      load: boundary({ get: async args => record('load', args, await load.get(args)) }), rhythm,
      searchMemory: async args => record('meeting-memory', args, []), searchAgency: async (_actor, query) => record('document-search', { query }, []), readAgency: async (_actor, id) => record('document', { id }, null)
    },
    extraDb: { user: { findUnique: async () => user }, client: clientDb, teamMember: memberDb, task: taskDb, contentPlan: records(plans, 'plan'), contentItem: records(pieces, 'piece'), socialPublication: records([], 'publication'), clientEditorialCriterion: records([], 'editorial'), contentPlanReviewFinding: records([], 'finding') }
  });
  return { ...fixture, reads, writes, calls, requests, outcomes, tasks, pieces, facts, financial,
    async send(question) {
      turn++;
      const answer = await fixture.send(question);
      const outcome = { turn, question, answer, calls: structuredClone(calls.filter(call => call.turn === turn)), reads: structuredClone(reads.filter(read => read.turn === turn)), completedOrder: ++order };
      outcomes.push(outcome);
      return answer;
    }
  };
};

// Match the entire monetary token, including cents. A correct integer prefix
// must not accept a different amount such as 6.612.000,50.
const mentionsAmount = (text, value) => new RegExp(`(?<![\\d.,-])${String(value).replace(/\B(?=(\d{3})+(?!\d))/g, '[.,\\s]?')}(?:[.,]00)?(?!\\d|[.,]\\d)`, 'u').test(text);
const timeConstraint = text => /(?:30|treinta)\s*(?:minutos|min\b)/iu.test(text);
const decisionDetails = outcome => outcome.calls.filter(call => call.name === 'leer_pendiente' && call.result?.tarea && call.resultOrder < outcome.completedOrder);
const currentReceivableReads = outcome => outcome.calls.filter(call => call.name === 'consultar_plataforma' && call.result?.operacion === 'GET /financials/receivables-ledger' && call.resultOrder < outcome.completedOrder);
const assertServerSubtotal = (outcome, fixture) => {
  const sameIds = ids => Array.isArray(ids) && ids.length === fixture.financial.expectedSubsetIds.length && fixture.financial.expectedSubsetIds.every(id => ids.includes(id));
  const exactSubtotal = sums => sums?.some(sum => sum.campo === 'outstandingTotal' && sum.moneda === 'COP' && sum.centavos === String(BigInt(fixture.financial.expectedSubset) * 100n));
  assert.ok(currentReceivableReads(outcome).some(({ result }) => {
    const evidence = result.evidenciaNumerica, selected = evidence?.seleccion;
    if (selected?.completa && !selected.error && selected.idsNoDisponibles?.length === 0 && sameIds(selected.idsEncontrados) && exactSubtotal(selected.sumasExactas)) return true;
    return evidence?.alcance.filasCompletas && sameIds(result.respuesta?.items?.map(row => row.id)) && exactSubtotal(evidence.sumasFilasVisibles);
  }), 'the requested two-client amount needs a current complete server-calculated subtotal receipt');
};

// These assertions check evidence coverage, absence of effects, time and money
// bounds. They do not grade nuanced causal reasoning or choose a winning option;
// a real-model result still needs review of the saved narrative and trace.
export const assertGroundedAnswer = (outcome, fixture, phase) => {
  const answer = outcome.answer, prose = answer.text || '';
  // Una cifra sin fuente la anota el motor como «cifras»; aquí se juzga con la comprobación del subtotal, más precisa.
  assert.deepEqual((answer.failures || []).filter(row => row.tool !== 'cifras'), [], 'a tool failure is not a successful investigation');
  assert.equal(answer.pendingAction, undefined);
  assert.equal(fixture.created.length, 0);
  assert.deepEqual(fixture.writes, []);
  assert.ok(!outcome.calls.some(call => /^(?:operar_|preparar_|confirmar_|guardar_|retirar_|eliminar_|cambiar_)/u.test(call.name)), 'no operational or memory write may be attempted');
  assert.ok(prose.length > 60 && prose.length < (phase === 1 ? 1200 : 1800), 'answer must be useful and concise');
  const calendar = checkEvalAnswer({}, { answer: prose, today: GROUNDED_NOW.slice(0, 10) });
  assert.deepEqual(calendar.failures, [], 'reported dates must agree with the fictional calendar');
  assert.doesNotMatch(prose, /Datos para aprobar|Costo o efecto:|Consultado en Gestión:/u);
  if (phase === 1) {
    const reads = currentReceivableReads(outcome);
    const ledger = reads.find(call => call.result.respuesta?.items?.length === 6 && call.result.evidenciaNumerica?.alcance.filasCompletas);
    assert.ok(ledger, 'finance answer must read the complete fictional ledger');
    assertServerSubtotal(outcome, fixture);
    assert.ok(mentionsAmount(prose, fixture.financial.expectedTotal), 'the six-row exact total must be distinguished');
    assert.ok(mentionsAmount(prose, fixture.financial.expectedSubset), 'the exact two-client subtotal must be distinguished');
    assert.match(prose, /subtotal|por separado|entre (?:las )?dos|suman|solo.*(?:Cometa|Órbita)/iu);
    assert.match(prose, /sin (?:fecha de )?vencimiento|no (?:hay|tienen|tiene|consta|figura|aparece).*vencimiento|ningun[ao].*vencimiento|vencimiento.*(?:no|sin).*inform/iu, 'missing due dates cannot establish overdue debt');
    return;
  }
  assert.ok(timeConstraint(prose), 'the thirty-minute constraint must survive the interruption');
  const details = decisionDetails(outcome);
  assert.ok(['cometa-task', 'cobalto-task'].every(id => details.some(call => call.result.tarea.id === id)), 'both alternatives need current detail before a recommendation');
  assert.ok(outcome.calls.some(call => call.name === 'leer_piezas_de_parrilla' && call.result?.piezas?.some(piece => piece.id === 'cometa-piece')), 'the memory claim needs current publication evidence');
  assert.ok(outcome.reads.some(read => ['account-memory', 'memory'].includes(read.name) && Array.isArray(read.result) && read.result.some(fact => fact.id === 'cometa-ready')), 'the remembered claim must be available in the same decision');
  assert.match(prose, /Cometa/iu); assert.match(prose, /Cobalto/iu);
  assert.match(prose, /hoy|26 de octubre|26\/10/iu, 'the alternative due today must not be described as already overdue');
  assert.match(prose, /publicaci[oó]n|publicad/iu);
  if (phase === 0) {
    // Coverage of the remembered claim is checked above through its read receipt.
    // Whether the narrative reconciles that claim needs semantic review, not a
    // vocabulary test that rejects equivalent natural wording.
    assert.match(prose, /27|veintisiete/iu, 'publication date must remain distinct from internal delivery');
  }
};

// A new clarification may recover a missing answer; it never replaces or
// retroactively accepts the earlier partial turn or its original report.
export const assertGroundedRecovery = (outcome, fixture) => {
  assertGroundedAnswer(outcome, fixture, 2);
  assertServerSubtotal(outcome, fixture);
  assert.ok(mentionsAmount(outcome.answer.text || '', fixture.financial.expectedSubset), 'the exact two-client subtotal must be distinguished');
};

export const runGroundedAnswersScenario = async (fixture, { savedOutcomes = [], onAccepted = async () => {} } = {}) => {
  const results = [];
  for (const [phase, question] of GROUNDED_QUESTIONS.entries()) {
    const previous = savedOutcomes[phase];
    if (!previous) await fixture.send(question);
    const outcome = previous || fixture.outcomes.at(-1);
    assertGroundedAnswer(outcome, fixture, phase);
    results.push(outcome);
    await onAccepted(outcome, phase);
  }
  return results;
};

// Run before any budgeted model evaluation. These reads use a scripted provider
// and the same native adapters; an incomplete fixture must fail locally first.
export const runGroundedReadPreflight = async () => {
  const requested = [
    ['mapa_de_plataforma', {}], ['buscar_cliente', { nombre: 'Cometa' }], ['mis_tareas', { estado: 'todas' }],
    ['buscar_pendientes', { estado: 'todas' }], ['buscar_pendientes', { cliente: 'Cobalto', responsable: 'Marina', vencidas: false }],
    ...['cometa', 'cobalto'].flatMap(id => [['tareas_de_cliente', { clientId: id }], ['leer_pendiente', { id: `${id}-task` }], ['operacion_de_cliente', { slug: id }], ['parrilla_de_cliente', { clientId: id, mes: 10, anio: 2026 }], ['leer_piezas_de_parrilla', { planId: `${id}-plan`, ids: [`${id}-piece`] }]]),
    ['cartera_de_operacion', {}], ['criterios_y_hallazgos', { clientId: 'cometa', planId: 'cometa-plan' }],
    ['publicaciones_programadas', { dias: 7 }], ['actividad_del_equipo', {}],
    ...['hoy', 'manana', 'semana', 'proxima_semana'].map(horizonte => ['carga_del_equipo', { horizonte }]),
    ['ritmo_del_equipo', { dias: 30 }], ['ritmo_del_equipo', { dias: 7, persona: 'Marina', cliente: 'Cometa', tipo: 'Post' }],
    ['memoria_de_la_agencia', { consulta: 'estado del mes', clientId: 'cometa', entidad: null }],
    ['consultar_aprendizajes', { consulta: 'Cometa' }], ['como_trabajar_con', { nombre: 'Marina Duarte' }],
    ['memoria_de_reuniones', { consulta: 'Cometa', clientId: 'cometa' }], ['memoria_de_agencia', { consulta: 'Cometa' }],
    ['leer_documento_de_agencia', { id: 'missing-fictional-document', desde: 0 }],
    ...['', '?year=2026&month=10', '?year=2026&quarter=4&q=Cometa', '?q=%C3%93rbita', '?q=Cliente%20inexistente', '?month=9', '?quarter=3'].map(query => ['consultar_plataforma', { ruta: `/financials/receivables-ledger${query}` }]),
    ['consultar_plataforma', { ruta: '/financials/receivables-ledger', idsParaSumar: ['receivable-0', 'receivable-2'] }],
    ...['', '?year=2026&month=10&type=INCOME', '?year=2026&quarter=4&q=Cometa', '?year=2026&month=11'].map(query => ['consultar_plataforma', { ruta: `/financials/dashboard${query}` }]),
    ...['?year=2026&month=10', '?year=2026&month=10&page=2&pageSize=1', '?type=INCOME&q=Cometa', '?year=2026&month=10&category=ADMINISTRATIVO', '?year=2026&month=11'].map(query => ['consultar_plataforma', { ruta: `/financials/records${query}` }]),
    ...['?year=2026&month=10', '?year=2026&month=10&q=Marea', '?year=2026&month=11', '?thirdPartyId=vendor-pliegue&status=PAGADA'].map(query => ['consultar_plataforma', { ruta: `/financials/payables-ledger${query}` }])
  ];
  let sent = false;
  const fixture = createGroundedAnswersFixture({ generate: async request => {
    if (!sent) { sent = true; return { functionCalls: requested.map(([name, args], index) => ({ id: `preflight-${index}`, name, args })) }; }
    return { text: 'Lecturas ficticias completadas. No se preparó ni ejecutó ningún cambio.' };
  } }, { maxCalls: 4 });
  const answer = await fixture.send('Consulta las fuentes actuales y las capacidades disponibles, sin preparar cambios.');
  assert.deepEqual(answer.failures, [], 'the offline fixture preflight must have no adapter failures');
  assert.equal(fixture.calls.length, requested.length);
  assert.ok(fixture.calls.every(call => call.result && !call.result.error), 'every requested read must have a successful tool result');
  assert.deepEqual(fixture.writes, []);
  return fixture;
};
