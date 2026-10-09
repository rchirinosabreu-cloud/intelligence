import test from 'node:test';
import assert from 'node:assert/strict';
import { toolByName } from '../src/services/briaAssistantTools.js';
import { lastClientRequest } from '../src/services/briaAssistantTools.js';

// «Cuenta al día» (9 de octubre de 2026): para que Bria pueda decir cómo va una cuenta frente a lo
// contratado, qué pidió cambiar el cliente y qué falta, sin tener que preguntarle a nadie.

const TODAY = '2026-10-09';
const noon = (key) => new Date(`${key}T12:00:00.000Z`);
const pm = { userId: 'u-pm', role: 'PROJECT_MANAGER', modulePermissions: { bria: true, parrillas: true, gestion: true } };
const editor = { userId: 'u-ed', role: 'EDITOR', modulePermissions: { parrillas: true } };
const person = { userId: 'u-pm', name: 'Camila', memberId: 'm-camila' };

test('the client request is the last thing the client wrote, never the team notes around it', () => {
  assert.equal(lastClientRequest(null), null);
  assert.equal(lastClientRequest('Nota del equipo sin cliente'), null);
  const comments = '[Cliente - 01/10/2026]: Cambien el color del fondo\n\n[Cliente - 05/10/2026]: Ahora el texto es muy largo, acórtenlo';
  assert.deepEqual(lastClientRequest(comments), { fecha: '05/10/2026', texto: 'Ahora el texto es muy largo, acórtenlo' });
  assert.equal(lastClientRequest(`[Cliente - 05/10/2026]: ${'a'.repeat(900)}`).texto.length, 600);
});

test('the grid tells what the client asked to change, what is already in production and how many pieces per format', async () => {
  const queries = [];
  const db = { contentPlan: { findFirst: async (args) => { queries.push(args); return {
    id: 'p1', month: 10, year: 2026, status: 'PLANIFICACION', client: { name: 'Aristea', slug: 'aristea' },
    contentItems: [
      { id: 'i1', objective: 'Lanzamiento', format: 'Reel', publishDate: noon('2026-10-03'), publishTime: null, status: 'DEVUELTO', copyText: 'g', captionText: 'c', finalAssetKey: null, revisionRequestedAt: null, comments: '[Cliente - 05/10/2026]: Cambien la música', assetsLinks: ['https://drive.google.com/a'], mediaUrl: [], _count: { finalAssets: 0 }, publications: [], tasks: [] },
      { id: 'i2', objective: 'Carrusel de servicios', format: 'Carrusel', publishDate: noon('2026-10-10'), publishTime: null, status: 'EN_PRODUCCION', copyText: 'g', captionText: 'c', finalAssetKey: null, revisionRequestedAt: null, comments: null, assetsLinks: [], mediaUrl: [], _count: { finalAssets: 0 }, publications: [], tasks: [{ id: 't9', status: 'EN_CURSO', dueDate: noon('2026-10-08'), assignee: { name: 'Melissa' } }] },
      { id: 'i3', objective: 'Post de equipo', format: 'Post', publishDate: noon('2026-10-20'), publishTime: null, status: 'BORRADOR', copyText: '', captionText: '', finalAssetKey: null, revisionRequestedAt: null, comments: null, assetsLinks: [], mediaUrl: [], _count: { finalAssets: 0 }, publications: [], tasks: [] }
    ]
  }; } } };
  const result = await toolByName('parrilla_de_cliente').run({ clientId: 'c1' }, { db, user: pm, person, today: TODAY });
  const select = queries[0].select.contentItems.select;
  assert.equal(select.comments, true);
  assert.deepEqual(select.tasks.where, { status: { not: 'REALIZADA' } });
  const [i1, i2] = result.data.parrilla.piezas;
  assert.deepEqual(i1.pedidoDelCliente, { fecha: '05/10/2026', texto: 'Cambien la música' });
  assert.equal(i1.referencias, 1);
  assert.equal(i1.enProduccion, null);
  assert.deepEqual(i2.enProduccion, { tareaId: 't9', responsable: 'Melissa', vence: '2026-10-08', estado: 'EN_CURSO', vencida: true });
  assert.deepEqual(result.data.parrilla.resumen.porFormato, { Reel: 1, Carrusel: 1, Post: 1 });
  assert.equal(result.data.parrilla.resumen.devueltas, 1);
  assert.equal(result.data.parrilla.resumen.enProduccion, 1);
});

