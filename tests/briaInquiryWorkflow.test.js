import test from 'node:test';
import assert from 'node:assert/strict';
import { runAssistant } from '../src/lib/briaAssistant.js';
import { briaInvestigationTools } from '../src/services/briaInvestigationTools.js';
import { inquiryDeclarations } from '../src/lib/briaInvestigation.js';
import { createFullInquiryFixture, runFullInquiryScenario, runAgencyOverviewScenario } from './evals/briaFullInquiryFixture.js';
import { normalizeTools } from '../src/services/openAIClient.js';
import { toolDeclarations } from '../src/lib/briaAssistant.js';

const user = { id: 'u', userId: 'u', role: 'ADMIN' };
const asunto = 'Entrega del portal', objetivo = 'Determinar riesgo y opciones de la entrega';

test('every round offers the whole catalog the person can use: no plan narrows or removes tools', async () => {
  const offered = [];
  let round = 0;
  await runAssistant({ user, question: 'Gracias, con eso cerramos.', tools: [...briaInvestigationTools, { name: 'consultar_datos', allowed: () => true, parameters: {}, run: async () => ({ data: {} }) }],
    ai: { generate: async request => { offered.push(request.tools.map(tool => tool.name)); return round++ === 0 ? { functionCalls: [{ id: 'read', name: 'consultar_datos', args: {} }] } : { text: 'Listo, quedó cerrado.' }; } } });
  assert.ok(offered[0].includes('consultar_datos') && offered[0].includes('actualizar_seguimiento'));
  assert.deepEqual(offered[1], offered[0]);
});

test('full catalog and conversation answer an agency overview without inventing a saved case', async () => {
  let step = 0;
  const fixture = createFullInquiryFixture({ generate: async () => {
    const calls = list => ({ output: [], functionCalls: list.map(([name, args], i) => ({ id: `${step}-${i}`, name, args })) });
    if (step++ === 0) return calls([['cartera_de_operacion', {}], ['buscar_cliente', { nombre: 'Aurora' }]]);
    if (step === 2) return calls([['operacion_de_cliente', { slug: 'aurora' }], ['parrilla_de_cliente', { clientId: 'lifecycle-client' }]]);
    return { text: 'Hay una cuenta con dos piezas aprobadas: una publicada y otra con fecha vencida que aún no se ha publicado. Conviene revisar por qué quedó pendiente.' };
  } }, { overview: true });
  await runAgencyOverviewScenario(fixture);
});

test('saving investigation requires the provider to include every evidence field, including alternative citations', () => {
  const [tool] = normalizeTools(toolDeclarations(briaInvestigationTools.filter(tool => tool.name === 'actualizar_seguimiento')));
  assert.equal(tool.strict, true);
  assert.deepEqual(tool.parameters.required.sort(), Object.keys(tool.parameters.properties).sort());
  assert.ok(tool.parameters.properties.alternativas.items.required.includes('consultas'));
  assert.deepEqual(tool.parameters.properties.accionPreparada.type, ['string', 'null']);
});

test('binding receipt ids never constrains uncertainty prose through a shared schema object', () => {
  const declarations = toolDeclarations(briaInvestigationTools);
  const tool = inquiryDeclarations(declarations, [{ id: 'consulta-actual' }]).find(tool => tool.name === 'actualizar_seguimiento');
  assert.deepEqual(tool.parameters.properties.alternativas.items.properties.consultas.items.enum, ['consulta-actual']);
  assert.deepEqual(tool.parameters.properties.relato.items.properties.consultas.items.enum, ['consulta-actual']);
  assert.equal(tool.parameters.properties.relato.items.properties.texto.enum, undefined);
  assert.equal(tool.parameters.properties.incertidumbres.items.enum, undefined);
  assert.equal(declarations.find(tool => tool.name === 'actualizar_seguimiento').parameters.properties.alternativas.items.properties.consultas.items.enum, undefined);
});

test('a saved follow-up cannot cite a source that was not read in this turn', async () => {
  let step = 0;
  const result = await runAssistant({ user, question: 'Investiga el compromiso del portal y conserva el seguimiento', maxRounds: 2, tools: briaInvestigationTools, context: { now: () => new Date('2026-10-24T20:00:00Z') },
    ai: { generate: async () => step++ === 0
      ? { output: [], functionCalls: [{ id: 'save', name: 'actualizar_seguimiento', args: { nueva: true, asunto, objetivo, cobertura: [{ area: 'TAREAS', estado: 'CONSULTADA', consultas: ['consulta-9'], motivo: '' }], hallazgos: [], decision: null, alternativas: [], recomendada: null, incertidumbres: [], relato: [], comprobaciones: [{ id: '1', criterio: 'Entrega verificada', resultado: 'PENDIENTE', consultas: [] }], proximaRevision: 'Mañana', accionPreparada: null } }] }
      : { text: 'No alcancé a leer la tarea; el seguimiento no quedó guardado.' } } });
  assert.equal(result.investigation, undefined);
  assert.match(result.answer, /no quedó guardado/);
});

