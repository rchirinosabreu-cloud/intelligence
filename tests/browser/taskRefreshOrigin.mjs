import test from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
import { createRecognitionPreview } from '../../scripts/preview-recognitions.js';

test('Gestion identifies initial/polling refreshes separately from the explicit refresh button', async () => {
  const preview = await createRecognitionPreview({ port: 0 });
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    const sources = [];
    await page.route('**/api/tasks*', async route => {
      const url = new URL(route.request().url());
      if (url.pathname === '/api/tasks') sources.push(url.searchParams.get('syncSource'));
      await route.continue();
    });
    await page.clock.install();
    await page.goto(`${preview.origin}/gestion`, { timeout: 60000 });
    await page.getByRole('heading', { name: 'Gestión de Tareas' }).waitFor({ timeout: 45000 });
    await page.getByRole('button', { name: 'Actualizar tareas', exact: true }).click();
    await page.getByRole('button', { name: 'Tareas actualizadas', exact: true }).waitFor();
    assert.equal(sources[0], 'AUTOMATIC');
    assert.equal(sources.at(-1), 'MANUAL');
    await Promise.all([
      page.waitForResponse(response => new URL(response.url()).pathname === '/api/tasks'),
      page.clock.runFor(31000),
    ]);
    assert.equal(sources.at(-1), 'AUTOMATIC');
  } finally { await browser.close(); await preview.close(); }
});
