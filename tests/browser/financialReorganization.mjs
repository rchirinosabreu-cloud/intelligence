// Financiero en cuatro pestañas (Elisa, 23 de octubre de 2026): Movimientos, Cuentas por cobrar con su
// antigüedad, Cuentas por pagar con la nómina adentro, y Análisis. Recorrido real sobre la muestra local
// en 3006, con capturas en claro, oscuro y celular.
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
const base = process.env.FINANCIAL_DEMO_URL || 'http://127.0.0.1:3006/tests/fixtures/financial-integrity.html';
const outDir = new URL('../../output/financial-reorganization/', import.meta.url);
const shot = (name) => fileURLToPath(new URL(name, outDir));
await mkdir(outDir, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
  page.setDefaultTimeout(10000);
  const errors = []; page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(base, { timeout: 90000, waitUntil: 'domcontentloaded' });
  await page.getByRole('navigation', { name: 'Paginación de movimientos' }).waitFor();

  const tabs = await page.getByRole('tablist', { name: 'Secciones de Financiero' }).getByRole('tab').allInnerTexts();
  assert.deepEqual(tabs.map((tab) => tab.trim()), ['Movimientos', 'Cuentas por cobrar', 'Cuentas por pagar', 'Análisis']);
  assert.equal(await page.getByRole('group', { name: 'Vistas de la sección' }).count(), 0, 'Movimientos no tiene vistas que elegir');

  // Cuentas por cobrar: resumen por clase y por antigüedad.
  await page.getByRole('tab', { name: 'Cuentas por cobrar' }).click();
  await page.locator('[data-receivable-summary]').waitFor();
  const receivables = page.locator('[data-receivable-summary]');
  assert.match(await receivables.locator('[data-debt-aging-total]').innerText(), /800[.,]000/);
  assert.equal((await receivables.locator('[data-debt-aging-parties]').innerText()).match(/\n(\d+)\n/)[1], '1');
  for (const key of ['DE_0_A_30', 'DE_31_A_60', 'MAS_DE_60']) await receivables.locator(`[data-debt-aging-bucket="${key}"]`).waitFor();
  await page.getByRole('group', { name: 'Clase de cuenta por cobrar' }).getByRole('button', { name: 'Préstamos a terceros' }).click();
  assert.match(await receivables.locator('[data-debt-aging-total]').innerText(), /\$\s*0/);
  await page.getByRole('group', { name: 'Clase de cuenta por cobrar' }).getByRole('button', { name: 'Todas' }).click();
  await page.locator('[data-receivable-section="CLIENTE"]').waitFor();
  await page.screenshot({ path: shot('cuentas-por-cobrar.png'), animations: 'disabled', fullPage: true });

  // Tocar un tramo filtra la lista; tocarlo otra vez la suelta.
  const bucket = receivables.locator('[data-debt-aging-bucket="DE_31_A_60"]');
  await bucket.click();
  assert.equal(await bucket.getAttribute('aria-pressed'), 'true');
  await page.screenshot({ path: shot('filtro-31-a-60.png'), animations: 'disabled', fullPage: true });
  await bucket.click();
  assert.equal(await bucket.getAttribute('aria-pressed'), 'false');
  await page.locator('[data-receivable-section="CLIENTE"]').waitFor();

  // El directorio de clientes es una vista de la misma pestaña.
  await page.getByRole('button', { name: 'Directorio de clientes' }).click();
  await page.getByText('Solo en el Excel · sin ficha').first().waitFor();

  // Cuentas por pagar: proveedores primero, nómina al lado.
  await page.getByRole('tab', { name: 'Cuentas por pagar' }).click();
  await page.locator('[data-payables-tab]').waitFor();
  await page.getByRole('heading', { name: 'Proveedores y gastos' }).waitFor();
  const payablesSummary = page.locator('[data-payables-summary]');
  await payablesSummary.locator('[data-debt-aging-bucket="MAS_DE_60"]').waitFor();
  assert.match(await payablesSummary.locator('[data-debt-aging-total]').innerText(), /1[.,]500[.,]000/);
  await page.screenshot({ path: shot('cuentas-por-pagar.png'), animations: 'disabled' });
  await page.getByRole('button', { name: 'Nómina', exact: true }).click();
  await page.getByRole('heading', { name: 'Nómina', exact: true }).waitFor();
  await page.screenshot({ path: shot('cuentas-por-pagar-nomina.png'), animations: 'disabled' });

  // Análisis: el flujo de caja; Rentabilidad solo para administración.
  await page.getByRole('tab', { name: 'Análisis' }).click();
  await page.getByText('Flujo de Caja Histórico').waitFor();

  // En oscuro, Cuentas por cobrar.
  await page.getByRole('tab', { name: 'Cuentas por cobrar' }).click();
  await page.getByRole('button', { name: 'Cuentas y préstamos' }).click();
  await page.evaluate(() => document.documentElement.classList.add('dark'));
  await page.locator('[data-receivable-summary]').waitFor();
  await page.screenshot({ path: shot('cuentas-por-cobrar-oscuro.png'), animations: 'disabled', fullPage: true });
  await page.evaluate(() => document.documentElement.classList.remove('dark'));

  // En el celular las pestañas se desplazan y la página no.
  await page.setViewportSize({ width: 390, height: 900 });
  await page.locator('[data-receivable-summary]').waitFor();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  assert.ok(overflow <= 1, `la página no se desplaza de lado (${overflow}px)`);
  await page.screenshot({ path: shot('cuentas-por-cobrar-celular.png'), animations: 'disabled', fullPage: true });

  assert.deepEqual(errors, []);
  console.log('OK', fileURLToPath(outDir));
} finally { await browser.close(); }
