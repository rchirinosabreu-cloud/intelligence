import test from 'node:test';
import assert from 'node:assert/strict';
import { briaAssistantTools, toolByName } from '../src/services/briaAssistantTools.js';

// Cada herramienta de Bria aplica el mismo permiso que la pantalla que muestra ese dato. Una persona sin
// el módulo no tiene la herramienta; con el módulo, ve exactamente lo que vería en la pantalla.

const TODAY = '2026-10-06';
const NOW = new Date('2026-10-06T15:00:00.000Z'); // 10:00 en Bogotá
const noon = (key) => new Date(`${key}T12:00:00.000Z`);

const editor = { userId: 'u-sara', role: 'EDITOR', modulePermissions: {} };
const editorWithModules = { userId: 'u-sara', role: 'EDITOR', modulePermissions: { gestion: true, parrillas: true } };
const pm = { userId: 'u-kamila', role: 'PROJECT_MANAGER', modulePermissions: { manager: true } };
const pmWithoutManager = { userId: 'u-kamila', role: 'PROJECT_MANAGER', modulePermissions: {} };
const person = { userId: 'u-sara', name: 'Sara', memberId: 'm-sara' };

const allowedFor = (who) => briaAssistantTools.filter((tool) => tool.allowed(who)).map((tool) => tool.name).sort();

test('each tool opens with the permission of its screen', () => {
  assert.deepEqual(allowedFor(editor), ['buscar_cliente', 'mis_tareas']);
  assert.deepEqual(allowedFor(editorWithModules), ['buscar_cliente', 'criterios_y_hallazgos', 'leer_piezas_de_parrilla', 'mis_tareas', 'parrilla_de_cliente', 'publicaciones_programadas', 'tareas_de_cliente']);
  assert.deepEqual(allowedFor(pmWithoutManager), ['buscar_cliente', 'cartera_de_operacion', 'mis_tareas', 'operacion_de_cliente']);
  // Ritmo del equipo (9 de octubre de 2026) tiene la misma puerta que la memoria de reuniones: la de Manager.
  assert.deepEqual(allowedFor(pm), ['buscar_cliente', 'carga_del_equipo', 'cartera_de_operacion', 'memoria_de_reuniones', 'mis_tareas', 'operacion_de_cliente', 'ritmo_del_equipo']);
  assert.deepEqual(allowedFor({ role: 'ADMIN' }), ['buscar_cliente', 'carga_del_equipo', 'cartera_de_operacion', 'criterios_y_hallazgos', 'leer_piezas_de_parrilla', 'memoria_de_reuniones', 'mis_tareas', 'operacion_de_cliente', 'parrilla_de_cliente', 'publicaciones_programadas', 'ritmo_del_equipo', 'tareas_de_cliente']);
  for (const tool of briaAssistantTools) {
    assert.equal(tool.parameters.type, 'object', `${tool.name} declara sus parámetros`);
    assert.ok(tool.description.length > 20, `${tool.name} explica para qué sirve`);
  }
});

// Mapa de carga (10 de octubre de 2026): la misma puerta que Ritmo; horas por persona y día, con sus tareas.
test('carga_del_equipo tells who is loaded and who has room, by person if asked, and never judges', async () => {
  const H = 3_600_000;
  const load = { get: async () => ({ today: '2026-10-09', days: ['2026-10-09', '2026-10-13'], capacityMs: 8 * H, people: [
    { personId: 'b', personName: 'Brayan Torres', weekMs: 12 * H, overdue: { count: 0, ms: 0, taskIds: [] }, undated: { count: 1 }, cells: [{ day: '2026-10-09', ms: 0, count: 0, level: 'libre', tasks: [] }, { day: '2026-10-13', ms: 12 * H, count: 3, level: 'excedida', tasks: [{ id: 'o1', title: 'Video Nutresa', clientName: 'Nutresa', ms: 4 * H, source: 'persona' }] }] },
    { personId: 'h', personName: 'Helen Hernández', weekMs: H, overdue: { count: 2, ms: H, taskIds: ['o4', 'o5'] }, undated: { count: 0 }, cells: [{ day: '2026-10-09', ms: H, count: 1, level: 'libre', tasks: [{ id: 'o6', title: 'Post Alpina', clientName: null, ms: H, source: 'supuesto' }] }, { day: '2026-10-13', ms: 0, count: 0, level: 'libre', tasks: [] }] }
  ], signals: [{ kind: 'DIA_EXCEDIDO', personId: 'b', message: 'Brayan Torres tiene 12 h estimadas el 13 de octubre en 3 tareas.' }, { kind: 'CON_ESPACIO', personId: 'h', message: 'Helen Hernández tiene 1 h comprometida.' }] }) };
  const all = await toolByName('carga_del_equipo').run({}, { load, user: pm, person, today: TODAY });
  assert.deepEqual([all.data.hoy, all.data.diasHabiles, all.data.jornada], ['9 de octubre', 2, '8 h']);
  assert.deepEqual(all.data.personas[0].dias[0], { dia: '13 de octubre', horas: '12 h', nivel: 'excedida', tareas: ['Video Nutresa (Nutresa) · 4 h'] });
  assert.deepEqual(all.data.personas[1].dias[0].tareas, ['Post Alpina · 1 h supuesto']);
  assert.equal(all.data.senales.length, 2);
  assert.match(all.data.instruccion, /nunca de desempeño/);
  assert.deepEqual(all.sources, [{ kind: 'ritmo', id: 'carga-2026-10-09', label: 'Mapa de carga', url: '/manager?tab=ritmo' }]);
  const one = await toolByName('carga_del_equipo').run({ persona: 'helen' }, { load, user: pm, person, today: TODAY });
  assert.deepEqual(one.data.personas.map((p) => p.nombre), ['Helen Hernández']);
  assert.deepEqual(one.data.senales, ['Helen Hernández tiene 1 h comprometida.']);
});