test('reading the pieces brings the client comments and the reference links', async () => {
  const db = { contentItem: { findMany: async () => [
    { id: 'i1', objective: 'Lanzamiento', format: 'Reel', publishDate: noon('2026-10-03'), status: 'DEVUELTO', copyText: 'g', captionText: 'c', internalNotes: null, comments: '[Cliente - 05/10/2026]: Cambien la música', assetsLinks: ['https://drive.google.com/a', 'https://drive.google.com/b'], mediaUrl: ['https://x.test/m.png'], plan: { id: 'p1', strategicObjectives: 'o', client: { name: 'Aristea' } } }
  ] } };
  const result = await toolByName('leer_piezas_de_parrilla').run({ planId: 'p1' }, { db, user: pm, person, today: TODAY });
  const piece = result.data.piezas[0];
  assert.match(piece.comentariosDelCliente, /Cambien la música/);
  assert.deepEqual(piece.referencias, ['https://drive.google.com/a', 'https://drive.google.com/b', 'https://x.test/m.png']);
});

test('the account operation brings the contract per format, stories, production days, notes and recent observations', async () => {
  const operations = { getOperation: async (slug) => ({
    id: 'c1', name: 'Aristea', slug, agency: 'BRAIN', complexity: 'MEDIA', projectManager: { name: 'Camila' }, communityManager: { name: 'Helen' },
    contract: { serviceType: 'PARRILLA', status: 'ACTIVO', startDate: '2026-05-05', endDate: null, cutDay: 30, deliverables: [{ format: 'Reel', quantity: 3 }, { format: 'Carrusel', quantity: 4 }, { format: 'Post', quantity: 5 }], storiesPerWeek: 3, productionDays: 1, monthlyReport: true, notes: 'Jornada de 2 h' },
    openTasks: [], cycles: {},
    observations: [{ text: 'Cliente pide más video', date: '2026-10-02', by: 'Camila' }, { text: 'Material de la jornada llegó', date: '2026-09-20', by: 'Helen' }],
    latestObservation: { text: 'Cliente pide más video', date: '2026-10-02', by: 'Camila' },
    evaluation: { level: 'green', reasons: [] }
  }) };
  const { operacion } = (await toolByName('operacion_de_cliente').run({ slug: 'aristea' }, { operations, user: pm, person, today: TODAY })).data;
  assert.deepEqual(operacion.contrato.entregablesPorFormato, [{ formato: 'Reel', cantidad: 3 }, { formato: 'Carrusel', cantidad: 4 }, { formato: 'Post', cantidad: 5 }]);
  assert.equal(operacion.contrato.historiasPorSemana, 3);
  assert.equal(operacion.contrato.jornadasPorMes, 1);
  assert.equal(operacion.contrato.notas, 'Jornada de 2 h');
  assert.equal(operacion.contrato.piezasPorMes, 12);
  assert.deepEqual(operacion.observacionesRecientes, ['Cliente pide más video (Camila, 2026-10-02)', 'Material de la jornada llegó (Helen, 2026-09-20)']);
});

