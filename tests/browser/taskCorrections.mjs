import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright-core';
import { createRecognitionPreview } from '../../scripts/preview-recognitions.js';
import { recognitionDemoMember, recognitionDemoUser } from '../fixtures/recognitionData.js';

let preview, browser;
before(async () => {
  preview = await createRecognitionPreview({ port: 0 });
  browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
  await mkdir('output/task-corrections', { recursive: true });
});
after(async () => { await browser?.close(); await preview?.close(); });

for (const mobile of [false, true]) test(`task client correction in ${mobile ? 'mobile dark' : 'desktop light'}`, async () => {
  const page = await browser.newPage({ viewport: mobile ? { width: 390, height: 844 } : { width: 1440, height: 1000 }, isMobile: mobile, hasTouch: mobile, colorScheme: mobile ? 'dark' : 'light' });
  const clients = [{ id: 'source', name: 'Cuenta Norte' }, { id: 'destination', name: 'Agencia Faro' }];
  const task = { id: 'correction-task', title: 'Preparar propuesta', clientId: 'source', client: clients[0], creatorId: recognitionDemoUser.id, creator: recognitionDemoUser, assigneeId: recognitionDemoMember.id, assignee: recognitionDemoMember, status: 'PENDIENTE', dueDate: null, collaborators: [], taskAttachments: [], isPrivate: false };
  const writes = [];
  let refuse = true;
  await page.route('**/api/**', async route => {
    const url = new URL(route.request().url());
    if (['/api/clients', '/api/db/clients'].includes(url.pathname)) return route.fulfill({ json: clients });
    if (url.pathname === '/api/tasks') return route.fulfill({ json: [task] });
    if (url.pathname === '/api/tasks/correction-task' && route.request().method() === 'PATCH') {
      writes.push(route.request().postDataJSON());
      return route.fulfill({ status: refuse ? 409 : 200, json: refuse ? { error: 'El cliente cambió; vuelve a revisar la tarea.' } : { ...task, ...writes.at(-1) } });
    }
    if (url.pathname === '/api/tasks/correction-task') return route.fulfill({ json: task });
    if (url.pathname.endsWith('/comments')) return route.fulfill({ json: [] });
    if (url.pathname.endsWith('/follow-status')) return route.fulfill({ json: { isFollowing: false } });
    return route.continue();
  });
  await page.goto(`${preview.origin}/gestion?taskId=correction-task`, { waitUntil: 'domcontentloaded' });
  const dialog = page.getByRole('dialog').filter({ hasText: 'Guardar cambios' });
  await dialog.waitFor({ timeout: 45000 });
  await dialog.locator('[data-task-title-input]').fill('Revisar propuesta');
  if (mobile) {
    await page.evaluate(() => document.documentElement.classList.add('dark'));
    await dialog.locator('select[aria-label="Cliente"]').selectOption('destination');
  } else {
    await dialog.getByRole('combobox', { name: 'Cliente', exact: true }).click();
    await page.getByRole('option', { name: 'Agencia Faro', exact: true }).click();
  }
  await page.screenshot({ path: `output/task-corrections/${mobile ? 'mobile-dark' : 'desktop-light'}.png` });
  await dialog.getByRole('button', { name: 'Guardar cambios', exact: true }).click();
  await page.getByText('El cliente cambió; vuelve a revisar la tarea.', { exact: true }).waitFor();
  assert.equal(writes[0].clientId, 'destination');
  assert.equal(await dialog.isVisible(), true, 'a refusal must keep the form open');
  refuse = false;
  await dialog.getByRole('button', { name: 'Guardar cambios', exact: true }).click();
  await dialog.waitFor({ state: 'hidden' });
  assert.equal(writes.length, 2);
  assert.equal(writes[1].title, 'Revisar propuesta');
  await page.close();
});
