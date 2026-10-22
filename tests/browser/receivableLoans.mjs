// Préstamos en Cartera (Rodny, 20 de octubre de 2026): «cuando registro un préstamo … que me
// aparezca en cartera. Y que cuando lo paguen, se reintegre». Recorrido real sobre la muestra
// local de Financiero en 3006: npx vite --host 127.0.0.1 --port 3006
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import { chooseOption } from './selectHelpers.mjs';
const base = process.env.FINANCIAL_DEMO_URL || 'http://127.0.0.1:3006/tests/fixtures/financial-integrity.html';
const outDir = new URL('../../output/receivable-loans/', import.meta.url);
const shot = name => fileURLToPath(new URL(name, outDir));
await mkdir(outDir, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1050 } });
  page.setDefaultTimeout(10000);
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto(base, { timeout: 90000, waitUntil: 'domcontentloaded' });
  await page.getByRole('navigation', { name: 'Paginación de movimientos' }).waitFor();
  await page.getByRole('button', { name: 'Cartera', exact: true }).click();
  await page.getByRole('button', { name: /Cliente de muestra/ }).waitFor();

  // Un préstamo a una colaboradora: el egreso se registra ahora.
  await page.getByRole('button', { name: 'Registrar préstamo', exact: true }).click();
  const dialog = page.getByRole('dialog');
  assert.match(await dialog.innerText(), /reintegro, no como venta/);
  await dialog.getByLabel('Nombre').fill('Melissa Ruiz');
  await dialog.getByLabel('Valor prestado').fill('500000');
  await chooseOption(dialog.getByLabel('Cuenta de la que salió'), 'demo-account');
  await dialog.getByLabel(/Notas/).fill('Se descuenta en dos quincenas.');
  await page.screenshot({ path: shot('dialog-prestamo.png'), animations: 'disabled' });
  await dialog.getByRole('button', { name: 'Registrar préstamo' }).click();
  await page.getByText(/Préstamo registrado: el egreso quedó en Movimientos/).waitFor();
  const body = await page.evaluate(() => window.__loanBody);
  assert.equal(body.counterpartyType, 'COLABORADOR');
  assert.equal(body.counterpartyName, 'Melissa Ruiz');
  assert.equal(body.amount, 500000);
  assert.equal(body.accountId, 'demo-account');
  assert.equal(body.financialRecordId, '');

  // Aparece en Cartera junto a lo de los clientes, rotulado como préstamo y sin cuenta de cobro.
  const row = page.getByRole('button', { name: /Melissa Ruiz/ });
  await row.waitFor();
  assert.match(await row.innerText(), /Préstamo · Colaborador/);
  await row.click();
  await page.locator('[data-receivable-loan]').waitFor();
  const card = page.locator('[data-receivable-loan]').locator('xpath=ancestor::div[contains(@class,"rounded-xl")][1]');
  assert.equal(await card.getByRole('button', { name: 'Emitir cuenta de cobro' }).count(), 0, 'un préstamo no emite cuenta de cobro');
  await page.screenshot({ path: shot('prestamo-en-cartera.png'), animations: 'disabled', fullPage: true });

  // La devolución: «Registrar reintegro», sin concepto, y el tablero lo dice aparte de las ventas.
  await card.getByRole('button', { name: 'Registrar pago', exact: true }).click();
  const payment = page.getByRole('dialog');
  assert.match(await payment.innerText(), /Registrar reintegro[\s\S]*no como venta/);
  assert.equal(await payment.getByLabel('Concepto del ingreso').count(), 0, 'un reintegro no pide concepto');
  await payment.getByLabel(/^Valor/).fill('200000');
  await chooseOption(payment.getByLabel('Cuenta'), 'demo-account');
  await page.screenshot({ path: shot('dialog-reintegro.png'), animations: 'disabled' });
  await payment.getByRole('button', { name: 'Guardar reintegro' }).click();
  await page.getByText(/Reintegro registrado\. No cuenta como venta/).waitFor();
  const paid = await page.evaluate(() => window.__loanPaymentBody);
  assert.equal(paid.amount, 200000);
  assert.ok(!paid.category, 'la pantalla no manda concepto: el servidor lo pone');
  await page.locator('[data-loan-repayments]').waitFor();
  assert.match(await page.locator('[data-loan-repayments]').innerText(), /200[.,]000[\s\S]*reintegros de préstamos, que no son ventas/);
  await page.screenshot({ path: shot('reintegro-registrado.png'), animations: 'disabled' });

  // «El egreso ya está en Movimientos»: se liga sin crear otro, en oscuro.
  await page.evaluate(() => document.documentElement.classList.add('dark'));
  await page.getByRole('button', { name: 'Registrar préstamo', exact: true }).click();
  const linked = page.getByRole('dialog');
  await chooseOption(linked.getByLabel('A quién se le presta'), 'SOCIO');
  await linked.getByLabel('Nombre').fill('Francisco Villa');
  await chooseOption(linked.getByRole('combobox', { name: 'El dinero' }), 'EXISTING');
  await chooseOption(linked.getByLabel('Egreso de préstamo registrado'), 'demo-record-3');
  assert.match(await linked.getByLabel('Valor prestado').inputValue(), /300[.,]000/);
  await page.screenshot({ path: shot('dialog-egreso-existente-dark.png'), animations: 'disabled' });
  await linked.getByRole('button', { name: 'Registrar préstamo' }).click();
  await page.getByText(/ligado al egreso que ya existía/).waitFor();
  const linkedBody = await page.evaluate(() => window.__loanBody);
  assert.equal(linkedBody.financialRecordId, 'demo-record-3');
  assert.equal(linkedBody.accountId, '');
  await page.getByRole('button', { name: /Francisco Villa/ }).waitFor();

  assert.deepEqual(errors, []);
  console.log('OK', fileURLToPath(outDir));
} finally { await browser.close(); }
