// Los cinco puntos de un día hábil (2 de noviembre de 2026): la regla pura que evalúa a una persona en un día con lo
// que la plataforma ya registra: sus cierres con sus relojes, sus sesiones, las vencidas con que amaneció y lo que le
// devolvieron. Un hábito que no se jugó es `null` y nunca resta; un juicio nunca aparece en la evidencia.
import test from 'node:test';
import assert from 'node:assert/strict';
import { effortPoints } from '../src/lib/platformLeague.js';
import { evaluateLeagueDay, isoWeekKey, isoWeekRange, previousWeekRange, openWindowOf, bogotaTimeOf, isProductionWork, workRecordFromTrace, withPublicationEffort, MIN_MEASURED_MS, FORGOTTEN_SESSION_MS } from '../src/lib/leagueDay.js';

const DAY = '2026-11-03';
const task = (over = {}) => ({ id: 't1', title: 'Reel', completedAt: `${DAY}T20:10:00.000Z`, originalDueDate: `${DAY}T12:00:00.000Z`, measuredMs: 45 * 60_000, declared: false, documented: true, ...over });
const session = (over = {}) => ({ durationMs: 45 * 60_000, isOverlapping: false, correctedAt: null, closeReason: 'PAUSED', ...over });

test('Documentado belongs to tasks created with context, independently of closing tasks', () => {
  assert.equal(evaluateLeagueDay({ day: DAY, createdTasks: [{ documented: true }] }).habits.DOCUMENTADO, true);
  assert.equal(evaluateLeagueDay({ day: DAY, closedTasks: [task()] }).habits.DOCUMENTADO, null);
  const mixed = evaluateLeagueDay({ day: DAY, createdTasks: [{ documented: true }, { documented: false }], closedTasks: [task()] });
  assert.equal(mixed.habits.DOCUMENTADO, false);
  assert.equal(mixed.evidence.DOCUMENTADO, '1 de 2 tareas delegadas con contexto.');
});

// Rodny, 12 de noviembre de 2026: «documentar es al menos un comentario de 20 caracteres … hay tareas que no requieren
// documentar». Solo juega lo que se le pasa a otra persona y no trae su contexto de una pieza.
test('Documentado only plays tasks delegated to someone else and not born from a content piece', () => {
  const own = evaluateLeagueDay({ day: DAY, createdTasks: [{ documented: false, delegated: false }, { documented: false, delegated: true, fromPiece: true }] });
  assert.equal(own.habits.DOCUMENTADO, null, 'a reminder for oneself or a piece task neither earns nor loses');
  assert.equal(own.evidence.DOCUMENTADO, 'Las tareas que creó eran para sí misma o salían de una pieza.');
  const delegated = evaluateLeagueDay({ day: DAY, createdTasks: [{ documented: false, delegated: false }, { documented: true, delegated: true }] });
  assert.equal(delegated.habits.DOCUMENTADO, true);
  assert.equal(delegated.evidence.DOCUMENTADO, '1 de 1 tarea delegada con contexto.');
});

test('a clean day earns the six points, each with its evidence in Spanish', () => {
  const out = evaluateLeagueDay({ day: DAY, createdTasks: [{ documented: true }], closedTasks: [task()], sessions: [session()], overdueAtDawn: 0, returnedToday: 0 });
  assert.deepEqual(out.habits, { RELOJ: true, AL_DIA: true, A_TIEMPO: true, DOCUMENTADO: true, SIN_DEVOLUCION: true, TRABAJO_REGISTRADO: true });
  assert.deepEqual(out.extras, { ESFUERZO: 1, PUBLICAR: 0, PRIMERO_EN_ABRIR: null, PRIMERO_EN_REUNION: null, RELOJ_TAREAS: [{ title: 'Reel', kind: 'ok', minutes: 45 }] }, 'the extras travel beside the habits, with the effort of the day and the tasks behind Reloj');
  assert.match(out.evidence.RELOJ, /1 tarea con reloj completo de 1/);
  assert.match(out.evidence.AL_DIA, /sin vencidas/);
  assert.match(out.evidence.TRABAJO_REGISTRADO, /Gestión de tareas/);
  for (const text of Object.values(out.evidence)) assert.doesNotMatch(text, /lento|flojo|mal\b/i);
});

