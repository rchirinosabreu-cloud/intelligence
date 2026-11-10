import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildDecisionBoard, observerCategoryLabel, responseProblem, readingVerdictFor, observerActionFor,
  laterUntil, DISCARD_REASONS, LATER_OPTIONS, learnedObserverKeys, currentWeekStart, openLabel, ownerRouting, listNames, meetingDriveUrl
} from '../src/lib/managerDecisions.js';

const NOW = new Date('2026-11-10T15:00:00.000Z'); // martes 10:00 en Bogotá

const reading = {
  day: '2026-11-10',
  signals: [
    { id: 'ROJO_SOSTENIDO:c1', kind: 'ROJO_SOSTENIDO', subjectType: 'CLIENT', subjectId: 'c1', subjectName: 'Verona', severity: 3, text: 'Verona lleva 8 días en rojo.' },
    { id: 'SIN_MOVIMIENTO:c2', kind: 'SIN_MOVIMIENTO', subjectType: 'CLIENT', subjectId: 'c2', subjectName: 'Aristea', severity: 2, text: 'Nadie registró tiempo de Aristea.' }
  ]
};
const decisions = [
  { id: '2026-11-10:1', kind: 'VIGILAR', title: 'Vigilar a Aristea', why: 'Sin movimiento', evidence: ['SIN_MOVIMIENTO:c2'], subjectType: 'CLIENT', subjectId: 'c2', subjectName: 'Aristea', url: '/clientes/operacion/aristea' },
  { id: '2026-11-10:2', kind: 'HACER', title: 'Revisar la operación de Verona', why: 'Lleva 8 días en rojo', ask: 'Revisa Verona', evidence: ['ROJO_SOSTENIDO:c1'], subjectType: 'CLIENT', subjectId: 'c1', subjectName: 'Verona', url: '/clientes/operacion/verona' },
  { id: '2026-11-10:3', kind: 'NO_HACER', title: 'No mover a Kamila', why: 'Ya tiene carga', evidence: [], subjectType: 'PERSON', subjectId: 'p1', subjectName: 'Kamila' }
];
const signal = (over = {}) => ({
  id: 's1', status: 'OPEN', category: 'PENDING_REGISTRATION', sourceKind: 'MEETING_MINUTE', severity: 'warning', clientId: 'c1',
  title: 'Falta registrar el contrato de Verona', evidence: 'Hay que subir el contrato firmado de Verona', suggestedAction: 'Subir el contrato',
  sourceUrl: '/minutas/m1', lastDetectedAt: '2026-11-09T20:00:00.000Z', metadata: null, ...over
});

test('nunca muestra un código en inglés como categoría', () => {
  assert.equal(observerCategoryLabel('PENDING_REGISTRATION'), 'Falta registrar algo');
  assert.equal(observerCategoryLabel('RESOURCE_DEFINITION'), 'Falta definir un recurso');
  assert.equal(observerCategoryLabel('COMMERCIAL_CLARIFICATION'), 'Aclaración comercial');
  assert.equal(observerCategoryLabel('AMBIGÜEDAD'), 'Ambigüedad');
  // Lo que el análisis de minutas inventa se agrupa por familia, nunca se muestra crudo.
  assert.equal(observerCategoryLabel('UNEXPLAINED_CHARGE'), 'Dinero');
  assert.equal(observerCategoryLabel('CONTRACT_DATE_INCONSISTENCY'), 'Contrato');
  assert.equal(observerCategoryLabel('PENDING_DATE_CONFIRMATION'), 'Fechas');
  assert.equal(observerCategoryLabel('MISSING_ATTACHMENTS'), 'Información pendiente');
  assert.equal(observerCategoryLabel('OPERATING_LOAD'), 'Equipo y responsables');
  assert.equal(observerCategoryLabel('SOMETHING_NEW_ENTIRELY', 'MEETING_MINUTE'), 'Señal de una reunión');
  assert.equal(observerCategoryLabel('', 'TASK_ANALYTICS'), 'Señal de las tareas');
  for (const code of ['PROCESS_GAP', 'DATA_QUALITY', 'PENDING_REVIEW', 'DELIVERY_RISK', 'INFORMATION_GAP', 'FINANCIAL_RISK', 'ACCESS_BLOCKER', 'DEADLINE_PRESSURE', 'WORKLOAD_RISK', 'OPERATIONAL_RISK', 'OPERATIONS']) {
    assert.doesNotMatch(observerCategoryLabel(code), /[A-Z]{2,}_|^[A-Z_]+$/);
  }
});

