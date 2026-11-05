import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright-core';
import { createSharedTaskApiFixture } from '../support/sharedTaskApiFixture.js';
import { sharedTaskOutput } from '../support/sharedTaskSandbox.js';
import { startSharedTaskWebFixture } from '../support/sharedTaskWebFixture.js';
import { markTaskTimingTutorialSeen, markTaskTimingTutorialAfternoonSeen } from '../../src/lib/taskTiming.js';

// Navegador real → proxy local → router y autenticación reales → PostgreSQL 55451.
// No intercepta ni fabrica respuestas de tareas; únicamente bloquea destinos externos.
let f, frontend, browser;
const contexts = [], errors = [];
const output = path.join(sharedTaskOutput, 'browser');
before(async () => {
  await mkdir(output, { recursive: true });
  f = await createSharedTaskApiFixture();
  frontend = await startSharedTaskWebFixture(f.api.origin);
  browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
});
after(async () => {
  await writeFile(path.join(output, 'page-errors.json'), JSON.stringify(errors, null, 2));
  if (f) await writeFile(path.join(output, 'api.log'), f.api.logs());
  await browser?.close(); await frontend?.close(); await f?.close();
});

async function openPerson(key, viewport = { width: 1440, height: 1000 }) {
  const context = await browser.newContext({ viewport }); contexts.push(context);
  await context.route('**/*', route => {
    const url = new URL(route.request().url());
    return ['127.0.0.1', 'localhost'].includes(url.hostname) ? route.continue() : route.abort();
  });
  const values = {}, storage = { setItem: (key, value) => { values[key] = value; }, getItem: key => values[key] };
  markTaskTimingTutorialSeen(storage, f.actors[key].id); markTaskTimingTutorialAfternoonSeen(storage, f.actors[key].id);
  await context.addInitScript(({ session, values }) => {
    localStorage.setItem('authToken', session.token); localStorage.setItem('currentUser', JSON.stringify(session.user));
    for (const [key, value] of Object.entries(values)) localStorage.setItem(key, value);
  }, { session: f.sessions[key], values });
  const page = await context.newPage();
  page.on('pageerror', error => errors.push({ person: key, message: error.message }));
  await page.goto('http://127.0.0.1:3181/gestion', { waitUntil: 'domcontentloaded', timeout: 90_000 });
  await page.getByRole('combobox', { name: 'Periodo', exact: true }).click();
  await page.getByRole('option', { name: 'Todos', exact: true }).click();
  await page.getByRole('combobox', { name: 'Cliente', exact: true }).click();
  await page.getByRole('option', { name: f.client.name, exact: true }).click();
  return page;
}
const card = (page, taskId, key) => page.locator(`[data-task-id="${taskId}"][data-task-member="${f.actors[key].memberId}"]`);
async function dragRight(page, taskId, key, status) {
  const target = card(page, taskId, key);
  await target.waitFor({ timeout: 45_000 }); await target.focus();
  assert.ok(await target.getAttribute('data-rfd-drag-handle-draggable-id'), `la tarjeta propia de ${key} permite arrastrar`);
  await page.keyboard.press('Space'); await page.waitForTimeout(250);
  await page.keyboard.press('ArrowRight'); await page.waitForTimeout(250);
  const saved = page.waitForResponse(response => response.url().includes(`/tasks/${taskId}/participants/${f.actors[key].memberId}`) && response.request().method() === 'PATCH');
  await page.keyboard.press('Space');
  assert.equal((await saved).status(), 200);
  await page.waitForFunction(({ taskId, memberId, status }) => document.querySelector(`[data-task-id="${taskId}"][data-task-member="${memberId}"]`)?.getAttribute('data-participation-status') === status,
    { taskId, memberId: f.actors[key].memberId, status });
  const unknown = page.getByRole('button', { name: 'No lo sé', exact: true });
  if (await unknown.isVisible().catch(() => false)) await unknown.click();
}

