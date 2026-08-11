import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('backend module routers enforce the same permissions as the frontend', async () => {
  const routes = await read('src/routes/index.js');

  assert.match(routes, /router\.use\('\/content',\s*requireModulePermission\('parrillas'\),\s*contentRouter\)/);
  assert.match(routes, /router\.use\('\/boards',\s*requireModulePermission\('inspiracion'\),\s*boardsRouter\)/);
  assert.match(routes, /router\.use\('\/activity',\s*requireModulePermission\('actividad'\),\s*activityRouter\)/);
  assert.match(routes, /router\.use\('\/clients\/:clientId',\s*requireModulePermission\('clientes'\),\s*clientFileRouter\)/);
  assert.match(routes, /router\.post\('\/openai\/v1\/chat\/completions',\s*requireModulePermission\('manager'\),/);
  assert.match(routes, /router\.post\('\/fireflies\/graphql',\s*requireModulePermission\('minutas'\),/);
});

test('deep frontend routes cannot bypass their module guard', async () => {
  const app = await read('src/App.jsx');

  assert.match(app, /path="\/parrillas\/:clientSlug\/:period"[\s\S]{0,180}<ModuleGuard module="parrillas">/);
  assert.match(app, /path="\/parrillas\/:planId"[\s\S]{0,180}<ModuleGuard module="parrillas">/);
  assert.match(app, /path="\/moodboard\/:boardId"[\s\S]{0,180}<ModuleGuard module="inspiracion">/);
  assert.match(app, /path="\/cliente\/:clientId"[\s\S]{0,180}<ModuleGuard module="clientes">/);
  assert.match(app, /path="\/cotizaciones\/nueva"[\s\S]{0,180}<ModuleGuard module="cotizaciones">/);
});

test('sensitive client mutations require a manager role', async () => {
  const routes = await read('src/routes/index.js');

  assert.match(routes, /router\.post\('\/clients',\s*requireManagerRole,/);
  assert.match(routes, /router\.patch\('\/clients\/:id',\s*requireManagerRole,/);
  assert.match(routes, /router\.patch\('\/clients\/:id\/archive',\s*requireManagerRole,/);
});

test('team provisioning has no shared default password and status updates are self-scoped', async () => {
  const team = await read('src/routes/api/team.js');

  assert.doesNotMatch(team, /Brainstudio2026/);
  assert.match(team, /randomBytes\(/);
  assert.match(team, /mustChangePassword:\s*true/);
  assert.doesNotMatch(team, /const \{ memberId, statusMessage \} = req\.body/);
  assert.match(team, /where:\s*\{\s*userId:\s*req\.user\.userId\s*\}/);
});

test('protected report pipeline metadata is not exposed before authentication', async () => {
  const routes = await read('src/routes/index.js');
  const publicBlock = routes.slice(routes.indexOf('// --- Public Routes'), routes.indexOf('// --- Protected Routes'));

  assert.doesNotMatch(publicBlock, /reports\/pipeline-status/);
});
