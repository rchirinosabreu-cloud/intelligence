import test from 'node:test';
import assert from 'node:assert/strict';
import {
  formatElapsedTime,
  getTaskElapsedMs,
  findConflictingActiveTask,
  REOPEN_REASONS,
} from '../src/lib/taskTiming.js';

test('formatElapsedTime renders a stable HH:MM:SS clock', () => {
  assert.equal(formatElapsedTime(0), '00:00:00');
  assert.equal(formatElapsedTime(3_661_000), '01:01:01');
  assert.equal(formatElapsedTime(97 * 3_600_000), '97:00:00');
});

test('getTaskElapsedMs uses the current active start and accumulated time', () => {
  const now = new Date('2026-08-26T15:00:00.000Z');
  const task = {
    status: 'EN_CURSO',
    startedAt: '2026-08-26T14:30:00.000Z',
    accumulatedWorkMs: 60_000,
  };
  assert.equal(getTaskElapsedMs(task, now), 31 * 60_000);
});

test('getTaskElapsedMs does not keep counting non-active tasks', () => {
  const task = {
    status: 'PENDIENTE',
    startedAt: '2026-08-26T14:30:00.000Z',
    accumulatedWorkMs: 90_000,
  };
  assert.equal(getTaskElapsedMs(task, new Date('2026-08-26T15:00:00.000Z')), 90_000);
});

test('findConflictingActiveTask only finds another active task for the same assignee', () => {
  const tasks = [
    { id: 'a', status: 'EN_CURSO', assigneeId: 'rodny' },
    { id: 'b', status: 'EN_CURSO', assigneeId: 'melissa' },
  ];
  assert.equal(findConflictingActiveTask(tasks, { id: 'c', assigneeId: 'rodny' })?.id, 'a');
  assert.equal(findConflictingActiveTask(tasks, { id: 'a', assigneeId: 'rodny' }), null);
});

test('reopening taxonomy includes client correction and scope change', () => {
  assert.ok(REOPEN_REASONS.some(reason => reason.value === 'CLIENT_CORRECTION'));
  assert.ok(REOPEN_REASONS.some(reason => reason.value === 'SCOPE_CHANGE'));
});