test('buscar_cliente finds by part of the name, without accents mattering to the search, and never archived first', async () => {
  const queries = [];
  const db = { client: { findMany: async (args) => { queries.push(args); return [
    { id: 'c1', name: 'Endova', slug: 'endova', status: 'ACTIVO', isArchived: false, responsible: { name: 'Jarlan' }, projectManager: null },
    { id: 'c2', name: 'Endova Viejo', slug: 'endova-viejo', status: 'ACTIVO', isArchived: true, responsible: null, projectManager: { name: 'Kamila' } }
  ]; } } };
  const result = await toolByName('buscar_cliente').run({ nombre: '  endo ' }, { db, user: editor, person, today: TODAY });
  assert.equal(queries[0].where.name.contains, 'endo');
  assert.equal(queries[0].where.name.mode, 'insensitive');
  assert.equal(queries[0].take, 8);
  assert.deepEqual(result.data.clientes[0], { id: 'c1', nombre: 'Endova', slug: 'endova', estado: 'ACTIVO', archivado: false, communityManager: 'Jarlan', projectManager: null });
  assert.equal(result.data.clientes[1].archivado, true);
  assert.deepEqual((await toolByName('buscar_cliente').run({ nombre: '' }, { db, user: editor, person, today: TODAY })).data, { clientes: [] });
});

// Rodny, 9 de octubre de 2026: «que entiende si uno dice una palabra mal». Sin coincidencia exacta, se compara
// contra todos los clientes tolerando letras cambiadas, y Bria sabe que fue una aproximación.
test('buscar_cliente understands a misspelled name, and says it was an approximation', async () => {
  const all = [
    { id: 'c1', name: 'Aristea', slug: 'aristea', status: 'ACTIVO', isArchived: false, responsible: null, projectManager: null },
    { id: 'c2', name: 'Abitat Insurance', slug: 'abitat', status: 'ACTIVO', isArchived: false, responsible: null, projectManager: null },
    { id: 'c3', name: 'Aristea Vieja', slug: 'aristea-vieja', status: 'ACTIVO', isArchived: true, responsible: null, projectManager: null }
  ];
  const db = { client: { findMany: async (args) => (args.where?.name?.contains ? [] : all) } };
  const result = await toolByName('buscar_cliente').run({ nombre: 'aristia' }, { db, user: editor, person, today: TODAY });
  assert.equal(result.data.clientes[0].nombre, 'Aristea');
  assert.equal(result.data.aproximado, true);
  assert.match(result.data.instruccion, /parecido/);
  assert.equal(result.data.clientes.some((c) => c.nombre === 'Abitat Insurance'), false, 'only names that look alike');
  const none = await toolByName('buscar_cliente').run({ nombre: 'zzqqxx' }, { db, user: editor, person, today: TODAY });
  assert.deepEqual(none.data.clientes, []);
});

