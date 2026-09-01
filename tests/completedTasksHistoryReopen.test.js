import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as taskTiming from '../src/lib/taskTiming.js';

test('only administrators can return a completed task from achievement history', () => {
  assert.equal(typeof taskTiming.canReturnCompletedTaskToBoard, 'function');
  assert.equal(taskTiming.canReturnCompletedTaskToBoard({ role: 'ADMIN' }), true);
  assert.equal(taskTiming.canReturnCompletedTaskToBoard({ role: 'PROJECT_MANAGER' }), false);
  assert.equal(taskTiming.canReturnCompletedTaskToBoard({ role: 'EDITOR' }), false);
});

test('achievement history builds a traceable reopen payload', () => {
  assert.equal(typeof taskTiming.buildCompletedTaskReopenPayload, 'function');
  assert.deepEqual(
    taskTiming.buildCompletedTaskReopenPayload('CLIENT_CORRECTION', '  Ajustar el cierre.  '),
    {
      status: 'PENDIENTE',
      reopenReason: 'CLIENT_CORRECTION',
      reopenNote: 'Ajustar el cierre.',
    }
  );
  assert.equal(taskTiming.buildCompletedTaskReopenPayload('CLIENT_CORRECTION', '   '), null);
});

test('achievement history exposes an admin-only server-confirmed return action', () => {
  const source = readFileSync('src/components/modules/CompletedTasksHistoryModal.jsx', 'utf8');

  assert.match(source, /canReturnCompletedTaskToBoard\(currentUser\)/);
  assert.match(source, /Regresar al tablero/);
  assert.match(source, /buildCompletedTaskReopenPayload\(reopenReason,\s*reopenNote\)/);
  assert.match(source, /method:\s*'PATCH'/);
  assert.match(source, /if \(!response\.ok\) throw[\s\S]*setTasks\(current => current\.filter/);
  assert.match(source, /setTasks\(current => current\.filter[\s\S]*closeReopenDialog\(true\)/);
  assert.match(source, /invalidateQueries\(\{ queryKey: \['nativeTasks'\] \}\)/);
  assert.match(source, /min-h-11/);
});
