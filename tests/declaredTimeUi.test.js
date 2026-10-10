// «¿Cuánto te tomó?» en la pantalla (9 de octubre de 2026): un solo diálogo en la aplicación, que se abre solo
// cuando el servidor lo pide al confirmar el cierre, y que nunca frena a nadie.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { askDeclaredTimeIfNeeded, DECLARED_TIME_EVENT } from '../src/lib/declaredTime.js';

const read = (path) => readFileSync(path, 'utf8');

test('only a server answer that asks for it opens the question', () => {
  const seen = [];
  globalThis.window = { dispatchEvent: (event) => seen.push(event) };
  globalThis.CustomEvent = class { constructor(type, init) { this.type = type; this.detail = init.detail; } };
  try {
    assert.equal(askDeclaredTimeIfNeeded({ id: 't1', title: 'Post', needsDeclaredTime: false }), false);
    assert.equal(askDeclaredTimeIfNeeded(null), false);
    assert.equal(askDeclaredTimeIfNeeded({ id: 't1', title: 'Post', needsDeclaredTime: true }), true);
    assert.deepEqual([seen[0].type, seen[0].detail], [DECLARED_TIME_EVENT, { id: 't1', title: 'Post' }]);
  } finally { delete globalThis.window; delete globalThis.CustomEvent; }
});

test('one dialog for the whole app, opened after the server confirms the close, from the board and the panel', () => {
  assert.match(read('src/components/layout/AppLayout.jsx'), /<DeclaredTimeDialog \/>/);
  const board = read('src/components/modules/NativeTasks.jsx');
  assert.match(board, /destinationColumnId === 'realizado'\) \{\s*triggerConfetti[\s\S]{0,200}askDeclaredTimeIfNeeded\(await response\.json\(\)/);
  const panel = read('src/components/modules/TaskSidePanel.jsx');
  assert.match(panel, /if \(cierraLaTarea\) askDeclaredTimeIfNeeded\(updatedTask\)/);
  const dialog = read('src/components/tasks/DeclaredTimeDialog.jsx');
  assert.match(dialog, /\/declared-time/);
  assert.match(dialog, /No lo sé/, 'never blocks: the person can skip');
  assert.match(dialog, /dark:bg-zinc-900/);
  assert.match(dialog, /console\.error\('\[DeclaredTimeDialog\]/);
  assert.match(read('src/routes/index.js'), /router\.post\('\/tasks\/:taskId\/declared-time', guardTask, taskController\.declareTaskTimeHandler\)/);
  assert.match(read('src/controllers/taskController.js'), /updateData\.status === 'REALIZADA'[\s\S]{0,300}needsDeclaredTime\(/);
});
