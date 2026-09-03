import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = async (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8').catch(() => '');

test('authenticated layout prioritizes returned-task reminders over excessive-time alerts', async () => {
  const layout = await read('src/components/layout/AppLayout.jsx');

  assert.match(layout, /ReturnedTaskAlertDialog/);
  assert.match(layout, /isReturnedTaskAlertBlocking/);
  assert.match(layout, /enabled=\{canUseTaskManagement && !isReturnedTaskAlertBlocking\}/);
  assert.match(layout, /import\.meta\.env\.DEV.*previewReturnedAlert/s);
  assert.match(layout, /previewTasks=\{returnedTaskAlertPreview\}/);
});

test('returned-task popup uses the approved reminder copy and offers review or server-side snooze', async () => {
  const source = await read('src/components/tasks/ReturnedTaskAlertDialog.jsx');

  assert.match(source, /api\/tasks\/returned-alerts/);
  assert.match(source, /returned-reminder\/snooze/);
  assert.match(source, /recuerda que tienes una tarea devuelta/);
  assert.match(source, /Hay una tarea que está esperando tu revisión/);
  assert.match(source, /Hay varias tareas que están esperando tu revisión/);
  assert.match(source, /Revisar tarea/);
  assert.match(source, /Recordarme más tarde/);
  assert.match(source, /\/gestion\?taskId=/);
  assert.match(source, /previewReturnedAlert=0/);
  assert.doesNotMatch(source, /pospone este aviso/);
  assert.match(source, /from-\[#00AC8A\].*to-\[#009EB9\]/s);
  assert.match(source, /brainstudio-mascot-tip\.png/);
  assert.match(source, /onBlockingChange/);
  assert.match(source, /isLoading \|\| isOpen \|\| hasPendingDialog/);
  assert.match(source, /previewTasks/);
  assert.match(source, /console\.error\('\[ReturnedTaskAlert\]/);
});

test('returned reminder routes stay behind the existing task-management permission boundary', async () => {
  const routes = await read('src/routes/index.js');

  assert.match(routes, /router\.use\('\/tasks', requireModulePermission\('gestion'\)\)/);
  assert.match(routes, /router\.get\('\/tasks\/returned-alerts', taskController\.getMyReturnedTaskAlerts\)/);
  assert.match(routes, /router\.post\('\/tasks\/:taskId\/returned-reminder\/snooze', taskController\.snoozeReturnedTaskReminder\)/);
});
