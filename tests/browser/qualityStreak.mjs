import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright-core';
import { createRecognitionPreview } from '../../scripts/preview-recognitions.js';

let preview, browser;
test.before(async () => {
  preview = await createRecognitionPreview({ port: 0 });
  browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
  await mkdir('output/quality-streak', { recursive: true });
});
test.after(async () => { await browser?.close(); await preview?.close(); });

for (const scenario of [
  { action: 'delete', screenshot: 'desktop-light' },
  { action: 'delete', dark: true, screenshot: 'desktop-dark' },
  { action: 'toggle' },
  { action: 'edit' },
  { action: 'create' },
  { action: 'delete', fail: true }
]) {
  test(`client ${scenario.action}${scenario.dark ? ' dark' : ''}${scenario.fail ? ' failure' : ''}: quality metric refreshes only after a confirmed write`, async () => {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    page.setDefaultTimeout(5000);
    page.setDefaultNavigationTimeout(60000);
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    let metricsReads = 0;
    let tasks = [{ id: 'returned-task', title: 'Ajustar pieza devuelta', clientId: 'streak-preview-client', status: 'DEVUELTA', isReturned: true, comments: '' }];
    const writes = [];
    let releaseWrite, writeReceived;
    const pendingWrite = new Promise(resolve => { releaseWrite = resolve; });
    const received = new Promise(resolve => { writeReceived = resolve; });
    const fulfilled = [];
    await page.route('**/api/**', async route => {
      const request = route.request();
      const pathname = new URL(request.url()).pathname;
      if (pathname === '/api/metrics/quality-streak') {
        metricsReads += 1;
        const count = tasks.filter(task => task.status === 'DEVUELTA').length;
        return route.fulfill({ json: { currentStreak: 0, maxStreak: 6, currentStreakDays: 0, currentReturnedTasksCount: count } });
      }
      if (pathname === '/api/db/clients') return route.fulfill({ json: [{ id: 'streak-preview-client', name: 'Cliente de ejemplo' }] });
      if (pathname === '/api/team') return route.fulfill({ json: [] });
      if (pathname === '/api/tasks' && request.method() === 'GET') return route.fulfill({ json: tasks });
      if (pathname === '/api/tasks' || pathname === '/api/tasks/returned-task') {
        writes.push({ method: request.method(), body: request.postDataJSON() });
        writeReceived();
        await pendingWrite;
        if (scenario.fail) {
          await route.fulfill({ status: 500, json: { error: 'Fallo de persistencia simulado' } });
        } else {
          if (request.method() === 'DELETE') tasks = [];
          else if (request.method() === 'POST') tasks.push({ id: 'created-task', ...request.postDataJSON() });
          else tasks = tasks.map(task => ({ ...task, ...request.postDataJSON() }));
          await route.fulfill({ status: request.method() === 'POST' ? 201 : 200, json: tasks.at(-1) || { success: true } });
        }
        fulfilled.push(true);
        return;
      }
      return route.fulfill({ status: 404, json: { error: 'Ruta bloqueada en la muestra local' } });
    });
    try {
      await page.goto(`${preview.origin}/tests/fixtures/quality-streak-preview.html${scenario.dark ? '?dark' : ''}`);
      const meter = page.locator('aside[aria-label="Racha de calidad"]');
      await meter.getByText('1 tarea devuelta', { exact: true }).waitFor();
      const card = page.getByText('Ajustar pieza devuelta', { exact: true }).locator('..').locator('..');
      await card.waitFor();
      if (scenario.action === 'delete') {
        await card.hover();
        await card.getByRole('button').click();
        await page.getByPlaceholder('Ej: Es un duplicado, el cliente canceló...').fill('El cliente canceló la pieza.');
        await page.getByRole('dialog').getByRole('button', { name: 'Eliminar tarea', exact: false }).click();
      } else if (scenario.action === 'toggle') {
        await card.locator(':scope > div').first().click();
      } else if (scenario.action === 'edit') {
        await page.getByText('Ajustar pieza devuelta', { exact: true }).click();
        await page.getByRole('dialog').getByRole('button', { name: 'Guardar y reintegrar tarea', exact: true }).click();
      } else {
        await page.getByRole('button', { name: 'Nueva tarea', exact: true }).click();
        await page.getByPlaceholder('Ej: Revisión de artes').fill('Nueva pieza de ejemplo');
        await page.getByRole('dialog').getByRole('button', { name: 'Crear tarea', exact: true }).click();
      }
      await received;
      assert.equal(writes.length, 1);
      assert.equal(metricsReads, 1, 'A pending write must not invalidate the confirmed quality metric');
      assert.equal(await meter.getByText('1 tarea devuelta', { exact: true }).count(), 1);
      releaseWrite();
      if (scenario.fail) {
        await page.getByRole('button', { name: 'Eliminar tarea', exact: false }).waitFor({ state: 'visible' });
        await page.waitForFunction(() => !document.querySelector('[role="dialog"] button:disabled'));
        assert.equal(fulfilled.length, 1);
        assert.equal(metricsReads, 1, 'A failed write must not report a changed quality metric');
        assert.equal(await meter.getByText('1 tarea devuelta', { exact: true }).count(), 1);
      } else {
        const deadline = Date.now() + 4000;
        while (metricsReads < 2 && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 25));
        assert.equal(metricsReads, 2, 'The confirmed write must refresh the quality metric before the 60-second poll');
        if (scenario.action !== 'create') await meter.getByText('0 días de racha', { exact: true }).waitFor();
        if (scenario.action === 'delete') await page.getByText('No hay tareas pendientes.', { exact: true }).waitFor();
        if (scenario.screenshot) {
          await page.getByRole('dialog').waitFor({ state: 'hidden' });
          await page.screenshot({ path: `output/quality-streak/${scenario.screenshot}.png`, fullPage: true });
        }
      }
      assert.deepEqual(errors, []);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    } finally { releaseWrite(); await page.close(); }
  });
}