test('mis_tareas returns only what the person is responsible for or collaborates in, without the body', async () => {
  const queries = [];
  const db = { task: { findMany: async (args) => { queries.push(args); return [
    { id: 't1', title: 'Subir videos', status: 'PENDIENTE', dueDate: noon('2026-10-02'), focusDeadlineAt: null, priority: 'ALTA', isPriority: false, isPrivate: false, comments: 'SECRETO', client: { name: 'Nattal' }, assignee: { name: 'Sara' } },
    { id: 't2', title: 'Reel de octubre', status: 'EN_CURSO', dueDate: null, focusDeadlineAt: new Date('2026-10-06T20:00:00.000Z'), priority: null, isPriority: true, isPrivate: true, comments: 'SECRETO', client: { name: 'Mimas' }, assignee: { name: 'Jarlan' } }
  ]; } } };
  const result = await toolByName('mis_tareas').run({ estado: 'todas' }, { db, user: editor, person, today: TODAY });
  const where = queries[0].where;
  assert.deepEqual(where.status, { in: ['PENDIENTE', 'EN_CURSO', 'DEVUELTA'] });
  assert.deepEqual(where.OR, [{ assigneeId: 'm-sara' }, { collaborators: { some: { memberId: 'm-sara' } } }]);
  assert.equal(JSON.stringify(result).includes('SECRETO'), false, 'la descripción nunca sale');
  assert.deepEqual(result.data.tareas[0], { id: 't1', titulo: 'Subir videos', estado: 'PENDIENTE', cliente: 'Nattal', responsable: 'Sara', vence: '2026-10-02', vencida: true, horaCompromiso: null, prioridad: 'ALTA', privada: false });
  assert.deepEqual(result.data.tareas[1], { id: 't2', titulo: 'Reel de octubre', estado: 'EN_CURSO', cliente: 'Mimas', responsable: 'Jarlan', vence: null, vencida: false, horaCompromiso: '15:00', prioridad: 'Destacada', privada: true });
  assert.deepEqual(result.sources[0], { kind: 'tarea', id: 't1', label: 'Subir videos', url: '/gestion?taskId=t1' });

  await toolByName('mis_tareas').run({ estado: 'devueltas' }, { db, user: editor, person, today: TODAY });
  assert.deepEqual(queries[1].where.status, { in: ['DEVUELTA'] });
  const nobody = await toolByName('mis_tareas').run({}, { db, user: editor, person: { ...person, memberId: null }, today: TODAY });
  assert.match(nobody.data.mensaje, /no está vinculada/i);
});

test('tareas_de_cliente goes through the same privacy-filtered reading as the board', async () => {
  const calls = [];
  const getTasks = async (clientId, viewerUserId) => { calls.push([clientId, viewerUserId]); return [
    { id: 't1', title: 'Guion', status: 'PENDIENTE', dueDate: noon('2026-10-09'), isPrivate: false, client: { name: 'Nattal' }, assignee: { name: 'Sara' } },
    { id: 't9', title: 'Privada', status: 'REALIZADA', dueDate: null, isPrivate: true, client: { name: 'Nattal' }, assignee: null }
  ]; };
  const result = await toolByName('tareas_de_cliente').run({ clientId: 'c1', estado: 'todas' }, { getTasks, user: editorWithModules, person, today: TODAY });
  assert.deepEqual(calls, [['c1', 'u-sara']]);
  assert.deepEqual(result.data.tareas.map((t) => t.id), ['t1'], 'las cerradas no entran salvo que se pidan');
  assert.deepEqual(result.data.tareas[0], { id: 't1', titulo: 'Guion', estado: 'PENDIENTE', cliente: 'Nattal', responsable: 'Sara', vence: '2026-10-09', vencida: false, privada: false });
  const closed = await toolByName('tareas_de_cliente').run({ clientId: 'c1', estado: 'realizadas' }, { getTasks, user: editorWithModules, person, today: TODAY });
  assert.deepEqual(closed.data.tareas.map((t) => t.id), ['t9']);
  assert.equal(closed.data.tareas[0].responsable, null);
});

