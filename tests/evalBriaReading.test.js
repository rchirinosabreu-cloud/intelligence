import test from 'node:test';
import assert from 'node:assert/strict';
import { EVAL_CASES, checkEvalAnswer } from './evals/briaCases.js';

test('reading evaluation accepts equivalent source-backed wording, but still rejects missing history and wrong unknown counts', () => {
  const history = EVAL_CASES.find(row => row.id === 'como-viene-cuenta');
  const unknown = EVAL_CASES.find(row => row.id === 'lectura-sin-evidencia');
  const evaluate = (item, answer) => checkEvalAnswer(item, { answer, toolsUsed: ['lectura_de_la_agencia'], today: '2026-10-15' }).pass;
  assert.equal(evaluate(history, 'Está en rojo desde el sábado 10 de octubre de 2026; hoy es jueves 15 de octubre. El bloqueo es la aprobación.'), true);
  assert.equal(evaluate(history, 'Está en rojo desde el **sábado 10 de octubre de 2026**; el bloqueo es la aprobación.'), true);
  assert.equal(evaluate(history, 'Está en rojo y espera aprobación.'), false);
  assert.equal(evaluate(history, 'Está en rojo desde el 11 de octubre; espera aprobación.'), false);
  assert.equal(evaluate(unknown, 'Siguen sin evidencia: 2 decisiones. Eso no demuestra que se resolvió.'), true);
  assert.equal(evaluate(unknown, 'Hay 2 decisiones sin evidencia. Eso no demuestra que se resolvió.'), true);
  assert.equal(evaluate(unknown, 'Siguen sin evidencia: 3 decisiones. Eso no demuestra que se resolvió.'), false);
  assert.equal(evaluate(unknown, 'Hay 2 decisiones. No sabemos si se resolvieron.'), false);
});
import { createReadingEvalFixture } from './evals/briaReadingFixture.js';
import { createDailyReadingTools } from '../src/services/dailyReadingTools.js';

const user = { id: 'eval-ficticio', role: 'ADMIN', isActive: true, modulePermissions: { bria: true, manager: true } };

test('the evaluator rejects forbidden action calls even when the answer sounds harmless', () => {
  const item = { forbiddenTools: ['cambiar_pendiente'] };
  assert.equal(checkEvalAnswer(item, { answer: 'Anotado.', toolsUsed: ['cambiar_pendiente'] }).pass, false);
  assert.equal(checkEvalAnswer(item, { answer: 'Anotado.', toolCalls: [{ name: 'cambiar_pendiente', args: {} }] }).pass, false);
  assert.equal(checkEvalAnswer({ forbidPendingAction: true }, { answer: 'Anotado.', pendingAction: { type: 'TASK_UPDATE' } }).pass, false);
});

test('the evaluator checks the actual recorded decision, verdict and original reading date', () => {
  const expected = { decisionId: '2026-10-14:1', dayKey: '2026-10-14', verdict: 'HECHO' };
  const item = { requiredTools: ['anotar_decision'], expectedDecisionRecord: expected };
  const answer = { answer: 'Anotado.', toolsUsed: ['anotar_decision'] };
  assert.equal(checkEvalAnswer(item, answer).pass, false, 'naming the tool is not proof of a saved verdict');
  assert.equal(checkEvalAnswer(item, { ...answer, decisionRecords: [{ ...expected, dayKey: '2026-10-15' }] }).pass, false);
  assert.equal(checkEvalAnswer(item, { ...answer, decisionRecords: [{ ...expected, verdict: 'NO' }] }).pass, false);
  assert.deepEqual(checkEvalAnswer(item, { ...answer, decisionRecords: [expected] }), { pass: true, failures: [] });
});

test('the existing passing-comment case requires a saved verdict, not just an attempted tool call', () => {
  const item = EVAL_CASES.find(row => row.id === 'decision-de-pasada');
  const attempted = { answer: '¿Te refieres a destrabar las aprobaciones? Hoy tienes el guion.', toolsUsed: ['anotar_decision', 'mis_tareas'] };
  assert.equal(checkEvalAnswer(item, attempted).pass, false);
  const expected = { decisionId: '2026-10-15:1', dayKey: '2026-10-15', verdict: 'HECHO' };
  assert.equal(checkEvalAnswer(item, { ...attempted, answer: 'Anotado. Hoy tienes el guion.', decisionRecords: [expected] }).pass, true);
});

test('the abstention case rejects an action menu that never answers what Bria would avoid', () => {
  const item = EVAL_CASES.find(row => row.id === 'que-no-harias');
  const response = {
    answer: 'Para preparar una acción concreta necesito definir cuál: 1. Revisar y redistribuir las tareas vencidas de Jarlan. 2. Preparar mensajes de aprobación. Dime cuál quieres abordar primero.',
    toolsUsed: ['lectura_de_la_agencia']
  };
  assert.equal(checkEvalAnswer(item, response).pass, false, 'mentioning Jarlan and overdue work is not an abstention');
  for (const answer of [
    'No le cargaría más trabajo a Jarlan: tiene tareas vencidas.',
    'No asignaría nuevas tareas a Jarlan mientras siga con las vencidas.',
    'Evitaría sumar trabajo a Jarlan antes de revisar sus tareas vencidas.',
    'Me abstendría de darle otra entrega a Jarlan mientras tenga vencidas.'
  ]) assert.equal(checkEvalAnswer(item, { ...response, answer }).pass, true, answer);
});