test('task details retain the native privacy boundary, even for an admin', async () => {
  const tool = briaInvestigationTools.find(t => t.name === 'leer_pendiente');
  assert.ok(tool);
  const privateTask = { id: 't', title: 'Visible header', isPrivate: true, creatorId: 'other', assignee: { userId: 'other' }, collaborators: [], viewers: [], comments: 'PRIVATE BODY', taskComments: [] };
  await assert.rejects(tool.run({ id: 't' }, { user, db: { task: { findUnique: async () => privateTask } } }), { status: 403 });
  const result = await tool.run({ id: 't' }, { user: { ...user, id: 'other', userId: 'other' }, db: { task: { findUnique: async () => privateTask } } });
  assert.equal(result.data.tarea.descripcion, 'PRIVATE BODY');
  assert.equal(result.sources[0].kind, 'tarea');
});

test('full production catalog resolves the target, preserves checks and reads it again without writes', async () => {
  let step = 0, turn = 0;
  const fixture = createFullInquiryFixture({ generate: async request => {
    if (request.input.at(-1)?.role === 'user' && step > 3) { step = 0; }
    const calls = list => ({ output: [], functionCalls: list.map(([name, args], index) => ({ id: `${turn}-${step}-${index}`, name, args })) });
    switch (step++) {
      case 0: turn++; return calls([['buscar_cliente', { nombre: 'Aurora' }]]);
      case 1: return calls([['tareas_de_cliente', { clientId: 'lifecycle-client' }], ['actividad_del_equipo', {}], ['carga_del_equipo', {}], ['operacion_de_cliente', { slug: 'aurora' }]]);
      case 2: return calls([['leer_pendiente', { id: 'feature-delivery' }]]);
      case 3: return calls([['actualizar_seguimiento', {
        nueva: turn === 1, asunto, objetivo,
        cobertura: ['TAREAS', 'ACTIVIDAD', 'CARGA', 'CONTEXTO'].map((area, i) => ({ area, estado: 'CONSULTADA', consultas: [`consulta-${i + 1}`, ...(i === 0 ? ['consulta-5'] : [])], motivo: '' })).concat({ area: 'CONTENIDO', estado: 'NO_APLICA', consultas: [], motivo: 'Es desarrollo interno, no una pieza editorial.' }),
        hallazgos: [{ texto: 'La entrega vencía el 20 de octubre; la exportación falla con cuentas sin movimientos.', consultas: ['consulta-5'] }],
        decision: null,
        relato: [{ texto: 'La entrega vencía el 20 de octubre y la exportación sigue fallando. Recomiendo validar el caso sin movimientos antes de proponer otro compromiso; dividir la entrega permitiría avanzar con permisos, pero dejaría la exportación pendiente.', consultas: ['consulta-5'] }],
        alternativas: [{ propuesta: 'Validar exportación', beneficio: 'Resolver el fallo', costo: 'Tiempo de pruebas no estimado', incertidumbre: 'Falta estimación', consultas: ['consulta-5'] }, { propuesta: 'Separar entregas', beneficio: 'Entregar permisos antes', costo: 'La exportación espera', incertidumbre: 'Falta aprobación del alcance', consultas: ['consulta-5'] }], recomendada: '1',
        incertidumbres: [],
        comprobaciones: [{ id: '1', criterio: turn > 1 ? null : 'La entrega pasa las pruebas de aceptación', resultado: 'NO_CUMPLIDO', consultas: ['consulta-5'] }], proximaRevision: 'Cuando se valide el caso sin movimientos', accionPreparada: null
      }]]);
      default: return { text: 'Investigación guardada.' };
    }
  } });
  await runFullInquiryScenario(fixture);
  assert.equal(fixture.modelRequests.length, 8, 'eight useful tool rounds across two turns; no planner and no redundant final generation');
  assert.ok(fixture.modelRequests.every(request => request.tools.includes('preparar_pendiente') && request.tools.includes('actualizar_seguimiento')), 'every round offers the whole catalog');
});