test('tres personas mueven la misma tarea real, conservan sus relojes y cierran el conjunto solo al terminar todos', { timeout: 180_000 }, async () => {
  const task = await f.createTask('Una presentación · tres personas · prueba real');
  const pages = {};
  try {
    for (const key of ['ana', 'bea', 'carlos']) {
      pages[key] = await openPerson(key); await card(pages[key], task.id, key).waitFor({ timeout: 60_000 });
      assert.equal(await card(pages[key], task.id, key).getAttribute('data-participation-status'), 'PENDIENTE');
    }
    await pages.ana.screenshot({ path: path.join(output, 'tres-partes-creadas.png'), fullPage: true, animations: 'disabled' });
    await dragRight(pages.ana, task.id, 'ana', 'EN_CURSO');
    await dragRight(pages.bea, task.id, 'bea', 'EN_CURSO');
    await dragRight(pages.ana, task.id, 'ana', 'REALIZADA');
    let current = await f.loadTask(task.id);
    assert.equal(current.status, 'EN_CURSO'); assert.equal(current.completedAt, null);
    assert.equal(f.participation(current, 'ana').status, 'REALIZADA');
    assert.equal(f.participation(current, 'bea').status, 'EN_CURSO');
    assert.equal(f.participation(current, 'carlos').status, 'PENDIENTE');
    assert.equal(await f.db.taskWorkSession.count({ where: { taskId: task.id, endedAt: null } }), 1);
    for (const key of ['bea', 'carlos']) {
      await pages[key].reload({ waitUntil: 'domcontentloaded' });
      await card(pages[key], task.id, key).getByText('1/3 completadas', { exact: false }).waitFor();
    }
    await pages.ana.screenshot({ path: path.join(output, 'ana-termino-su-parte.png'), fullPage: true, animations: 'disabled' });
    await pages.bea.evaluate(() => document.documentElement.classList.add('dark'));
    await pages.bea.screenshot({ path: path.join(output, 'bea-sigue-trabajando-dark.png'), fullPage: true, animations: 'disabled' });
    await pages.carlos.setViewportSize({ width: 390, height: 844 });
    await pages.carlos.screenshot({ path: path.join(output, 'carlos-pendiente-mobile.png'), fullPage: true, animations: 'disabled' });
    await pages.carlos.setViewportSize({ width: 1440, height: 1000 });
    await pages.ana.reload({ waitUntil: 'domcontentloaded' });
    await card(pages.ana, task.id, 'ana').waitFor({ timeout: 30_000 });
    assert.equal(await card(pages.ana, task.id, 'ana').getAttribute('data-participation-status'), 'REALIZADA');
    await dragRight(pages.bea, task.id, 'bea', 'REALIZADA');
    await dragRight(pages.carlos, task.id, 'carlos', 'EN_CURSO');
    await dragRight(pages.carlos, task.id, 'carlos', 'REALIZADA');
    current = await f.loadTask(task.id);
    assert.equal(current.status, 'REALIZADA'); assert.ok(current.completedAt);
    assert.equal(await f.db.task.count({ where: { id: task.id } }), 1);
    assert.equal(await f.db.taskWorkSession.count({ where: { taskId: task.id, endedAt: null } }), 0);
    assert.equal(await f.db.taskWorkCycle.count({ where: { taskId: task.id, closedAt: { not: null } } }), 1);
    await pages.carlos.screenshot({ path: path.join(output, 'todos-realizados.png'), fullPage: true, animations: 'disabled' });
    await card(pages.carlos, task.id, 'carlos').click();
    const progress = pages.carlos.locator('[data-task-participations]');
    await progress.getByRole('button', { name: 'Reabrir mi parte', exact: true }).click();
    const reopenDialog = pages.carlos.getByRole('dialog').filter({ has: pages.carlos.getByRole('heading', { name: 'Reabrir participación', exact: true }) });
    await reopenDialog.getByLabel('Nota', { exact: true }).fill('Ajuste ficticio para comprobar reapertura personal.');
    const reopened = pages.carlos.waitForResponse(response => response.url().includes(`/tasks/${task.id}/participants/`) && response.request().method() === 'PATCH');
    await reopenDialog.getByRole('button', { name: 'Reabrir participación', exact: true }).click();
    assert.equal((await reopened).status(), 200);
    const afterReopen = await f.loadTask(task.id);
    assert.equal(f.participation(afterReopen, 'carlos').status, 'PENDIENTE');
    assert.equal(f.participation(afterReopen, 'ana').status, 'REALIZADA');
    assert.equal(f.participation(afterReopen, 'bea').status, 'REALIZADA');
    assert.equal(afterReopen.completedAt, null);
    await progress.getByRole('button', { name: 'Empezar mi parte', exact: true }).waitFor();
    await pages.carlos.screenshot({ path: path.join(output, 'reabrir-solo-mi-parte.png'), fullPage: true, animations: 'disabled' });
    await writeFile(path.join(output, 'acceptance.json'), JSON.stringify({ runId: f.runId, taskId: task.id,
      memberIds: ['ana', 'bea', 'carlos'].map(key => f.actors[key].memberId), status: current.status,
      completedAt: current.completedAt, participants: current.participants.map(row => ({ memberId: row.memberId, status: row.status, completedAt: row.completedAt })),
      reopened: { status: afterReopen.status, completedAt: afterReopen.completedAt, memberId: f.actors.carlos.memberId } }, null, 2));
    assert.deepEqual(errors, []);
  } catch (error) {
    for (const [key, page] of Object.entries(pages)) await page.screenshot({ path: path.join(output, `failure-${key}.png`), fullPage: true }).catch(() => {});
    throw error;
  }
});

