import assert from 'node:assert/strict';
import { briaAssistantTools } from '../../src/services/briaAssistantTools.js';
import { createBriaAgencyFactService } from '../../src/services/briaAgencyFactService.js';
import { createTeamLoadService } from '../../src/services/teamLoadService.js';
import { factKey } from '../../src/lib/briaAgencyFacts.js';
import { createTaskLifecycleFixture } from './briaTaskLifecycleFixture.js';

export const DECISION_INVESTIGATION_QUESTIONS = [
  '¿Cómo ves las próximas publicaciones de la agencia? Investiga lo que pueda cambiar la decisión, compárame alternativas y recomiéndame el siguiente paso. Conserva el seguimiento hasta verificar la publicación. No prepares ni ejecutes cambios ni contactes a nadie.',
  'Retoma ese asunto y comprueba qué cambió desde la última revisión. Dime cuál sería ahora el siguiente paso y conserva las condiciones de cierre. Todavía no prepares cambios ni contactes a nadie.'
];

// Production conversation, assistant, tools and memory adapter. Only storage and
// external boundaries are fictional. There is no browser session, as in WhatsApp.
export const createDecisionInvestigationFixture = (ai, { initialTurns = [] } = {}) => {
  const reads = [], writes = [], observed = [];
  const clients = [
    { id: 'cedro', name: 'Estudio Cedro Ficticio', slug: 'cedro', isArchived: false },
    { id: 'nacar', name: 'Laboratorio Nácar Ficticio', slug: 'nacar', isArchived: false }
  ];
  const author = { id: 'lifecycle-user', userId: 'lifecycle-user', role: 'ADMIN', isActive: true, sessionVersion: 0, modulePermissions: { bria: true }, teamMember: { isActive: true } };
  const person = { id: 'lifecycle-member', userId: author.id, name: 'Marina Duarte', isActive: true };
  const facts = [
    { id: 'cedro-october', clientId: 'cedro', statement: 'Octubre no está contratado. Sus nueve piezas son una propuesta sin autorización, no un compromiso de publicación.', validFrom: '2026-10-01', validUntil: '2026-10-31' },
    { id: 'nacar-october', clientId: 'nacar', statement: 'La campaña Lanzamiento nácar está contratada para el 27 de octubre a las 15:00 de Bogotá. La pieza final y sus datos técnicos requieren aprobación antes de publicar.', validFrom: '2026-10-01', validUntil: '2026-10-31' }
  ].map(row => ({ ...row, entity: clients.find(client => client.id === row.clientId).name, entityType: 'cliente', topic: 'acuerdo', certainty: 'CONFIRMADO', purpose: 'operacion', sensitivity: 'normal', origin: 'EQUIPO', actorName: person.name, updatedAt: '2026-10-23T16:00:00Z', status: 'ACTIVE', revision: 1, sources: [] }));
  const recordRead = (name, args, data) => { reads.push({ name, args: structuredClone(args) }); return structuredClone(data); };
  const forbidden = name => async () => { writes.push(name); throw new Error(`Unexpected side effect: ${name}`); };
  const boundary = methods => new Proxy(methods, { get: (object, key) => key in object ? object[key] : forbidden(String(key)) });
  const linkedPiece = { id: 'nacar-launch', planId: 'nacar-plan', objective: 'Lanzamiento nácar', format: 'Post', publishDate: new Date('2026-10-27T12:00:00Z'), publishTime: '15:00', status: 'APROBADO', revisionRequestedAt: new Date('2026-10-23T15:00:00Z'), finalAssetKey: 'fictional-final-design', _count: { finalAssets: 1 }, copyText: 'Presentación del nuevo producto.', captionText: 'Descubre nuestro nuevo producto.', internalNotes: 'El diseño está listo. Falta contrastar los datos técnicos con la ficha del producto antes de pedir aprobación final.', comments: 'El cliente pidió verificar la ficha técnica antes de publicar.', assetsLinks: [], mediaUrl: null, deletedAt: null, publications: [] };
  const target = { id: 'nacar-production', title: 'Preparar lanzamiento nácar', clientId: 'nacar', client: clients[1], assigneeId: person.id, assignee: person, status: 'PENDIENTE', dueDate: new Date('2026-10-23T17:00:00Z'), focusDeadlineAt: null, accumulatedWorkMs: 7200000, startedAt: null, isPrivate: false, creatorId: author.id, collaborators: [], viewers: [], contentItemId: linkedPiece.id, contentItem: linkedPiece, comments: 'Preparación interna del lanzamiento. La fecha de la tarea corresponde a terminar el material, no a publicar.', updatedAt: new Date('2026-10-24T16:00:00Z'), taskComments: [{ id: 'technical-blocker', content: 'La ficha técnica del producto sigue pendiente. El material cambió después de la primera aprobación; hay que validar esa nueva versión. La publicación sigue prevista para el 27 a las 15:00.', createdAt: new Date('2026-10-24T16:00:00Z'), author: { name: person.name } }] };
  linkedPiece.tasks = [{ id: target.id, status: target.status, dueDate: target.dueDate, assignee: person }];
  const plans = clients.map(client => ({ id: `${client.id}-plan`, clientId: client.id, client, month: 10, year: 2026, deletedAt: null, strategicObjectives: client.id === 'cedro' ? 'Propuesta de octubre pendiente de contratación y autorización.' : 'Presentar el producto aprobado en la fecha de campaña acordada.', status: 'EN_PROCESO', contentItems: client.id === 'cedro' ? Array.from({ length: 9 }, (_, index) => ({ id: `cedro-proposal-${index}`, planId: 'cedro-plan', objective: `Propuesta sin autorización ${index + 1}`, format: 'Post', publishDate: new Date(`2026-10-0${index + 1}T12:00:00Z`), status: 'PENDIENTE', copyText: '', captionText: '', finalAssetKey: null, comments: 'Propuesta de octubre sin contratación ni autorización.', tasks: [], publications: [], deletedAt: null })) : [
    ...Array.from({ length: 7 }, (_, index) => ({ id: `nacar-history-${index}`, planId: 'nacar-plan', objective: `Publicación anterior ${index + 1}`, format: 'Post', publishDate: new Date(`2026-10-0${index + 1}T12:00:00Z`), status: 'PUBLICADO', copyText: 'Contenido anterior aprobado.', captionText: 'Texto ya publicado.', finalAssetKey: `fictional-history-${index}`, comments: '', tasks: [], publications: [{ status: 'PUBLISHED' }], deletedAt: null })), linkedPiece
  ] }));
  linkedPiece.plan = { id: plans[1].id, clientId: 'nacar', deletedAt: null, client: clients[1], strategicObjectives: plans[1].strategicObjectives };
  const operations = clients.map(client => ({ ...client, agency: 'BRAIN', contract: { status: 'ACTIVO', startDate: '2026-01-01', endDate: client.id === 'cedro' ? '2026-09-30' : '2026-12-31', notes: client.id === 'cedro' ? 'Sin renovación para octubre' : 'Lanzamiento contratado para el 27 de octubre', deliverables: [{ format: 'Post', quantity: 8 }] }, evaluation: { level: 'red', reasons: [{ text: client.id === 'cedro' ? 'Nueve fechas pasadas en una parrilla propuesta' : 'Una tarea de producción vencida' }] }, cycles: { current: { label: 'Octubre de 2026', quota: 8, created: client.id === 'cedro' ? 9 : 8, reached: { aprobada: client.id === 'cedro' ? 0 : 8, publicada: client.id === 'cedro' ? 0 : 7 }, overdueItems: client.id === 'cedro' ? 9 : 0 } }, openTasks: client.id === 'nacar' ? [{ ...target, overdue: true }] : [] }));
  // A small storage double for the predicates these production readers issue.
  // It applies scope/date/status filters instead of returning every seeded row.
  const matches = (row, where = {}) => Object.entries(where).every(([key, value]) => {
    if (key === 'OR') return value.some(condition => matches(row, condition));
    if (key === 'AND') return [value].flat().every(condition => matches(row, condition));
    if (key === 'NOT') return !matches(row, value);
    const actual = row?.[key];
    if (value == null || typeof value !== 'object' || value instanceof Date) return value instanceof Date ? +new Date(actual) === +value : actual === value;
    if ('in' in value) return value.in.includes(actual);
    if ('not' in value) return actual !== value.not;
    if ('contains' in value) return factKey(actual).includes(factKey(value.contains));
    if ('equals' in value) return factKey(actual) === factKey(value.equals);
    if ('lt' in value) return actual != null && +new Date(actual) < +new Date(value.lt);
    if ('some' in value) return (actual || []).some(item => matches(item, value.some));
    return matches(actual, value);
  });
  const tasks = [target];
  const records = (rows, name) => ({
    findMany: async ({ where = {}, skip = 0, take = rows.length } = {}) => recordRead(name, where, rows.filter(row => matches(row, where)).slice(skip, skip + take)),
    findUnique: async ({ where }) => recordRead(name, where, rows.find(row => matches(row, where)) || null),
    count: async ({ where = {} } = {}) => rows.filter(row => matches(row, where)).length
  });
  const clientDb = records(clients, 'client');
  const taskDb = { ...records(tasks, 'task-search'), findUnique: async ({ where }) => recordRead('task-detail', where, tasks.find(task => matches(task, where)) || null) };
  const memberDb = records([person], 'member');
  const factsService = createBriaAgencyFactService({ db: { user: { findUnique: async () => author }, client: clientDb, teamMember: memberDb }, repository: {
    searchClients: async (_access, selected, limit) => recordRead('account-memory', selected.map(client => client.id), selected.flatMap(client => facts.filter(row => row.clientId === client.id).slice(0, limit))),
    search: async (_access, args) => {
      const words = factKey(args.query).match(/[\p{L}\p{N}]{3,}/gu) || [];
      const selected = facts.filter(row => (!args.clientId || row.clientId === args.clientId) && (!args.entity || factKey(row.entity) === factKey(args.entity)) && (!args.topic || row.topic === args.topic) && (args.clientId || args.entity || words.some(word => factKey(`${row.entity} ${row.topic} ${row.statement}`).split(/\W+/u).some(token => token.startsWith(word)))));
      return recordRead('memory', args, selected.slice(0, args.limit || 25));
    },
    openQuestions: async () => [], getMany: async (_access, ids) => facts.filter(row => ids.includes(row.id))
  } });
  const rhythm = boundary({ get: async ({ days = 30 } = {}) => recordRead('rhythm', { days }, {
    period: { days }, team: { closed: 0, measured: 0, coverage: 0 },
    people: [{ personId: person.id, personName: person.name, closed: 0, measured: 0, coverage: 0, byType: [], findings: [] }], profiles: [], tasks: {},
    hours: [{ personId: person.id, personName: person.name, days: [{ day: '2026-10-23', measuredMs: target.accumulatedWorkMs, declaredMs: 0 }], weeks: [{ week: '2026-10-19', measuredMs: target.accumulatedWorkMs, declaredMs: 0 }] }], historyIncomplete: false, hoursIncomplete: false
  }) });
  const load = createTeamLoadService({ db: { teamMember: memberDb, task: taskDb }, rhythm, now: () => new Date('2026-10-24T17:00:00Z') });
  const fixture = createTaskLifecycleFixture({ generate: async request => {
    for (const item of request.input || []) if (item.type === 'function_call_output' && !observed.some(row => row.callId === item.call_id)) {
      observed.push({ callId: item.call_id, data: JSON.parse(item.output) });
    }
    return ai.generate(request);
  } }, {
    initialTurns,
    assistantTools: briaAssistantTools,
    knowledge: boundary({ list: async () => [], businessContext: async (_user, selected) => ({ agency: { state: 'CONSULTADO', partial: false, learnings: [] }, accounts: selected.map(client => ({ clientId: client.id, state: 'CONSULTADO', partial: false, learnings: [] })) }) }),
    assistantOptions: { agencyFacts: factsService, taskDrafts: boundary({}), dispatchDrafts: boundary({}), deleteDrafts: boundary({}), actions: boundary({}), dailyReading: boundary({ explain: async () => ({ propuestas: [], lectura: null }) }) },
    assistantContext: {
      getTasks: async id => recordRead('task-list', { clientId: id }, tasks.filter(task => task.clientId === id)),
      operations: boundary({ listOperations: async () => recordRead('portfolio', {}, operations), getOperation: async slug => { const row = operations.find(client => client.slug === slug); if (!row) throw Object.assign(new Error('No encontramos ese cliente ficticio.'), { status: 404 }); return recordRead('operation', { slug }, row); } }),
      readActivity: async () => recordRead('activity', {}, []),
      load: boundary({ get: async args => recordRead('load', args, await load.get(args)) }), rhythm,
      searchMemory: async args => recordRead('meeting-memory', args, []), searchAgency: async (_user, query) => recordRead('document-search', { query }, []), readAgency: async (_user, id, offset) => recordRead('document-detail', { id, offset }, null)
    },
    extraDb: {
      client: clientDb, teamMember: memberDb, task: taskDb,
      contentPlan: { findFirst: async ({ where }) => recordRead('plan', where, plans.find(plan => matches(plan, where)) || null) },
      contentItem: { findMany: async ({ where, skip = 0, take }) => {
        const plan = plans.find(row => row.id === where.planId);
        const selected = (plan?.contentItems || []).filter(item => matches({ ...item, plan }, where)).slice(skip, skip + take);
        return recordRead('piece-detail', where, selected.map(item => ({ ...item, plan: item.plan || { id: plan.id, client: plan.client, strategicObjectives: plan.strategicObjectives } })));
      } },
      socialPublication: { findMany: async args => recordRead('scheduled-publications', args.where, []) },
      clientEditorialCriterion: { findMany: async () => [] }, contentPlanReviewFinding: { findMany: async () => [] }
    }
  });
  return { ...fixture, reads, writes, observed,
    advanceEvidence() {
      linkedPiece.revisionRequestedAt = null;
      linkedPiece.internalNotes = 'Ficha técnica recibida y datos validados. La nueva versión recibió aprobación del cliente; queda programar la publicación.';
      linkedPiece.comments = 'Cliente aprobó esta versión con sus datos técnicos.';
      target.taskComments.unshift({ id: 'technical-received', content: 'Llegó la ficha técnica; validé los datos y el cliente aprobó el material final. Todavía no está programado ni publicado.', createdAt: new Date('2026-10-24T17:00:00Z'), author: { name: person.name } });
      target.updatedAt = new Date('2026-10-24T17:00:00Z');
    }
  };
};

