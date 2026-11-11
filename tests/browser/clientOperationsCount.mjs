import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright-core';

// Rodny, 10 de noviembre de 2026: «ponme números, quiero saber cuántos clientes tenemos activos y
// enumerarlos». Sobre la muestra de Operación (node scripts/preview-client-operations.js --port=3700).
const BASE = process.env.CLIENT_OPERATIONS_URL || 'http://127.0.0.1:3700';
const OUT = 'output/operacion-conteo';
let browser;
test.before(async () => {
  browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
  await mkdir(OUT, { recursive: true });
});
test.after(async () => { await browser?.close(); });

for (const [name, viewport] of [['escritorio', { width: 1440, height: 1000 }], ['celular', { width: 390, height: 844 }]]) {
  for (const theme of ['light', 'dark']) {
    test(`Operación dice cuántos clientes hay y los numera (${name}, ${theme})`, async () => {
      const page = await browser.newPage({ viewport, colorScheme: theme });
      page.setDefaultTimeout(15000);
      const errors = [];
      page.on('pageerror', (error) => errors.push(error.message));
      await page.goto(`${BASE}/clientes`, { timeout: 90000, waitUntil: 'domcontentloaded' });
      const count = page.locator('[data-operation-count]');
      await count.waitFor({ timeout: 60000 });
      await page.evaluate((dark) => document.documentElement.classList.toggle('dark', dark), theme === 'dark');
      const rows = page.locator('[aria-label="Clientes"] li');
      const total = await rows.count();
      assert.ok(total > 0);
      assert.match(await count.innerText(), new RegExp(`${total} clientes? en operación`));
      // El avance se lee en porcentaje, del mes vigente y del siguiente (reunión del 10 de noviembre de 2026).
      const percents = await page.locator('[data-cycle-percent]').allInnerTexts();
      assert.ok(percents.length > 0);
      for (const text of percents) assert.match(text, /^\d+ %$/);
      assert.ok(await page.locator('[data-cycle-progress="next"]').count() > 0, 'cada cliente medido muestra también el mes siguiente');
      const positions = await page.locator('[data-client-position]').allInnerTexts();
      assert.deepEqual(positions, Array.from({ length: total }, (_, i) => String(i + 1)));

      await page.getByRole('group', { name: 'Filtrar por estado' }).getByRole('button', { name: /En riesgo/ }).click();
      assert.match(await count.innerText(), /Con estos filtros: \d+/);
      assert.equal((await page.locator('[data-client-position]').allInnerTexts())[0], '1', 'la numeración sigue la lista visible');
      await page.getByRole('group', { name: 'Filtrar por estado' }).getByRole('button', { name: /En riesgo/ }).click();
      await page.waitForTimeout(200);
      await page.screenshot({ path: `${OUT}/${name}-${theme}.png` });
      assert.deepEqual(errors, []);
      await page.close();
    });
  }
}
