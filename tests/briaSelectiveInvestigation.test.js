import test from 'node:test';
import assert from 'node:assert/strict';
import { toolByName } from '../src/services/briaAssistantTools.js';
import { briaInvestigationTools } from '../src/services/briaInvestigationTools.js';
import { createAgencyFactTools } from '../src/services/briaAgencyFactTools.js';
import { runAssistant } from '../src/lib/briaAssistant.js';

const user = { id: 'reader', userId: 'reader', role: 'ADMIN', isActive: true };
const now = () => new Date('2026-10-26T15:00:00Z');
const piece = { id: 'relevant', objective: 'Presentación', format: 'Reel', publishDate: '2026-10-30', publishTime: '15:00', status: 'APROBADO', revisionRequestedAt: '2026-10-25T12:00:00Z', finalAssetKey: 'final-file', internalNotes: 'Falta la ficha técnica', comments: 'Revisar el dato del producto', plan: { id: 'plan', strategicObjectives: 'Lanzamiento', client: { name: 'Cuenta ficticia' } } };
const readPieces = toolByName('leer_piezas_de_parrilla');
const readTask = briaInvestigationTools.find(tool => tool.name === 'leer_pendiente');

test('selective investigation reads only the requested pieces in their own undeleted plan', async () => {
  let query;
  const reply = await readPieces.run({ planId: 'plan', ids: ['relevant'] }, { user, today: '2026-10-26', now, db: { contentItem: { findMany: async args => { query = args; return [piece]; } } } });
  assert.deepEqual(query.where.id, { in: ['relevant'] });
  assert.equal(query.where.planId, 'plan');
  assert.equal(query.where.deletedAt, null);
  assert.equal(query.where.plan.deletedAt, null);
  assert.equal(reply.data.piezas[0].aprobacion, 'MATERIAL_NUEVO');
  assert.equal(reply.data.piezas[0].tieneMaterialFinal, true);
  assert.equal(reply.data.piezas[0].notaInterna, 'Falta la ficha técnica');
  assert.equal(reply.data.nextOffset, null);
  assert.deepEqual(reply.data.idsNoDisponibles, []);
  assert.deepEqual(reply.sources.map(source => source.id), ['relevant']);
});

test('a missing requested piece is observable and cannot be counted as investigated', async () => {
  const reply = await readPieces.run({ planId: 'plan', ids: ['relevant', 'elsewhere'] }, { user, today: '2026-10-26', now, db: { contentItem: { findMany: async () => [piece] } } });
  assert.deepEqual(reply.data.idsNoDisponibles, ['elsewhere']);
  assert.equal(reply.data.recortada, true);
  assert.deepEqual(reply.sources.map(source => source.id), ['relevant']);
});

test('selective reading rejects malformed or oversized selections without quietly dropping requested work', async () => {
  const ctx = { db: { contentItem: { findMany: async () => assert.fail('invalid selection reached database') } } };
  for (const args of [{ ids: [] }, { ids: ['x', 'x'] }, { ids: [null] }, { ids: [' '] }, { ids: Array.from({ length: 7 }, (_, i) => String(i)) }, { ids: ['x'], desde: 6 }]) {
    await assert.rejects(readPieces.run({ planId: 'plan', ...args }, ctx), { status: 400 });
  }
});

test('unselected editorial reading preserves pagination rather than silently limiting the plan', async () => {
  let query;
  const reply = await readPieces.run({ planId: 'plan', desde: 6 }, { user, today: '2026-10-26', now, db: { contentItem: { findMany: async args => { query = args; return Array.from({ length: 7 }, (_, i) => ({ ...piece, id: String(i) })); } } } });
  assert.equal(query.skip, 6);
  assert.equal(query.where.id, undefined);
  assert.equal(reply.data.nextOffset, 12);
  assert.equal(reply.data.piezas.length, 6);
});

const task = { id: 'task', title: 'Preparar material', status: 'PENDIENTE', isPrivate: false, creatorId: 'reader', dueDate: '2026-10-23', taskComments: [], contentItem: { ...piece, planId: 'plan', deletedAt: null, plan: { id: 'plan', deletedAt: null } } };
test('an authorized task detail supplies the native route to the related piece without guessing from its title', async () => {
  let query;
  const reply = await readTask.run({ id: 'task' }, { user, today: '2026-10-26', now, db: { task: { findUnique: async args => { query = args; return task; } } } });
  assert.ok(query.select.contentItem);
  assert.deepEqual(reply.data.tarea.pieza, { id: 'relevant', planId: 'plan', titulo: 'Presentación', estado: 'APROBADO' });
  assert.equal(reply.data.tarea.plazos.entrega.vencida, true);
  assert.equal(reply.data.tarea.plazos.publicacion.vencida, false);
  assert.ok(reply.sources.some(source => source.kind === 'pieza' && source.id === 'relevant'));
});

