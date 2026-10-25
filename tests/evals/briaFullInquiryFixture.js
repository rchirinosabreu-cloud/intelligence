import assert from 'node:assert/strict';
import { briaAssistantTools } from '../../src/services/briaAssistantTools.js';
import { createTaskLifecycleFixture } from './briaTaskLifecycleFixture.js';

// Catálogo completo del servicio real. Solo datos y fronteras externas simulados.
// Ninguna frase del caso forma parte de las instrucciones de producción.
export const createFullInquiryFixture = (ai, { initialTurns = [] } = {}) => {
  const client = { id: 'lifecycle-client', name: 'Taller Aurora Ficticio', slug: 'aurora', isArchived: false };
  const base = { clientId: client.id, client, assignee: { id: 'lifecycle-member', name: 'Marina Duarte', userId: 'lifecycle-user' }, isPrivate: false, collaborators: [], viewers: [], accumulatedWorkMs: 0 };
  const target = { ...base, id: 'feature-delivery', title: 'Solicitud de actualizaciones y nuevas funcionalidades de la plataforma de gestión', status: 'PENDIENTE', dueDate: '2026-10-20T17:00:00Z', comments: 'Entrega del portal interno: permisos de clientes y exportación de reportes. Falta validar la exportación en staging.', updatedAt: '2026-10-24T15:00:00Z', taskComments: [{ id: 'blocker', content: 'La exportación falla con cuentas sin movimientos. Nora debe revisar el caso; las pruebas de aceptación siguen pendientes. No hay una nueva fecha acordada.', createdAt: '2026-10-24T15:00:00Z', author: { name: 'Marina Duarte' } }] };
  const tasks = [
    { ...base, id: 'social', title: 'Comunicar novedades en redes sociales', status: 'EN_CURSO', dueDate: '2026-10-26T17:00:00Z', taskComments: [] },
    target,
    { ...base, id: 'invoice', title: 'Actualizar datos de facturación', status: 'PENDIENTE', dueDate: '2026-10-27T17:00:00Z', taskComments: [] }
  ];
  const reads = [], writes = [];
  const record = (name, value) => async () => { reads.push(name); return structuredClone(value); };
  const forbidden = name => async () => { writes.push(name); throw new Error(`Unexpected mutation: ${name}`); };
  const service = methods => new Proxy(methods, { get: (object, key) => key in object ? object[key] : forbidden(String(key)) });
  const matches = where => tasks.filter(task => (!where?.clientId || task.clientId === where.clientId) && (!where?.status?.in || where.status.in.includes(task.status)));
  const history = [{ id: 'old-invoice', title: 'Aviso de facturación de febrero', content: 'Aviso de renovación de febrero de 2026; no demuestra la vigencia del servicio de hoy.', authority: 'HISTORICO' }];
  const fixture = createTaskLifecycleFixture(ai, {
    initialTurns,
    assistantTools: briaAssistantTools,
    session: { token: 'fictional-no-network' },
    knowledge: service({ list: record('knowledge', []) }),
    assistantOptions: {
      taskDrafts: service({}), dispatchDrafts: service({}), deleteDrafts: service({}), actions: service({}),
      usage: service({ summary: record('usage', {}) }), platform: service({ call: async ({ method }) => { assert.equal(method, 'GET'); return { ok: false, status: 404, error: 'No hay información adicional en esa ruta de esta cuenta ficticia. Usa las lecturas propias de Gestión, Actividad y Carga.' }; } }),
      agencyFacts: service({ consult: record('facts', { hechos: [], dudas: [] }), howToWorkWith: record('person-context', { hechos: [] }) }),
      vault: service({ list: record('vault', []) }), mail: service({ recentImportant: record('mail', []), readMessage: record('message', null) }),
      permissions: service({}), dailyReading: service({ explain: record('daily', { propuestas: [] }) }), serviceHealth: service({ getSummary: record('health', { overall: 'GREEN', troubled: [] }) })
    },
    assistantContext: {
      getTasks: async id => { assert.equal(id, client.id); reads.push('tasks'); return structuredClone(tasks); },
      readActivity: record('activity', [{ id: 'lifecycle-nora', name: 'Nora Sáenz', status: 'REUNION', currentEvent: { id: 'meeting', title: 'Revisión interna', type: 'MEETING', startAt: '2026-10-24T16:00:00Z', endAt: '2026-10-24T18:00:00Z' } }]),
      load: service({ get: record('load', { today: '2026-10-24', days: [], capacityMs: 28800000, people: [{ personId: 'lifecycle-member', personName: 'Marina Duarte', overdue: { count: 1 }, undated: { count: 0 }, cells: [] }], forecast: null }) }),
      rhythm: service({ get: record('rhythm', { period: { days: 30 }, team: { closed: 0, measured: 0, coverage: 0 }, people: [], profiles: [], hours: [] }) }),
      operations: service({ getOperation: record('operation', { ...client, cycles: {}, contract: null, openTasks: [], evaluation: { level: 'gray', reasons: [] } }), listOperations: record('portfolio', []) }),
      searchMemory: record('minutes', [{ sourceRecordId: 'old-meeting', title: 'Reunión del 19 de octubre', subtitle: '2026-10-19', section: 'Resumen', content: 'Se habló de centralizar archivos; no se acordaron fechas de desarrollo.' }]),
      searchAgency: record('history', history), readAgency: record('document', history[0])
    },
    extraDb: {
      client: { findMany: async ({ where }) => {
        const term = where?.name?.contains || where?.OR?.find(row => row.name)?.name.contains || '';
        return client.name.toLowerCase().includes(term.toLowerCase()) || where?.OR?.some(row => row.id === client.id) ? [client] : [];
      }, findUnique: record('client', client) },
      task: { findMany: async ({ where }) => { reads.push('tasks'); return structuredClone(matches(where)); }, count: async ({ where }) => matches(where).length,
        findUnique: async ({ where }) => { reads.push(`detail:${where.id}`); return structuredClone(tasks.find(row => row.id === where.id) || null); } },
      contentPlan: { findFirst: record('content', null), findMany: record('content-list', []) },
      clientEditorialCriterion: { findMany: record('criteria', []) }, contentPlanReviewFinding: { findMany: record('findings', []) }, socialPublication: { findMany: record('publications', []) }
    }
  });
  return { ...fixture, reads, writes };
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
