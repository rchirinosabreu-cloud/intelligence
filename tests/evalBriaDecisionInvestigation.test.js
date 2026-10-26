import test from 'node:test';
import assert from 'node:assert/strict';
import { DECISION_INVESTIGATION_QUESTIONS, createDecisionInvestigationFixture, runDecisionInvestigationScenario, runDecisionInvestigationContinuation } from './evals/briaDecisionInvestigationFixture.js';

const plan = continuing => ({ investigar: true, continuar: continuing, actualidad: true, localizarTrabajo: false, guardarSeguimiento: true, prepararCambios: false, compararAlternativas: true, soloConversacion: false, propositoMemoria: 'NINGUNO', asunto: 'Próximas publicaciones', objetivo: 'Decidir el siguiente paso que proteja los compromisos de publicación vigentes', areas: ['TAREAS', 'CONTENIDO', 'CONTEXTO'], condiciones: continuing ? [] : ['El material final está aprobado', 'La ficha técnica está recibida y validada', 'La publicación comprometida está verificada'] });

const scriptedModel = ({ inspect = () => {}, combinedCondition = false, initialTurn = 0 } = {}) => {
  let turn = initialTurn, step = 0;
  const declared = new Map();
  return { generate: async request => {
    if (request.responseSchema) { turn++; step = 0; declared.clear(); return { text: JSON.stringify(plan(turn > 1)) }; }
    const outputs = (request.input || []).filter(row => row.type === 'function_call_output').map(row => ({ name: declared.get(row.call_id), data: JSON.parse(row.output) })).filter(row => row.name);
    inspect(outputs, { turn, step });
    const call = rows => ({ output: [], functionCalls: rows.map(([name, args], index) => { const id = `${turn}-${step}-${index}`; declared.set(id, name); return { id, name, args }; }) });
    if (step++ === 0) return call([['cartera_de_operacion', {}]]);
    if (step === 2) return call([['parrilla_de_cliente', { clientId: 'nacar', mes: 10, anio: 2026 }], ['tareas_de_cliente', { clientId: 'nacar' }]]);
    if (step === 3) return call([['leer_pendiente', { id: 'nacar-production' }], ['leer_piezas_de_parrilla', { planId: 'nacar-plan', ids: ['nacar-launch'] }], ['publicaciones_programadas', { clientId: 'nacar', dias: 7 }]]);
    if (step === 4) {
      const receipts = outputs.filter(row => row.data.comprobanteConsulta).map(row => ({ name: row.name, ...row.data.comprobanteConsulta }));
      const ids = names => receipts.filter(row => names.includes(row.name)).map(row => row.id);
      const task = ids(['leer_pendiente']), piece = ids(['leer_piezas_de_parrilla']), context = ids(['cartera_de_operacion']), publication = ids(['publicaciones_programadas']);
      const summary = turn === 1
        ? 'Yo pondría el foco en Nácar. Cedro tiene fechas pasadas, pero octubre no está contratado. En Nácar la tarea interna venció el 23 de octubre; la publicación acordada es el 27 a las 15:00 y aún no ha vencido. El problema comprobado es la ficha técnica pendiente y la nueva versión del material sin aprobación.'
        : 'La revisión cambió: ya llegó la ficha técnica y el cliente aprobó la versión final. La tarea interna conserva el vencimiento del 23 de octubre, pero la publicación sigue prevista para el 27 a las 15:00; aún no aparece programada ni publicada. Cedro sigue fuera de los compromisos de octubre.';
      return call([['actualizar_seguimiento', { nueva: turn === 1, asunto: plan(false).asunto, objetivo: plan(false).objetivo,
        cobertura: ['TAREAS', 'CONTENIDO', 'CONTEXTO'].map(area => ({ area, estado: 'CONSULTADA', consultas: receipts.filter(row => row.area === area).map(row => row.id), motivo: '' })).concat(['ACTIVIDAD', 'CARGA'].map(area => ({ area, estado: 'NO_APLICA', consultas: [], motivo: 'No se propone reasignar trabajo ni se estima capacidad; los bloqueos concretos están en aprobación y datos de la pieza.' }))),
        hallazgos: [{ texto: summary, consultas: [...task, ...piece, ...context] }],
        alternativas: [{ propuesta: turn === 1 ? 'Validar la ficha y obtener aprobación de la nueva versión antes de programar' : 'Preparar la programación de la versión aprobada para revisión humana', beneficio: 'Protege la fecha acordada con datos aprobados', costo: 'Necesita completar la revisión antes de publicar', incertidumbre: 'La publicación todavía no está verificada', consultas: [...task, ...piece, ...publication] }, { propuesta: 'Proponer otra fecha si no puede sostenerse el compromiso', beneficio: 'Permite acordar un plazo viable', costo: 'Requiere cambiar el compromiso con autorización', incertidumbre: 'No hay autorización para cambiarlo', consultas: [...task, ...piece] }], recomendada: '1',
        incertidumbres: ['Todavía no está verificada la publicación comprometida.'],
        relato: [{ texto: summary, consultas: [...task, ...piece, ...context] }, { texto: turn === 1 ? 'Recomiendo resolver esos dos puntos antes de programar. Replantear la fecha sería la alternativa si no alcanzan, pero cambiarla ahora sin despejar el bloqueo sería prematuro. Dejo el seguimiento abierto hasta verificar la publicación; cualquier contacto o cambio esperará tu aprobación.' : 'El siguiente paso que propongo es preparar la programación para que la revises, conservando la fecha acordada. No la he preparado ni ejecutado. El seguimiento sigue abierto: recibir material y aprobación mejora la situación, pero no acredita que se haya publicado.', consultas: [...task, ...piece, ...publication] }],
        comprobaciones: combinedCondition ? [{ id: 'validated-publication', criterio: turn === 1 ? 'La publicación está verificada después de validar la ficha y aprobar el material final' : null, resultado: 'PENDIENTE', consultas: [...task, ...piece, ...publication] }] : [{ id: 'approval', criterio: turn === 1 ? 'El material final está aprobado' : null, resultado: turn === 1 ? 'NO_CUMPLIDO' : 'CUMPLIDO', consultas: piece }, { id: 'input', criterio: turn === 1 ? 'La ficha técnica está recibida y validada' : null, resultado: turn === 1 ? 'NO_CUMPLIDO' : 'CUMPLIDO', consultas: task }, { id: 'published', criterio: turn === 1 ? 'La publicación comprometida está verificada' : null, resultado: 'NO_CUMPLIDO', consultas: publication }],
        proximaRevision: turn === 1 ? 'Revisar cuando se registre la ficha técnica y la aprobación final, antes de la publicación del 27.' : 'Revisar el resultado de publicación después de aprobar la programación; todavía no hay un aviso automático.', accionPreparada: null
      }]]);
    }
    return { text: 'Todavía no se completó la comprobación del caso.' };
  } };
};

