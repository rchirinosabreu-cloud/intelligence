import test from 'node:test';
import assert from 'node:assert/strict';
import { recognitionCalendar, isRecognitionOverdue, taskAwardKinds, planIsApproved } from '../src/services/recognitionRules.js';

test('recognition days and Monday weeks use Bogota, including midnight and year changes', () => {
  assert.deepEqual(recognitionCalendar(new Date('2026-09-14T04:59:59Z')), { day: '2026-09-13', week: '2026-09-07' });
  assert.deepEqual(recognitionCalendar(new Date('2026-09-14T05:00:00Z')), { day: '2026-09-14', week: '2026-09-14' });
  assert.equal(recognitionCalendar(new Date('2027-01-01T12:00:00Z')).week, '2026-12-28');
});
test('date-only deadlines stay on their calendar date, with no overdue award for today or missing dates', () => {
  const at = new Date('2026-09-10T16:00:00Z');
  assert.equal(isRecognitionOverdue({ status: 'PENDIENTE', dueDate: '2026-09-09T00:00:00Z' }, at), true);
  assert.equal(isRecognitionOverdue({ status: 'PENDIENTE', dueDate: '2026-09-10T00:00:00Z' }, at), false);
  assert.equal(isRecognitionOverdue({ status: 'REALIZADA', dueDate: '2026-09-09' }, at), false);
  assert.equal(isRecognitionOverdue({ status: 'PENDIENTE', dueDate: null }, at), false);
});
test('exact thresholds are eight daily and fifty weekly; first team task is not first personal task', () => {
  const context = { teamDayCount: 2, userDayCount: 7, userWeekCount: 49, caughtUp: false, early: false };
  assert.deepEqual(taskAwardKinds(context), []);
  assert.deepEqual(taskAwardKinds({ ...context, teamDayCount: 1, userDayCount: 1 }), ['FIRST_TASK']);
  assert.deepEqual(taskAwardKinds({ ...context, userDayCount: 8, userWeekCount: 50 }), ['DAILY_EIGHT', 'WEEKLY_FIFTY']);
  assert.deepEqual(taskAwardKinds({ ...context, userDayCount: 9, userWeekCount: 51, early: true, caughtUp: true }), ['EARLY_DELIVERY', 'CAUGHT_UP']);
});
test('plan approval requires active pieces with explicit approval, not production inferred as approval', () => {
  assert.equal(planIsApproved([]), false);
  assert.equal(planIsApproved([{ id: 'a', status: 'APROBADO' }, { id: 'b', status: 'EN_REVISION' }]), false);
  assert.equal(planIsApproved([{ id: 'a', status: 'EN_PRODUCCION' }]), false);
  assert.equal(planIsApproved([{ id: 'a', status: 'EN_PRODUCCION' }], ['a']), true);
  assert.equal(planIsApproved([{ id: 'a', status: 'APROBADO' }, { id: 'b', status: 'DEVUELTO', deletedAt: new Date() }]), true);
  assert.equal(planIsApproved([{ id: 'a', status: 'DEVUELTO' }], ['a']), false);
});