// Rodny, 18 de noviembre de 2026: sin trabajo no hay hábitos regalados. Antes, quien no cerraba nada sumaba Al día y Sin
// devolución, diez puntos al día por no tener tareas.
test('a day without closings leaves every habit out of play: nothing is earned for having no work, and a return still counts', () => {
  const out = evaluateLeagueDay({ day: DAY, closedTasks: [], sessions: [], overdueAtDawn: 0, returnedToday: 0 });
  assert.deepEqual(out.habits, { RELOJ: null, AL_DIA: null, A_TIEMPO: null, DOCUMENTADO: null, SIN_DEVOLUCION: null, TRABAJO_REGISTRADO: null });
  assert.equal(evaluateLeagueDay({ day: DAY, returnedToday: 1 }).habits.SIN_DEVOLUCION, false, 'a returned task is lost even on a day without closings');
});

test('Al día is judged at the close of the day, names what was left and falls back to the dawn photo without that reading', () => {
  const clean = evaluateLeagueDay({ day: DAY, closedTasks: [task()], sessions: [session()], overdueAtDawn: 1, returnedToday: 0, closeState: { closed: 1, pending: 0, pendingTasks: [] } });
  assert.equal(clean.habits.AL_DIA, true, 'who dawned with an overdue task and closed it wins the habit');
  assert.equal(clean.evidence.AL_DIA, 'Cerró la jornada sin nada vencido.');
  const left = evaluateLeagueDay({ day: DAY, closedTasks: [task()], overdueAtDawn: 0, returnedToday: 0,
    closeState: { closed: 1, pending: 3, pendingTasks: [{ title: 'Informe octubre', dueDate: '2026-10-02T12:00:00.000Z' }, { title: 'Reel', dueDate: null }, { title: 'Post', dueDate: null }] } });
  assert.equal(left.habits.AL_DIA, false);
  assert.equal(left.evidence.AL_DIA, 'Al cierre quedaba «Informe octubre» (vencía el 2 de octubre), «Reel» y 1 más.');
  assert.equal(evaluateLeagueDay({ day: DAY, closedTasks: [task()], overdueAtDawn: 2, returnedToday: 0 }).habits.AL_DIA, false, 'without the close reading, the dawn photo');
});

test('effort pays one point per task closed, and a lost habit pays the part that was done', () => {
  const late = (n) => task({ id: `l${n}`, completedAt: `${DAY}T20:00:00.000Z`, originalDueDate: '2026-11-02T12:00:00.000Z' });
  const out = evaluateLeagueDay({ day: DAY, closedTasks: [task({ id: 'a' }), task({ id: 'b' }), task({ id: 'c' }), late(1), task({ id: 'u', measuredMs: 60_000 })], sessions: [session()], returnedToday: 0,
    closeState: { closed: 5, pending: 0, pendingTasks: [] } });
  assert.equal(out.extras.ESFUERZO, 5, 'every closing counts, with or without its clock (Rodny, 18 de noviembre de 2026)');
  assert.equal(out.habits.A_TIEMPO, false);
  assert.equal(out.habits.RELOJ, false);
  assert.deepEqual(out.extras.PROPORCION, { RELOJ: 0.8, A_TIEMPO: 0.8 });
});

