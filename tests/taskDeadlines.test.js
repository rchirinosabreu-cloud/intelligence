import test from 'node:test';
import assert from 'node:assert/strict';
import { buildPersonalDashboard } from '../src/services/personalDashboardService.js';
import { createDailyReadingService } from '../src/services/dailyReadingService.js';
import { taskCalendarDay, taskTemporalEvidence } from '../src/lib/briaTemporalEvidence.js';
import { listDashboardReminders } from '../src/lib/dashboardTips.js';
import { isTaskOverdue, snapshotOverdueCount, taskDueDay } from '../src/lib/taskDeadlines.js';

const now = new Date('2026-11-04T14:21:00Z');
const task = (id, dueDate, extra = {}) => ({ id, title: id, status: 'PENDIENTE', assigneeId: 'm1', creatorId: 'u2', dueDate: dueDate ? new Date(dueDate) : null, ...extra });
const dashboard = tasks => buildPersonalDashboard({ member: { id: 'm1', userId: 'u1', role: 'Diseñadora', nativeTasks: tasks }, now });

test('delivery days turn overdue at Bogotá midnight, including month boundaries; invalid dates stay unknown', () => {
  const endOfMonth = task('last-day', '2026-10-31T00:00:00Z');
  assert.equal(isTaskOverdue(endOfMonth, new Date('2026-11-01T04:59:59Z')), false);
  assert.equal(isTaskOverdue(endOfMonth, new Date('2026-11-01T05:00:00Z')), true);
  for (const value of [null, '', 'invalid', '2026-02-30']) assert.equal(taskDueDay(value), null);
});

test('only a complete, same-day dawn snapshot with matching task evidence establishes the count', () => {
  const proof = { policy: 'task-calendar-v1', complete: true, capturedAt: '2026-11-04T11:02:00Z', tasks: [{ id: 't1', overdue: true }] };
  assert.equal(snapshotOverdueCount({ overdue: 1, deadlineEvidence: proof }, '2026-11-04'), 1);
  for (const change of [{ complete: false }, { policy: 'legacy' }, { capturedAt: '2026-11-03T11:02:00Z' }, { tasks: [] }, { tasks: [...proof.tasks, ...proof.tasks] }]) {
    assert.equal(snapshotOverdueCount({ overdue: 1, deadlineEvidence: { ...proof, ...change } }, '2026-11-04'), null);
  }
});

test('one task today and three tomorrow produce one today and no overdue, regardless of midnight/noon storage', () => {
  for (const hour of ['00', '05', '12', '17']) {
    const result = dashboard([task('today', `2026-11-04T${hour}:00:00Z`), ...[1, 2, 3].map(i => task(`tomorrow-${i}`, '2026-11-05T00:00:00Z'))]);
    assert.equal(result.stats.dueToday, 1);
    assert.equal(result.stats.overdue, 0);
    assert.equal(result.upcomingTasks.length, 3);
    assert.ok(!result.focusCards.some(card => card.id === 'overdue-focus'));
    const reminders = listDashboardReminders({ dashboard: result, user: { id: 'u1', role: 'ADMIN' }, now });
    assert.ok(!reminders.some(reminder => reminder.id === 'overdue'), 'no reminder for nonexistent overdue work');
  }
});

test('only an explicit commitment can expire during today; a completed or returned task does not penalize the assignee', () => {
  const result = dashboard([
    task('yesterday', '2026-11-03T12:00:00Z'),
    task('past-hour', '2026-11-04T12:00:00Z', { focusDeadlineAt: new Date('2026-11-04T14:00:00Z') }),
    task('future-hour', '2026-11-04T12:00:00Z', { focusDeadlineAt: new Date('2026-11-04T16:00:00Z') }),
    task('done', '2026-11-03T12:00:00Z', { status: 'REALIZADA' }),
    task('returned', '2026-11-03T12:00:00Z', { status: 'DEVUELTA' }),
  ]);
  assert.deepEqual(result.overdueTasks.map(t => t.id), ['yesterday', 'past-hour']);
});

test('Bria reads the same calendar delivery day; commitment instants keep Bogotá time', () => {
  assert.equal(taskCalendarDay('2026-11-04T00:00:00Z'), '2026-11-04');
  const result = taskTemporalEvidence(task('today', '2026-11-04T00:00:00Z', { focusDeadlineAt: '2026-11-05T02:00:00Z' }), { now });
  assert.equal(result.entrega.relacionConHoy, 'HOY');
  assert.equal(result.entrega.vencida, false);
  assert.equal(result.compromiso.fecha, '2026-11-04');
  assert.equal(result.compromiso.hora, '21:00');
});

test('morning snapshot records date evidence, shares collaborator work once and routes returns to their creator', async () => {
  const open = [
    task('today', '2026-11-04T00:00:00Z'),
    task('tomorrow', '2026-11-05T00:00:00Z'),
    task('overdue', '2026-11-03T12:00:00Z', { collaborators: [{ memberId: 'm1' }, { memberId: 'm2' }] }),
    task('returned', '2026-11-03T12:00:00Z', { status: 'DEVUELTA' })
  ];
  let saved;
  const service = createDailyReadingService({
    db: {
      task: { findMany: async ({ where }) => where.status === 'REALIZADA' ? [] : open },
      contentItem: { findMany: async () => [] }, taskWorkSession: { findMany: async () => [] },
      teamMember: { findMany: async () => [{ id: 'm1', userId: 'u1', name: 'Ana', user: { role: 'EDITOR' } }, { id: 'm2', userId: 'u2', name: 'Bea', user: { role: 'EDITOR' } }] }
    }, repository: { saveSnapshot: async (day, snapshot) => { saved = { day, ...snapshot }; } },
    operations: { listOperations: async () => [] }, now: () => now
  });
  await service.takeSnapshot(now);
  const [ana, bea] = saved.people;
  assert.equal(ana.metrics.overdue, 1);
  assert.equal(ana.metrics.returned, 0);
  assert.equal(bea.metrics.returned, 1);
  assert.equal(bea.metrics.overdue, 1);
  const proof = ana.metrics.deadlineEvidence;
  assert.equal(proof.policy, 'task-calendar-v1');
  assert.equal(proof.complete, true);
  assert.equal(proof.capturedAt, now.toISOString());
  assert.deepEqual(proof.tasks.map(t => [t.id, t.dueDay, t.overdue]), [['today', '2026-11-04', false], ['tomorrow', '2026-11-05', false], ['overdue', '2026-11-03', true]]);
  assert.ok(proof.tasks.every(t => !('title' in t)), 'no private task content in the aggregate snapshot');
});
