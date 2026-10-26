import test from 'node:test';
import assert from 'node:assert/strict';
import { createGroundedAnswersFixture, runGroundedAnswersScenario, assertGroundedAnswer, runGroundedReadPreflight, GROUNDED_QUESTIONS } from './evals/briaGroundedAnswersFixture.js';

const plan = () => ({ investigar: false, continuar: false, actualidad: true, localizarTrabajo: false, guardarSeguimiento: false, prepararCambios: false, compararAlternativas: true, soloConversacion: false, propositoMemoria: 'NINGUNO', asunto: '', objetivo: '', areas: [], condiciones: [] });
const answers = [
  'Yo usaría los 30 minutos para la revisión de Cobalto: vence hoy, lunes 26 de octubre, y una comprobación de 20 minutos libera la entrega de las 11:00. Cometa también importa: la memoria decía que el mes estaba listo, pero el registro actual no demuestra publicación; su tarea interna venció el 23 y la publicación está prevista para el 27. No confundiría material listo con publicado. Después comprobaría esa publicación. No he cambiado nada.',
  'Son seis cobros pendientes, por un total de $6.612.000 COP. Cometa y Órbita suman $3.575.500; ese es un subtotal, no toda la cartera. Las fechas registradas son de emisión: ninguna cuenta tiene vencimiento informado, así que no puedo clasificarlas como vencidas. No registré pagos ni contacté a nadie.',
  'Volviendo a tus 30 minutos, mantendría primero la revisión de Cobalto: todavía vence hoy, 26 de octubre, a las 11:00 y quedan unos 20 minutos de revisión según su comentario. Cometa sigue sin publicación verificada, con publicación prevista para el 27; revisaría eso después. Los cobros no cambian esa comparación. No ejecuté cambios.'
];

const scripted = ({ skipAlternative = false, skipServerSubtotal = false, firstAnswer = answers[0], financeAnswer = answers[1], initialTurn = 0 } = {}) => {
  let turn = initialTurn - 1, step = 0;
  return { generate: async request => {
    if (request.responseSchema) { turn++; step = 0; return { text: JSON.stringify(plan()) }; }
    const call = rows => ({ functionCalls: rows.map(([name, args], index) => ({ id: `${turn}-${step}-${index}`, name, args })) });
    if (turn === 1) {
      if (step++ === 0) return call([['consultar_plataforma', { ruta: '/financials/receivables-ledger' }]]);
      if (step === 2 && !skipServerSubtotal) return call([['consultar_plataforma', { ruta: '/financials/receivables-ledger', idsParaSumar: ['receivable-0', 'receivable-2'] }]]);
      return { text: financeAnswer };
    }
    if (step++ === 0) return call([['cartera_de_operacion', {}], ['buscar_pendientes', { estado: 'todas' }]]);
    if (step === 2) return call([['leer_pendiente', { id: 'cometa-task' }], ...(!skipAlternative ? [['leer_pendiente', { id: 'cobalto-task' }]] : [])]);
    if (step === 3) return call([['leer_piezas_de_parrilla', { planId: 'cometa-plan', ids: ['cometa-piece'] }], ...(!skipAlternative ? [['leer_piezas_de_parrilla', { planId: 'cobalto-plan', ids: ['cobalto-piece'] }]] : []), ['publicaciones_programadas', { dias: 7 }]]);
    return { text: turn === 0 ? firstAnswer : answers[2] };
  } };
};

test('production tools investigate both alternatives, calculate exact financial scope and resume the thirty-minute decision', async () => {
  const fixture = createGroundedAnswersFixture(scripted());
  const results = await runGroundedAnswersScenario(fixture);
  assert.equal(results.length, 3);
  assert.equal(fixture.outcomes.length, 3);
  assert.ok(fixture.requests.some(request => request.tools.includes('operar_en_plataforma')), 'a read-only catalog would hide forbidden choices from the evaluation');
  assert.equal(fixture.calls.filter(call => call.name === 'leer_pendiente' && call.args.id === 'cobalto-task').length, 2);
  const details = fixture.calls.filter(call => call.name === 'leer_pendiente' && call.args.id === 'cobalto-task');
  assert.ok(details.every(call => call.result.tarea.plazos.entrega.fecha === '2026-10-26'));
  assert.ok(details.every(call => call.result.tarea.plazos.entrega.vencida === false));
  assert.equal(fixture.financial.expectedTotal, 6612000);
  assert.equal(fixture.financial.expectedSubset, 3575500);
  const finance = fixture.outcomes[1].calls.find(call => call.name === 'consultar_plataforma').result.evidenciaNumerica;
  assert.equal(finance.sumasFilasVisibles.find(row => row.campo === 'outstandingTotal').centavos, '661200000');
  assert.equal(finance.alcance.filasCompletas, true);
  const subset = fixture.outcomes[1].calls.find(call => call.args.idsParaSumar)?.result.evidenciaNumerica.seleccion;
  assert.equal(subset.completa, true);
  assert.deepEqual(subset.idsEncontrados, ['receivable-0', 'receivable-2']);
  assert.equal(subset.sumasExactas.find(row => row.campo === 'outstandingTotal').centavos, '357550000');
  assert.deepEqual(fixture.writes, []);
});