test('el tablero junta la lectura y el Observer, ordenado por lo más urgente', () => {
  const board = buildDecisionBoard({ reading, decisions, entries: [], signals: [signal()], dismissed: [], clients: { c1: 'Verona' }, now: NOW });
  assert.deepEqual(board.pending.map(card => card.key), ['L:2026-11-10:2', 'O:s1', 'L:2026-11-10:1']);
  const [first, second] = board.pending;
  assert.equal(first.source, 'LECTURA');
  assert.equal(first.kindLabel, 'Hacer');
  assert.equal(first.level, 'alta');
  assert.equal(first.subjectName, 'Verona');
  assert.equal(second.categoryLabel, 'Falta registrar algo');
  assert.equal(second.sourceLabel, 'Reunión');
  const fromMeeting = buildDecisionBoard({ signals: [signal({ metadata: { meetingTitle: 'Reunión M&N', meetingAt: '2026-11-09T16:00:00.000Z', owner: 'Camila' } })], now: NOW }).pending[0];
  assert.equal(fromMeeting.sourceLabel, 'Reunión «Reunión M&N», 9 nov');
  assert.equal(fromMeeting.owner, 'Camila');
  assert.equal(second.quote, 'Hay que subir el contrato firmado de Verona');
  assert.equal(second.subjectName, 'Verona');
  // Lo que Bria no haría se dice aparte y no pide botones.
  assert.deepEqual(board.avoid.map(card => card.title), ['No mover a Kamila']);
  assert.equal(board.counts.pending, 3);
});

test('lo ya respondido sale de los pendientes y queda con su respuesta', () => {
  const entries = [{ decisionId: '2026-11-10:2', dayKey: '2026-11-10', verdict: 'NO', note: 'Descartada: Espera al cliente.', decidedAt: '2026-11-10T14:00:00.000Z' }];
  const board = buildDecisionBoard({ reading, decisions, entries, signals: [signal({ status: 'REVIEWED' })], dismissed: [], clients: {}, now: NOW });
  assert.deepEqual(board.pending.map(card => card.key), ['L:2026-11-10:1']);
  assert.deepEqual(board.answered.map(card => [card.key, card.answer.label]), [['L:2026-11-10:2', 'Descartada']]);
  assert.deepEqual(board.taken.map(card => card.key), ['O:s1']);
});

test('una respuesta de otro día no tapa la decisión de hoy', () => {
  const entries = [{ decisionId: '2026-11-10:2', dayKey: '2026-11-09', verdict: 'HECHO' }];
  const board = buildDecisionBoard({ reading, decisions, entries, signals: [], dismissed: [], clients: {}, now: NOW });
  assert.ok(board.pending.some(card => card.key === 'L:2026-11-10:2'));
});

test('tres descartes del mismo tipo y cliente en 30 días: Bria aprende y lo agrupa aparte', () => {
  const dismissed = ['2026-10-20', '2026-10-28', '2026-11-05'].map((day, i) => ({ id: `d${i}`, category: 'PENDING_REGISTRATION', clientId: 'c1', dismissedAt: `${day}T15:00:00.000Z`, metadata: { dismissal: { reason: 'NO_PRIORIDAD' } } }));
  assert.deepEqual([...learnedObserverKeys(dismissed, { now: NOW })], ['Falta registrar algo|c1']);
  const board = buildDecisionBoard({ reading, decisions, entries: [], signals: [signal()], dismissed, clients: { c1: 'Verona' }, now: NOW });
  assert.ok(!board.pending.some(card => card.key === 'O:s1'));
  assert.equal(board.learned.length, 1);
  assert.equal(board.learned[0].label, 'Falta registrar algo · Verona');
  // «La información no es correcta» no enseña a callar: enseña que el detector se equivocó.
  const wrong = dismissed.map(row => ({ ...row, metadata: { dismissal: { reason: 'INFO_INCORRECTA' } } }));
  assert.equal(learnedObserverKeys(wrong, { now: NOW }).size, 0);
  // Fuera de los 30 días no cuenta.
  const old = dismissed.map(row => ({ ...row, dismissedAt: '2026-09-01T15:00:00.000Z' }));
  assert.equal(learnedObserverKeys(old, { now: NOW }).size, 0);
});