test('parrilla_de_cliente reads the month of the question, computes the stage of each piece and links to it', async () => {
  const queries = [];
  const db = { contentPlan: { findFirst: async (args) => { queries.push(args); if (args.where.month === 9) return null; return {
    id: 'p-oct', month: 10, year: 2026, status: 'PLANIFICACION', client: { name: 'Nattal', slug: 'nattal' },
    contentItems: [
      { id: 'i1', objective: 'Lanzamiento', format: 'Reel', publishDate: noon('2026-10-03'), publishTime: '09:00', status: 'APROBADO', copyText: 'ESCENA 1', captionText: 'Hola', finalAssetKey: null, revisionRequestedAt: null, _count: { finalAssets: 1 }, publications: [{ status: 'SCHEDULED' }] },
      { id: 'i2', objective: 'Promo', format: 'Post', publishDate: noon('2026-10-20'), publishTime: null, status: 'BORRADOR', copyText: '', captionText: '', finalAssetKey: null, revisionRequestedAt: null, _count: { finalAssets: 0 }, publications: [] },
      { id: 'i3', objective: 'Detrás de cámaras', format: 'Carrusel', publishDate: noon('2026-10-12'), publishTime: null, status: 'APROBADO', copyText: 'x', captionText: 'y', finalAssetKey: 'k', revisionRequestedAt: new Date(), _count: { finalAssets: 0 }, publications: [] }
    ]
  }; } } };
  const result = await toolByName('parrilla_de_cliente').run({ clientId: 'c1' }, { db, user: editorWithModules, person, today: TODAY });
  assert.deepEqual(queries[0].where, { clientId: 'c1', deletedAt: null, month: 10, year: 2026 });
  assert.equal(result.data.parrilla.cliente, 'Nattal');
  assert.equal(result.data.parrilla.mes, 'octubre de 2026');
  assert.deepEqual(result.data.parrilla.piezas.map((p) => [p.id, p.etapa, p.aprobacion]), [
    ['i1', 'programada', 'APROBADA'],
    // Misma regla que Operación de clientes: el estado APROBADO cuenta como etapa aprobada; que el
    // cliente aún no vio el material nuevo lo dice `aprobacion`, no la etapa.
    ['i3', 'aprobada', 'MATERIAL_NUEVO'],
    ['i2', 'sin texto', 'POR_REVISAR']
  ]);
  assert.deepEqual(result.data.parrilla.piezas[0], { id: 'i1', titulo: 'Lanzamiento', formato: 'Reel', fecha: '2026-10-03', hora: '09:00', estado: 'APROBADO', etapa: 'programada', aprobacion: 'APROBADA', tieneTexto: true, tieneMaterial: true, pedidoDelCliente: null, enProduccion: null, referencias: 0 });
  assert.deepEqual(result.data.parrilla.resumen, { piezas: 3, porFormato: { Reel: 1, Carrusel: 1, Post: 1 }, sinTexto: 1, sinMaterial: 1, porAprobar: 2, devueltas: 0, enProduccion: 0, vencidas: 1 });
  assert.deepEqual(result.sources[0], { kind: 'pieza', id: 'i1', label: 'Lanzamiento (3 oct)', url: '/parrillas/p-oct?item=i1' });
  assert.equal(JSON.stringify(result).includes('ESCENA 1'), false, 'el guion no viaja al modelo');

  const missing = await toolByName('parrilla_de_cliente').run({ clientId: 'c1', mes: 9, anio: 2026 }, { db, user: editorWithModules, person, today: TODAY });
  assert.equal(missing.data.parrilla, null);
  assert.match(missing.data.mensaje, /septiembre de 2026/);
});

test('operacion_de_cliente compacts the traffic light with its reasons, for managers only', async () => {
  const operations = { getOperation: async (slug) => ({
    id: 'c1', name: 'Nattal', slug, agency: 'BRAIN', complexity: 'MEDIA',
    projectManager: { name: 'Kamila' }, communityManager: { name: 'Jarlan' },
    contract: { serviceType: 'PARRILLA', status: 'ACTIVO', startDate: '2026-01-01', endDate: null, cutDay: 1, deliverables: [{ format: 'Post', quantity: 4 }], monthlyReport: true },
    openTasks: [{ id: 't1', title: 'Subir videos', overdue: true }, { id: 't2', title: 'Guion', overdue: false }],
    cycles: { current: { label: 'Octubre 2026', quota: 4, created: 3, reached: { redactada: 2, disenada: 1, aprobada: 1, programada: 1, publicada: 0 }, overdueItems: 0, day: 6, length: 31, report: null } },
    latestObservation: { text: 'El cliente pide mover el reel.', date: '2026-10-01', by: 'Kamila' },
    evaluation: { level: 'yellow', reasons: [{ level: 'yellow', text: '1 tarea vencida en Gestión.' }] }
  }) };
  const result = await toolByName('operacion_de_cliente').run({ slug: 'nattal' }, { operations, user: pm, person, today: TODAY });
  assert.deepEqual(result.data.operacion, {
    cliente: 'Nattal', slug: 'nattal', agencia: 'BRAIN', complejidad: 'MEDIA', projectManager: 'Kamila', communityManager: 'Jarlan',
    semaforo: 'amarillo', motivos: ['1 tarea vencida en Gestión.'],
    contrato: { tipo: 'PARRILLA', estado: 'ACTIVO', inicio: '2026-01-01', fin: null, diaDeCorte: 1, piezasPorMes: 4, entregablesPorFormato: [{ formato: 'Post', cantidad: 4 }], historiasPorSemana: 0, jornadasPorMes: 0, notas: null, informeMensual: true },
    mesActual: { nombre: 'Octubre 2026', dia: 6, de: 31, piezasContratadas: 4, piezasCreadas: 3, redactadas: 2, disenadas: 1, aprobadas: 1, programadas: 1, publicadas: 0, vencidas: 0, informeEntregado: false },
    tareasAbiertas: 2, tareasVencidas: 1,
    ultimaObservacion: 'El cliente pide mover el reel. (Kamila, 2026-10-01)',
    observacionesRecientes: []
  });
  assert.deepEqual(result.sources, [{ kind: 'cliente', id: 'c1', label: 'Nattal', url: '/clientes/operacion/nattal' }]);
});

