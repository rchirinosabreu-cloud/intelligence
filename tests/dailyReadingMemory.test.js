import test from 'node:test';
import assert from 'node:assert/strict';
import { buildDailyDigest, buildDailyReadingRequest, validateDailyReading, composeReading, buildMorningBrief } from '../src/lib/dailyReading.js';
import { projectReadingContext, dailyContextFingerprint, dailyContextSources } from '../src/lib/dailyReadingContext.js';
import { createDailyReadingService, readDailyMemoryContext, readDailyCriteria } from '../src/services/dailyReadingService.js';
import { createDailyReadingTools } from '../src/services/dailyReadingTools.js';
import { createBriaAgencyFactRepository } from '../src/services/briaAgencyFactRepository.js';

const day = '2026-10-26';
const clients = [{ id: 'client-x', name: 'Estudio Norte', metrics: { level: 'red', reasons: ['Septiembre: faltaron dos piezas.'], contract: 'ACTIVO' } }];
const signals = [{ id: 'ROJO_SOSTENIDO:client-x', kind: 'ROJO_SOSTENIDO', subjectType: 'CLIENT', subjectId: 'client-x', subjectName: 'Estudio Norte', direction: 'peor', severity: 3, text: 'Septiembre cerró con dos piezas sin publicar.' }];
const summary = { clients: { red: 1, yellow: 0, green: 0, gray: 0 }, team: { open: 0, overdue: 0, returned: 0 }, historyDays: 8 };
const fact = { id: 'fact-x', revision: 1, statement: 'No se renovó octubre. La parrilla se preparó sin confirmación.', purpose: 'operacion', sensitivity: 'normal', certainty: 'CONFIRMADO', validFrom: '2026-10-01', validUntil: '2026-10-31', origin: 'EQUIPO', updatedAt: '2026-10-25T12:00:00Z' };
const context = { accounts: [{ clientId: 'client-x', state: 'CONSULTADO', partial: false, contract: { estado: 'ACTIVO', inicio: '2026-09-01', fin: '2026-09-30' }, facts: [fact] }], criteria: [] };
const admin = { purposes: ['operacion', 'direccion'], restricted: ['operacion', 'direccion'] };
const raw = { resumen: 'Octubre no tiene un compromiso confirmado; las dos piezas corresponden a septiembre.', decisiones: [{ titulo: 'Aclarar las dos piezas de septiembre', porque: 'La falta de renovación de octubre no resuelve una obligación anterior.', tipo: 'VIGILAR', evidencia: [signals[0].id], memoria: ['fact-x'], pedido: null, regla: null }], cuentas: [{ clientId: 'client-x', lectura: 'Separar septiembre de la parrilla no confirmada de octubre.' }] };
const reading = () => composeReading({ day, summary, signals: structuredClone(signals), clients, context, model: validateDailyReading(raw, { day, signals, clients, context }) });

test('only confirmed team facts become confirmed agency criteria, never proposals or uncertain memories', async () => {
  const rows = [
    { ...fact, id: 'confirmed', origin: 'EQUIPO', certainty: 'CONFIRMADO' },
    { ...fact, id: 'proposal', origin: 'EQUIPO', certainty: 'PROPUESTA' },
    { ...fact, id: 'unknown', origin: 'EQUIPO', certainty: undefined },
    { ...fact, id: 'imported', origin: 'IMPORTACION', certainty: 'CONFIRMADO' }
  ];
  const criteria = await readDailyCriteria({ factRepository: { search: async () => rows } });
  assert.deepEqual(criteria.map(rule => rule.id), ['confirmed']);
});

test('the same morning analysis receives persistent corrections, certainty, dates and native contract before ranking', () => {
  const digest = buildDailyDigest({ today: day, summary, signals, clients, context });
  assert.match(digest.text, /No se renovó octubre/);
  assert.match(digest.text, /2026-09-30/);
  assert.match(digest.text, /CONFIRMADO/);
  assert.match(digest.text, /2026-10-31/);
  const saved = reading();
  assert.equal(saved.context.fingerprint, dailyContextFingerprint(context));
  assert.deepEqual(saved.decisions[0].memoryEvidence, ['fact-x']);
  assert.equal(saved.decisions[0].kind, 'VIGILAR');
});