test('un guardado demorado pierde frente a otra sesión real y muestra 409 sin reenviar ni duplicar reloj', { timeout: 90_000 }, async () => {
  const task = await f.createTask('Dos dispositivos · revisión anterior real');
  const page = await openPerson('bea');
  await card(page, task.id, 'bea').click();
  const section = page.locator('[data-task-participations]');
  await section.getByRole('button', { name: 'Empezar mi parte', exact: true }).waitFor();
  let release, arrive; let writes = 0;
  const held = new Promise(resolve => { release = resolve; });
  const arriving = new Promise(resolve => { arrive = resolve; });
  const endpoint = `**/api/tasks/${task.id}/participants/${f.actors.bea.memberId}`;
  await page.route(endpoint, async route => { writes += 1; arrive(); await held; await route.continue(); });
  try {
    const response = page.waitForResponse(res => res.url().includes(`/tasks/${task.id}/participants/`) && res.request().method() === 'PATCH');
    await section.getByRole('button', { name: 'Empezar mi parte', exact: true }).click(); await arriving;
    await section.getByRole('status').filter({ hasText: 'Guardando' }).waitFor();
    assert.equal(await f.db.taskWorkSession.count({ where: { taskId: task.id } }), 0);
    assert.equal(await page.locator('body > canvas').count(), 0);
    const otherDevice = (await f.move(task, 'bea', 'EN_CURSO')).data;
    release(); assert.equal((await response).status(), 409);
    await section.getByRole('alert').waitFor();
    await section.getByRole('button', { name: 'Pausar mi parte', exact: true }).waitFor();
    assert.equal(writes, 1);
    const current = await f.loadTask(task.id);
    assert.equal(f.participation(current, 'bea').revision, f.participation(otherDevice, 'bea').revision);
    assert.equal(await f.db.taskWorkSession.count({ where: { taskId: task.id, endedAt: null } }), 1);
    await page.screenshot({ path: path.join(output, 'conflicto-real-409.png'), fullPage: true, animations: 'disabled' });
  } finally { release(); await page.unroute(endpoint); }
});
