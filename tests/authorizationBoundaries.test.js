import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import * as security from '../src/config/security.js';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('module permissions are case-insensitive and ADMIN bypasses them', () => {
  assert.equal(typeof security.hasModulePermission, 'function');
  assert.equal(security.hasModulePermission({ role: 'ADMIN' }, 'reportes'), true);
  assert.equal(security.hasModulePermission({ role: 'EDITOR', modulePermissions: { Reportes: true } }, 'reportes'), true);
  assert.equal(security.hasModulePermission({ role: 'EDITOR', modulePermissions: { reportes: false } }, 'reportes'), false);
});

test('task updates are limited to managers, creators, and assignees', () => {
  const task = { creatorId: 'creator', assignee: { userId: 'assignee' } };
  assert.equal(typeof security.canUpdateTask, 'function');
  assert.equal(security.canUpdateTask({ userId: 'admin', role: 'ADMIN' }, task), true);
  assert.equal(security.canUpdateTask({ userId: 'pm', role: 'PROJECT_MANAGER' }, task), true);
  assert.equal(security.canUpdateTask({ userId: 'creator', role: 'EDITOR' }, task), true);
  assert.equal(security.canUpdateTask({ userId: 'assignee', role: 'EDITOR' }, task), true);
  assert.equal(security.canUpdateTask({ userId: 'other', role: 'EDITOR' }, task), false);
});

test('task deletion is limited to managers and the creator', () => {
  const task = { creatorId: 'creator', assignee: { userId: 'assignee' } };
  assert.equal(typeof security.canDeleteTask, 'function');
  assert.equal(security.canDeleteTask({ userId: 'pm', role: 'PROJECT_MANAGER' }, task), true);
  assert.equal(security.canDeleteTask({ userId: 'creator', role: 'EDITOR' }, task), true);
  assert.equal(security.canDeleteTask({ userId: 'assignee', role: 'EDITOR' }, task), false);
});

test('task update payload cannot overwrite lifecycle or ownership fields', () => {
  assert.equal(typeof security.pickAllowedTaskUpdates, 'function');
  const result = security.pickAllowedTaskUpdates({
    title: 'Actualizada',
    status: 'EN_CURSO',
    reopenReason: 'CLIENT_CORRECTION',
    reopenNote: 'Cambiar el cierre.',
    creatorId: 'attacker',
    completedAt: '2026-01-01',
    returnCount: 999,
    contentItemId: 'other-item',
    unknown: true
  });

  assert.deepEqual(result, {
    title: 'Actualizada',
    status: 'EN_CURSO',
    reopenReason: 'CLIENT_CORRECTION',
    reopenNote: 'Cambiar el cierre.'
  });
});

test('task attachment deletion is scoped to its parent task', async () => {
  const service = await read('src/services/nativeTaskService.js');
  assert.match(service, /taskAttachment\.deleteMany\([\s\S]*where:\s*\{\s*id:\s*updateData\.deleteAttachmentId,\s*taskId:\s*id\s*\}/);
});

test('notification reads are scoped to the authenticated user', async () => {
  const controller = await read('src/controllers/notificationController.js');
  const service = await read('src/services/notificationService.js');

  assert.match(controller, /markAsRead\(req\.params\.id,\s*req\.user\.userId\)/);
  assert.match(service, /where:\s*\{\s*id:\s*notificationId,\s*userId\s*\}/);
});

test('integration credentials are never serialized and management requires a manager role', async () => {
  const integrations = await read('src/routes/api/integrations.js');

  assert.match(integrations, /router\.use\(requireManagerRole\)/);
  assert.match(integrations, /select:\s*publicIntegrationSelect/);
  assert.doesNotMatch(integrations, /credentials:\s*true/);
});

test('legacy announcement writes and direct notification creation require managers', async () => {
  const routes = await read('src/routes/index.js');

  assert.match(routes, /router\.post\('\/notifications',\s*requireManagerRole,/);
  assert.match(routes, /router\.post\('\/global-announcements',\s*requireManagerRole,/);
  assert.match(routes, /router\.delete\('\/global-announcements\/:id',\s*requireManagerRole,/);
  assert.match(routes, /router\.post\('\/clients\/:clientId\/announcements',\s*requireManagerRole,/);
});

test('central Google Calendar connection changes require a manager role', async () => {
  const activity = await read('src/routes/api/activity.js');

  assert.match(activity, /router\.get\('\/google-calendar\/auth-url',\s*requireManagerRole,/);
  assert.match(activity, /router\.patch\('\/google-calendar\/active-calendar',\s*requireManagerRole,/);
  assert.match(activity, /router\.post\('\/google-calendar\/oauth-callback',\s*requireManagerRole,/);
  assert.match(activity, /router\.post\('\/google-calendar\/sync',\s*requireManagerRole,/);
});

test('Talent Radar recognizes the PROJECT_MANAGER enum', async () => {
  const radar = await read('src/routes/api/talentRadar.js');
  assert.doesNotMatch(radar, /req\.user\?\.role\s*!==\s*'PM'/);
  assert.match(radar, /requireManagerRole/);
  assert.match(radar, /router\.put\('\/member\/:memberId\/avatar',\s*requireManagerRole,/);
});
