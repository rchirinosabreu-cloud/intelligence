import test from 'node:test';
import assert from 'node:assert/strict';
import { createBriaAssistantService } from '../src/services/briaAssistantService.js';
import { buildInvestigation, investigationReply } from '../src/lib/briaInvestigation.js';
import { incompleteInquiry } from '../src/lib/briaInquiry.js';
import { createBriaConversationService } from '../src/services/briaConversationService.js';
import { createBriaTurnAuthorizer } from '../src/services/briaTurnAuthorization.js';
import { createInvestigationFixture, runInvestigationScenario } from './evals/briaInvestigationFixture.js';
import { briaInvestigationTools } from '../src/services/briaInvestigationTools.js';
import { runAssistant } from '../src/lib/briaAssistant.js';

const receipts = [{ id: 'consulta-1', area: 'TAREAS', herramienta: 'tareas_de_cliente', consultadoEn: '2026-10-24T20:00:00Z', partial: false, sources: [{ kind: 'tarea_resumen', id: 't1' }] }];
const analysis = () => ({ asunto: 'Entrega Aurora', objetivo: 'Entregar la pieza aprobada',
  cobertura: [ { area: 'TAREAS', estado: 'CONSULTADA', consultas: ['consulta-1'], motivo: '' }, ...['CONTENIDO','ACTIVIDAD','CONTEXTO','CARGA'].map(area => ({ area, estado: 'NO_APLICA', consultas: [], motivo: 'No interviene en esta comprobación acotada.' })) ],
  hallazgos: [{ texto: 'La entrega sigue abierta.', consultas: ['consulta-1'] }],
  alternativas: [{ propuesta: 'Mantener la entrega', beneficio: 'Conservar el acuerdo', costo: 'Revisar el bloqueo', incertidumbre: 'Falta confirmar el insumo', consultas: ['consulta-1'] }, { propuesta: 'Proponer otro plazo', beneficio: 'Dar margen de revisión', costo: 'Cambiar el acuerdo', incertidumbre: 'Debe aceptarlo el cliente', consultas: ['consulta-1'] }], recomendada: '1',
  comprobaciones: [{ id: 'entrega', criterio: 'La pieza aprobada está entregada', resultado: 'PENDIENTE', consultas: [] }], proximaRevision: 'cuando llegue el insumo', incertidumbres: ['Falta el insumo'] });

const relato = [{ texto: 'Encontré la entrega abierta. Falta el insumo, así que todavía no puedo confirmar que lleguemos a tiempo.', consultas: ['consulta-1'] },
  { texto: 'Te recomiendo aclarar primero cuándo llegará. Cambiar el plazo daría margen, pero requiere acordarlo con el cliente.', consultas: ['consulta-1'] }];

test('the conversational answer leads with grounded prose while preserving the complete internal investigation', () => {
  const record = buildInvestigation({ ...analysis(), relato }, { receipts });
  const reply = investigationReply(record);
  assert.deepEqual(record.relato, relato);
  assert.ok(reply.startsWith(relato[0].texto));
  assert.ok(reply.includes(relato[1].texto));
  assert.doesNotMatch(reply, /Opción 1|Beneficio:|Por aclarar:|Consultado en/);
  assert.equal(reply, relato.map(row => row.texto).join('\n\n'), 'no server-authored closing or internal audit fields');
  assert.equal(record.estado, 'ABIERTO');
  assert.equal(record.proximaRevision, 'cuando llegue el insumo');
  assert.equal(record.alternativas.length, 2);
  assert.equal(record.comprobaciones[0].criterio, 'La pieza aprobada está entregada');
  assert.equal(record.ejecucionAutorizada, false);
});

test('narrative cannot cite invented evidence or survive into a new revision by inheritance', () => {
  assert.throws(() => buildInvestigation({ ...analysis(), relato: [{ texto: 'Falso', consultas: ['inventada'] }] }, { receipts }), /no fue consultada/);
  assert.throws(() => buildInvestigation({ ...analysis(), relato: [{ texto: 'Falso', consultas: [] }] }, { receipts }), /consulta/);
  const first = buildInvestigation({ ...analysis(), relato }, { receipts });
  const next = buildInvestigation(analysis(), { previous: first, receipts });
  assert.deepEqual(next.relato, []);
  assert.doesNotMatch(investigationReply(next), /Te recomiendo aclarar primero/);
});

test('the decision under comparison is distinct from the persistent objective and is not inherited by a progress update', () => {
  const decision = '¿Conservar la fecha de entrega o proponer otra mientras falta el insumo?';
  const first = buildInvestigation({ ...analysis(), decision, relato }, { receipts });
  assert.equal(first.decision, decision);
  assert.equal(first.objetivo, analysis().objetivo);
  const next = buildInvestigation({ ...analysis(), decision: null, alternativas: [], recomendada: null, relato }, { previous: first, receipts });
  assert.equal(next.decision, null);
  assert.deepEqual(next.alternativas, []);
  assert.equal(next.objetivo, first.objetivo);
  assert.deepEqual(next.comprobaciones.map(row => row.criterio), first.comprobaciones.map(row => row.criterio));
  assert.equal(next.ejecucionAutorizada, false);
  const legacy = buildInvestigation({ ...analysis(), relato }, { receipts });
  assert.equal(legacy.decision, null, 'old records still preserve their supported diagnosis');
  assert.equal(investigationReply(legacy), relato.map(row => row.texto).join('\n\n'));
});