test('a model recommendation which ignores available account memory is not published as a definitive priority', () => {
  const ignored = { ...raw, decisiones: [{ ...raw.decisiones[0], tipo: 'HACER', memoria: [] }] };
  const model = validateDailyReading(ignored, { day, signals, clients, context });
  assert.equal(model.decisions.length, 0);
  const saved = composeReading({ day, summary, signals, clients, context, model });
  assert.equal(saved.decisions[0].kind, 'VIGILAR');
  assert.doesNotMatch(saved.decisions[0].ask || '', /salir del rojo|volver a verde|este mes/);
  assert.match(saved.decisions[0].why, /contexto|compromiso/i);
  const mixedSignals = [...signals, { id: 'VENCIDAS_SUBEN:person', subjectType: 'PERSON', subjectId: 'person', subjectName: 'Ana', direction: 'peor' }];
  const mixed = validateDailyReading({ ...ignored, decisiones: [...ignored.decisiones, { titulo: 'Revisar la carga de Ana', tipo: 'VIGILAR', evidencia: ['VENCIDAS_SUBEN:person'], memoria: [] }] }, { day, signals: mixedSignals, clients, context });
  assert.equal(mixed.decisions.length, 1);
  assert.equal(mixed.overview, null, 'a rejected interpretation cannot survive in the global overview');
  assert.deepEqual(mixed.accounts, {});
});

test('a fresh correction invalidates derived advice without replacing persisted proposal ids or spending another model call', () => {
  const saved = reading();
  const changed = structuredClone(context);
  changed.accounts[0].facts = [{ ...fact, id: 'fact-new', revision: 1, statement: 'Se confirmó una nueva entrega para noviembre.' }];
  const view = projectReadingContext(saved, changed, admin);
  assert.equal(view.decisions[0].id, saved.decisions[0].id);
  assert.equal(view.decisions[0].kind, 'VIGILAR');
  assert.equal(view.overview, null);
  assert.doesNotMatch(JSON.stringify(view.decisions), /Aclarar las dos piezas de septiembre/);
  assert.deepEqual(saved.decisions[0].memoryEvidence, ['fact-x'], 'the original evidence and human review remain unchanged');
  assert.equal(view.contextChanged, true);
  const same = projectReadingContext(saved, structuredClone(context), admin);
  assert.equal(same.contextChanged, false);
  assert.equal(same.overview, saved.overview);
});

test('contract renewal, fact retirement and missing memory also invalidate cached recommendations', () => {
  const saved = reading();
  for (const current of [
    { ...context, accounts: [{ ...context.accounts[0], contract: { ...context.accounts[0].contract, fin: '2026-11-30' } }] },
    { ...context, accounts: [{ ...context.accounts[0], facts: [] }] },
    { ...context, accounts: [{ ...context.accounts[0], state: 'NO_DISPONIBLE', partial: true, facts: [] }] }
  ]) assert.equal(projectReadingContext(saved, current, admin).overview, null);
});

test('a correction to one account preserves proposals with independent evidence', () => {
  const saved = reading();
  saved.signals.push({ id: 'VENCIDAS_SUBEN:person', subjectType: 'PERSON', subjectId: 'person' });
  saved.decisions.push({ id: `${day}:2`, subjectType: 'PERSON', subjectId: 'person', title: 'Revisar la carga de Ana', evidence: ['VENCIDAS_SUBEN:person'], kind: 'VIGILAR', source: 'MODELO' });
  const changed = { ...context, accounts: [{ ...context.accounts[0], facts: [] }] };
  const view = projectReadingContext(saved, changed, admin);
  assert.deepEqual(view.decisions[1], saved.decisions[1]);
});