test('una señal crítica nunca se calla aunque se haya descartado antes', () => {
  const dismissed = ['2026-10-20', '2026-10-28', '2026-11-05'].map((day, i) => ({ id: `d${i}`, category: 'PENDING_REGISTRATION', clientId: 'c1', dismissedAt: `${day}T15:00:00.000Z`, metadata: { dismissal: { reason: 'NO_PRIORIDAD' } } }));
  const board = buildDecisionBoard({ reading, decisions: [], entries: [], signals: [signal({ severity: 'critical' })], dismissed, clients: {}, now: NOW });
  assert.deepEqual(board.pending.map(card => card.key), ['O:s1']);
});

test('solo cuenta la semana vigente: lo de semanas anteriores desaparece del tablero', () => {
  assert.equal(currentWeekStart(NOW), '2026-11-09T05:00:00.000Z');
  assert.equal(currentWeekStart(new Date('2026-11-16T04:00:00.000Z')), '2026-11-09T05:00:00.000Z'); // domingo 23:00 en Bogotá
  const lastWeek = signal({ id: 's-old', metadata: { meetingTitle: 'Comité', meetingAt: '2026-11-06T15:00:00.000Z' } });
  const takenLastWeek = signal({ id: 's-taken', status: 'REVIEWED', metadata: { meetingAt: '2026-11-05T15:00:00.000Z' } });
  const board = buildDecisionBoard({ reading, decisions, entries: [], signals: [signal(), lastWeek, takenLastWeek], dismissed: [], clients: {}, now: NOW });
  assert.ok(!board.pending.some(card => card.key === 'O:s-old'));
  assert.equal(board.taken.length, 0);
  assert.equal(board.counts.outsideWeek, 2);
  assert.ok(board.pending.some(card => card.key === 'O:s1'));
});

test('la revisión genérica de las reglas se muestra con el hecho como título', () => {
  const generic = { id: '2026-11-10:7', kind: 'VIGILAR', title: 'Revisar el compromiso de Verona', why: 'Hay una señal registrada. Falta contrastar el compromiso…', needsContextReview: true, evidence: ['ROJO_SOSTENIDO:c1'], subjectType: 'CLIENT', subjectId: 'c1', subjectName: 'Verona' };
  const withDetail = { ...reading, signals: [{ ...reading.signals[0], text: 'Verona lleva 23 días en rojo: Octubre: 10 de 12 publicadas; faltan 2 piezas.' }] };
  const [card] = buildDecisionBoard({ reading: withDetail, decisions: [generic], now: NOW }).pending;
  assert.equal(card.title, 'Verona lleva 23 días en rojo');
  assert.equal(card.why, 'Octubre: 10 de 12 publicadas; faltan 2 piezas.');
  assert.doesNotMatch(JSON.stringify(card), /Falta contrastar el compromiso/);
});

test('cada enlace dice a dónde lleva', () => {
  assert.equal(openLabel('/minutas?minute=1'), 'Ver la reunión');
  assert.equal(openLabel('/gestion?responsable=Ana'), 'Ver sus tareas');
  assert.equal(openLabel('/clientes/operacion/verona'), 'Ver la cuenta');
  assert.equal(openLabel('/otra'), 'Ver el detalle');
});
test('una decisión grave de la lectura va antes que una señal «crítica» de una reunión', () => {
  const board = buildDecisionBoard({ reading, decisions: [decisions[0], { ...decisions[0], id: '2026-11-10:9', kind: 'VIGILAR', evidence: ['ROJO_SOSTENIDO:c1'] }], entries: [], signals: [signal({ severity: 'critical' })], dismissed: [], clients: {}, now: NOW });
  assert.deepEqual(board.pending.map(card => card.key), ['L:2026-11-10:9', 'O:s1', 'L:2026-11-10:1']);
  assert.equal(board.pending[1].level, 'alta');
});

test('una señal aplazada no aparece hasta su fecha', () => {
  const board = buildDecisionBoard({ reading: null, decisions: [], entries: [], signals: [signal({ status: 'SNOOZED', snoozedUntil: '2026-11-12T13:00:00.000Z' })], dismissed: [], clients: {}, now: NOW });
  assert.equal(board.pending.length, 0);
  assert.equal(board.counts.later, 1);
});