test('task detail permission does not grant editorial access or revive deleted content', async () => {
  const withoutEditorial = { ...user, role: 'EDITOR', modulePermissions: { gestion: true, parrillas: false } };
  for (const [viewer, contentItem] of [[withoutEditorial, task.contentItem], [user, { ...task.contentItem, deletedAt: new Date() }], [user, { ...task.contentItem, plan: { id: 'plan', deletedAt: new Date() } }]]) {
    const reply = await readTask.run({ id: 'task' }, { user: viewer, today: '2026-10-26', now, db: { task: { findUnique: async () => ({ ...task, contentItem }) } } });
    assert.equal(reply.data.tarea.pieza, null);
    assert.equal(reply.data.tarea.plazos.publicacion, null);
    assert.equal(reply.sources.some(source => source.kind === 'pieza'), false);
  }
  await assert.rejects(readTask.run({ id: 'task' }, { user, now, db: { task: { findUnique: async () => ({ ...task, isPrivate: true, creatorId: 'other' }) } } }), { status: 403 });
});

test('server receipts distinguish portfolio summary from selected detail and describe only returned resources', async () => {
  const actualReceipts = [];
  let round = 0;
  const tools = [briaInvestigationTools.find(tool => tool.name === 'actualizar_seguimiento'),
    { name: 'cartera_de_operacion', allowed: () => true, parameters: {}, run: async () => ({ data: { cuentas: [], parcial: true }, sources: [{ kind: 'cliente', id: 'account' }] }) },
    { name: 'leer_piezas_de_parrilla', allowed: () => true, parameters: {}, run: async () => ({ data: { piezas: [{ id: 'relevant' }], idsNoDisponibles: ['missing'], recortada: true }, sources: [{ kind: 'pieza', id: 'relevant' }] }) },
    { name: 'memoria_de_la_agencia', allowed: () => true, parameters: {}, run: async () => ({ data: { hechos: [] }, sources: [{ kind: 'hecho_agencia', id: 'agreement' }] }) }
  ];
  await runAssistant({ user, question: 'Investiga la entrega', tools, context: { now }, ai: { generate: async request => {
    if (!round++) return { output: [], functionCalls: ['cartera_de_operacion', 'leer_piezas_de_parrilla', 'memoria_de_la_agencia'].map((name, i) => ({ id: String(i), name, args: {} })) };
    actualReceipts.push(...request.input.filter(row => row.type === 'function_call_output').map(row => JSON.parse(row.output).comprobanteConsulta));
    return { text: 'Queda una pieza sin consultar.' };
  } } });
  assert.equal(actualReceipts[0].area, 'CONTEXTO');
  assert.equal(actualReceipts[0].nivel, 'RESUMEN');
  assert.equal(actualReceipts[0].parcial, true);
  assert.equal(actualReceipts[1].nivel, 'DETALLE');
  assert.equal(actualReceipts[1].parcial, true);
  assert.deepEqual(actualReceipts[1].recursos, [{ tipo: 'pieza', id: 'relevant' }]);
  assert.equal(actualReceipts[2].area, 'CONTEXTO');
});

test('memory readings with nullable selectors receive current-turn receipts without accepting missing required arguments', async () => {
  const memory = createAgencyFactTools({ consult: async () => ({ hechos: [{ id: 'agreement', entidad: 'Taller ficticio' }] }) }).find(tool => tool.name === 'memoria_de_la_agencia');
  const choices = [{ consulta: 'acuerdo vigente', clientId: 'account', entidad: null }, { consulta: 'prioridades', clientId: null, entidad: 'Brain Studio' }, { consulta: 'acuerdo vigente', clientId: 'account' }];
  const results = [];
  let round = 0;
  await runAssistant({ user: { ...user, modulePermissions: { bria: true } }, question: 'Investiga los compromisos', tools: [memory, briaInvestigationTools.find(tool => tool.name === 'actualizar_seguimiento')], context: { now }, ai: { generate: async request => {
    if (!round++) return { output: [], functionCalls: choices.map((args, i) => ({ id: String(i), name: memory.name, args })) };
    results.push(...request.input.filter(row => row.type === 'function_call_output').map(row => JSON.parse(row.output)));
    return { text: 'Consulté los acuerdos vigentes.' };
  } } });
  for (const result of results.slice(0, 2)) {
    assert.equal(result.error, undefined);
    assert.equal(result.comprobanteConsulta?.area, 'CONTEXTO');
    assert.deepEqual(result.comprobanteConsulta.recursos, [{ tipo: 'hecho_agencia', id: 'agreement' }]);
  }
  assert.equal(results[2].comprobanteConsulta, undefined);
});
