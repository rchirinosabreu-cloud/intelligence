import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, mkdir } from 'node:fs/promises';
import { chromium } from 'playwright-core';

// App completa y datos ficticios del entorno aislado. Solo login y consultas; no entrega archivos.
test('llegar desde Gestión permite elegir otro período inmediatamente después del enfoque de la pieza', async () => {
  const access = JSON.parse(await readFile('output/task-piece-local/preview-access.json', 'utf8'));
  assert.equal(access.apiOrigin, 'http://127.0.0.1:8092');
  const origin = 'http://127.0.0.1:3183';
  const health = await fetch(`${origin}/api/health`).then(response => response.json());
  assert.equal(health.isolatedTaskPieceTest, true);
  await mkdir('output/task-piece-local/period-regression', { recursive: true });
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  page.setDefaultTimeout(12000);
  const piece = access.pieces.current.approved;
  try {
    await page.goto(`${origin}/gestion?taskId=${piece.taskId}`);
    await page.locator('input[type="email"]').fill(access.users.ana.email);
    await page.locator('input[type="password"]').fill(access.users.ana.password);
    await page.getByRole('button', { name: 'Acceder', exact: true }).click();
    await page.getByRole('button', { name: 'Entendido', exact: true }).click();
    await page.getByRole('button', { name: 'Abrir Parrilla', exact: true }).click();
    await page.locator(`#item-${piece.id}`).waitFor();
    await page.getByRole('combobox', { name: 'Período de la parrilla', exact: true }).click();
    const option = page.getByRole('option', { name: 'Octubre 2026', exact: true });
    await option.waitFor();
    const bounds = await option.boundingBox();
    const state = await page.evaluate(() => ({ y: scrollY, height: innerHeight,
      trigger: document.querySelector('#plan-period')?.getBoundingClientRect().toJSON(),
      menu: document.querySelector('[data-brain-select-menu]')?.getBoundingClientRect().toJSON() }));
    assert.ok(bounds && bounds.y >= 0 && bounds.y + bounds.height <= 1000, `la opción debe quedar dentro del viewport: ${JSON.stringify({ bounds, state })}`);
    await page.screenshot({ path: 'output/task-piece-local/period-regression/selector-abierto.png', fullPage: false, animations: 'disabled' });
    await option.click();
    await page.getByRole('heading', { name: 'octubre 2026', exact: true }).waitFor();
    await page.locator('[data-back-to-origin] button').click();
    await page.getByRole('button', { name: 'Ver pieza', exact: true }).waitFor();
    assert.equal(new URL(page.url()).pathname, '/gestion');
  } catch (error) {
    await page.screenshot({ path: 'output/task-piece-local/period-regression/error.png', fullPage: false, animations: 'disabled' });
    throw error;
  } finally { await browser.close(); }
});