test('the portfolio answers «which accounts are in red and why» in one call, for managers only', async () => {
  const operations = { listOperations: async () => [
    { id: 'c1', name: 'Aristea', slug: 'aristea', agency: 'BRAIN', projectManager: { name: 'Camila' }, communityManager: { name: 'Helen' }, evaluation: { level: 'red', reasons: [{ text: 'Piezas con fecha pasada sin publicar.' }, { text: 'Ritmo atrasado.' }, { text: 'Otro.' }] }, cycles: { current: { quota: 12, created: 12, reached: { aprobada: 4, publicada: 2 }, overdueItems: 3 } }, openTasks: [{ overdue: true }] },
    { id: 'c2', name: 'Bonsai', slug: 'bonsai', agency: 'BRAIN', projectManager: { name: 'Camila' }, communityManager: null, evaluation: { level: 'green', reasons: [] }, cycles: {}, openTasks: [] },
    { id: 'c3', name: 'Verona', slug: 'verona', agency: 'MIO', projectManager: { name: 'Rodny' }, communityManager: { name: 'Sara' }, evaluation: { level: 'yellow', reasons: [{ text: 'Informe sin entregar.' }] }, cycles: {}, openTasks: [] }
  ] };
  const tool = toolByName('cartera_de_operacion');
  assert.equal(tool.allowed(pm), true);
  assert.equal(tool.allowed(editor), false);
  const all = (await tool.run({}, { operations, user: pm, person, today: TODAY })).data;
  assert.equal(all.cuentas.length, 3);
  assert.deepEqual(all.porSemaforo, { rojo: 1, amarillo: 1, verde: 1, gris: 0 });
  assert.equal(all.cuentas[0].cliente, 'Aristea', 'red first');
  assert.deepEqual(all.cuentas[0].motivos, ['Piezas con fecha pasada sin publicar.', 'Ritmo atrasado.']);
  assert.deepEqual(all.cuentas[0].mesActual, { contratadas: 12, creadas: 12, aprobadas: 4, publicadas: 2, vencidas: 3 });
  assert.equal(all.cuentas[0].tareasVencidas, 1);
  const red = (await tool.run({ semaforo: 'rojo' }, { operations, user: pm, person, today: TODAY })).data;
  assert.deepEqual(red.cuentas.map((c) => c.cliente), ['Aristea']);
  const mio = (await tool.run({ agencia: 'mio' }, { operations, user: pm, person, today: TODAY })).data;
  assert.deepEqual(mio.cuentas.map((c) => c.cliente), ['Verona']);
  const camila = (await tool.run({ responsable: 'camila' }, { operations, user: pm, person, today: TODAY })).data;
  assert.deepEqual(camila.cuentas.map((c) => c.cliente).sort(), ['Aristea', 'Bonsai']);
});

test('criteria and findings: only approved criteria of the client or of that plan, and only open findings', async () => {
  const queries = {};
  const db = {
    clientEditorialCriterion: { findMany: async (args) => { queries.criteria = args; return [{ id: 'k1', category: 'MARCA', text: 'Nunca videos de tendencias.', scope: 'CLIENT', version: 2 }]; } },
    contentPlanReviewFinding: { findMany: async (args) => { queries.findings = args; return [{ id: 'f1', itemId: 'i1', severity: 'HIGH', category: 'MARCA', title: 'Tono informal', detail: 'Usa jerga.', recommendation: 'Ajustar.' }]; } }
  };
  const tool = toolByName('criterios_y_hallazgos');
  assert.equal(tool.allowed(editor), true);
  assert.equal(tool.allowed({ role: 'EDITOR', modulePermissions: {} }), false);
  const out = (await tool.run({ clientId: 'c1', planId: 'p1' }, { db, user: pm, person, today: TODAY })).data;
  assert.deepEqual(queries.criteria.where, { clientId: 'c1', status: 'APPROVED', OR: [{ scope: 'CLIENT' }, { scope: 'PLAN', sourcePlanId: 'p1' }] });
  assert.deepEqual(queries.findings.where, { planId: 'p1', status: 'OPEN' });
  assert.deepEqual(out.criterios, [{ categoria: 'MARCA', criterio: 'Nunca videos de tendencias.', alcance: 'cliente', version: 2 }]);
  assert.equal(out.hallazgosAbiertos[0].titulo, 'Tono informal');
  const withoutPlan = (await tool.run({ clientId: 'c1', planId: null }, { db, user: pm, person, today: TODAY })).data;
  assert.deepEqual(queries.criteria.where, { clientId: 'c1', status: 'APPROVED', scope: 'CLIENT' });
  assert.deepEqual(withoutPlan.hallazgosAbiertos, []);
});
