import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('authenticated layout mounts a personal excessive-time popup', async () => {
  const layout = await read('src/components/layout/AppLayout.jsx');
  assert.match(layout, /ExcessiveTaskAlertDialog/);
});

test('popup uses the authenticated endpoint, explains the 15-hour threshold and links to tasks', async () => {
  const source = await read('src/components/tasks/ExcessiveTaskAlertDialog.jsx');
  assert.match(source, /api\/tasks\/work-alerts/);
  assert.match(source, /15 horas/);
  assert.match(source, /\/gestion\?taskId=/);
  assert.match(source, /sessionStorage/);
  assert.match(source, /excessive-task-alert:v6/);
  assert.match(source, /h-8 gap-1\.5 rounded-lg/);
  assert.match(source, /DialogContent/);
  assert.match(source, /from-\[#00AC8A\].*to-\[#009EB9\]/s);
  assert.match(source, /brainstudio-mascot-tip\.png/);
  assert.match(source, /const firstName = String\(userName/);
  assert.match(source, /Hola\{firstName/);
  assert.match(source, /sm:whitespace-nowrap/);
  assert.match(source, /estas tareas todavía siguen activas/);
  assert.match(source, /evaluación de tu desempeño/);
  assert.match(source, /Sigo trabajando/);
  assert.match(source, /Revisar tarea/);
  assert.match(source, /work-confirmation/);
  assert.doesNotMatch(source, /Entendido, revisaré mis tareas/);
});

test('task alerts route remains protected by the gestion module permission', async () => {
  const routes = await read('src/routes/index.js');
  assert.match(routes, /router\.use\('\/tasks', requireModulePermission\('gestion'\)\)/);
  assert.match(routes, /router\.get\('\/tasks\/work-alerts', taskController\.getMyExcessiveTaskAlerts\)/);
  assert.match(routes, /router\.post\('\/tasks\/:taskId\/work-confirmation', taskController\.confirmExcessiveTaskWork\)/);
});