test('Trabajo registrado (Rodny, 9 de noviembre de 2026): Elisa’s financial records and any other module count; only presence loses it; no trace means not played', () => {
  // Elisa registra un ingreso y un egreso en Financiero y una gestión de cobro: ninguno es una tarea.
  const elisa = evaluateLeagueDay({ day: DAY, workRecords: ['Financiero', 'Financiero', 'Financiero'], presence: true, overdueAtDawn: 0, returnedToday: 0 });
  assert.equal(elisa.habits.TRABAJO_REGISTRADO, true);
  assert.match(elisa.evidence.TRABAJO_REGISTRADO, /3 registros: Financiero\./);
  assert.equal(elisa.habits.RELOJ, null, 'without tasks the clock is not played, and it never subtracts');
  const browsing = evaluateLeagueDay({ day: DAY, presence: true, overdueAtDawn: 0, returnedToday: 0 });
  assert.equal(browsing.habits.TRABAJO_REGISTRADO, false);
  assert.match(browsing.evidence.TRABAJO_REGISTRADO, /no quedó registro de trabajo/);
  assert.equal(evaluateLeagueDay({ day: DAY, overdueAtDawn: 0, returnedToday: 0 }).habits.TRABAJO_REGISTRADO, null, 'no trace: nothing assumed');
  assert.equal(evaluateLeagueDay({ day: DAY, presence: undefined, closedTasks: [task()], sessions: [session()] }).habits.TRABAJO_REGISTRADO, true, 'a closed task is recorded work even without a trace reading');
  const crm = evaluateLeagueDay({ day: DAY, workRecords: ['CRM', 'Parrillas', 'Pautas'], presence: true });
  assert.match(crm.evidence.TRABAJO_REGISTRADO, /CRM, Parrillas, Pautas/);
});

test('what counts as recorded work in the operational trace: task events and write mutations of a module; the league, the profile, the bell and Bria do not', () => {
  assert.equal(workRecordFromTrace({ eventType: 'PLATFORM_MUTATION', metadata: { method: 'POST', path: '/api/financials/records' } }), 'Financiero');
  assert.equal(workRecordFromTrace({ eventType: 'PLATFORM_MUTATION', metadata: { method: 'POST', path: '/api/financials/receivables/:id/payments' } }), 'Financiero');
  assert.equal(workRecordFromTrace({ eventType: 'PLATFORM_MUTATION', metadata: { method: 'PATCH', path: '/api/crm/leads/:id' } }), 'CRM');
  assert.equal(workRecordFromTrace({ eventType: 'PLATFORM_MUTATION', metadata: { method: 'PUT', path: '/api/content/items/:id' } }), 'Parrillas');
  assert.equal(workRecordFromTrace({ eventType: 'PLATFORM_MUTATION', metadata: { method: 'POST', path: '/api/ad-budgets/:id/readings' } }), 'Pautas');
  assert.equal(workRecordFromTrace({ eventType: 'PLATFORM_MUTATION', metadata: { method: 'POST', path: '/api/activity/events' } }), 'Actividad');
  assert.equal(workRecordFromTrace({ eventType: 'TASK_CREATED' }), 'Gestión de tareas');
  assert.equal(workRecordFromTrace({ eventType: 'TASK_UPDATED' }), 'Gestión de tareas');
  for (const path of ['/api/league/kudos', '/api/user/profile', '/api/notifications/read-all', '/api/bria/conversations', '/api/important-notices/x/snooze', '/api/onboarding/progress', '/api/login'])
    assert.equal(workRecordFromTrace({ eventType: 'PLATFORM_MUTATION', metadata: { method: 'POST', path } }), null, `${path} is presence, not work`);
  assert.equal(workRecordFromTrace({ eventType: 'PLATFORM_MUTATION', metadata: { method: 'GET', path: '/api/financials/records' } }), null, 'reading is not recording');
  assert.equal(workRecordFromTrace({ eventType: 'SESSION_STARTED' }), null);
  assert.equal(workRecordFromTrace({ eventType: 'TASK_OPENED' }), null, 'opening a task is presence');
});