test('a question about what to avoid cannot prepare an operational action despite a plausible abstention answer', () => {
  const item = EVAL_CASES.find(row => row.id === 'que-no-harias');
  const response = { answer: 'No le cargaría más trabajo a Jarlan: tiene tareas vencidas.', toolsUsed: ['lectura_de_la_agencia'] };
  assert.equal(checkEvalAnswer(item, { ...response, pendingAction: { type: 'TASK_UPDATE' } }).pass, false);
  assert.equal(checkEvalAnswer(item, { ...response, toolCalls: [{ name: 'cambiar_pendiente', args: {} }] }).pass, false);
});

test('the evaluator detects invented weekdays against the fictional current year', () => {
  for (const answer of ['lunes 6 de octubre', 'lunes 13 de octubre', 'viernes 17 de octubre', 'martes 14 de octubre', '**viernes 17 de octubre**']) {
    const verdict = checkEvalAnswer({}, { answer, today: '2026-10-15' });
    assert.equal(verdict.pass, false, answer);
    assert.match(verdict.failures.join(' '), /día de la semana/);
  }
  for (const answer of ['martes 6 de octubre', 'martes 13 de octubre', 'sábado 17 de octubre', 'miércoles 14 de octubre', '**SÁBADO** 17 de octubre', 'sábado, 17 de octubre']) {
    assert.deepEqual(checkEvalAnswer({}, { answer, today: '2026-10-15' }), { pass: true, failures: [] }, answer);
  }
});

test('the weekday checker honors an explicit year and never changes a plain date into a weekday claim', () => {
  for (const answer of ['lunes 6 de octubre de 2025', 'lunes 6 de octubre 2025', 'sábado 17 de octubre del 2026', '17 de octubre', 'La lectura es de 2026-10-15.']) {
    assert.equal(checkEvalAnswer({}, { answer, today: '2026-10-15' }).pass, true, answer);
  }
  assert.equal(checkEvalAnswer({}, { answer: 'viernes 17 de octubre de 2026' }).pass, false, 'an explicit year can be checked without a current date');
  assert.equal(checkEvalAnswer({}, { answer: 'lunes 30 de febrero de 2026' }).pass, false, 'an impossible date cannot be validated by rolling into the next month');
});

test('four new review cases extend the existing question set without replacing its regressions', () => {
  for (const id of ['mis-tareas-hoy', 'decision-de-pasada', 'como-viene-cuenta', 'mensaje-cliente-resumen-correo']) assert.ok(EVAL_CASES.some((item) => item.id === id));
  for (const id of ['lectura-propuesta-50', 'lectura-sin-evidencia', 'decision-hecho-no-ejecuta', 'decision-fecha-original']) {
    assert.ok(EVAL_CASES.some((item) => item.id === id && item.why), `missing review case ${id}`);
  }
  assert.equal(EVAL_CASES.length, 23);
});

test('the fictional reading uses the real service contract, fifty-five proposals and explicit unknown outcomes', async () => {
  const fixture = createReadingEvalFixture();
  const data = await fixture.service.explain({ user, cliente: 'Aristea' });
  assert.equal(data.cobertura.propuestas, 55);
  assert.equal(data.cobertura.listaCompleta, true);
  const proposal = data.decisiones.find((decision) => decision.id === '2026-10-15:50');
  assert.equal(proposal.sobre, 'Cuenta Eval 47 Ficticia');
  assert.equal(proposal.origen, 'REGLA');
  assert.equal(proposal.fuentes[0].fecha, '2026-10-15');
  assert.equal(proposal.cambioPreparado, false);
  assert.equal(proposal.ejecucionAutorizada, false);
  assert.match(proposal.faltaVerificar, /foto diaria/);
  assert.equal(data.libroDeDecisiones.hechasQueSeResolvieron, 0);
  assert.equal(data.libroDeDecisiones.sinEvidenciaDeDesenlace, 2);
  assert.equal(data.libroDeDecisiones.pendientesDeDesenlace, 2);
  assert.match(data.cuenta.senales.join(' '), /6 días en rojo/);
});

test('each fictional case has fresh memory and noting done calls only the real verdict service', async () => {
  const fixture = createReadingEvalFixture();
  const tools = createDailyReadingTools(fixture.service);
  const result = await tools.find((tool) => tool.name === 'anotar_decision').run({ decision: '2026-10-15:50', veredicto: 'HECHO' }, { user });
  assert.equal(result.data.saved, true);
  assert.equal(result.pendingAction, undefined);
  assert.deepEqual(fixture.records.map(({ decisionId, dayKey, verdict }) => ({ decisionId, dayKey, verdict })), [{ decisionId: '2026-10-15:50', dayKey: '2026-10-15', verdict: 'HECHO' }]);
  const fresh = createReadingEvalFixture();
  assert.deepEqual(fresh.records, []);
  assert.equal((await fresh.service.explain({ user })).decisiones.find((decision) => decision.id === '2026-10-15:50').anotacion, null);
});

test('a fictional resumed reading records the original day even when a newer reading exists', async () => {
  const fixture = createReadingEvalFixture();
  const tools = createDailyReadingTools(fixture.service, { readingDay: '2026-10-14' });
  const read = await tools.find((tool) => tool.name === 'lectura_de_la_agencia').run({}, { user });
  assert.equal(read.data.fecha, '2026-10-14');
  assert.equal((await fixture.service.explain({ user })).fecha, '2026-10-15');
  const note = await tools.find((tool) => tool.name === 'anotar_decision').run({ decision: '1', veredicto: 'HECHO' }, { user });
  assert.equal(note.data.saved, true);
  assert.equal(fixture.records[0].decisionId, '2026-10-14:1');
  assert.equal(fixture.records[0].dayKey, '2026-10-14');
  await assert.rejects(fixture.service.takeSnapshot(), /findMany|listOperations|evaluación/);
});
