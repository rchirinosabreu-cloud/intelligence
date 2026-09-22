import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { focusNoticeStorageKey, hasSeenFocusNotice, markFocusNoticeSeen } from '../src/lib/taskFocus.js';

// Rodny, 22 de septiembre de 2026: un aviso como los tutoriales que explique el compromiso con hora la primera
// vez que la persona lo ve: qué significa, que bloquea los demás pendientes y que puede pedir más tiempo.

const fakeStorage = () => {
  const data = new Map();
  return {
    getItem: (key) => (data.has(key) ? data.get(key) : null),
    setItem: (key, value) => data.set(key, String(value)),
    size: () => data.size,
    raw: (key) => data.get(key)
  };
};

test('the notice is remembered per commitment, so each new one explains itself once', () => {
  const storage = fakeStorage();
  assert.equal(focusNoticeStorageKey('user-helen'), 'brainstudio:focus-commitment-notice:v1:user-helen');
  assert.equal(hasSeenFocusNotice(storage, 'user-helen', 'task-1'), false);

  markFocusNoticeSeen(storage, 'user-helen', 'task-1');
  assert.equal(hasSeenFocusNotice(storage, 'user-helen', 'task-1'), true);
  assert.equal(hasSeenFocusNotice(storage, 'user-helen', 'task-2'), false, 'a new commitment explains itself again');
  assert.equal(hasSeenFocusNotice(storage, 'user-melissa', 'task-1'), false, 'each person has their own memory');

  markFocusNoticeSeen(storage, 'user-helen', 'task-1');
  assert.deepEqual(JSON.parse(storage.raw(focusNoticeStorageKey('user-helen'))), ['task-1'], 'marking it twice does not duplicate');

  for (let index = 0; index < 40; index += 1) markFocusNoticeSeen(storage, 'user-helen', `bulk-${index}`);
  assert.equal(JSON.parse(storage.raw(focusNoticeStorageKey('user-helen'))).length, 30, 'the memory stays small');

  const broken = { getItem: () => '{not json', setItem: () => { throw new Error('quota'); } };
  assert.equal(hasSeenFocusNotice(broken, 'user-helen', 'task-1'), false, 'a broken storage never breaks the board');
  assert.doesNotThrow(() => markFocusNoticeSeen(broken, 'user-helen', 'task-1'));
});

test('the notice looks like the other tutorials and says what a commitment means', () => {
  const notice = readFileSync('src/components/tasks/FocusCommitmentNotice.jsx', 'utf8');

  assert.match(notice, /bg-gradient-to-br from-\[#00AC8A\] to-\[#009EB9\]/, 'same header as the timing tutorial');
  assert.match(notice, /brainstudio-mascot-tip\.png/, 'with the mascot');
  assert.match(notice, /overlayClassName="z-\[190\]"[\s\S]*?className="z-\[200\]/, 'and the same layer, above the board');
  assert.match(notice, /Tienes un compromiso\{time \? ` hasta las \$\{time\}` : ''\}/, 'the title carries the hour');
  assert.match(notice, /Es lo único que trabajas/, 'what it means');
  assert.match(notice, /Tus demás pendientes esperan/, 'that it locks the rest');
  assert.match(notice, /Lo que ya tenías en proceso puedes terminarlo/, 'the exception');
  assert.match(notice, /Si ves que no llegas, pide más tiempo/, 'and that the time can be extended');
  assert.match(notice, /Si pasa la hora sin terminarla/, 'plus what happens when it expires');
  assert.match(notice, />Entendido</, 'one way out, like the other tutorials');
});

test('the board shows it once per commitment, and never on top of another explanation', () => {
  const board = readFileSync('src/components/modules/NativeTasks.jsx', 'utf8');

  assert.match(board, /<FocusCommitmentNotice task=\{focusNoticeTask\} open=\{!!focusNoticeTask\} onClose=\{closeFocusNotice\} \/>/);
  assert.match(board, /if \(hasSeenFocusNotice\(window\.localStorage, tutorialUserId, myFocusTask\.id\)\) return;/, 'only the first time for that commitment');
  assert.match(board, /if \(focusNoticeTask\) markFocusNoticeSeen\(window\.localStorage, tutorialUserId, focusNoticeTask\.id\);/, 'closing it is what remembers it');
  assert.match(board, /if \(!myFocusTask \|\| myOverdueFocusTask \|\| focusNoticeTask \|\| isTimingTutorialOpen\) return;/, 'never over the timing tutorial or the overdue dialog');
  assert.match(board, /if \(myOverdueFocusTask && focusNoticeTask\) \{ setFocusNoticeTask\(null\); return; \}/, 'and it steps aside if the hour passes while it is open');
});
