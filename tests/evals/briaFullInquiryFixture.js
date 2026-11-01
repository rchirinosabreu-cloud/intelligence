import assert from 'node:assert/strict';
import { briaAssistantTools } from '../../src/services/briaAssistantTools.js';
import { createTaskLifecycleFixture } from './briaTaskLifecycleFixture.js';

// Catálogo completo del servicio real. Solo datos y fronteras externas simulados.
// Ninguna frase del caso forma parte de las instrucciones de producción.
export const createFullInquiryFixture = (ai, { initialTurns = [], overview = false, assistantOptions = {}, conversationOptions = {}, members = [] } = {}) => {
  const client = { id: 'lifecycle-client', name: 'Taller Aurora Ficticio', slug: 'aurora', isArchived: false };
  const base = { clientId: client.id, client, assignee: { id: 'lifecycle-member', name: 'Marina Duarte', userId: 'lifecycle-user' }, isPrivate: false, collaborators: [], viewers: [], accumulatedWorkMs: 0 };
  const target = { ...base, id: 'feature-delivery', title: 'Solicitud de actualizaciones y nuevas funcionalidades de la plataforma de gestión', status: 'PENDIENTE', dueDate: '2026-10-20T17:00:00Z', comments: 'Entrega del portal interno: permisos de clientes y exportación de reportes. Falta validar la exportación en staging.', updatedAt: '2026-10-24T15:00:00Z', taskComments: [{ id: 'blocker', content: 'La exportación falla con cuentas sin movimientos. Nora debe revisar el caso; las pruebas de aceptación siguen pendientes. No hay una nueva fecha acordada.', createdAt: '2026-10-24T15:00:00Z', author: { name: 'Marina Duarte' } }] };
  const tasks = [
    { ...base, id: 'social', title: 'Comunicar novedades en redes sociales', status: 'EN_CURSO', dueDate: '2026-10-26T17:00:00Z', taskComments: [] },
    target,
    { ...base, id: 'invoice', title: 'Actualizar datos de facturación', status: 'PENDIENTE', dueDate: '2026-10-27T17:00:00Z', taskComments: [] }
  ];
  const operation = { ...client, agency: 'BRAIN', cycles: overview ? { current: { label: 'Octubre de 2026', quota: 2, created: 2, reached: { aprobada: 2, publicada: 1 }, overdueItems: 1 } } : {}, contract: null, openTasks: [], evaluation: overview ? { level: 'red', reasons: [{ text: 'Una pieza aprobada sigue sin publicar tras su fecha prevista.' }] } : { level: 'gray', reasons: [] } };
  const editorialPlan = overview ? { id: 'overview-plan', month: 10, year: 2026, status: 'EN_PROCESO', client, contentItems: [
    { id: 'published', objective: 'Presentación del taller', format: 'Post', publishDate: '2026-10-22', status: 'PUBLICADO', copyText: 'Texto validado', captionText: 'Texto público', finalAssetKey: 'fixture-one', comments: [], publications: [{ status: 'PUBLISHED' }], tasks: [] },
    { id: 'overdue', objective: 'Servicios del taller', format: 'Post', publishDate: '2026-10-23', status: 'APROBADO', copyText: 'Texto validado', captionText: 'Texto público', finalAssetKey: 'fixture-two', comments: [], publications: [], tasks: [] }
  ] } : null;
  if (overview) operation.openTasks = tasks.map(task => ({ ...task, overdue: String(task.dueDate).slice(0, 10) < '2026-10-24' }));
  const reads = [], writes = [];
  const record = (name, value) => async () => { reads.push(name); return structuredClone(value); };
  const forbidden = name => async () => { writes.push(name); throw new Error(`Unexpected mutation: ${name}`); };
  const service = methods => new Proxy(methods, { get: (object, key) => key in object ? object[key] : forbidden(String(key)) });
  const matches = where => tasks.filter(task => (!where?.clientId || task.clientId === where.clientId) && (!where?.status?.in || where.status.in.includes(task.status)) && (!where?.id?.in || where.id.in.includes(task.id)) && (where?.assigneeId === undefined || task.assigneeId === where.assigneeId));
  const history = [{ id: 'old-invoice', title: 'Aviso de facturación de febrero', content: 'Aviso de renovación de febrero de 2026; no demuestra la vigencia del servicio de hoy.', authority: 'HISTORICO' }];
  const fixture = createTaskLifecycleFixture(ai, {
    initialTurns, conversationOptions,
    assistantTools: briaAssistantTools,
    session: { token: 'fictional-no-network' },
    knowledge: service({ list: record('knowledge', []), businessContext: async (_user, clients) => {
      reads.push('business-context');
      return { agency: { state: 'CONSULTADO', partial: false, learnings: [] }, accounts: clients.map(client => ({ clientId: client.id, state: 'CONSULTADO', partial: false, learnings: [] })) };
    } }),
    assistantOptions: {
      taskDrafts: service({}), dispatchDrafts: service({}), deleteDrafts: service({}), actions: service({}),
      usage: service({ summary: record('usage', {}) }), platform: service({ call: async ({ method }) => { assert.equal(method, 'GET'); return { ok: false, status: 404, error: 'No hay información adicional en esa ruta de esta cuenta ficticia. Usa las lecturas propias de Gestión, Actividad y Carga.' }; } }),
      agencyFacts: service({ contextForClients: async (_user, clients) => { reads.push('account-context'); return { cuentas: clients.map(row => ({ clientId: row.id, estado: 'CONSULTADO', parcial: false, hechos: [] })) }; }, consult: record('facts', { hechos: [], dudas: [] }), recall: record('recall', { hechos: [], cuentas: [] }), howToWorkWith: record('person-context', { hechos: [] }) }),
      vault: service({ list: record('vault', []) }), mail: service({ recentImportant: record('mail', []), readMessage: record('message', null) }),
      permissions: service({}), dailyReading: service({ explain: record('daily', { propuestas: [] }) }), serviceHealth: service({ getSummary: record('health', { overall: 'GREEN', troubled: [] }) }), ...assistantOptions
    },
    assistantContext: {
      getTasks: async id => { assert.equal(id, client.id); reads.push('tasks'); return structuredClone(tasks); },
      readActivity: record('activity', [{ id: 'lifecycle-nora', name: 'Nora Sáenz', status: 'REUNION', currentEvent: { id: 'meeting', title: 'Revisión interna', type: 'MEETING', startAt: '2026-10-24T16:00:00Z', endAt: '2026-10-24T18:00:00Z' } }]),
      load: service({ get: record('load', { today: '2026-10-24', days: [], capacityMs: 28800000, people: [{ personId: 'lifecycle-member', personName: 'Marina Duarte', overdue: { count: 1 }, undated: { count: 0 }, cells: [] }], forecast: null }) }),
      rhythm: service({ get: record('rhythm', { period: { days: 30 }, team: { closed: 0, measured: 0, coverage: 0 }, people: [], profiles: [], hours: [] }) }),
      operations: service({ getOperation: record('operation', operation), listOperations: record('portfolio', overview ? [operation] : []) }),
      searchMemory: record('minutes', [{ sourceRecordId: 'old-meeting', title: 'Reunión del 19 de octubre', subtitle: '2026-10-19', section: 'Resumen', content: 'Se habló de centralizar archivos; no se acordaron fechas de desarrollo.' }]),
      searchAgency: record('history', history), readAgency: record('document', history[0])
    },
    extraDb: {
      client: { findMany: async ({ where }) => {
        const term = where?.name?.contains || where?.OR?.find(row => row.name)?.name.contains || '';
        return client.name.toLowerCase().includes(term.toLowerCase()) || where?.OR?.some(row => row.id === client.id) ? [client] : [];
      }, findUnique: record('client', client) },
      ...(members.length ? { teamMember: { findMany: async ({ where }) => members.filter(member => !where?.OR || where.OR.some(clause => member.name.toLowerCase().includes(String(clause.name?.contains || clause.email?.equals || '\u0000').toLowerCase()))), findUnique: async ({ where }) => members.find(member => member.id === where.id || where.userId && member.userId === where.userId) } } : {}),
      task: { findMany: async ({ where, take }) => { reads.push('tasks'); return structuredClone(matches(where).slice(0, take)); }, count: async ({ where }) => matches(where).length,
        findUnique: async ({ where }) => { reads.push(`detail:${where.id}`); return structuredClone(tasks.find(row => row.id === where.id) || null); } },
      contentPlan: { findFirst: record('content', editorialPlan), findMany: record('content-list', editorialPlan ? [editorialPlan] : []) },
      clientEditorialCriterion: { findMany: record('criteria', []) }, contentPlanReviewFinding: { findMany: record('findings', []) }, socialPublication: { findMany: record('publications', []) }
    }
  });
  return { ...fixture, reads, writes, tasks, client };
};