test('memoria_de_reuniones searches the memory with the same scope as the manager panel and cites the minute', async () => {
  const calls = [];
  const searchMemory = async (args) => { calls.push(args); return [
    { id: 'ch1', section: 'decisions', content: 'Se acordó mover el lanzamiento al 15.', title: 'Reunión con Endova', subtitle: '2 de octubre de 2026', sourceKind: 'MEETING_MINUTE', sourceRecordId: 'min-1', sourceUrl: '/minutas?minute=min-1', clientId: null, score: 0.8 }
  ]; };
  const result = await toolByName('memoria_de_reuniones').run({ consulta: 'lanzamiento Endova' }, { searchMemory, user: pm, person, today: TODAY });
  assert.deepEqual(calls[0], { query: 'lanzamiento Endova', limit: 5, clientId: null, includeUnscoped: true });
  assert.deepEqual(result.data.fragmentos[0], { reunion: 'Reunión con Endova', fecha: '2 de octubre de 2026', seccion: 'decisions', texto: 'Se acordó mover el lanzamiento al 15.' });
  assert.deepEqual(result.sources, [{ kind: 'minuta', id: 'min-1', label: 'Reunión con Endova', url: '/minutas?minute=min-1' }]);
  assert.deepEqual((await toolByName('memoria_de_reuniones').run({ consulta: '  ' }, { searchMemory, user: pm, person, today: TODAY })).data, { fragmentos: [] });
});

test('publicaciones_programadas lists what leaves in the coming days, in Bogotá clock', async () => {
  const queries = [];
  const db = { socialPublication: { findMany: async (args) => { queries.push(args); return [
    { id: 'pub1', scheduledAt: new Date('2026-10-07T14:30:00.000Z'), platform: 'INSTAGRAM', status: 'SCHEDULED', socialAccount: { displayName: '@endova' }, contentItem: { id: 'i1', objective: 'Lanzamiento', format: 'Reel', planId: 'p1', plan: { client: { name: 'Endova' } } } }
  ]; } } };
  const result = await toolByName('publicaciones_programadas').run({ dias: 3 }, { db, user: editorWithModules, person, today: TODAY, now: () => NOW });
  const where = queries[0].where;
  assert.deepEqual(where.status, { in: ['SCHEDULED', 'PUBLISHING'] });
  assert.equal(where.scheduledAt.gte.toISOString(), NOW.toISOString());
  assert.equal(where.scheduledAt.lte.toISOString(), '2026-10-09T15:00:00.000Z');
  assert.equal(where.contentItem, undefined);
  assert.deepEqual(result.data.publicaciones[0], { pieza: 'Lanzamiento', formato: 'Reel', cliente: 'Endova', cuenta: '@endova', red: 'INSTAGRAM', sale: '2026-10-07 09:30', estado: 'SCHEDULED' });
  assert.deepEqual(result.sources, [{ kind: 'pieza', id: 'i1', label: 'Lanzamiento', url: '/parrillas/p1?item=i1' }]);

  await toolByName('publicaciones_programadas').run({ dias: 99, clientId: 'c1' }, { db, user: editorWithModules, person, today: TODAY, now: () => NOW });
  assert.equal(queries[1].where.scheduledAt.lte.toISOString(), '2026-11-05T15:00:00.000Z', 'tope de 30 días');
  assert.deepEqual(queries[1].where.contentItem, { plan: { clientId: 'c1' } });
});