test('las respuestas se validan en un solo sitio', () => {
  assert.equal(responseProblem({ source: 'LECTURA', id: 'x', respuesta: 'HACER' }), null);
  assert.match(responseProblem({ source: 'OTRA', id: 'x', respuesta: 'HACER' }), /origen/);
  assert.match(responseProblem({ source: 'LECTURA', id: '', respuesta: 'HACER' }), /cuál/);
  assert.match(responseProblem({ source: 'LECTURA', id: 'x', respuesta: 'DESCARTAR' }), /motivo/);
  assert.match(responseProblem({ source: 'LECTURA', id: 'x', respuesta: 'DESCARTAR', motivo: 'OTRO' }), /cuéntame/i);
  assert.equal(responseProblem({ source: 'LECTURA', id: 'x', respuesta: 'DESCARTAR', motivo: 'OTRO', nota: 'Lo maneja MIO' }), null);
  assert.match(responseProblem({ source: 'OBSERVER', id: 'x', respuesta: 'MAS_TARDE' }), /cuándo/);
  assert.equal(responseProblem({ source: 'OBSERVER', id: 'x', respuesta: 'MAS_TARDE', hasta: 'MANANA' }), null);
  assert.match(responseProblem({ source: 'OBSERVER', id: 'x', respuesta: 'DESCARTAR', motivo: 'X' }), /motivo/);
  assert.match(responseProblem({ source: 'LECTURA', id: 'x', respuesta: 'HACER', nota: 'a'.repeat(301) }), /300/);
  assert.equal(DISCARD_REASONS.length, 5);
  assert.equal(LATER_OPTIONS.length, 3);
});

test('cada botón llega al libro de decisiones con un veredicto real', () => {
  assert.deepEqual(readingVerdictFor({ respuesta: 'HACER' }), { veredicto: 'HECHO', nota: null });
  assert.deepEqual(readingVerdictFor({ respuesta: 'DESCARTAR', motivo: 'ESPERA_CLIENTE', nota: 'Gema no responde' }), { veredicto: 'NO', nota: 'Descartada: Espera al cliente. Gema no responde' });
  assert.deepEqual(readingVerdictFor({ respuesta: 'DESCARTAR', motivo: 'OTRO', nota: 'La maneja MIO' }), { veredicto: 'NO', nota: 'Descartada: La maneja MIO' });
  assert.deepEqual(readingVerdictFor({ respuesta: 'MAS_TARDE', hasta: 'PROXIMA_SEMANA' }, { now: NOW }), { veredicto: 'DESPUES', nota: 'Más tarde: la próxima semana (martes 17 de noviembre).' });
});

test('en el Observer, cada botón cambia el estado y deja el motivo para aprender', () => {
  assert.deepEqual(observerActionFor({ respuesta: 'HACER' }, { now: NOW }), { action: 'REVIEW' });
  const dismiss = observerActionFor({ respuesta: 'DESCARTAR', motivo: 'NO_PRIORIDAD', nota: '' }, { now: NOW });
  assert.equal(dismiss.action, 'DISMISS');
  assert.deepEqual(dismiss.dismissal, { reason: 'NO_PRIORIDAD', label: 'No es prioridad ahora', note: null });
  // «Ya está resuelto» es resolver, no descartar.
  assert.equal(observerActionFor({ respuesta: 'DESCARTAR', motivo: 'YA_RESUELTO' }, { now: NOW }).action, 'RESOLVE');
  const later = observerActionFor({ respuesta: 'MAS_TARDE', hasta: 'MANANA' }, { now: NOW });
  assert.equal(later.action, 'SNOOZE');
  assert.equal(later.snoozedUntil, '2026-11-11T13:00:00.000Z');
});

test('«más tarde» cae en un día hábil, a las 8:00 de Bogotá', () => {
  // Viernes 13 de noviembre: el lunes 16 es festivo (Independencia de Cartagena), así que «mañana» es el martes 17.
  const friday = new Date('2026-11-13T15:00:00.000Z');
  assert.equal(laterUntil('MANANA', friday), '2026-11-17T13:00:00.000Z');
  assert.equal(laterUntil('TRES_DIAS', NOW), '2026-11-13T13:00:00.000Z');
  assert.equal(laterUntil('PROXIMA_SEMANA', NOW), '2026-11-17T13:00:00.000Z');
  assert.equal(laterUntil('PROXIMA_SEMANA', new Date('2026-11-18T15:00:00.000Z')), '2026-11-23T13:00:00.000Z');
  assert.equal(laterUntil('NUNCA', NOW), null);
});