test('private facts cannot leak through model overview, decision text or account summaries to a different recipient', () => {
  const privateContext = { ...context, accounts: [{ ...context.accounts[0], facts: [{ ...fact, purpose: 'direccion', sensitivity: 'restringida' }] }] };
  const saved = composeReading({ day, summary, signals, clients, context: privateContext, model: validateDailyReading(raw, { day, signals, clients, context: privateContext }) });
  const pm = projectReadingContext(saved, privateContext, { purposes: ['operacion'], restricted: [] });
  assert.equal(pm.overview, null);
  assert.equal(pm.context.accounts[0].facts.length, 0);
  assert.equal(pm.context.accounts[0].partial, true, 'hidden context is not presented as proof that there are no agreements');
  assert.doesNotMatch(JSON.stringify(pm.decisions), /renovación|septiembre/);
  assert.equal(pm.accounts['client-x'].lectura, null);
});

test('the morning uses concise narrative without prompt recipes or repeating the same evidence', () => {
  const saved = reading();
  const brief = buildMorningBrief({ recipientName: 'María', reading: saved });
  assert.match(brief.text, /Octubre no tiene un compromiso confirmado/);
  assert.doesNotMatch(brief.text, /Se ve en:|Pídemelo así:|Lo que haría hoy|También cambió/);
  assert.equal(brief.text.split(raw.resumen).length, 2);
});

test('generation, delivery and reopening share current persistent context without regenerating saved analyses', async () => {
  let current = structuredClone(context), generated = 0;
  const saved = reading(), messages = [];
  const user = { id: 'owner', role: 'ADMIN', name: 'María', modulePermissions: { bria: true } };
  const service = createDailyReadingService({
    repository: {
      reading: async () => saved, latestReading: async () => saved,
      snapshot: async () => ({ clients, people: [] }), readingsBefore: async () => []
    },
    memoryContext: async () => structuredClone(current), criteria: async () => [],
    generate: async () => { generated += 1; throw new Error('not required'); },
    proactive: { morningBriefDelivery: async () => null, recordMorningBriefDelivery: async () => ({}) },
    conversations: { postAssistantNote: async (_actor, note) => { messages.push(note); return { id: 'chat' }; } },
    notify: async () => {}, whatsapp: () => {}, now: () => new Date('2026-10-26T12:30:00Z'), logger: { error() {} }
  });
  await service.generateReading();
  current.accounts[0].facts = [{ ...fact, revision: 2, statement: 'La entrega de noviembre está confirmada.' }];
  await service.deliver(user, saved);
  assert.doesNotMatch(messages[0].text, /Octubre no tiene un compromiso confirmado/);
  assert.ok(messages[0].metadata.sources.some(source => source.kind === 'hecho_agencia' && source.id === 'fact-x'));
  const explained = await service.explain({ user });
  assert.equal(explained.contexto.accounts[0].facts[0].revision, 2);
  assert.equal(explained.contextoActualizado, true);
  assert.equal(explained.decisiones[0].id, saved.decisions[0].id);
  assert.equal(generated, 0);
  const result = await createDailyReadingTools(service)[0].run({}, { user });
  assert.ok(result.sources.some(source => source.kind === 'hecho_agencia' && source.id === 'fact-x'));
});

test('recipient scope filters persistent context before returning the daily-reading tool', async () => {
  const saved = reading();
  saved.owners = { 'client-x': 'mine', 'other': 'not-mine' };
  const other = { clientId: 'other', state: 'CONSULTADO', facts: [{ ...fact, id: 'other-fact', statement: 'Dato de otra cuenta' }], contract: null };
  const current = { ...context, accounts: [...context.accounts, other] };
  const user = { id: 'pm', role: 'PROJECT_MANAGER', modulePermissions: { bria: true }, teamMember: { id: 'mine' } };
  const service = createDailyReadingService({ repository: { latestReading: async () => saved, snapshot: async () => ({ clients: [...clients, { id: 'other', name: 'Otra' }], people: [] }) }, memoryContext: async () => current, criteria: async () => [] });
  const response = await createDailyReadingTools(service)[0].run({}, { user });
  assert.deepEqual(response.data.contexto.accounts.map(account => account.clientId), ['client-x']);
  assert.doesNotMatch(JSON.stringify(response), /other-fact|Dato de otra cuenta/);
});

