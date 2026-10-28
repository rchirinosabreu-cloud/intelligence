import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright-core';

// Cuentas por cobrar en la muestra local de Financiero (npx vite --host 127.0.0.1 --port 3006): las gestiones de cobro
// de cada cliente (28 de octubre de 2026: «debe haber un registro») y los plazos de los avisos de cartera, que solo ve un
// administrador. Pantallas enteras, numeradas a continuación de las de la banda, en output/recorrido-cartera.
const base = process.env.FINANCIAL_DEMO_URL || 'http://127.0.0.1:3006/tests/fixtures/financial-integrity.html';
const OUT = 'output/recorrido-cartera';
let browser;
test.before(async () => {
  browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
  await mkdir(OUT, { recursive: true });
});
test.after(async () => { await browser?.close(); });

const openReceivables = async (query = '') => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  page.setDefaultTimeout(15000);
  await page.goto(`${base}${query}`, { timeout: 90000, waitUntil: 'domcontentloaded' });
  await page.getByRole('tab', { name: 'Cuentas por cobrar' }).click();
  await page.getByText('Lo que les deben a Brain Studio').waitFor();
  return page;
};
const shot = (page, name) => page.screenshot({ path: `${OUT}/${name}.png`, fullPage: true });

test('«Registrar pago» lleva aquí: el cliente muestra sus gestiones de cobro y se registra otra a mano', async () => {
  const page = await openReceivables();
  await page.waitForTimeout(400);
  await shot(page, '09-cuentas-por-cobrar');

  await page.getByRole('button', { name: /Cliente de muestra/ }).first().click();
  const panel = page.locator('[data-collection-activities]').first();
  await panel.waitFor();
  assert.match(await panel.innerText(), /WhatsApp · 27 oct 2026 · Elisa Mestra · desde el aviso/);
  await shot(page, '10-cliente-con-sus-gestiones');

  await panel.locator('[data-collection-activity-add]').click();
  await shot(page, '11-registrar-gestion');
  await panel.locator('[data-collection-channel="LLAMADA"]').click();
  await page.getByText('Gestión de cobro registrada').waitFor();
  await panel.locator('[data-collection-activity="LLAMADA"]').waitFor();
  await shot(page, '12-gestion-a-mano-registrada');
  await page.close();
});

test('un administrador cambia los plazos y los enciende; un valor que no sirve se explica', async () => {
  const page = await openReceivables();
  await page.locator('[data-collection-settings-open]').click();
  const dialog = page.locator('[data-collection-settings]');
  await dialog.waitFor();
  assert.equal(await dialog.locator('[data-collection-setting="paymentTermDays"]').inputValue(), '15');
  await page.waitForTimeout(300);
  await shot(page, '13-avisos-de-cartera');

  await dialog.locator('[data-collection-setting="repeatDays"]').fill('0');
  await dialog.getByRole('button', { name: 'Guardar' }).click();
  assert.match(await dialog.getByRole('alert').innerText(), /Cada cuántos días/);
  await dialog.locator('[data-collection-setting="repeatDays"]').fill('7');
  await dialog.locator('[data-collection-setting="enabled"]').check();
  await dialog.getByRole('button', { name: 'Guardar' }).click();
  await page.getByText('Plazos de los avisos de cartera guardados').waitFor();
  assert.deepEqual(await page.evaluate(() => window.__collectionSettings), { enabled: true, paymentTermDays: 15, monthlyAlertCount: 2, oneOffFirstAlertDays: 15, repeatDays: 7 });

  await page.evaluate(() => document.documentElement.classList.add('dark'));
  await page.locator('[data-collection-settings-open]').click();
  await dialog.waitFor();
  await page.waitForTimeout(300);
  await shot(page, '14-avisos-de-cartera-oscuro');
  await page.close();

  const viewer = await openReceivables('?viewer=reader');
  assert.equal(await viewer.locator('[data-collection-settings-open]').count(), 0, 'quien no administra no ve el botón');
  await viewer.close();
});