export const assertDecisionInvestigationAnswer = (fixture, answer) => {
    assert.deepEqual(answer.failures, []);
    assert.equal(answer.pendingAction, undefined);
    assert.deepEqual(fixture.writes, []);
    assert.equal(fixture.created.length, 0);
    assert.ok(answer.investigation, 'the requested follow-up must be stored');
    assert.deepEqual(answer.investigation.pendientesDelRecorrido || [], []);
    assert.equal(answer.investigation.ejecucionAutorizada, false);
    assert.equal(answer.investigation.seguimientoAutomatico, false);
    assert.ok(answer.investigation.alternativas.length >= 2 && answer.investigation.recomendada);
    assert.ok(answer.investigation.sources.some(source => source.kind === 'hecho_agencia' && source.id === 'cedro-october'));
    assert.ok(answer.investigation.sources.some(source => source.kind === 'tarea' && source.id === 'nacar-production'));
    assert.ok(answer.investigation.sources.some(source => source.kind === 'pieza' && source.id === 'nacar-launch'));
    assert.ok(answer.investigation.relato.length);
    assert.ok(answer.text.startsWith(answer.investigation.relato[0].texto));
    assert.ok(answer.text.length < 4000);
    assert.doesNotMatch(answer.text, /Consultado en|Costo o efecto:|Datos para aprobar|Por aclarar:/u);
};