test('the selective investigation reads the blocking piece and task, distinguishes dates and resumes changed evidence without acting', async () => {
  const fixture = createDecisionInvestigationFixture(scriptedModel({ inspect(outputs, { turn }) {
    const task = outputs.find(row => row.name === 'leer_pendiente');
    if (task) {
      assert.deepEqual(task.data.tarea.pieza, { id: 'nacar-launch', planId: 'nacar-plan', titulo: 'Lanzamiento nácar', estado: 'APROBADO' });
      assert.equal(task.data.tarea.plazos.entrega.fecha, '2026-10-23');
      assert.equal(task.data.tarea.plazos.entrega.vencida, true);
      assert.equal(task.data.tarea.plazos.publicacion.fecha, '2026-10-27');
      assert.equal(task.data.tarea.plazos.publicacion.vencida, false);
    }
    const read = outputs.find(row => row.name === 'leer_piezas_de_parrilla');
    if (read) {
      assert.deepEqual(read.data.piezas.map(row => row.id), ['nacar-launch'], 'selective reading must not return the first historical page');
      assert.deepEqual(read.data.idsNoDisponibles, []);
      assert.equal(read.data.comprobanteConsulta.nivel, 'DETALLE');
      assert.equal(read.data.piezas[0].tieneMaterialFinal, true);
      assert.equal(read.data.piezas[0].aprobacion, turn === 1 ? 'MATERIAL_NUEVO' : 'APROBADA');
      assert.equal(read.data.piezas[0].plazos.fecha, '2026-10-27');
      assert.equal(read.data.piezas[0].plazos.vencida, false);
    }
  } }));
  const { first, second } = await runDecisionInvestigationScenario(fixture);
  assert.equal(fixture.reads.filter(row => row.name === 'piece-detail').length, 2);
  assert.ok(fixture.reads.filter(row => row.name === 'piece-detail').every(row => row.args.id.in.join() === 'nacar-launch'));
  assert.equal(first.investigation.consultas.find(row => row.herramienta === 'cartera_de_operacion').nivel, 'RESUMEN');
  assert.equal(second.investigation.estado, 'MEJORA_PARCIAL');
  assert.equal(fixture.modelRequests.filter(row => row.planning).length, 2, 'reuse the existing purpose planner; no extra classifier');
  assert.equal(fixture.modelRequests.length, 10, 'two plans and eight useful rounds, without a separate prose pass');
});

