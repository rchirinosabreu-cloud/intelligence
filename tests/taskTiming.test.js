import test from 'node:test';
import assert from 'node:assert/strict';
import {
  closeTaskWorkSession,
  formatElapsedTime,
  getTaskElapsedMs,
  findConflictingActiveTask,
  getTaskTimingTutorialStorageKey,
  hasSeenTaskTimingTutorial,
  markTaskTimingTutorialAfternoonSeen,
  markTaskTimingTutorialSeen,
  parseReopenEventContent,
  shouldShowTaskTimingTutorialAgain,
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

test('closeTaskWorkSession preserves prior time and adds the active session', () => {
  const total = closeTaskWorkSession({
    startedAt: '2026-08-26T14:30:00.000Z',
    accumulatedWorkMs: 90_000,
  }, new Date('2026-08-26T14:32:00.000Z'));
  assert.equal(total, 210_000);
});

test('reopening event content separates its reason label from the note', () => {
  assert.deepEqual(parseReopenEventContent('[CLIENT_CORRECTION]\nCambiar el cierre del video.'), {
    reasonValue: 'CLIENT_CORRECTION',
    reasonLabel: 'Corrección normal del cliente',
    note: 'Cambiar el cierre del video.',
  });
  assert.equal(parseReopenEventContent('SCOPE_CHANGE: Agregar una escena.').reasonLabel, 'Cambio de alcance');
});

test('task timing tutorial acknowledgement is versioned per user', () => {
  const values = new Map();
  const storage = {
    getItem: key => values.get(key) || null,
    setItem: (key, value) => values.set(key, value),
  };
  const key = getTaskTimingTutorialStorageKey('rodny');

  assert.equal(hasSeenTaskTimingTutorial(storage, 'rodny'), false);
  const morning = new Date(2026, 7, 26, 10, 0, 0);
  const afternoon = new Date(2026, 7, 26, 14, 0, 0);
  markTaskTimingTutorialSeen(storage, 'rodny', morning);
  assert.ok(values.get(key).includes('seenAt'));
  assert.equal(hasSeenTaskTimingTutorial(storage, 'rodny'), true);
  assert.equal(hasSeenTaskTimingTutorial(storage, 'melissa'), false);
  assert.equal(shouldShowTaskTimingTutorialAgain(storage, 'rodny', afternoon), true);
  markTaskTimingTutorialAfternoonSeen(storage, 'rodny', afternoon);
  assert.equal(shouldShowTaskTimingTutorialAgain(storage, 'rodny', afternoon), false);
});