test('lo mismo en varias cuentas es una sola decisión, con lo que Bria haría', () => {
  const red = ['Aristea', 'Multik', 'Verona', 'Villa Montaña'].map((name, i) => ({ id: `ROJO_SOSTENIDO:r${i}`, kind: 'ROJO_SOSTENIDO', subjectType: 'CLIENT', subjectId: `r${i}`, subjectName: name, severity: 3, text: `${name} lleva 23 días en rojo: Octubre: faltan ${i + 1} piezas.` }));
  const many = red.map((s, i) => ({ id: `2026-11-10:${i + 1}`, kind: 'VIGILAR', title: `Revisar el compromiso de ${s.subjectName}`, needsContextReview: true, evidence: [s.id], subjectType: 'CLIENT', subjectId: s.subjectId, subjectName: s.subjectName }));
  const board = buildDecisionBoard({ reading: { day: '2026-11-10', signals: red }, decisions: many, now: NOW });
  assert.equal(board.pending.length, 1);
  const [group] = board.pending;
  assert.equal(group.title, '4 cuentas siguen en rojo desde hace 23 días');
  assert.equal(group.why, 'Aristea, Multik, Verona y Villa Montaña');
  assert.deepEqual(group.refs, ['2026-11-10:1', '2026-11-10:2', '2026-11-10:3', '2026-11-10:4']);
  assert.deepEqual(group.items[0], { name: 'Aristea', text: 'Octubre: faltan 1 piezas.' });
  assert.match(group.ask, /^Revisa por qué Aristea, Multik, Verona y Villa Montaña siguen en rojo/);
  assert.equal(group.url, '/clientes?tab=operacion');
  // Una sola no se agrupa, pero recibe lo que Bria haría.
  const single = buildDecisionBoard({ reading: { day: '2026-11-10', signals: red }, decisions: [many[0]], now: NOW }).pending[0];
  assert.equal(single.key, 'L:2026-11-10:1');
  assert.match(single.ask, /^Revisa por qué Aristea siguen en rojo|^Revisa por qué Aristea/);
  assert.equal(listNames(['A', 'B', 'C', 'D', 'E'], 3), 'A, B, C y 2 más');
});

test('lo que quedó a cargo de otra persona del equipo le toca a ella, no a quien mira', () => {
  const team = ['Rodny Chirinos', 'Kamila del Toro', 'Francisco Villa'];
  assert.deepEqual(ownerRouting('Kamila del Toro', { team, viewerName: 'Rodny Chirinos' }), { mine: false, people: ['Kamila del Toro'] });
  assert.deepEqual(ownerRouting('Rodny y Kamila', { team, viewerName: 'Rodny Chirinos' }), { mine: true, people: ['Kamila del Toro'] });
  assert.deepEqual(ownerRouting('Social Brain Studio', { team, viewerName: 'Rodny Chirinos' }), { mine: true, people: [] });
  assert.deepEqual(ownerRouting('', { team, viewerName: 'Rodny Chirinos' }), { mine: true, people: [] });
  const board = buildDecisionBoard({ signals: [signal({ metadata: { owner: 'Kamila del Toro' } }), signal({ id: 's2', metadata: { owner: 'Rodny Chirinos' } })], team, viewerName: 'Rodny Chirinos', now: NOW });
  assert.deepEqual(board.pending.map(card => card.key), ['O:s2']);
  assert.equal(board.delegated[0].name, 'Kamila del Toro');
  assert.equal(board.delegated[0].count, 1);
  assert.match(board.delegated[0].ask, /^Prepara como pendientes para Kamila del Toro/);
});

test('lo que la reunión marcó como no accionable no pide decisión', () => {
  const board = buildDecisionBoard({ signals: [signal({ metadata: { actionable: false } })], now: NOW });
  assert.equal(board.pending.length, 0);
  assert.equal(board.counts.notActionable, 1);
});
test('«Ver la reunión» abre su resumen en Drive; sin Drive queda Minutas', () => {
  const url = meetingDriveUrl({ sourceKind: 'MEETING_MINUTE', sourceRecordId: 'm1' }, 'Reunión M&N');
  assert.equal(url, '/drive?folderId=bria-minutes&open=m1&q=Reuni%C3%B3n+M%26N');
  assert.equal(openLabel(url), 'Ver la reunión');
  assert.equal(meetingDriveUrl({ sourceKind: 'TASK_ANALYTICS', sourceRecordId: 'x' }), null);
  const card = buildDecisionBoard({ signals: [signal({ sourceRecordId: 'm1', metadata: { meetingTitle: 'Comité' } })], now: NOW }).pending[0];
  assert.equal(card.driveUrl, '/drive?folderId=bria-minutes&open=m1&q=Comit%C3%A9');
  assert.equal(card.url, '/minutas/m1');
});