// Exercise the real tool adapters even when the narrative model chooses a
// different read sequence. These are data-boundary checks, not reasoning scores.
const readWithFixture = async calls => {
  const outputs = new Map();
  let sent = false;
  const fixture = createDecisionInvestigationFixture({ generate: async request => {
    if (request.responseSchema) return { text: JSON.stringify({ ...plan(false), investigar: false, actualidad: false, guardarSeguimiento: false, compararAlternativas: false, areas: [], condiciones: [] }) };
    for (const row of request.input || []) if (row.type === 'function_call_output') outputs.set(row.call_id, JSON.parse(row.output));
    if (!sent) { sent = true; return { output: [], functionCalls: calls.map(([name, args], index) => ({ id: `read-${index}`, name, args })) }; }
    return { text: 'Lecturas ficticias verificadas; no se preparó ningún cambio.' };
  } });
  const answer = await fixture.send('Consulta los registros actuales y el contexto autorizado; no prepares cambios.');
  assert.deepEqual(answer.failures, []);
  assert.equal(outputs.size, calls.length);
  assert.deepEqual(fixture.writes, []);
  return calls.map((_, index) => outputs.get(`read-${index}`));
};

test('the fictional data supports load and rhythm through their production read adapters', async () => {
  const [load, rhythm] = await readWithFixture([['carga_del_equipo', { horizonte: 'proxima_semana' }], ['ritmo_del_equipo', { dias: 30 }]]);
  assert.match(load.hoy, /24 de octubre/u);
  assert.equal(load.equipo.personas, 1);
  assert.equal(load.prevision.personas[0].puedeRecibir, false);
  assert.equal(load.prevision.personas[0].tareas[0].id, 'nacar-production');
  assert.equal(rhythm.periodo, '30 días');
  assert.equal(rhythm.personas[0].nombre, 'Marina Duarte');
});

test('query-only memory searches can find the same authorized facts as account context', async () => {
  const [memory] = await readWithFixture([['memoria_de_la_agencia', { consulta: 'Nácar lanzamiento', clientId: null, entidad: null }]]);
  assert.ok(memory.hechos.some(row => row.id === 'nacar-october'));
  assert.ok(memory.comprobanteConsulta);
});

test('a combined validation-and-publication condition remains open after intermediate progress', async () => {
  const fixture = createDecisionInvestigationFixture(scriptedModel({ combinedCondition: true }));
  const { first, second } = await runDecisionInvestigationScenario(fixture);
  assert.equal(first.investigation.comprobaciones.length, 1);
  assert.equal(second.investigation.comprobaciones[0].resultado, 'PENDIENTE');
  assert.notEqual(second.investigation.estado, 'RESUELTO');
});

