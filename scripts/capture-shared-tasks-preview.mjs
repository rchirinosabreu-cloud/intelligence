// Comprueba el preview persistente a través del login de pantalla, sin cambiar las tareas.
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright-core';
import { sharedTaskOutput } from '../tests/support/sharedTaskSandbox.js';
import { markTaskTimingTutorialSeen, markTaskTimingTutorialAfternoonSeen } from '../src/lib/taskTiming.js';

const info = JSON.parse(await readFile(path.join(sharedTaskOutput, 'preview-access.json'), 'utf8'));
assert.ok(['http://127.0.0.1:3181/gestion', 'http://127.0.0.1:3182/gestion'].includes(info.url), 'Solo se captura el preview local de compartidas.');
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1100 } });
  await context.route('**/*', route => ['127.0.0.1', 'localhost'].includes(new URL(route.request().url()).hostname) ? route.continue() : route.abort());
  const page = await context.newPage();
  await page.goto(info.url, { waitUntil: 'domcontentloaded' });
  await page.getByLabel('Correo electrónico', { exact: true }).fill(info.users.manager.email);
  await page.getByLabel('Contraseña', { exact: true }).fill(info.password);
  await page.getByRole('button', { name: 'Acceder', exact: true }).click();
  await page.getByRole('heading', { name: 'Gestión de Tareas', exact: true }).waitFor();
  const userId = await page.evaluate(() => JSON.parse(localStorage.getItem('currentUser')).id);
  const values = {}, storage = { setItem: (key, value) => { values[key] = value; }, getItem: key => values[key] };
  markTaskTimingTutorialSeen(storage, userId); markTaskTimingTutorialAfternoonSeen(storage, userId);
  await page.evaluate(values => { for (const [key, value] of Object.entries(values)) localStorage.setItem(key, value); }, values);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.getByRole('combobox', { name: 'Cliente', exact: true }).click();
  await page.getByRole('option', { name: info.client, exact: true }).click();
  await page.getByRole('combobox', { name: 'Responsable', exact: true }).click();
  await page.getByRole('option', { name: 'Todos los responsables', exact: true }).click();
  const cards = page.locator(`[data-task-id="${info.tasks.partial}"]`);
  await cards.first().waitFor(); assert.equal(await cards.count(), 3);
  const states = await cards.evaluateAll(rows => rows.map(row => row.dataset.participationStatus));
  assert.deepEqual(states.sort(), ['EN_CURSO', 'PENDIENTE', 'REALIZADA']);
  await page.screenshot({ path: path.join(sharedTaskOutput, 'browser/preview-todos.png'), fullPage: true, animations: 'disabled' });
  await cards.filter({ hasText: 'Parte de Bea' }).click();
  await page.locator('[data-task-participations]').waitFor();
  await page.getByRole('heading', { name: `Tarea #${info.tasks.partial.slice(0, 8)}`, exact: true }).waitFor();
  await page.screenshot({ path: path.join(sharedTaskOutput, 'browser/preview-mismo-id.png'), fullPage: true, animations: 'disabled' });
  await writeFile(path.join(sharedTaskOutput, 'preview-verified.json'), JSON.stringify({ at: new Date().toISOString(), url: info.url,
    login: 'real screen', taskId: info.tasks.partial, cards: 3, states, sameDetailCode: info.tasks.partial.slice(0, 8) }, null, 2));
  console.log('Preview verificado: login real, tres tarjetas con el mismo Task ID, estados personales y detalle común.');
} finally { await browser.close(); }
