// Hábitos por área (Rodny, 12 de noviembre de 2026: «Sí, hábitos por área»): los mismos hábitos, leídos también de la
// fuente de cada área. Regla pura: cada fuente da un chequeo y el hábito se gana solo si todo lo jugado salió bien.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  plansOverdueCheck, crmFollowUpCheck, adBudgetsCheck, piecesOnTimeCheck, crmNotesCheck, financialSupportCheck, mergeAreaChecks, hasRealContext, MIN_CONTEXT_CHARS
} from '../src/lib/leagueAreaChecks.js';

// Rodny, 12 de noviembre de 2026: «algunos para documentar ponen solo un puntico … al menos un comentario de 20 caracteres».
test('real context: twenty letters or digits, a file or a link; dots, spaces, emojis and markup do not count', () => {
  assert.equal(MIN_CONTEXT_CHARS, 20);
  for (const empty of [null, '', '.', '...', 'ok', '👍👍👍', '<p>.</p>', '   ———   ', 'Listo, ya quedó.']) assert.equal(hasRealContext(empty), false, empty);
  assert.equal(hasRealContext('Versión vertical para historias'), true);
  assert.equal(hasRealContext('<p><strong>Ver</strong> el brief del cliente, página 2</p>'), true);
  assert.equal(hasRealContext('<p>' + 'a'.repeat(19) + '</p>'), false, 'tags never add letters');
  assert.equal(hasRealContext('Brief: https://drive.google.com/x'), true, 'a link is context even when short');
  assert.equal(hasRealContext('www.cliente.com'), true);
});

const NOW = new Date('2026-11-12T20:00:00Z'); // jueves 12, 15:00 de Bogotá

test('plans: the accounts a person carries play; any overdue piece loses the day and says where', () => {
  assert.equal(plansOverdueCheck([]), null, 'no accounts: not played');
  assert.deepEqual(plansOverdueCheck([{ clientName: 'Verona', overdue: 0 }, { clientName: 'Pablo Hoff', overdue: 0 }]),
    { source: 'Parrillas', ok: true, text: 'Sin piezas atrasadas en sus 2 cuentas.' });
  const late = plansOverdueCheck([{ clientName: 'Verona', overdue: 2 }, { clientName: 'Pablo Hoff', overdue: 1 }, { clientName: 'Endova', overdue: 0 }]);
  assert.equal(late.ok, false);
  assert.equal(late.text, '3 piezas con fecha pasada sin publicar: Verona y Pablo Hoff.');
});

test('crm: only open leads play; an overdue follow-up loses, a closed or archived lead never counts', () => {
  assert.equal(crmFollowUpCheck([], NOW), null);
  assert.equal(crmFollowUpCheck([{ stage: 'GANADO', nextFollowUpAt: '2026-11-01' }], NOW), null, 'closed stages do not play');
  const clean = crmFollowUpCheck([{ stage: 'PROPUESTA_ENVIADA', nextFollowUpAt: '2026-11-12' }, { stage: 'POR_GESTIONAR', nextFollowUpAt: null }], NOW);
  assert.deepEqual(clean, { source: 'CRM', ok: true, text: 'Sin seguimientos vencidos.' });
  const late = crmFollowUpCheck([{ stage: 'NEGOCIACION', nextFollowUpAt: '2026-11-11' }, { stage: 'PROPUESTA_ENVIADA', nextFollowUpAt: '2026-11-05' }], NOW);
  assert.deepEqual(late, { source: 'CRM', ok: false, text: '2 seguimientos vencidos.' });
});

test('ads: a budget the person carries plays; a closed cycle without its final spend is the only thing overdue', () => {
  assert.equal(adBudgetsCheck([]), null);
  assert.deepEqual(adBudgetsCheck([{ pendingClose: null }, { pendingClose: null }]), { source: 'Pautas', ok: true, text: 'Sin gasto final pendiente en sus 2 pautas.' });
  assert.deepEqual(adBudgetsCheck([{ pendingClose: { cycle: {} } }, { pendingClose: null }]), { source: 'Pautas', ok: false, text: 'Falta el gasto final de 1 pauta.' });
});