test('the offered operational and contextual reads work beyond the selected narrative sequence', async () => {
  const calls = [
    ['buscar_cliente', { nombre: 'Nácar' }], ['mis_tareas', { estado: 'todas' }],
    ['buscar_pendientes', { cliente: 'nacar', responsable: 'Marina', vencidas: true }], ['buscar_pendientes', { estado: 'realizadas' }],
    ['tareas_de_cliente', { clientId: 'cedro' }], ['leer_pendiente', { id: 'nacar-production' }],
    ['cartera_de_operacion', {}], ['operacion_de_cliente', { slug: 'nacar' }],
    ['parrilla_de_cliente', { clientId: 'cedro', mes: 10, anio: 2026 }], ['parrilla_de_cliente', { clientId: 'nacar', mes: 11, anio: 2026 }],
    ['leer_piezas_de_parrilla', { planId: 'nacar-plan', desde: 6 }], ['leer_piezas_de_parrilla', { planId: 'cedro-plan', ids: ['nacar-launch'] }],
    ['criterios_y_hallazgos', { clientId: 'nacar', planId: 'nacar-plan' }], ['publicaciones_programadas', { dias: 7 }],
    ['actividad_del_equipo', {}], ['lectura_de_la_agencia', {}], ['consultar_aprendizajes', { consulta: 'publicación' }],
    ['memoria_de_reuniones', { consulta: 'Nácar', clientId: 'nacar' }], ['memoria_de_agencia', { consulta: 'lanzamiento' }],
    ['leer_documento_de_agencia', { id: 'missing-fictional-document', desde: 0 }], ['como_trabajar_con', { nombre: 'Marina Duarte' }]
  ];
  const results = await readWithFixture(calls);
  assert.equal(results[0].clientes[0].id, 'nacar');
  assert.equal(results[2].total, 1);
  assert.equal(results[3].total, 0, 'closed-task filter must not return the open task');
  assert.equal(results[4].tareas.length, 0, 'the task belongs only to Nácar');
  assert.equal(results[8].parrilla.resumen.piezas, 9, 'Cedro has proposed pieces, matching its memory and stale counter');
  assert.equal(results[9].parrilla, null, 'an October plan must not impersonate November');
  assert.ok(results[10].piezas.some(row => row.id === 'nacar-launch'));
  assert.deepEqual(results[11].piezas, []);
  assert.deepEqual(results[11].idsNoDisponibles, ['nacar-launch'], 'selection cannot cross the plan boundary');
  assert.equal(results[19].documento, null, 'missing documents stay inside the fictional boundary');
  assert.equal(results[20].persona.nombre, 'Marina Duarte');
  assert.equal(results[20].ficha, null);
});

test('a restored continuation preserves conditions without declaring a failed historical phase successful', async () => {
  const original = createDecisionInvestigationFixture(scriptedModel({ combinedCondition: true }));
  const first = await original.send(DECISION_INVESTIGATION_QUESTIONS[0]);
  first.failures = [{ tool: 'carga_del_equipo' }];
  const resumed = createDecisionInvestigationFixture(scriptedModel({ combinedCondition: true, initialTurn: 1 }), {
    initialTurns: [{ role: 'user', text: DECISION_INVESTIGATION_QUESTIONS[0] }, first]
  });
  const { second } = await runDecisionInvestigationContinuation(resumed, first);
  assert.deepEqual(first.failures, [{ tool: 'carga_del_equipo' }]);
  assert.deepEqual(second.failures, []);
  assert.deepEqual(second.investigation.comprobaciones.map(row => [row.id, row.criterio]), first.investigation.comprobaciones.map(row => [row.id, row.criterio]));
  assert.equal(resumed.traces.length, 1, 'resume must not regenerate the historical first answer');
  await assert.rejects(() => runDecisionInvestigationScenario(resumed, { first }), assert.AssertionError);
  assert.equal(resumed.traces.length, 1, 'a failed first phase cannot pass full-scenario acceptance');
});