test('Brayan’s production day: an Actividad production event or a production task counts as work, and declared time keeps the clock point there', () => {
  const jornada = evaluateLeagueDay({ day: DAY, productionDays: [{ id: 'e1', title: 'Grabación Nutresa' }], presence: false, overdueAtDawn: 0, returnedToday: 0 });
  assert.equal(jornada.habits.TRABAJO_REGISTRADO, true, 'a production day counts even without touching the platform');
  assert.match(jornada.evidence.TRABAJO_REGISTRADO, /Jornada de producción: Grabación Nutresa/);
  const declared = evaluateLeagueDay({ day: DAY, closedTasks: [task({ title: 'Jornada de grabación', measuredMs: 0, declared: true, production: true })], sessions: [session({ closeReason: 'DECLARED', durationMs: 6 * 3_600_000 })], overdueAtDawn: 0, returnedToday: 0 });
  assert.equal(declared.habits.RELOJ, true, 'in the field there is no stopwatch: declared time on a production task is a recorded time');
  assert.match(declared.evidence.RELOJ, /1 jornada con tiempo declarado/);
  const unmeasured = evaluateLeagueDay({ day: DAY, closedTasks: [task({ measuredMs: 0, declared: false, production: true })], sessions: [], overdueAtDawn: 0, returnedToday: 0 });
  assert.equal(unmeasured.habits.RELOJ, null, 'a production task closed without any time passed straight to done: Reloj does not apply');
  assert.equal(evaluateLeagueDay({ day: DAY, closedTasks: [task({ measuredMs: 0, declared: true })], sessions: [], overdueAtDawn: 0, returnedToday: 0 }).habits.RELOJ, null, 'ordinary work passed straight to done with declared time: Reloj does not apply');
  assert.equal(isProductionWork({ type: 'PRODUCTION' }), true);
  assert.equal(isProductionWork({ aiCategory: 'Producción Audiovisual' }), true);
  assert.equal(isProductionWork({ title: 'Jornada de fotos en Verona' }), true);
  assert.equal(isProductionWork({ title: 'Rodaje reel' }), true);
  assert.equal(isProductionWork({ title: 'Caption de la semana', aiCategory: 'Creación de contenido' }), false);
});

test('without a dawn snapshot or a returns reading nothing is assumed', () => {
  const out = evaluateLeagueDay({ day: DAY, closedTasks: [task()], sessions: [session()], overdueAtDawn: null, returnedToday: null });
  assert.equal(out.habits.AL_DIA, null);
  assert.equal(out.habits.SIN_DEVOLUCION, null);
});

test('the clock point: a short clock, a forgotten clock, an overlapping session or a correction lose it; declared time does not play', () => {
  assert.equal(evaluateLeagueDay({ day: DAY, closedTasks: [task({ measuredMs: 0, declared: true })], sessions: [session({ closeReason: 'DECLARED' })], overdueAtDawn: 0, returnedToday: 0 }).habits.RELOJ, null);
  assert.equal(evaluateLeagueDay({ day: DAY, closedTasks: [task({ measuredMs: MIN_MEASURED_MS - 1 })], sessions: [session()], overdueAtDawn: 0, returnedToday: 0 }).habits.RELOJ, false, 'under ten minutes is not measured');
  assert.equal(evaluateLeagueDay({ day: DAY, closedTasks: [task()], sessions: [session({ durationMs: FORGOTTEN_SESSION_MS + 1 })], overdueAtDawn: 0, returnedToday: 0 }).habits.RELOJ, false, 'a clock left running');
  assert.equal(evaluateLeagueDay({ day: DAY, closedTasks: [task()], sessions: [session({ isOverlapping: true })], overdueAtDawn: 0, returnedToday: 0 }).habits.RELOJ, false, 'two clocks at once');
  assert.equal(evaluateLeagueDay({ day: DAY, closedTasks: [task()], sessions: [session({ correctedAt: `${DAY}T21:00:00.000Z` })], overdueAtDawn: 0, returnedToday: 0 }).habits.RELOJ, false, 'an administrator had to fix it');
  // Sessions without a closing still play the clock point (a collaborator who worked and closed nothing).
  const only = evaluateLeagueDay({ day: DAY, closedTasks: [], sessions: [session()], overdueAtDawn: 0, returnedToday: 0 });
  assert.equal(only.habits.RELOJ, true);
  assert.equal(only.habits.A_TIEMPO, null);
});

