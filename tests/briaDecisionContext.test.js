import test from 'node:test';
import assert from 'node:assert/strict';
import { briaAssistantTools } from '../src/services/briaAssistantTools.js';
import { createBriaAgencyFactService } from '../src/services/briaAgencyFactService.js';
import { createBriaTurnAuthorizer } from '../src/services/briaTurnAuthorization.js';
import { createDecisionContextFixture } from './evals/briaDecisionContextFixture.js';
import { inquiryGaps } from '../src/lib/briaInquiry.js';

const user = { id: 'u', role: 'ADMIN', isActive: true, sessionVersion: 0, modulePermissions: { bria: true }, teamMember: { isActive: true } };
const tool = name => briaAssistantTools.find(row => row.name === name);
const clients = [{ id: 'c1', name: 'Estudio Roble', slug: 'roble' }, { id: 'c2', name: 'Clínica Faro', slug: 'faro' }];
const rows = clients.map(client => ({ ...client, contract: { status: 'ACTIVE', startDate: '2026-01-01', endDate: '2026-09-30', notes: 'Renovación pendiente' }, cycles: { current: { label: 'Octubre de 2026', quota: 12, overdueItems: 9 } }, evaluation: { level: 'red' }, openTasks: [] }));
const fact = { id: 'correction', clientId: 'c1', entity: clients[0].name, topic: 'acuerdo', statement: 'Octubre no fue contratado; las piezas son una propuesta.', certainty: 'CONFIRMADO', purpose: 'operacion', sensitivity: 'normal', validFrom: '2026-10-01', sources: [], origin: 'EQUIPO', revision: 2, status: 'ACTIVE' };
const context = () => ({ user, today: '2026-10-25', operations: { listOperations: async () => rows, getOperation: async () => rows[0] },
  agencyFacts: { contextForClients: async (_user, selected) => ({ cuentas: selected.map(client => ({ clientId: client.id, estado: 'CONSULTADO', parcial: false, hechos: client.id === 'c1' ? [{ id: fact.id, afirmacion: fact.statement }] : [] })), nota: 'Contrastar el periodo' }) } });

test('a verified empty task search does not force a nonexistent detail or another model call', () => {
  const plan = { investigar: true, localizarTrabajo: true, areas: ['TAREAS'], guardarSeguimiento: false };
  const empty = { herramienta: 'tareas_de_cliente', area: 'TAREAS', taskCount: 0, partial: false };
  assert.deepEqual(inquiryGaps(plan, null, [empty]), []);
  assert.ok(inquiryGaps(plan, null, [{ ...empty, partial: true }]).length);
  assert.ok(inquiryGaps(plan, null, [empty, { ...empty, taskCount: 1 }]).length, 'a candidate still requires its detail');
});

test('portfolio supplies current contract and account memory together before the model ranks clients', async () => {
  const ctx = context(); let selected;
  const read = ctx.agencyFacts.contextForClients;
  ctx.agencyFacts.contextForClients = async (who, batch) => { selected = batch; return read(who, batch); };
  const result = await tool('cartera_de_operacion').run({}, ctx);
  assert.deepEqual(selected.map(row => row.id), ['c2', 'c1']);
  const account = result.data.cuentas.find(row => row.clientId === 'c1');
  assert.equal(account.contrato.fin, '2026-09-30');
  assert.equal(account.mesActual.nombre, 'Octubre de 2026');
  assert.equal(account.contexto.hechos[0].afirmacion, fact.statement);
  assert.ok(result.sources.some(row => row.kind === 'hecho_agencia' && row.id === 'correction'));
  assert.equal(account.mesActual.vencidas, 9, 'memory does not rewrite the platform counter');
});

test('client detail and editorial plan also refresh memory without a separate model request', async () => {
  const ctx = context();
  const detail = await tool('operacion_de_cliente').run({ slug: 'roble' }, ctx);
  assert.equal(detail.data.operacion.contexto.hechos[0].afirmacion, fact.statement);
  const plan = await tool('parrilla_de_cliente').run({ clientId: 'c1' }, { ...ctx, db: { contentPlan: { findFirst: async () => ({ id: 'p1', client: clients[0], month: 10, year: 2026, contentItems: [] }) } } });
  assert.equal(plan.data.parrilla.contexto.hechos[0].afirmacion, fact.statement);
  assert.ok(plan.sources.some(row => row.kind === 'hecho_agencia'));
});

