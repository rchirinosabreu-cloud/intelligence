// El servicio de la lectura de la semana (10 de octubre de 2026): genera, guarda, y los lunes avisa una sola vez
// a quienes ven Manager. Dobles para la base, el modelo y los avisos.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createWeeklyReadingService, initWeeklyReadingScheduler, WEEKLY_READING_NOTIFICATION } from '../src/services/weeklyReadingService.js';
import { createTeamLoadService, estimatesFromRhythm } from '../src/services/teamLoadService.js';

const H = 3_600_000;
const rhythm = { period: { days: 30 }, team: { closed: 4, measured: 3, declared: 0, coverage: 0.75 }, people: [{ personId: 'm-b', personName: 'Brayan Torres', closed: 4, measured: 3, coverage: 0.75, measuredMs: 9 * H, byType: [{ workType: 'Video', measured: 3, medianMs: 3 * H, minMs: 2 * H, maxMs: 4 * H, teamMedianMs: null, comparable: true }], findings: [{ kind: 'HEAVY_DAY', severity: 'warning', message: 'Brayan Torres cerró 2 tareas de Video el 6 de octubre.', taskIds: ['t1'] }] }], types: [{ workType: 'Video', measured: 3, people: 1, medianMs: 3 * H }], tasks: { t1: { title: 'Video A', workType: 'Video', day: '2026-10-06', personName: 'Brayan Torres', measuredMs: 4 * H } } };
const load = { today: '2026-10-12', days: ['2026-10-13'], capacityMs: 8 * H, people: [{ personId: 'm-b', personName: 'Brayan Torres', overdue: { count: 0, ms: 0, taskIds: [] }, undated: { count: 0 }, weekMs: 9 * H, cells: [{ day: '2026-10-13', ms: 9 * H, level: 'alta', count: 3, tasks: [{ id: 'o1', title: 'Video Nutresa', clientName: 'Nutresa' }] }] }], signals: [] };
const modelAnswer = '```json\n' + JSON.stringify({ summary: 'Semana cargada para Brayan.', decisions: [{ title: 'Repartir los videos del martes', why: 'Brayan tiene 9 h el martes.', evidence: ['9 h estimadas el 13 de octubre'], urgency: 'alta', action: { kind: 'REVISAR_TAREA', label: 'Abrir Video Nutresa', personName: 'Brayan Torres', taskId: 'o1', suggestedMessage: null } }] }) + '\n```';

const memoryRepository = () => {
  const rows = [];
  return {
    rows,
    latest: async () => rows.at(-1) || null,
    forWeek: async (weekKey, { trigger } = {}) => [...rows].reverse().find((r) => r.weekKey === weekKey && (!trigger || r.trigger === trigger)) || null,
    save: async (row) => { const saved = { id: `r${rows.length + 1}`, generatedAt: new Date(), ...row }; rows.push(saved); return saved; }
  };
};
const build = ({ nowIso, repository = memoryRepository(), generateCalls = [], notices = [] } = {}) => ({
  repository, generateCalls, notices,
  service: createWeeklyReadingService({
    repository, rhythm: { get: async () => rhythm }, load: { get: async () => load },
    generate: async (request) => { generateCalls.push(request); return { text: modelAnswer, model: 'gpt-test', usage: { input_tokens: 10 } }; },
    now: () => new Date(nowIso), notify: async (notice) => { notices.push(notice); }, listManagers: async () => [{ id: 'u-rodny', role: 'ADMIN' }, { id: 'u-kamila', role: 'PROJECT_MANAGER' }], logger: { error: () => {}, log: () => {} }
  })
});

test('generating reads rhythm and load, asks the governed model once and saves the validated reading for the week', async () => {
  const { service, repository, generateCalls } = build({ nowIso: '2026-10-09T15:00:00Z' });
  const saved = await service.generate({ actor: { ref: 'u-rodny', name: 'Rodny' }, trigger: 'MANUAL' });
  assert.equal(generateCalls.length, 1);
  assert.equal(generateCalls[0].governanceContext.useCase, 'manager.weekly-reading');
  assert.match(generateCalls[0].prompt, /\[o1\] Video Nutresa/);
  assert.deepEqual([saved.weekKey, saved.trigger, saved.periodDays, saved.model], ['2026-W41', 'MANUAL', 30, 'gpt-test']);
  assert.equal(saved.reading.decisions[0].action.taskId, 'o1');
  assert.equal(repository.rows.length, 1);
  const current = await service.current();
  assert.deepEqual([current.weekKey, current.isCurrentWeek, current.reading.id], ['2026-W41', true, 'r1']);
});

