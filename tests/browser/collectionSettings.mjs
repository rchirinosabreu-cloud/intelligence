import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright-core';

// Los plazos de los avisos de cartera (Rodny, 28 de octubre de 2026: «dejar las fechas flexibles»), en la muestra local de
// Financiero (npx vite --host 127.0.0.1 --port 3006). Solo un administrador ve el botón; la regla dice el motivo.
const base = process.env.FINANCIAL_DEMO_URL || 'http://127.0.0.1:3006/tests/fixtures/financial-integrity.html';
const OUT = 'output/avisos-de-cartera';
let browser;
test.before(async () => {
  browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
  await mkdir(OUT, { recursive: true });
});
test.after(async () => { await browser?.close(); });

const openReceivables = async (query = '', options = {}) => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, ...options });
  page.setDefaultTimeout(15000);
  await page.goto(`${base}${query}`, { timeout: 90000, waitUntil: 'domcontentloaded' });
  await page.getByRole('tab', { name: 'Cuentas por cobrar' }).click();
  return page;
};

test('un administrador cambia los plazos; un valor que no sirve se explica', async () => {
  const page = await openReceivables();
  await page.locator('[data-collection-settings-open]').click();
  const dialog = page.locator('[data-collection-settings]');
  await dialog.waitFor();
  assert.equal(await dialog.locator('[data-collection-setting="paymentTermDays"]').inputValue(), '15');
  assert.equal(await dialog.locator('[data-collection-setting="monthlyAlertCount"]').inputValue(), '2');
  await page.waitForTimeout(300);
  await dialog.screenshot({ path: `${OUT}/6-plazos-claro.png` });

  await dialog.locator('[data-collection-setting="repeatDays"]').fill('0');
  await dialog.getByRole('button', { name: 'Guardar' }).click();
  assert.match(await dialog.getByRole('alert').innerText(), /Cada cuántos días/);

  await dialog.locator('[data-collection-setting="repeatDays"]').fill('5');
  await dialog.locator('[data-collection-setting="paymentTermDays"]').fill('10');
  await dialog.getByRole('button', { name: 'Guardar' }).click();
  await page.getByText('Plazos de los avisos de cartera guardados').waitFor();
  assert.deepEqual(await page.evaluate(() => window.__collectionSettings), { enabled: false, paymentTermDays: 10, monthlyAlertCount: 2, oneOffFirstAlertDays: 15, repeatDays: 5 });

  // Nacen apagados; encenderlos se guarda igual.
  await page.locator('[data-collection-settings-open]').click();
  await dialog.locator('[data-collection-setting="enabled"]').check();
  await dialog.getByRole('button', { name: 'Guardar' }).click();
  await page.getByText('Plazos de los avisos de cartera guardados').last().waitFor();
  assert.equal(await page.evaluate(() => window.__collectionSettings.enabled), true);
  await page.close();
});

test('en oscuro se lee, y quien no administra no ve el botón', async () => {
  const dark = await openReceivables();
  await dark.evaluate(() => document.documentElement.classList.add('dark'));
  await dark.locator('[data-collection-settings-open]').click();
  await dark.locator('[data-collection-settings]').waitFor();
  await dark.waitForTimeout(300);
  await dark.locator('[data-collection-settings]').screenshot({ path: `${OUT}/7-plazos-oscuro.png` });
  await dark.close();

  const viewer = await openReceivables('?viewer=reader');
  await viewer.getByText('Lo que les deben a Brain Studio').waitFor();
  assert.equal(await viewer.locator('[data-collection-settings-open]').count(), 0);
  await viewer.close();
});