test('unavailable memory is explicit, while authorization loss stops the read', async () => {
  const ctx = context();
  ctx.agencyFacts.contextForClients = async () => { throw new Error('database unavailable PRIVATE'); };
  const result = await tool('cartera_de_operacion').run({}, { ...ctx, logger: { warn() {} } });
  assert.equal(result.data.cuentas[0].contexto.estado, 'NO_DISPONIBLE');
  assert.equal(result.data.contextoParcial, true);
  assert.doesNotMatch(JSON.stringify(result), /PRIVATE/);
  ctx.agencyFacts.contextForClients = async () => { throw Object.assign(new Error('revoked'), { status: 403 }); };
  await assert.rejects(tool('cartera_de_operacion').run({}, ctx), { status: 403 });
});

test('context service batches reads, exposes truncation and retains evidence metadata without offering questions', async () => {
  let calls = 0, questionWrites = 0;
  const service = createBriaAgencyFactService({ db: { user: { findUnique: async () => user } }, repository: {
    searchClients: async (access, batch, limit) => { calls++; assert.ok(access.purposes.includes('operacion')); assert.equal(batch.length, 2); return Array.from({ length: limit }, (_, i) => ({ ...fact, id: String(i) })); },
    openQuestions: async () => { questionWrites++; return []; }
  } });
  const result = await service.contextForClients(user, clients);
  assert.equal(calls, 1); assert.equal(questionWrites, 0);
  assert.equal(result.cuentas[0].parcial, true);
  assert.ok(result.cuentas[0].hechos[0].periodo.includes('octubre'));
  assert.equal(result.cuentas[1].estado, 'CONSULTADO');
  assert.deepEqual(result.cuentas[1].hechos, []);
});

test('losing privileged access during the batch read removes facts before returning them', async () => {
  let calls = 0;
  const service = createBriaAgencyFactService({ db: { user: { findUnique: async () => calls++ === 0 ? user : { ...user, role: 'PROJECT_MANAGER' } } }, repository: {
    searchClients: async () => [{ ...fact, purpose: 'direccion', sensitivity: 'restringida' }]
  } });
  assert.deepEqual((await service.contextForClients(user, clients)).cuentas[0].hechos, []);
});

test('memory sources are reauthorized when a conversation is reused', async () => {
  let visible = true;
  const authorize = createBriaTurnAuthorizer({ agencyFacts: () => ({ canReadMany: async (_user, ids) => visible && ids.length === 1 && ids[0] === fact.id }) });
  const turn = { sources: [{ kind: 'hecho_agencia', id: fact.id }] };
  assert.equal(await authorize(user, turn), true);
  visible = false;
  assert.equal(await authorize(user, turn), false);
  assert.equal(await createBriaTurnAuthorizer({})(user, turn), false);
});

test('a follow-up rereads context and delivers a later agreement even if the counters have not changed', async () => {
  let step = 0, turns = 0;
  const fixture = createDecisionContextFixture({ generate: async request => {
    if (request.responseSchema) { step = 0; turns++; return { text: JSON.stringify({ investigar: true, continuar: false, actualidad: true, localizarTrabajo: false, guardarSeguimiento: false, prepararCambios: false, compararAlternativas: false, asunto: 'Cumplimiento editorial', objetivo: 'Priorizar', areas: [], condiciones: [] }) }; }
    if (step++ === 0) return { output: [], functionCalls: [{ id: `read-${turns}`, name: 'cartera_de_operacion', args: {} }] };
    const output = request.input.findLast(row => row.type === 'function_call_output').output;
    assert.match(output, turns === 1 ? /la pausa de septiembre terminó/ : /reprogramar esas siete piezas para noviembre/);
    assert.match(output, /"vencidas":7/, 'no operational mutation disguises the change of meaning');
    return { text: turns === 1 ? 'Lago tiene un compromiso vigente; Roble es una propuesta.' : 'La nueva pausa cambia el orden: Faro pasa primero. Lago queda separado por el acuerdo posterior.' };
  } });
  await fixture.send('Revisa el cumplimiento de las cuentas.');
  fixture.pauseLago();
  const next = await fixture.send('Retoma el análisis con la información más reciente.');
  assert.match(next.text, /Faro pasa primero/);
  assert.equal(fixture.reads.filter(row => row === 'account-context').length, 2);
  assert.equal(fixture.created.length, 0);
});
