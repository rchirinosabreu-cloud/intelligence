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

test('task lifecycle actions use semantic return and reintegration icons consistently', () => {
  const icons = readFileSync('src/components/ui/icons.jsx', 'utf8');
  const history = readFileSync('src/components/modules/CompletedTasksHistoryModal.jsx', 'utf8');
  const kanban = readFileSync('src/components/modules/NativeTasks.jsx', 'utf8');
  const sidePanel = readFileSync('src/components/modules/TaskSidePanel.jsx', 'utf8');

  assert.match(icons, /TaskReturnIcon\s*=\s*createIcon\(HandIconData/);
  assert.match(icons, /TaskReintegrateIcon\s*=\s*createIcon\(RefreshIconData/);

  assert.match(history, /TaskReintegrateIcon/);
  assert.doesNotMatch(history, /\bRefreshCw\b/);

  assert.match(kanban, /TaskReintegrateIcon[\s\S]{0,180}Reabrir tarea/);
  assert.match(kanban, /TaskReturnIcon[\s\S]{0,180}Devolver tarea/);
  assert.match(sidePanel, /isReturn\s*\?\s*<TaskReturnIcon[\s\S]*:\s*isReopen\s*\?\s*<TaskReintegrateIcon[\s\S]*:\s*<CheckCircle2/);
  assert.match(sidePanel, /<TaskReintegrateIcon[^>]*\/>\s*Reintegrar Tarea/);
});

test('kanban lifecycle actions only appear in their corresponding columns', () => {
  assert.equal(typeof taskTiming.getTaskLifecycleAction, 'function');
  assert.equal(taskTiming.getTaskLifecycleAction('PENDIENTE'), 'return');
  assert.equal(taskTiming.getTaskLifecycleAction('EN_CURSO'), 'return');
  assert.equal(taskTiming.getTaskLifecycleAction('REALIZADA'), 'reintegrate');
  assert.equal(taskTiming.getTaskLifecycleAction('DEVUELTA'), null);

  const kanban = readFileSync('src/components/modules/NativeTasks.jsx', 'utf8');
  assert.match(kanban, /getTaskLifecycleAction\(task\.status\)/);
  assert.match(kanban, /min-h-11 min-w-11[^"]*sm:min-h-8 sm:min-w-8/);
});

test('all task system events use the same badge-and-note composition without decorative quotes', () => {
  assert.equal(typeof taskTiming.getTaskSystemEventPresentation, 'function');
  assert.deepEqual(
    taskTiming.getTaskSystemEventPresentation('system_return', '  Pendiente a titulares y fotos  '),
    { badgeLabel: 'Motivo de devolución', note: 'Pendiente a titulares y fotos' }
  );
  assert.deepEqual(
    taskTiming.getTaskSystemEventPresentation('system_reintegrate', '  Ajuste resuelto  '),
    { badgeLabel: 'Nota de reintegración', note: 'Ajuste resuelto' }
  );
  assert.deepEqual(
    taskTiming.getTaskSystemEventPresentation('system_reopen', '[CLIENT_CORRECTION]\nAjustar el cierre.'),
    { badgeLabel: 'Corrección normal del cliente', note: 'Ajustar el cierre.' }
  );

  const sidePanel = readFileSync('src/components/modules/TaskSidePanel.jsx', 'utf8');
  assert.match(sidePanel, /getTaskSystemEventPresentation\(comment\.type,\s*cleanContent\)/);
  assert.doesNotMatch(sidePanel, /"<RichCommentContent/);
});
