import test from 'node:test';
import assert from 'node:assert/strict';
import { createTeamLoadService } from '../src/services/teamLoadService.js';
import { analyzeTeamRhythm } from '../src/lib/teamRhythm.js';
import { buildContextProfiles } from '../src/lib/workPrediction.js';

const H = 3_600_000;
const member = { id: 'a', name: 'Ana', isActive: true };
const task = (id, day, extra = {}) => ({ id, title: `Video ${id}`, status: 'PENDIENTE', assigneeId: 'a', clientId: 'x', aiComplexity: 'MEDIA', dueDate: day && new Date(`${day}T12:00:00Z`), contentItem: { format: 'Video' }, client: { name: 'Ejemplo' }, ...extra });
const history = (hours = [4, 4, 4]) => {
  const analysis = analyzeTeamRhythm({ tasks: hours.map((h, i) => ({ id: `h${i}`, personId: 'a', personName: 'Ana', workType: 'Video', measuredMs: h * H, completedDay: '2026-10-13' })) });
  return { ...analysis, profiles: buildContextProfiles(hours.map((h,i) => ({ id: String(i), personId: 'a', workType: 'Video', clientId: 'x', complexity: 'MEDIA', measuredMs: h*H }))), team: { coverage: 1 } };
};
async function forecast(tasks, { rhythm = history(), clock = '2026-10-14T13:00:00Z' } = {}) {
  const service = createTeamLoadService({
    db: { teamMember: { findMany: async () => [member] }, task: { findMany: async () => tasks } },
    rhythm: { get: async () => rhythm }, now: () => new Date(clock)
  });
  const map = await service.get();
  assert.ok(map.forecast, 'Manager needs a deadline forecast, separate from the delivery-day heatmap');
  return map.forecast;
}

test('work due Friday can use Wednesday and Thursday instead of all landing on Friday', async () => {
  const f = await forecast([task('1', '2026-10-16'), task('2', '2026-10-16'), task('3', '2026-10-16')]);
  assert.equal(f.people[0].remainingMs, 12 * H);
  assert.equal(f.people[0].riskCount, 0);
  assert.equal(f.people[0].capacityMs, 24 * H);
  assert.equal(f.people[0].availableMs, 12 * H);
  assert.deepEqual(f.days, ['2026-10-14', '2026-10-15', '2026-10-16']);
});

test('overdue backlog consumes capacity before later deadlines', async () => {
  const f = await forecast([task('old', '2026-10-13'), task('today1', '2026-10-14'), task('today2', '2026-10-14')]);
  assert.equal(f.people[0].overdueCount, 1);
  assert.equal(f.people[0].riskCount, 2);
  assert.equal(f.summary.attentionCount, 3);
  assert.equal(f.people[0].status, 'revisar');
});

test('remaining work subtracts only reliable time from the assignee in the open cycle', async () => {
  const sessions = [
    { workerId: 'a', durationMs: 3 * H, startedAt: '2026-10-13T13:00:00Z', endedAt: '2026-10-13T16:00:00Z' },
    { workerId: 'other', durationMs: 2 * H },
    { workerId: 'a', durationMs: H, isOverlapping: true },
    { workerId: 'a', durationMs: 9 * H }
  ];
  const f = await forecast([task('1', '2026-10-16', { status: 'EN_CURSO', workSessions: sessions })]);
  assert.equal(f.people[0].tasks[0].remainingMs, null, 'a contaminated open cycle cannot certify the remaining effort');
  assert.equal(f.people[0].tasks[0].spentMs, 3 * H);
});

test('a running clock contributes reliable elapsed time, without closing the task by prediction', async () => {
  const f = await forecast([task('1', '2026-10-16', { status: 'EN_CURSO', workSessions: [{ workerId: 'a', startedAt: '2026-10-14T09:00:00Z', endedAt: null }] })]);
  assert.equal(f.people[0].tasks[0].remainingMs, null, 'reaching the typical duration requires confirming the remaining work');
  assert.equal(f.people[0].tasks[0].needsReview, true);
});

test('an assumption and undated tasks never become a claim of spare capacity', async () => {
  const f = await forecast([task('1', '2026-10-16'), task('2', null)], { rhythm: { people: [], types: [], team: { coverage: 0 } } });
  assert.equal(f.people[0].confidence, 'baja');
  assert.equal(f.people[0].status, 'sin_datos');
  assert.equal(f.people[0].canReceive, false);
  assert.equal(f.people[0].undatedCount, 1);
});

test('the range uses historical variation and distinguishes a tight deadline from an exceeded one', async () => {
  const f = await forecast([task('1', '2026-10-14'), task('2', '2026-10-14')], { rhythm: history([3, 4, 7]) });
  assert.equal(f.people[0].remainingMs, 8 * H);
  assert.equal(f.people[0].upperMs, 14 * H);
  assert.equal(f.people[0].status, 'ajustada');
  assert.equal(f.people[0].riskCount, 0);
  assert.equal(f.people[0].tightCount, 2);
});

test('this week excludes next week while retaining all commitments in the detail', async () => {
  const f = await forecast([task('this', '2026-10-16'), task('next', '2026-10-19')]);
  assert.equal(f.summary.dueCount, 1);
  assert.equal(f.people[0].remainingMs, 4 * H);
  assert.equal(f.people[0].tasks.length, 2);
});

test('the current day loses capacity as the Bogotá workday elapses', async () => {
  const f = await forecast([task('1', '2026-10-14')], { clock: '2026-10-14T23:00:00Z' });
  assert.equal(f.people[0].tasks[0].capacityToDeadlineMs, 0);
  assert.equal(f.people[0].riskCount, 1);
});

test('a weekend deadline is evaluated on the next Colombian working day', async () => {
  const f = await forecast([task('1', '2026-10-10')], { clock: '2026-10-09T13:00:00Z' });
  assert.equal(f.people[0].tasks[0].scheduledDay, '2026-10-10');
  assert.equal(f.people[0].tasks[0].risk, 'ok');
});

test('a holiday in midweek still opens the current week, not a mislabeled next week', async () => {
  const f = await forecast([task('1', '2026-01-02')], { clock: '2026-01-01T13:00:00Z' });
  assert.equal(f.days[0], '2026-01-02');
  assert.equal(f.nextWeek, false);
});

test('incomplete queries cannot suggest that someone can receive more work', async () => {
  const f = await forecast(Array.from({ length: 3001 }, (_, i) => task(String(i), '2027-01-01')));
  assert.equal(f.incomplete, true);
  assert.equal(f.people[0].canReceive, false);
});