test('yesterday’s verdict section cannot revive private model text or an obsolete recommendation', async () => {
  const previous = reading();
  previous.day = '2026-10-23';
  previous.owners = { 'client-x': 'mine' };
  previous.decisions[0].title = 'Texto reservado de dirección';
  const entry = { id: 'entry', dayKey: previous.day, decisionId: previous.decisions[0].id, title: previous.decisions[0].title, note: 'Nota antigua', verdict: 'HECHO' };
  const user = { id: 'pm', role: 'PROJECT_MANAGER', modulePermissions: { bria: true }, teamMember: { id: 'mine' } };
  const service = createDailyReadingService({
    repository: { readingsBefore: async () => [previous], recentDecisions: async () => [entry], snapshot: async () => ({ clients, people: [] }) },
    memoryContext: async () => ({ ...context, accounts: [{ ...context.accounts[0], facts: [] }] }), criteria: async () => []
  });
  const log = await service.decisionsFor(user, reading());
  assert.doesNotMatch(JSON.stringify(log), /Texto reservado|Nota antigua/);
  assert.equal(log.decided[0].decisionId, entry.decisionId);
});

test('access revoked during the context read prevents both delivery and reopening', async () => {
  const saved = reading();
  let delivered = false;
  const denied = Object.assign(new Error('Revoked'), { status: 403 });
  const service = createDailyReadingService({
    repository: { latestReading: async () => saved, snapshot: async () => ({ clients, people: [] }) },
    memoryContext: async () => ({ ...context, revalidate: async () => { throw denied; } }), criteria: async () => [],
    proactive: { morningBriefDelivery: async () => null },
    conversations: { postAssistantNote: async () => { delivered = true; } }
  });
  const user = { id: 'owner', role: 'ADMIN', modulePermissions: { bria: true } };
  await assert.rejects(service.deliver(user, saved), error => error === denied);
  await assert.rejects(service.explain({ user }), error => error === denied);
  assert.equal(delivered, false);
});

test('missing or partial context is observable and cannot support a definitive action recommendation', () => {
  for (const current of [
    { ...context, accounts: [{ ...context.accounts[0], state: 'NO_DISPONIBLE', partial: true }] },
    { ...context, accounts: [{ ...context.accounts[0], partial: true }] },
    { ...context, criteriaState: 'NO_DISPONIBLE' }
  ]) {
    const result = validateDailyReading({ ...raw, decisiones: [{ ...raw.decisiones[0], tipo: 'HACER' }] }, { day, signals, clients, context: current });
    assert.equal(result.decisions.length, 0);
    assert.equal(result.overview, null);
  }
});

test('the response schema binds evidence to provided identities and reference markup does not lose a valid decision', () => {
  const digest = buildDailyDigest({ today: day, summary, signals, clients, context });
  const request = buildDailyReadingRequest({ digest, today: day });
  assert.deepEqual(request.responseSchema.properties.decisiones.items.properties.evidencia.items.enum, signals.map(row => row.id));
  assert.deepEqual(request.responseSchema.properties.decisiones.items.properties.memoria.items.enum, ['fact-x']);
  const wrapped = { ...raw, decisiones: [{ ...raw.decisiones[0], evidencia: [`[${signals[0].id}]`], memoria: ['[fact-x]'] }] };
  const accepted = validateDailyReading(wrapped, { day, signals, clients, context });
  assert.equal(accepted.decisions.length, 1);
  assert.deepEqual(accepted.decisions[0].evidence, [signals[0].id]);
  assert.deepEqual(accepted.decisions[0].memoryEvidence, ['fact-x']);
  const unknown = validateDailyReading({ ...wrapped, decisiones: [{ ...wrapped.decisiones[0], evidencia: ['[not-a-real-signal]'] }] }, { day, signals, clients, context });
  assert.equal(unknown.decisions.length, 0);
  assert.equal(unknown.diagnostics.rejected[0].code, 'UNKNOWN_EVIDENCE');
  assert.equal(validateDailyReading({ decisiones: [] }, { day, signals, clients, context }).diagnostics.received, 0);
});