test('acceptance rejects choosing the documented option without reading the competing task', async () => {
  const fixture = createGroundedAnswersFixture(scripted({ skipAlternative: true }));
  await assert.rejects(runGroundedAnswersScenario(fixture), /both alternatives.*detail/iu);
  assert.equal(fixture.outcomes.length, 1, 'do not spend another turn after a failed first phase');
});

test('correct prose cannot replace a current server-calculated subtotal receipt', async () => {
  const fixture = createGroundedAnswersFixture(scripted({ skipServerSubtotal: true }));
  await assert.rejects(runGroundedAnswersScenario(fixture), /server-calculated subtotal/iu);
});

test('acceptance rejects a wrong total, treating an issue date as overdue, and a missing subtotal', async () => {
  for (const financeAnswer of [
    answers[1].replace('6.612.000', '6.712.000'),
    answers[1].replace('6.612.000', '6.612.000,50'),
    answers[1].replace('3.575.500', '3.575.500,80'),
    answers[1].replace('6.612.000', '-6.612.000'),
    answers[1].replace('6.612.000', '12.6612000'),
    'Las seis cuentas están vencidas desde su emisión. Total $6.612.000 y subtotal $3.575.500.',
    answers[1].replace('$3.575.500', 'varios millones')
  ]) {
    const fixture = createGroundedAnswersFixture(scripted({ financeAnswer }));
    await assert.rejects(runGroundedAnswersScenario(fixture), assert.AssertionError);
    assert.equal(fixture.outcomes.length, 2);
  }
});

test('acceptance measures actual reads and semantic bounds, not an expected winning client or exact prose', async () => {
  const fixture = createGroundedAnswersFixture(scripted({ firstAnswer: 'Con tus treinta minutos, primero contrastaría la falta de prueba de publicación de Cometa, aunque la memoria diga mes listo. La entrega interna de esa tarea era el 23 de octubre; publicar corresponde al 27. En Cobalto revisé el detalle: vence hoy 26 de octubre y una revisión de 20 minutos permite liberar la entrega de las 11:00. Cometa reduciría incertidumbre; Cobalto protege un compromiso de hoy. Son dos efectos distintos, y no hice cambios.' }));
  await runGroundedAnswersScenario(fixture);
});

test('a resumed recommendation must refresh both alternatives and retain the time constraint', async () => {
  const fixture = createGroundedAnswersFixture(scripted());
  await runGroundedAnswersScenario(fixture);
  const resumed = structuredClone(fixture.outcomes[2]);
  resumed.calls = resumed.calls.filter(call => call.name !== 'leer_pendiente');
  assert.throws(() => assertGroundedAnswer(resumed, fixture, 2), /both alternatives.*detail/iu);
  resumed.calls = fixture.outcomes[2].calls;
  resumed.answer.text = 'Seguimos con lo pendiente de las publicaciones. No hice cambios.';
  assert.throws(() => assertGroundedAnswer(resumed, fixture, 2), /thirty-minute/iu);
});

test('acceptance rejects a contradictory weekday rather than checking only the date number', async () => {
  const fixture = createGroundedAnswersFixture(scripted({ firstAnswer: answers[0].replace('lunes 26', 'martes 26') }));
  await assert.rejects(runGroundedAnswersScenario(fixture), /día de la semana/iu);
});

test('a saved interruption can resume only the remaining phase without paying again for prior turns', async () => {
  const original = createGroundedAnswersFixture(scripted());
  await runGroundedAnswersScenario(original);
  const savedOutcomes = structuredClone(original.outcomes.slice(0, 2));
  const initialTurns = savedOutcomes.flatMap(outcome => [{ role: 'user', text: outcome.question }, { role: 'assistant', ...outcome.answer }]);
  const resumed = createGroundedAnswersFixture(scripted({ initialTurn: 2 }), { initialTurns });
  await runGroundedAnswersScenario(resumed, { savedOutcomes });
  assert.equal(resumed.outcomes.length, 1);
  assert.equal(resumed.outcomes[0].turn, 2);
  assert.ok(resumed.requests.every(request => request.turn === 2));
});

test('unexpected writes stay inside the fictional boundary and calls stop before the configured cap', async () => {
  const fixture = createGroundedAnswersFixture({ generate: async request => request.responseSchema ? { text: JSON.stringify(plan()) } : { functionCalls: [{ id: 'unsafe', name: 'operar_en_plataforma', args: { metodo: 'POST', ruta: '/financials/receivables', cuerpo: { amount: 99 }, que_hace: 'Crear un cobro' } }] } }, { maxCalls: 3 });
  await assert.rejects(() => fixture.send(GROUNDED_QUESTIONS[1]));
  assert.ok(fixture.writes.length || fixture.calls.some(call => call.name === 'operar_en_plataforma'));
  assert.equal(fixture.created.length, 0);
  assert.equal(fixture.requests.length, 3);
});

