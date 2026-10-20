// Ajustes de cartera en Financiero y el caso de Foobspain (Rodny, 20 de octubre de 2026): el
// resumen de lo saldado sin dinero, y un pago en dólares que llega con la tasa del día y no cabía
// en la cartera. Muestra local de Financiero en 3006: npx vite --host 127.0.0.1 --port 3006
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import { chooseOption } from './selectHelpers.mjs';
const base = process.env.FINANCIAL_DEMO_URL || 'http://127.0.0.1:3006/tests/fixtures/financial-integrity.html';
const outDir = new URL('../../output/receivable-adjustments/', import.meta.url);
const shot = name => fileURLToPath(new URL(name, outDir));
await mkdir(outDir, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1050 } });
  page.setDefaultTimeout(10000);
  const errors = []; page.on('pageerror', error => errors.push(error.message));

  // 1. El resumen de ajustes: vacío al abrir, y con el acuerdo en cuanto se registra.
  await page.goto(base, { timeout: 90000, waitUntil: 'domcontentloaded' });
  await page.getByRole('navigation', { name: 'Paginación de movimientos' }).waitFor();
  await page.getByRole('button', { name: 'Cartera', exact: true }).click();
  await page.locator('[data-receivable-adjustments-empty]').waitFor();
  const row = page.getByRole('button', { name: /Cliente de muestra/ });
  await row.click();
  await page.getByRole('button', { name: 'Saldar de otra forma', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Valor que se da por saldado').fill('300000');
  await dialog.getByLabel('Autorizado por').fill('Francisco Villa');
  await dialog.getByLabel('Motivo').fill('Acuerdo por cierre del negocio.');
  await dialog.getByRole('button', { name: 'Saldar la deuda' }).click();
  await page.locator('[data-adjustment-kind="ACUERDO"]').waitFor();
  assert.match(await page.locator('[data-adjustment-kind="ACUERDO"]').innerText(), /300[.,]000[\s\S]*1 cuenta/);
  await page.getByRole('button', { name: /Ver detalle \(1\)/ }).click();
  assert.match(await page.locator('[data-adjustment-item]').innerText(), /Cliente de muestra[\s\S]*Acuerdo por menor valor[\s\S]*Autorizó Francisco Villa[\s\S]*1\.200\.000[\s\S]*Acuerdo por cierre del negocio/);
  await page.screenshot({ path: shot('resumen-ajustes.png'), animations: 'disabled' });

  // 2. Foobspain: USD 300 a TRM 4.000 son 1.200.000 en cartera; entraron 1.250.000 con la tasa del día.
  await page.goto(`${base}?usd`, { timeout: 90000, waitUntil: 'domcontentloaded' });
  await page.getByRole('navigation', { name: 'Paginación de movimientos' }).waitFor();
  await page.getByRole('button', { name: 'Cartera', exact: true }).click();
  await page.getByRole('button', { name: /Foobspain/ }).click();
  await page.getByRole('button', { name: 'Registrar pago', exact: true }).click();
  const payment = page.getByRole('dialog');
  assert.match(await payment.innerText(), /la cartera se ajusta sola a lo que entró/);
  await chooseOption(payment.getByLabel('Concepto del ingreso'), 'MEMBRESIA');
  const amount = payment.getByLabel('Valor en pesos');
  await amount.fill('1250000');
  assert.equal(await amount.evaluate(element => element.validity.rangeOverflow), false, 'en dólares el campo no tiene tope');
  await chooseOption(payment.getByLabel('Cuenta'), 'demo-account');
  await page.screenshot({ path: shot('pago-usd-con-tasa.png'), animations: 'disabled' });
  await payment.getByRole('button', { name: 'Guardar pago' }).click();
  await page.getByText(/se ajustó de \$ 1\.200\.000 a \$ 1\.250\.000 por la tasa del día/).waitFor();
  assert.equal((await page.evaluate(() => window.__receivablePaymentBody)).amount, 1250000);
  await page.locator('[data-receivable-exchange-adjustment]').waitFor();
  assert.match(await page.locator('[data-receivable-exchange-adjustment]').innerText(), /1\.200\.000[\s\S]*1\.250\.000/);
  assert.match(await page.locator('[data-adjustment-exchange]').innerText(), /\+\$\s50\.000/);
  assert.equal(await page.getByRole('button', { name: 'Registrar pago', exact: true }).count(), 0, 'la cuenta quedó pagada');
  await page.screenshot({ path: shot('foobspain-ajustada.png'), animations: 'disabled', fullPage: true });

  // 3. Entró menos y la cuenta queda al día: la casilla lo dice, en oscuro.
  await page.goto(`${base}?usd`, { timeout: 90000, waitUntil: 'domcontentloaded' });
  await page.getByRole('navigation', { name: 'Paginación de movimientos' }).waitFor();
  await page.evaluate(() => document.documentElement.classList.add('dark'));
  await page.getByRole('button', { name: 'Cartera', exact: true }).click();
  await page.getByRole('button', { name: /Foobspain/ }).click();
  await page.getByRole('button', { name: 'Registrar pago', exact: true }).click();
  const less = page.getByRole('dialog');
  await chooseOption(less.getByLabel('Concepto del ingreso'), 'MEMBRESIA');
  await less.getByLabel('Valor en pesos').fill('1150000');
  const box = less.getByRole('checkbox');
  assert.match(await less.innerText(), /queda al día[\s\S]*50\.000[\s\S]*tasa del día/);
  await box.check();
  await chooseOption(less.getByRole('combobox', { name: 'Cuenta' }), 'demo-account');
  await page.screenshot({ path: shot('pago-usd-queda-al-dia-dark.png'), animations: 'disabled' });
  await less.getByRole('button', { name: 'Guardar pago' }).click();
  await page.getByText(/se ajustó de \$ 1\.200\.000 a \$ 1\.150\.000/).waitFor();
  assert.equal((await page.evaluate(() => window.__receivablePaymentBody)).settlesInFull, true);

  assert.deepEqual(errors, []);
  console.log('OK', fileURLToPath(outDir));
} finally { await browser.close(); }
