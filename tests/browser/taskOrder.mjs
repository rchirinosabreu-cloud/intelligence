import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright-core';
import { createRecognitionPreview } from '../../scripts/preview-recognitions.js';
import { recognitionDemoMember, recognitionDemoUser } from '../fixtures/recognitionData.js';

let preview, browser;
before(async () => {
  preview = await createRecognitionPreview({ port: 0, role: 'ADMIN' });
  browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
  await mkdir('output/task-order', { recursive: true });
});
after(async () => { await browser?.close(); await preview?.close(); });

for (const dark of [false, true]) test(`filtered priority survives new tasks and refresh (${dark ? 'dark' : 'light'})`, async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, colorScheme: dark ? 'dark' : 'light' });
  const day = new Date().toISOString().slice(0, 10);
  const row = (id, sortOrder, clientName = 'Agencia Faro') => ({
    id, title: `Pendiente ${id.toUpperCase()}`, sortOrder, status: 'PENDIENTE', dueDate: `${day}T12:00:00Z`, createdAt: `${day}T09:00:00Z`,
    clientId: clientName, client: { name: clientName }, creatorId: recognitionDemoUser.id, creator: recognitionDemoUser,
    assigneeId: recognitionDemoMember.id, assignee: recognitionDemoMember, collaborators: [], taskAttachments: [], taskComments: []
  });
  let rows = [row('a', 0), row('hidden', 1, 'Otra cuenta'), row('b', 2)];
  const writes = [];
  let reject = false;
  await page.route('**/api/tasks**', async route => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/api/tasks') return route.fulfill({ json: rows });
    if (path === '/api/tasks/reorder') {
      writes.push(route.request().postDataJSON());
      if (reject) return route.fulfill({ status: 409, json: { error: 'La prioridad cambió. Actualiza el tablero antes de ordenar.' } });
      rows = [row('b', 0), row('hidden', 1, 'Otra cuenta'), row('a', 2), row('new', 3)];
      return route.fulfill({ json: { success: true, order: rows.map(({ id, sortOrder }) => ({ id, sortOrder })) } });
    }
    return route.continue();
  });
  await page.goto(`${preview.origin}/gestion?admin`, { waitUntil: 'domcontentloaded' });
  const column = page.locator('[data-rfd-droppable-id="pendiente"]');
  await column.locator('[data-rfd-draggable-id="b"]').waitFor({ timeout: 45000 });
  if (dark) await page.evaluate(() => document.documentElement.classList.add('dark'));
  const choose = async (label, value) => {
    await page.getByRole('combobox', { name: label, exact: true }).click();
    await page.getByRole('option', { name: value, exact: true }).click();
  };
  const visibleIds = () => column.locator('[data-rfd-draggable-id]').evaluateAll(elements => elements.map(element => element.getAttribute('data-rfd-draggable-id')));
  await choose('Cliente', 'Agencia Faro');
  assert.deepEqual(await visibleIds(), ['a', 'b']);
  const dragUp = async id => {
    const card = column.locator(`[data-rfd-draggable-id="${id}"]`);
    await card.focus();
    await page.keyboard.press('Space');
    await page.keyboard.press('ArrowUp');
    await page.keyboard.press('Space');
  };
  await dragUp('b');
  await page.waitForResponse(response => response.url().endsWith('/api/tasks/reorder'));
  await page.getByText('Prioridad guardada', { exact: false }).first().waitFor();
  assert.deepEqual(writes[0].previousIds, ['a', 'b']);
  await choose('Cliente', 'Todos los clientes');
  await page.getByRole('button', { name: 'Actualizar tareas', exact: true }).click();
  await column.locator('[data-rfd-draggable-id="new"]').waitFor();
  assert.deepEqual(await visibleIds(), ['b', 'hidden', 'a', 'new']);
  await page.screenshot({ path: `output/task-order/${dark ? 'dark' : 'light'}.png`, fullPage: true });
  reject = true;
  await dragUp('new');
  await page.getByText('La prioridad cambió. Actualiza el tablero antes de ordenar.', { exact: true }).waitFor();
  assert.deepEqual(await visibleIds(), ['b', 'hidden', 'a', 'new'], 'a rejected move leaves the saved order visible');
  await page.reload({ waitUntil: 'domcontentloaded' });
  await column.locator('[data-rfd-draggable-id="new"]').waitFor();
  assert.deepEqual(await visibleIds(), ['b', 'hidden', 'a', 'new']);
  await page.close();
});