test('on time compares the Bogotá day of the closing with the date the task was born with, never the current date', () => {
  const late = task({ completedAt: '2026-11-04T03:30:00.000Z', originalDueDate: `${DAY}T12:00:00.000Z` }); // 22:30 Bogotá del 3: a tiempo
  assert.equal(evaluateLeagueDay({ day: DAY, closedTasks: [late], sessions: [session()], overdueAtDawn: 0, returnedToday: 0 }).habits.A_TIEMPO, true);
  const moved = task({ completedAt: `${DAY}T20:00:00.000Z`, originalDueDate: '2026-11-02T12:00:00.000Z', dueDate: `${DAY}T12:00:00.000Z` });
  assert.equal(evaluateLeagueDay({ day: DAY, closedTasks: [moved], sessions: [session()], overdueAtDawn: 0, returnedToday: 0 }).habits.A_TIEMPO, false, 'moving the due date does not help');
  const undated = task({ originalDueDate: null, dueDate: null });
  assert.equal(evaluateLeagueDay({ day: DAY, closedTasks: [undated], sessions: [session()], overdueAtDawn: 0, returnedToday: 0 }).habits.A_TIEMPO, null, 'no date, nothing to compare');
  const mixed = evaluateLeagueDay({ day: DAY, closedTasks: [task(), task({ id: 't2', completedAt: `${DAY}T20:00:00.000Z`, originalDueDate: '2026-11-01T12:00:00.000Z' })], sessions: [session()], overdueAtDawn: 0, returnedToday: 0 });
  assert.equal(mixed.habits.A_TIEMPO, false, 'every closing of the day has to be on time');
  assert.match(mixed.evidence.A_TIEMPO, /1 de 2/);
});

test('documented and returns', () => {
  const out = evaluateLeagueDay({ day: DAY, createdTasks: [{ documented: false }], closedTasks: [task({ documented: false })], sessions: [session()], overdueAtDawn: 0, returnedToday: 1 });
  assert.equal(out.habits.DOCUMENTADO, false);
  assert.equal(out.habits.SIN_DEVOLUCION, false);
  assert.match(out.evidence.SIN_DEVOLUCION, /1 tarea devuelta/);
});

test('the extras: first to open from 8:00 goes to one person with the time; meeting points are supplied by the separate admin register', () => {
  const opener = { memberId: 'm-helen', name: 'Helen', at: `${DAY}T13:04:00.000Z` }; // 8:04 Bogotá
  const helen = evaluateLeagueDay({ day: DAY, memberId: 'm-helen', firstOpener: opener });
  assert.equal(helen.extras.PRIMERO_EN_ABRIR, true);
  assert.match(helen.evidence.PRIMERO_EN_ABRIR, /Abrió primero, a las 08:04/);
  const rodny = evaluateLeagueDay({ day: DAY, memberId: 'm-rodny', firstOpener: opener });
  assert.equal(rodny.extras.PRIMERO_EN_ABRIR, false);
  assert.match(rodny.evidence.PRIMERO_EN_ABRIR, /Helen abrió primero, a las 08:04/);
  assert.equal(evaluateLeagueDay({ day: DAY, memberId: 'm-rodny', firstOpener: null }).extras.PRIMERO_EN_ABRIR, null, 'nobody opened: not played');
  assert.equal(evaluateLeagueDay({ day: DAY, memberId: 'm-rodny' }).extras.PRIMERO_EN_ABRIR, null, 'no reading: nothing assumed');
  assert.equal(helen.extras.PRIMERO_EN_REUNION, null);
  assert.match(helen.evidence.PRIMERO_EN_REUNION, /administrador/);
  assert.deepEqual(openWindowOf(DAY), { start: new Date(`${DAY}T13:00:00.000Z`), end: new Date('2026-11-04T05:00:00.000Z') }, 'from 8:00 Bogotá to midnight');
  assert.equal(bogotaTimeOf(`${DAY}T13:04:00.000Z`), '08:04');
});