export const runAgencyOverviewScenario = async fixture => {
  const answer = await fixture.send('¿Cómo ves el panorama general de la agencia y el cumplimiento de las parrillas?');
  assert.deepEqual(fixture.writes, []);
  assert.equal(fixture.created.length, 0);
  assert.equal(answer.pendingAction, undefined);
  assert.equal(answer.investigation, undefined, 'an overview does not request a saved follow-up');
  assert.deepEqual(answer.failures, []);
  assert.ok(fixture.reads.includes('portfolio'), 'must read agency-wide operational data');
  assert.ok(fixture.reads.includes('content'), 'must verify the editorial plan');
  assert.ok(answer.text.length > 50);
  assert.match(answer.text, /publica|publicó|publicaci/iu, 'the answer must discuss publication compliance');
  assert.doesNotMatch(answer.text, /No pude responder ahora|No se pudo interpretar el alcance/);
  assert.ok(fixture.modelRequests.find(request => request.tools?.length)?.tools.length >= 50);
};

export const runFullInquiryScenario = async (fixture, { first: priorFirst } = {}) => {
  const first = priorFirst || await fixture.send('Me preocupa que no lleguemos a tiempo con la entrega de nuevas funcionalidades de la plataforma del Taller Aurora Ficticio. Investiga cómo está realmente la situación, qué puede impedir cumplir y qué información falta. Propón alternativas, explícame cuál recomiendas y por qué. Deja el asunto en seguimiento con condiciones claras para saber cuándo está resuelto. Por ahora no prepares ni ejecutes cambios ni contactes a nadie.');
  const check = result => {
    assert.deepEqual(fixture.writes, [], 'no side effects while investigating');
    assert.equal(result.pendingAction, undefined);
    assert.ok(result.investigation, 'follow-up is actually persisted');
    assert.deepEqual(result.investigation.pendientesDelRecorrido || [], [], 'the investigation must finish its requested workflow');
    assert.ok(result.investigation.sources.some(source => source.kind === 'tarea' && source.id === 'feature-delivery'), 'semantic target matched and private detail authorized');
    assert.ok(result.investigation.alternativas.length >= 2 && result.investigation.recomendada);
    assert.notEqual(result.investigation.estado, 'RESUELTO');
    assert.ok(result.investigation.relato?.length, 'the real model must compose a conversational synthesis, not use the legacy field dump');
    assert.ok(result.text.startsWith(result.investigation.relato[0].texto));
    assert.doesNotMatch(result.text, /Consultado en|Beneficio:|Costo o efecto:|Por aclarar:/u, 'internal record labels should not be repeated to the person');
    assert.ok(result.text.length < 5500, 'a concise explanation while retaining the complete internal record');
    assert.match(result.text, /exportaci[oó]n/iu, 'must discuss the actual blocker, not just list source headers');
    assert.match(result.text, /20 de octubre|20\/10\/2026/iu, 'must report the registered deadline');
    assert.doesNotMatch(result.text, /18:00|6\s*(?:p\.?\s*m\.?|de la tarde)/iu);
    assert.doesNotMatch(result.text, /(?:franja|reuni[oó]n)[^.\n]*(?:ya\s+(?:transcurri[oó]|termin[oó])|finaliz[oó])/iu, 'the fixture meeting is still active at consultation time');
    assert.ok(result.investigation.incertidumbres.every(text => !result.investigation.consultas.some(row => row.id === text)), 'uncertainties are human questions, not receipt ids');
    assert.deepEqual(result.failures, []);
  };
  check(first);
  const count = fixture.reads.filter(name => name === 'detail:feature-delivery').length;
  const second = await fixture.send('Retoma ese asunto: ¿el hecho de tener un responsable ya elimina el riesgo de entrega? Vuelve a comprobarlo y conserva las condiciones que dejamos. No prepares cambios.');
  check(second);
  assert.equal(second.investigation.id, first.investigation.id);
  assert.deepEqual(second.investigation.comprobaciones.map(row => [row.id, row.criterio]), first.investigation.comprobaciones.map(row => [row.id, row.criterio]));
  assert.ok(fixture.reads.filter(name => name === 'detail:feature-delivery').length > count);
  const offered = fixture.modelRequests.find(request => request.tools?.length)?.tools || [];
  assert.ok(offered.length >= 50, 'full production catalog, not a shortlist');
  for (const name of ['mapa_de_plataforma', 'operar_en_plataforma', 'guardar_en_memoria', 'memoria_de_agencia', 'carga_del_equipo', 'leer_pendiente', 'actualizar_seguimiento']) assert.ok(offered.includes(name), name);
  assert.equal(fixture.created.length, 0);
};