test('a reopened proposal cannot expose revoked context through the verdict note, outcome or history', async () => {
  const saved = reading();
  const user = { id: 'pm', role: 'PROJECT_MANAGER', modulePermissions: { bria: true } };
  const entry = { dayKey: day, decisionId: saved.decisions[0].id, verdict: 'HECHO', note: 'Nota reservada', outcomeText: 'Desenlace reservado', history: [{ note: 'Historia reservada' }] };
  const service = createDailyReadingService({
    repository: { latestReading: async () => saved, recentDecisions: async () => [entry], snapshot: async () => ({ clients, people: [] }) },
    memoryContext: async () => ({ ...context, accounts: [{ ...context.accounts[0], facts: [] }] }), criteria: async () => []
  });
  const result = await service.explain({ user });
  assert.equal(result.decisiones[0].anotacion.veredicto, 'HECHO');
  assert.doesNotMatch(JSON.stringify(result), /Nota reservada|Desenlace reservado|Historia reservada/);
});

const oldLearning = { id: 'legacy-x', scope: 'ACCOUNT', entity: 'Estudio Norte', topic: 'Compromiso', text: 'Octubre no está contratado; las dos piezas pendientes pertenecen a septiembre.', kind: 'CONFIRMED', status: 'ACTIVE', revision: 2, author: 'Dirección', validFrom: '2026-10-01', validUntil: '2026-10-31' };
const legacyContext = () => ({ ...context, accounts: [{ ...context.accounts[0], facts: [], learnings: [oldLearning] }], agency: { state: 'CONSULTADO', partial: false, facts: [{ ...fact, id: 'agency-x', statement: 'Priorizar compromisos de publicaciones de esta semana.', topic: 'Prioridades' }], learnings: [] }, businessAccess: { readableIds: ['legacy-x'] } });

test('existing business learnings and general agency facts reach the same morning model with provenance and distinct source ids', () => {
  const current = legacyContext();
  const digest = buildDailyDigest({ today: day, summary, signals, clients, context: current });
  assert.match(digest.text, /Priorizar compromisos de publicaciones/);
  assert.match(digest.text, /Octubre no está contratado/);
  assert.match(digest.text, /CONFIRMED/);
  assert.match(digest.text, /2026-10-31/);
  assert.ok(digest.memoryIds.includes('aprendizaje:legacy-x'));
  const model = validateDailyReading({ ...raw, decisiones: [{ ...raw.decisiones[0], memoria: ['aprendizaje:legacy-x', 'agency-x'] }] }, { day, signals, clients, context: current });
  assert.equal(model.decisions.length, 1);
  assert.deepEqual(dailyContextSources(current).map(source => [source.kind, source.id]).sort(), [['aprendizaje', 'legacy-x'], ['hecho_agencia', 'agency-x']]);
  const saved = composeReading({ day, summary, signals, clients, context: current, model });
  assert.equal(projectReadingContext(saved, current, admin).overview, saved.overview);
  assert.equal(saved.context.businessAccess, undefined, 'transient authorization is not persisted');
});

test('legacy revocation and a changed agency priority invalidate cached prose without transferring original learning ACL to fact ACL', () => {
  const current = legacyContext();
  const model = validateDailyReading({ ...raw, decisiones: [{ ...raw.decisiones[0], memoria: ['aprendizaje:legacy-x'] }] }, { day, signals, clients, context: current });
  const saved = composeReading({ day, summary, signals, clients, context: current, model });
  const denied = projectReadingContext(saved, { ...current, businessAccess: { readableIds: [] } }, admin);
  assert.equal(denied.overview, null);
  assert.equal(denied.context.accounts[0].learnings.length, 0);
  assert.equal(denied.context.accounts[0].partial, true);
  assert.doesNotMatch(JSON.stringify(denied), /Octubre no está contratado/);
  const changed = structuredClone(current);
  changed.agency.facts[0].revision += 1;
  assert.equal(projectReadingContext(saved, changed, admin).overview, null);
  assert.equal(projectReadingContext(saved, changed, admin).decisions[0].needsContextReview, true);
});