test('partial coverage remains visible and an incomplete workflow discards its premature narrative', () => {
  const args = { ...analysis(), relato };
  args.cobertura[0].estado = 'PENDIENTE';
  args.cobertura[0].motivo = 'Falta leer el documento adjunto.';
  const record = buildInvestigation(args, { receipts });
  assert.equal(record.cobertura[0].motivo, 'Falta leer el documento adjunto.');
  const unfinished = incompleteInquiry({ investigar: true }, { record, receipts, gaps: ['Abrir el detalle autorizado.'] });
  assert.deepEqual(unfinished.relato, []);
  assert.match(investigationReply(unfinished), /incompleta/);
  assert.doesNotMatch(investigationReply(unfinished), /Te recomiendo aclarar primero/);
});

test('evidence must come from this turn, partial or absent evidence cannot close the original issue', () => {
  assert.throws(() => buildInvestigation(analysis(), { receipts: [] }), /no fue consultada/);
  const first = buildInvestigation(analysis(), { receipts });
  assert.equal(first.estado, 'ABIERTO');
  assert.equal(first.ejecucionAutorizada, false);
  const next = analysis(); next.comprobaciones[0] = { ...next.comprobaciones[0], resultado: 'CUMPLIDO', consultas: ['consulta-1'] };
  assert.equal(buildInvestigation(next, { previous: first, receipts: receipts.map(row => ({ ...row, partial: true })) }).estado, 'ABIERTO');
  assert.equal(buildInvestigation(next, { previous: first, receipts }).estado, 'RESUELTO');
  next.comprobaciones[0].criterio = 'Se creó una tarea';
  assert.equal(buildInvestigation(next, { previous: first, receipts }).comprobaciones[0].criterio, first.comprobaciones[0].criterio, 'the stored criterion is authoritative even if the model echoes a different description');
  next.comprobaciones[0].criterio = null;
  assert.equal(buildInvestigation(next, { previous: first, receipts }).comprobaciones[0].criterio, first.comprobaciones[0].criterio);
  next.comprobaciones[0].id = 'different-check';
  assert.throws(() => buildInvestigation(next, { previous: first, receipts }), /Conserva las condiciones/);
});

test('saved investigation survives more than ten turns and reports an executed action without closing the problem', async () => {
  const record = buildInvestigation({ ...analysis(), accionPreparada: 'action-1' }, { receipts, action: { id: 'action-1', type: 'TASK_CREATE', status: 'DRAFT' } });
  let request;
  const turns = [{ role: 'assistant', text: 'Análisis', investigation: record, sources: record.sources }, { role: 'assistant', text: 'Creada', pendingAction: { id: 'action-1', type: 'TASK_CREATE', status: 'DONE' } }, ...Array.from({ length: 12 }, () => ({ role: 'user', text: 'Otro dato' }))];
  const service = createBriaConversationService({ repository: { get: async () => ({ id: 'chat', revision: 10, turns }), append: async () => ({ turns: [] }) }, resolveActor: async () => ({ ref: 'owner', role: 'ADMIN' }), assistant: { ask: async args => { request = args; return { answer: 'Sigue en revisión', sources: [] }; } } });
  await service.send({ user, id: 'chat', question: '¿Se resolvió lo de la entrega?' });
  assert.equal(request.investigation.id, record.id);
  assert.equal(request.investigation.accion.status, 'DONE');
  assert.equal(request.investigation.estado, 'ABIERTO');
});

test('activity and investigation metadata are hidden after relevant access is revoked', async () => {
  const authorize = createBriaTurnAuthorizer({ db: {} });
  assert.equal(await authorize({ role: 'EDITOR', modulePermissions: {} }, { sources: [{ kind: 'actividad', id: 'equipo' }] }), false);
  assert.equal(await authorize({ role: 'EDITOR', modulePermissions: {} }, { investigation: { sources: [] }, sources: [] }), false);
});

test('a coverage claim cannot borrow evidence from another area and a fabricated action cannot be linked', () => {
  const args = analysis(); args.cobertura[0].area = 'ACTIVIDAD';
  assert.throws(() => buildInvestigation(args, { receipts }), /no acredita el área/);
  assert.throws(() => buildInvestigation({ ...analysis(), accionPreparada: 'invented' }, { receipts }), /realmente preparada/);
});

test('coverage distinguishes a completed read from unresolved business questions', () => {
  const args = analysis();
  args.cobertura[0].motivo = 'Consultada; falta saber si el cliente aceptará otro plazo.';
  const result = buildInvestigation(args, { receipts });
  assert.equal(result.cobertura[0].estado, 'CONSULTADA');
  assert.equal(result.cobertura[1].estado, 'NO_APLICA');
  assert.equal(result.estado, 'ABIERTO');
  args.cobertura[0].estado = 'NO_APLICA';
  assert.throws(() => buildInvestigation(args, { receipts }), /no aplicable/);
  args.cobertura[0].estado = 'invented';
  assert.throws(() => buildInvestigation(args, { receipts }), /estado de cobertura/);
});