test('the automatic reading runs on Monday from 7:00 Bogotá, once per week, and notifies only managers with access', async () => {
  const repository = memoryRepository();
  const notices = [];
  const sunday = build({ nowIso: '2026-10-12T11:30:00Z', repository, notices }); // 6:30 de Bogotá del lunes 12
  assert.deepEqual(await sunday.service.runAutomatic(), { skipped: 'fuera de horario' });
  const monday = build({ nowIso: '2026-10-12T12:05:00Z', repository, notices }); // 7:05 de Bogotá
  const first = await monday.service.runAutomatic();
  assert.equal(first.notified, 2);
  assert.deepEqual(notices.map((n) => [n.userId, n.type, n.url]), [['u-rodny', WEEKLY_READING_NOTIFICATION, '/manager?tab=ritmo'], ['u-kamila', WEEKLY_READING_NOTIFICATION, '/manager?tab=ritmo']]);
  assert.deepEqual(await build({ nowIso: '2026-10-12T20:00:00Z', repository, notices }).service.runAutomatic(), { skipped: 'ya generada' }, 'a restart later the same Monday does not repeat it');
  assert.equal(notices.length, 2);
  assert.equal(repository.rows[0].trigger, 'AUTOMATICO');
});

test('a notification that fails never breaks the reading; the scheduler ticks and never overlaps', async () => {
  const repository = memoryRepository();
  const service = createWeeklyReadingService({ repository, rhythm: { get: async () => rhythm }, load: { get: async () => load }, generate: async () => ({ text: modelAnswer, model: 'gpt-test' }), now: () => new Date('2026-10-12T13:00:00Z'), notify: async () => { throw new Error('push caído'); }, listManagers: async () => [{ id: 'u-rodny' }], logger: { error: () => {}, log: () => {} } });
  const result = await service.runAutomatic();
  assert.equal(result.notified, 0);
  assert.equal(repository.rows.length, 1);
  const timers = [];
  const tick = initWeeklyReadingScheduler({ service: { runAutomatic: async () => ({ skipped: 'x' }) }, setIntervalFn: (fn, ms) => { timers.push(['interval', ms]); return { unref() {} }; }, setTimeoutFn: (fn, ms) => { timers.push(['timeout', ms]); return { unref() {} }; }, logger: { log: () => {}, error: () => {} } });
  assert.deepEqual(timers, [['timeout', 90_000], ['interval', 30 * 60_000]]);
  await tick();
});

test('the load service turns open tasks into the map with Bogotá days and rhythm medians as estimates', async () => {
  const db = {
    teamMember: { findMany: async () => [{ id: 'm-b', name: 'Brayan Torres', avatarUrl: null }] },
    task: { findMany: async ({ where }) => { assert.deepEqual(where.status.in, ['PENDIENTE', 'EN_CURSO', 'DEVUELTA']); return [
      { id: 'o1', title: '[Producción] Video: Nutresa', status: 'PENDIENTE', dueDate: new Date('2026-10-13T12:00:00.000Z'), assigneeId: 'm-b', aiCategory: null, contentItem: { format: 'Video' }, client: { name: 'Nutresa' } },
      { id: 'o2', title: 'Llamar al cliente', status: 'EN_CURSO', dueDate: new Date('2026-10-01T12:00:00.000Z'), assigneeId: 'm-b', aiCategory: 'Operaciones & Reuniones', contentItem: null, client: { name: 'Alpina' } },
      { id: 'o3', title: 'Sin fecha', status: 'PENDIENTE', dueDate: null, assigneeId: 'm-b', aiCategory: null, contentItem: null, client: { name: 'Alpina' } }
    ]; } }
  };
  const service = createTeamLoadService({ db, rhythm: { get: async () => rhythm }, now: () => new Date('2026-10-09T15:00:00Z'), days: 3 });
  const map = await service.get();
  assert.deepEqual(estimatesFromRhythm(rhythm), { byPersonType: { 'm-b|Video': 3 * H }, byType: { Video: 3 * H } });
  const brayan = map.people[0];
  const tuesday = brayan.cells.find((c) => c.day === '2026-10-13');
  assert.deepEqual([tuesday.ms, tuesday.tasks[0].source, tuesday.tasks[0].clientName], [3 * H, 'persona', 'Nutresa']);
  assert.deepEqual([brayan.overdue.taskIds, brayan.undated.count], [['o2'], 1]);
  assert.ok(Array.isArray(map.signals));
});