test('missing or truncated agency memory cannot support a definitive recommendation and is not absence of agreements', () => {
  const current = legacyContext();
  current.agency.partial = true;
  const model = validateDailyReading({ ...raw, decisiones: [{ ...raw.decisiones[0], tipo: 'HACER', memoria: ['aprendizaje:legacy-x'] }] }, { day, signals, clients, context: current });
  assert.equal(model.decisions.length, 0);
  assert.equal(model.diagnostics.rejected[0].code, 'CONTEXT_NOT_SUPPORTED');
});

test('daily context loads general agency and legacy memory together and reauthorizes stored sources after the read', async () => {
  const user = { id: 'pm', sessionVersion: 4 };
  const viewer = { id: 'pm', role: 'PROJECT_MANAGER', isActive: true, sessionVersion: 4, modulePermissions: { bria: true, parrillas: true }, teamMember: { id: 'person', isActive: true } };
  const queries = [], checked = [], accountQueries = [];
  const current = await readDailyMemoryContext({ clients, user, db: { user: { findUnique: async () => viewer }, client: { findMany: async () => [...clients, { id: 'outside-snapshot', name: clients[0].name.toUpperCase() }] } }, operations: { listOperations: async () => [{ id: clients[0].id, name: clients[0].name, contract: null }] },
    factRepository: { searchClients: async (_access, rows) => { accountQueries.push(...rows); return []; }, search: async (_access, query) => { queries.push(query); return [{ ...fact, id: 'agency' }]; }, getMany: async (_access, ids) => { checked.push(...ids); return [{ ...fact, id: 'agency' }]; } },
    knowledgeRepository: { businessContext: async () => [{ ...oldLearning, contextClientId: clients[0].id }], getBusinessMany: async (_actor, ids) => { checked.push(...ids); return []; } },
    resolveBusinessActor: async () => ({ ref: 'pm', role: 'PROJECT_MANAGER', accountIds: [] }),
    sourceContext: { accounts: [{ clientId: clients[0].id, facts: [{ ...fact, id: 'old-fact' }], learnings: [oldLearning] }] }
  });
  assert.deepEqual(queries[0].excludeTopics, ['criterio']);
  assert.deepEqual(queries[0].excludeEntityTypes, ['persona']);
  assert.equal(accountQueries[0].ambiguous, true, 'the whole native catalog, not the selected snapshot, disambiguates legacy names');
  assert.equal(current.agency.facts[0].id, 'agency');
  assert.equal(current.accounts[0].learnings[0].id, 'legacy-x');
  const authorization = await current.revalidate();
  assert.deepEqual(authorization.businessAccess.readableIds, []);
  assert.ok(checked.includes('legacy-x'));
  assert.ok(checked.includes('old-fact'));
  assert.equal(authorization.viewer.id, 'pm');
});

test('agency context excludes private person fichas and criteria before its bounded SQL read', async () => {
  let query;
  const repo = createBriaAgencyFactRepository({ workspace: 'test', pool: { query: async (sql, params) => { query = { sql, params }; return { rows: [] }; } } });
  await repo.search(admin, { entity: 'Brain Studio', excludeTopics: ['criterio'], excludeEntityTypes: ['persona'], limit: 13 });
  assert.ok(query.sql.indexOf('NOT(f.topic') < query.sql.indexOf('LIMIT'));
  assert.ok(query.sql.indexOf('NOT(f.entity_type') < query.sql.indexOf('LIMIT'));
  assert.deepEqual(query.params.slice(-3), [['criterio'], ['persona'], 13]);
});

test('a source whose ACL changed cannot survive through independently cached prose', () => {
  const saved = reading();
  saved.signals.push({ id: 'VENCIDAS_SUBEN:person', subjectType: 'PERSON', subjectId: 'person' });
  saved.decisions.push({ id: `${day}:2`, subjectType: 'PERSON', subjectId: 'person', title: 'Una conclusión derivada de contexto reservado', evidence: ['VENCIDAS_SUBEN:person'], kind: 'VIGILAR', source: 'MODELO' });
  const view = projectReadingContext(saved, { ...context, factSourceIds: [], accounts: [{ ...context.accounts[0], facts: [] }] }, admin);
  assert.equal(view.contextRestricted, true);
  assert.doesNotMatch(JSON.stringify(view.decisions), /contexto reservado/);
});
