// Los cinco puntos de un día hábil (2 de noviembre de 2026): la regla pura que evalúa a una persona en un día con lo
// que la plataforma ya registra: sus cierres con sus relojes, sus sesiones, las vencidas con que amaneció y lo que le
// devolvieron. Un hábito que no se jugó es `null` y nunca resta; un juicio nunca aparece en la evidencia.
import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateLeagueDay, isoWeekKey, isoWeekRange, previousWeekRange, openWindowOf, bogotaTimeOf, isProductionWork, workRecordFromTrace, MIN_MEASURED_MS, FORGOTTEN_SESSION_MS } from '../src/lib/leagueDay.js';

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
  assert.deepEqual(out.extras, { PRIMERO_EN_ABRIR: null, PRIMERO_EN_REUNION: null }, 'the extras travel beside the habits');
  assert.match(out.evidence.RELOJ, /1 cierre con tiempo registrado/);
  assert.match(out.evidence.AL_DIA, /sin vencidas/);
  assert.match(out.evidence.TRABAJO_REGISTRADO, /Gestión de tareas/);
  for (const text of Object.values(out.evidence)) assert.doesNotMatch(text, /lento|flojo|mal\b/i);
});

test('a day without closings leaves clock, on-time, documented and recorded work out of play, and the others still count', () => {
  const out = evaluateLeagueDay({ day: DAY, closedTasks: [], sessions: [], overdueAtDawn: 2, returnedToday: 0 });
  assert.deepEqual(out.habits, { RELOJ: null, AL_DIA: false, A_TIEMPO: null, DOCUMENTADO: null, SIN_DEVOLUCION: true, TRABAJO_REGISTRADO: null });
  assert.match(out.evidence.AL_DIA, /2 vencidas/);
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
  assert.equal(unmeasured.habits.RELOJ, false, 'a production task closed without any time, declared or measured, still loses the clock');
  assert.equal(evaluateLeagueDay({ day: DAY, closedTasks: [task({ measuredMs: 0, declared: true })], sessions: [], overdueAtDawn: 0, returnedToday: 0 }).habits.RELOJ, false, 'declared time on ordinary work keeps losing the clock');
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

test('the clock point: declared time, a forgotten clock, an overlapping session or a correction lose it', () => {
  assert.equal(evaluateLeagueDay({ day: DAY, closedTasks: [task({ measuredMs: 0, declared: true })], sessions: [session({ closeReason: 'DECLARED' })], overdueAtDawn: 0, returnedToday: 0 }).habits.RELOJ, false);
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