// Accepting an already returned first answer permits an external budget guard to
// stop between phases without repeating the paid conversation.
export const runDecisionInvestigationScenario = async (fixture, { first: priorFirst } = {}) => {
  const first = priorFirst || await fixture.send(DECISION_INVESTIGATION_QUESTIONS[0]);
  assertDecisionInvestigationAnswer(fixture, first);
  assert.equal(first.investigation.estado, 'ABIERTO');
  assert.match(first.text, /23|veintitrés/iu, 'internal due date must be distinguished');
  assert.match(first.text, /27|veintisiete/iu, 'future publication date must be retained');
  assert.match(first.text, /ficha técnica/iu, 'must investigate the blocker already recorded in the task');
  assert.match(first.text, /aprobaci[oó]n|aprobad/iu);
  return runDecisionInvestigationContinuation(fixture, first);
};

// A saved answer may contain an earlier read failure. Resuming proves only the
// new turn; it must not relabel that historical first phase as successful.
export const runDecisionInvestigationContinuation = async (fixture, first) => {
  assert.ok(first.investigation?.id);
  const firstReads = fixture.reads.length;
  fixture.advanceEvidence();
  const second = await fixture.send(DECISION_INVESTIGATION_QUESTIONS[1]);
  assertDecisionInvestigationAnswer(fixture, second);
  assert.equal(second.investigation.id, first.investigation.id);
  assert.equal(second.investigation.revision, first.investigation.revision + 1);
  assert.deepEqual(second.investigation.comprobaciones.map(row => [row.id, row.criterio]), first.investigation.comprobaciones.map(row => [row.id, row.criterio]));
  assert.notEqual(second.investigation.estado, 'RESUELTO', 'approval and received input do not prove publication');
  assert.ok(second.investigation.comprobaciones.some(row => row.resultado !== 'CUMPLIDO'));
  assert.ok(fixture.reads.slice(firstReads).some(row => row.name === 'task-detail'));
  assert.ok(fixture.reads.slice(firstReads).some(row => row.name === 'piece-detail'));
  assert.match(second.text, /program|public/iu);
  assert.notEqual(second.text, first.text, 'continuation must explain changed evidence');
  assert.ok(fixture.modelRequests.every(request => !request.tools?.includes('operar_en_plataforma')), 'this acceptance uses the WhatsApp catalog without a browser session');
  return { first, second };
};