test('pieces of the day: published or scheduled counts as on time; anything else is late', () => {
  assert.equal(piecesOnTimeCheck([]), null);
  assert.deepEqual(piecesOnTimeCheck([{ status: 'PUBLICADO' }, { status: 'PROGRAMADO' }]), { source: 'Parrillas', ok: true, text: '2 de 2 piezas de hoy publicadas o programadas.' });
  assert.deepEqual(piecesOnTimeCheck([{ status: 'PUBLICADO' }, { status: 'APROBADO' }, { status: 'BORRADOR' }]), { source: 'Parrillas', ok: false, text: '1 de 3 piezas de hoy publicadas o programadas.' });
});

test('crm notes and financial support: what the person registered carries context', () => {
  assert.equal(crmNotesCheck([]), null);
  assert.deepEqual(crmNotesCheck([{ note: 'Pidió la propuesta en PDF para el lunes' }, { note: ' ', result: 'Agendó reunión con la gerente el martes' }, { note: '.', result: null }]),
    { source: 'CRM', ok: false, text: '2 de 3 gestiones con nota.' }, 'a dot is not a note');
  assert.equal(financialSupportCheck([], []), null);
  const records = [{ hasDocument: true }, { notes: 'Pago quincena' }, { reference: 'TRF-88' }];
  assert.deepEqual(financialSupportCheck(records, [{ hasDocument: false, documentNumber: 'FV-12' }]),
    { source: 'Financiero', ok: true, text: '4 de 4 registros con soporte o nota.' });
  assert.deepEqual(financialSupportCheck([{ hasDocument: false, notes: '  ', reference: null }], []),
    { source: 'Financiero', ok: false, text: '0 de 1 registro con soporte o nota.' });
});

test('merge: a source plays even without tasks, and the habit is won only if every played source passed', () => {
  const plan = { source: 'Parrillas', ok: true, text: 'Sin piezas atrasadas en sus 2 cuentas.' };
  const late = { source: 'CRM', ok: false, text: '1 seguimiento vencido.' };
  // Sin tareas el hábito no se jugaba; con una fuente de su área, sí.
  const habits = { AL_DIA: null, A_TIEMPO: true, DOCUMENTADO: true, RELOJ: true };
  const evidence = { AL_DIA: 'Sin foto de las 6:00 ese día.', A_TIEMPO: '1 de 1 a tiempo.', DOCUMENTADO: '1 de 1 tareas creadas con comentario o archivo.', RELOJ: 'x' };
  mergeAreaChecks(habits, evidence, { AL_DIA: [plan, null], DOCUMENTADO: [late], A_TIEMPO: [] });
  assert.equal(habits.AL_DIA, true);
  assert.equal(evidence.AL_DIA, 'Parrillas: Sin piezas atrasadas en sus 2 cuentas.', 'an unplayed task part is not repeated');
  assert.equal(habits.DOCUMENTADO, false, 'one failing source loses the habit');
  assert.equal(evidence.DOCUMENTADO, 'Tareas: 1 de 1 tareas creadas con comentario o archivo. · CRM: 1 seguimiento vencido.');
  assert.equal(habits.A_TIEMPO, true, 'no checks leaves the habit untouched');
  assert.equal(evidence.A_TIEMPO, '1 de 1 a tiempo.');
  assert.equal(habits.RELOJ, true);
  // Una tarea perdida no la recupera una fuente que pasó.
  const lost = { AL_DIA: false }, why = { AL_DIA: 'Amaneció con 1 vencida.' };
  mergeAreaChecks(lost, why, { AL_DIA: [plan] });
  assert.equal(lost.AL_DIA, false);
});