test('the ISO week of a Bogotá day, for the weekly gift', () => {
  assert.equal(isoWeekKey('2026-11-02'), '2026-W45');
  assert.equal(isoWeekKey('2026-11-08'), '2026-W45', 'Sunday closes the week');
  assert.equal(isoWeekKey('2026-11-09'), '2026-W46');
  assert.equal(isoWeekKey('2027-01-01'), '2026-W53');
});

test('the week of a day runs Monday to Sunday and the previous one is seven days back, even across a month boundary', () => {
  assert.deepEqual(isoWeekRange('2026-11-09'), { weekKey: '2026-W46', from: '2026-11-09', to: '2026-11-15' }, 'Monday starts its own week');
  assert.deepEqual(isoWeekRange('2026-11-15'), { weekKey: '2026-W46', from: '2026-11-09', to: '2026-11-15' }, 'Sunday closes it');
  assert.deepEqual(isoWeekRange('2026-11-04'), { weekKey: '2026-W45', from: '2026-11-02', to: '2026-11-08' });
  assert.deepEqual(previousWeekRange('2026-11-04'), { weekKey: '2026-W44', from: '2026-10-26', to: '2026-11-01' }, 'the previous week crosses October and November');
  assert.deepEqual(previousWeekRange('2026-11-09'), { weekKey: '2026-W45', from: '2026-11-02', to: '2026-11-08' });
});

test('antes de las 18:00 Al día dice lo que falta por cerrar, no «al cierre quedaba»', () => {
  const open = evaluateLeagueDay({ day: DAY, closedTasks: [task()], sessions: [session()], returnedToday: 0,
    closeState: { closed: 1, pending: 3, open: true, pendingTasks: [{ title: 'Carrusel Villa', dueDate: `${DAY}T12:00:00.000Z` }, { title: 'Informe', dueDate: '2026-11-02T12:00:00.000Z' }, { title: 'Post', dueDate: null }] } });
  assert.equal(open.evidence.AL_DIA, 'Antes de las 18:00 te falta cerrar «Carrusel Villa» (vence hoy), «Informe» (venció el 2 de noviembre) y 1 más.');
  const clear = evaluateLeagueDay({ day: DAY, closedTasks: [task()], sessions: [session()], returnedToday: 0, closeState: { closed: 1, pending: 0, open: true, pendingTasks: [] } });
  assert.equal(clear.evidence.AL_DIA, 'Por ahora nada pendiente: se confirma a las 18:00.');
});

test('Reloj nombra la tarea a la que le faltó reloj', () => {
  const day = evaluateLeagueDay({ day: DAY, closedTasks: [task(), task({ title: 'Carrusel Villa', measuredMs: 3 * 60000 })], sessions: [session()], returnedToday: 0 });
  assert.match(day.evidence.RELOJ, /Faltó tiempo: «Carrusel Villa» \(3 min de reloj, el mínimo es 10\)\.$/);
});