test('missing required read arguments cannot produce a consultation receipt', async () => {
  let step = 0;
  await runAssistant({ user, question: 'Investiga la entrega', tools: [briaInvestigationTools[1], { name: 'tareas_de_cliente', allowed: () => true, parameters: { type: 'object', required: ['clientId'], properties: { clientId: { type: 'string' } } }, run: async () => ({ data: { tareas: [], mensaje: 'Falta el cliente' } }) }], ai: { generate: async request => {
    if (!step++) return { output: [], functionCalls: [{ id: 'missing', name: 'tareas_de_cliente', args: {} }] };
    const output = JSON.parse(request.input.at(-1).output);
    assert.equal(output.comprobanteConsulta, undefined);
    return { text: 'Falta resolver el cliente.' };
  } } });
});

test('activity reading uses the existing status service shape and excludes descriptions and meeting links', async () => {
  const tool = briaInvestigationTools.find(tool => tool.name === 'actividad_del_equipo');
  const reply = await tool.run({}, { user, now: () => new Date('2026-10-24T20:00:00Z'), readActivity: async () => [{ id: 'member', name: 'Nora', status: 'REUNION', currentTask: { id: 't1', title: 'Portada', description: 'PRIVATE TASK BODY' }, currentEvent: { id: 'e1', title: 'Revisión', type: 'MEETING', startAt: '2026-10-24T19:00:00Z', endAt: '2026-10-24T21:00:00Z', description: 'PRIVATE EVENT BODY', meetingLink: 'https://private.invalid' } }] });
  assert.equal(reply.data.personas[0].estado, 'REUNION');
  assert.equal(reply.data.personas[0].evento.horarioBogota.fin, '24/10/2026, 16:00');
  assert.equal(reply.data.horaConsultaBogota, '24/10/2026, 15:00');
  assert.equal(reply.data.personas[0].evento.vigenteEnConsulta, true);
  assert.doesNotMatch(JSON.stringify(reply), /PRIVATE|private.invalid/);
  assert.ok(reply.sources.some(source => source.kind === 'actividad'));
});

const user = { id: 'owner', userId: 'owner', role: 'ADMIN', name: 'Marina', isActive: true, sessionVersion: 0, modulePermissions: { bria: true, gestion: true, manager: true, activity: true, parrillas: true } };
const setup = generate => createBriaAssistantService({
  db: { user: { findUnique: async () => ({ ...user, teamMember: { id: 'member', name: 'Marina', isActive: true } }) } },
  ai: { generate }, inquiryPlanner: null, tools: [], knowledge: null, taskDrafts: null, dispatchDrafts: null, deleteDrafts: null, actions: null, usage: null, platform: null, agencyFacts: null, vault: null, mail: null, permissions: null, dailyReading: null, serviceHealth: null
});

test('the production assistant offers a structured investigation without an execution permission', async () => {
  let seen = false;
  const service = setup(async request => {
    const tool = request.tools.find(tool => tool.name === 'actualizar_seguimiento');
    assert.ok(tool, 'investigation and alternatives must be available in the real assistant');
    assert.ok(tool.parameters.properties.alternativas);
    assert.ok(tool.parameters.properties.comprobaciones);
    seen = true;
    return { text: 'Reviso las fuentes antes de proponer.' };
  });
  const result = await service.ask({ user: { ...user }, question: 'Investiga la entrega y compara opciones' });
  assert.equal(seen, true);
  assert.equal(result.pendingAction, undefined);
});

test('real conversation services investigate three areas and re-read before following up without writes', async () => {
  const data = analysis();
  data.cobertura = [ { area: 'TAREAS', estado: 'CONSULTADA', consultas: ['consulta-1'], motivo: '' }, { area: 'CONTENIDO', estado: 'CONSULTADA', consultas: ['consulta-2'], motivo: '' }, { area: 'ACTIVIDAD', estado: 'CONSULTADA', consultas: ['consulta-3'], motivo: '' }, ...['CONTEXTO','CARGA'].map(area => ({ area, estado: 'PENDIENTE', consultas: [], motivo: 'Falta consultar' })) ];
  const calls = [ { name: 'tareas_de_cliente', args: { clientId: 'lifecycle-client' } }, { name: 'parrilla_de_cliente', args: { clientId: 'lifecycle-client' } }, { name: 'actividad_del_equipo', args: {} } ];
  let step = 0;
  const fixture = createInvestigationFixture({ generate: async () => {
    const phase = step++ % 3;
    if (phase === 0) return { output: [], functionCalls: calls.map((call, index) => ({ ...call, id: `${step}:${index}` })) };
    if (phase === 1) return { output: [], functionCalls: [{ id: `save-${step}`, name: 'actualizar_seguimiento', args: data }] };
    return { text: 'Investigado.' };
  } }, { inquiryPlanner: null });
  await runInvestigationScenario(fixture);
});