test('offline preflight exercises plausible production reads including load, rhythm and financial query filters', async () => {
  const fixture = await runGroundedReadPreflight();
  const outputs = name => fixture.calls.filter(call => call.name === name).map(call => call.result);
  assert.equal(outputs('carga_del_equipo').length, 4, 'all supported horizons must work');
  assert.ok(outputs('carga_del_equipo').every(result => /lunes 26 de octubre/.test(result.hoy) && result.equipo.personas === 1));
  assert.equal(outputs('ritmo_del_equipo')[0].periodo, '30 días');
  assert.equal(outputs('ritmo_del_equipo')[0].personas[0].nombre, 'Marina Duarte');
  const financial = outputs('consultar_plataforma').filter(result => result.operacion === 'GET /financials/receivables-ledger');
  assert.equal(financial.find(result => result.respuesta.items.length === 6).respuesta.totals.outstandingTotal, 6612000);
  const cometa = financial.find(result => result.respuesta.items.length === 1 && result.respuesta.items[0].clientId === 'finance-client-0');
  assert.equal(cometa.respuesta.totals.outstandingTotal, 1275500);
  assert.equal(cometa.evidenciaNumerica.alcance.filtrosSolicitados.q, 'Cometa');
  assert.equal(financial.filter(result => result.respuesta.items.length === 0).length, 3, 'unknown q, another month and another quarter must not impersonate a full ledger');
  const selection = financial.find(result => result.evidenciaNumerica.seleccion)?.evidenciaNumerica.seleccion;
  assert.equal(selection.completa, true);
  assert.equal(selection.sumasExactas.find(row => row.campo === 'outstandingTotal').centavos, '357550000');
  assert.deepEqual(fixture.outcomes[0].answer.failures, []);
  assert.deepEqual(fixture.writes, []);
});

test('financial preflight separates cash, receivables and payables and preserves native filters and pagination totals', async () => {
  const fixture = await runGroundedReadPreflight();
  const read = path => fixture.calls.find(call => call.name === 'consultar_plataforma' && call.args.ruta === path).result;
  const dashboard = read('/financials/dashboard');
  assert.equal(dashboard.respuesta.sourceSummary.totals.income, 900000);
  assert.equal(dashboard.respuesta.sourceSummary.totals.expense, 250000);
  assert.equal(dashboard.respuesta.sourceSummary.totals.netFlow, 650000);
  assert.equal(dashboard.respuesta.sourceSummary.totals.receivable, 6612000);
  const filtered = read('/financials/dashboard?year=2026&month=10&type=INCOME');
  assert.equal(filtered.respuesta.sourceSummary.totals.expense, 0);
  assert.equal(filtered.respuesta.sourceSummary.totals.receivable, 6612000, 'cash filters cannot erase or become the receivable scope');
  const cometa = read('/financials/dashboard?year=2026&quarter=4&q=Cometa');
  assert.equal(cometa.respuesta.sourceSummary.totals.income, 900000);
  assert.equal(cometa.respuesta.sourceSummary.totals.receivable, 1275500);
  const page = read('/financials/records?year=2026&month=10&page=2&pageSize=1');
  assert.equal(page.respuesta.items.length, 1);
  assert.equal(page.respuesta.total, 3);
  assert.equal(page.respuesta.totals.net, 650000);
  assert.equal(page.evidenciaNumerica.alcance.filasCompletas, false);
  assert.equal(read('/financials/records?year=2026&month=10&category=ADMINISTRATIVO').respuesta.totals.expense, 150000);
  assert.equal(read('/financials/records?year=2026&month=11').respuesta.total, 0);
  assert.equal(read('/financials/payables-ledger?year=2026&month=10').respuesta.totals.outstanding, 775000);
  assert.equal(read('/financials/payables-ledger?year=2026&month=10').respuesta.totals.paidInPeriod, 100000);
  assert.equal(read('/financials/payables-ledger?year=2026&month=10&q=Marea').respuesta.totals.outstanding, 500000);
  const nextPeriod = read('/financials/payables-ledger?year=2026&month=11').respuesta;
  assert.equal(nextPeriod.totals.outstanding, 775000, 'open supplier balances retain their native all-date scope');
  assert.equal(nextPeriod.totals.paidInPeriod, 0, 'payments have the selected period scope');
  assert.equal(read('/financials/payables-ledger?thirdPartyId=vendor-pliegue&status=PAGADA').respuesta.items.length, 1);
});

test('each accepted phase is checkpointed before a later failure, without accepting the failing response', async () => {
  const fixture = createGroundedAnswersFixture(scripted({ financeAnswer: answers[1].replace('6.612.000', '6.712.000') }));
  const accepted = [];
  await assert.rejects(runGroundedAnswersScenario(fixture, { onAccepted: async (outcome, phase) => { accepted.push({ phase, question: outcome.question }); } }));
  assert.deepEqual(accepted, [{ phase: 0, question: GROUNDED_QUESTIONS[0] }]);
  assert.equal(fixture.outcomes.length, 2);
});