test('Reloj: lo que pasa directo a realizado no aplica, pero suma Esfuerzo; Publicar suma Esfuerzo y no aplica a Reloj', () => {
  const day = evaluateLeagueDay({ day: DAY, closedTasks: [task(), task({ title: 'Story', measuredMs: 0, declared: true }), task({ title: '[Publicar] Reel', measuredMs: 0 })], sessions: [session()], returnedToday: 0 });
  assert.equal(day.habits.RELOJ, true);
  // Rodny, 26 de noviembre de 2026: las tareas de publicar también suman al esfuerzo.
  assert.equal(day.extras.ESFUERZO, 3);
  assert.equal(day.extras.PUBLICAR, 1);
  assert.match(day.evidence.ESFUERZO, /^3 tareas cerradas \(1 de publicar\)\.$/);
  assert.match(day.evidence.RELOJ, /1 pasó directo a realizado y no aplica/);
  assert.deepEqual(day.extras.RELOJ_TAREAS.map((row) => row.kind), ['ok', 'directo', 'publicar']);
  const none = evaluateLeagueDay({ day: DAY, closedTasks: [task({ measuredMs: 0 })], returnedToday: 0 });
  assert.equal(none.habits.RELOJ, null);
  assert.equal(none.extras.ESFUERZO, 1);
});

// Rodny, 21 de noviembre de 2026: «Ninguna tarea devuelta sí puede aplicar al project manager siempre y cuando haya
// creado más de 5 pendientes ese día»; rige desde el lunes 23.
test('a project manager only plays Sin devolución the day more than five tasks were created', () => {
  const NEW = '2026-11-23';
  const closed = [task({ completedAt: `${NEW}T20:10:00.000Z`, originalDueDate: `${NEW}T12:00:00.000Z` })];
  const created = (count) => Array.from({ length: count }, () => ({ documented: true }));
  const few = evaluateLeagueDay({ day: NEW, closedTasks: closed, createdTasks: created(5), returnedToday: 0, areas: ['PROJECT_MANAGEMENT', 'DIRECCION'] });
  assert.equal(few.habits.SIN_DEVOLUCION, null);
  assert.match(few.evidence.SIN_DEVOLUCION, /más de 5 pendientes: hoy van 5/);
  assert.equal(evaluateLeagueDay({ day: NEW, closedTasks: closed, createdTasks: created(6), returnedToday: 0, areas: ['PROJECT_MANAGEMENT'] }).habits.SIN_DEVOLUCION, true);
  assert.equal(evaluateLeagueDay({ day: NEW, closedTasks: closed, createdTasks: created(6), returnedToday: 1, areas: ['PROJECT_MANAGEMENT'] }).habits.SIN_DEVOLUCION, false);
  assert.equal(evaluateLeagueDay({ day: NEW, closedTasks: closed, createdTasks: [], returnedToday: 0, areas: ['DISENO'] }).habits.SIN_DEVOLUCION, true, 'other areas play it as always');
  assert.equal(evaluateLeagueDay({ day: DAY, closedTasks: [task()], createdTasks: [], returnedToday: 0, areas: ['PROJECT_MANAGEMENT'] }).habits.SIN_DEVOLUCION, true, 'before the 23rd nothing changes');
});

test('Elisa’s good day: her area sources play Al día, A tiempo and Sin devolución, and her records count as effort', () => {
  const NEW = '2026-11-23';
  const areaChecks = { AL_DIA: [], A_TIEMPO: [{ source: 'Financiero', ok: true, text: '2 de 2 pagos hechos en su fecha.' }],
    DOCUMENTADO: [{ source: 'Financiero', ok: true, text: '6 de 6 registros con soporte o nota.' }], SIN_DEVOLUCION: [{ source: 'Financiero', ok: true, text: 'Ningún registro anulado por otra persona.' }] };
  Object.defineProperty(areaChecks, 'effort', { value: [{ source: 'Financiero', units: 4.5, text: '6 registros en Financiero, 3 con soporte' }], enumerable: false });
  const day = evaluateLeagueDay({ day: NEW, workRecords: ['Financiero'], presence: true, returnedToday: 0, areaChecks, areas: ['ADMINISTRATIVA'] });
  assert.deepEqual(day.habits, { RELOJ: null, AL_DIA: null, A_TIEMPO: true, DOCUMENTADO: true, SIN_DEVOLUCION: true, TRABAJO_REGISTRADO: true });
  assert.equal(day.extras.ESFUERZO, 4.5);
  assert.equal(effortPoints(day), 5, 'the day rounds to the point so scores stay whole');
  assert.equal(day.evidence.ESFUERZO, '6 registros en Financiero, 3 con soporte.');
  assert.equal(day.evidence.SIN_DEVOLUCION, 'Financiero: Ningún registro anulado por otra persona.');
});

test('a task delivered another day that comes back is judged by its first delivery: on time stays on time, late does not count twice', () => {
  const back = task({ id: 'back', completedAt: `${DAY}T20:00:00.000Z`, originalDueDate: '2026-11-01T12:00:00.000Z', firstCompletedAt: '2026-11-01T15:00:00.000Z' });
  const lateBefore = task({ id: 'late', completedAt: `${DAY}T20:00:00.000Z`, originalDueDate: '2026-10-28T12:00:00.000Z', firstCompletedAt: '2026-10-30T15:00:00.000Z' });
  const fresh = task({ id: 'fresh' });
  const result = evaluateLeagueDay({ day: DAY, closedTasks: [back, lateBefore, fresh], sessions: [session()], overdueAtDawn: 0, returnedToday: 0 });
  assert.equal(result.habits.A_TIEMPO, true);
  assert.match(result.evidence.A_TIEMPO, /2 de 2 a tiempo/);
  const sameDay = task({ completedAt: `${DAY}T20:00:00.000Z`, originalDueDate: '2026-11-01T12:00:00.000Z', firstCompletedAt: `${DAY}T14:00:00.000Z` });
  assert.equal(evaluateLeagueDay({ day: DAY, closedTasks: [sameDay], sessions: [session()], overdueAtDawn: 0, returnedToday: 0 }).habits.A_TIEMPO, false, 'reclosing the same day changes nothing');
});

test('los días guardados antes del 26 de noviembre suman sus tareas de publicar al esfuerzo, una sola vez y sin tocar lo demás', () => {
  const habits = { RELOJ: true, A_TIEMPO: false };
  const mixed = { habits, extras: { ESFUERZO: 5, PROPORCION: { A_TIEMPO: 0.5 } }, evidence: { ESFUERZO: '5 tareas cerradas (sin contar 2 de publicar) · 1 gestión del CRM.', RELOJ: 'x' } };
  const next = withPublicationEffort(mixed);
  assert.equal(next.extras.ESFUERZO, 7);
  assert.equal(next.extras.PUBLICAR, 2);
  assert.deepEqual(next.extras.PROPORCION, { A_TIEMPO: 0.5 });
  assert.equal(next.evidence.ESFUERZO, '7 tareas cerradas (2 de publicar) · 1 gestión del CRM.');
  assert.equal(next.evidence.RELOJ, 'x');
  assert.equal(withPublicationEffort({ habits, extras: next.extras, evidence: next.evidence }), null, 'repeating changes nothing');
  const only = withPublicationEffort({ habits, extras: { ESFUERZO: 0, RELOJ_TAREAS: [{ kind: 'publicar' }, { kind: 'publicar' }, { kind: 'publicar' }] }, evidence: { ESFUERZO: 'Solo cerraste tareas de publicar, que no suman.' } });
  assert.equal(only.extras.ESFUERZO, 3);
  assert.equal(only.evidence.ESFUERZO, '3 tareas cerradas (3 de publicar).');
  const none = withPublicationEffort({ habits, extras: { ESFUERZO: 4 }, evidence: { ESFUERZO: '4 tareas cerradas.' } });
  assert.equal(none.extras.ESFUERZO, 4);
  assert.equal(none.extras.PUBLICAR, 0, 'marked so the next start does not look again');
});
