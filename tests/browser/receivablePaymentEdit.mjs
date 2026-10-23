// Corregir un abono sin revertirlo (Rodny, 20 de octubre de 2026). El caso de Foobspain tal como
// quedó en producción: cartera 1.205.856, abono registrado por 1.136.000, saldo fantasma de
// 69.856. Muestra local de Financiero en 3006: npx vite --host 127.0.0.1 --port 3006
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
const base = process.env.FINANCIAL_DEMO_URL || 'http://127.0.0.1:3006/tests/fixtures/financial-integrity.html';
const outDir = new URL('../../output/receivable-payment-edit/', import.meta.url);
const shot = name => fileURLToPath(new URL(name, outDir));
await mkdir(outDir, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1050 } });
  page.setDefaultTimeout(10000);
  const errors = []; page.on('pageerror', error => errors.push(error.message));

  // La deuda de muestra: 1.200.000, abono de 400.000, saldo 800.000. Se corrige el abono a 450.000.
  await page.goto(base, { timeout: 90000, waitUntil: 'domcontentloaded' });
  await page.getByRole('navigation', { name: 'Paginación de movimientos' }).waitFor();
  await page.getByRole('tab', { name: 'Cuentas por cobrar' }).click();
  await page.getByRole('button', { name: /Cliente de muestra/ }).click();
  await page.locator('[data-receivable-payment-edit]').first().click();
  const dialog = page.getByRole('dialog');
  assert.match(await dialog.innerText(), /Corregir abono[\s\S]*cambia con él/);
  // Sin tocar el dinero no hay motivo que pedir.
  assert.equal(await dialog.getByLabel('Motivo de la corrección').count(), 0);
  await dialog.getByLabel('Valor').fill('450000');
  await dialog.getByLabel('Motivo de la corrección').waitFor();
  await dialog.getByLabel('Motivo de la corrección').fill('El comprobante dice 450.000, no 400.000.');
  await page.screenshot({ path: shot('dialog-corregir.png'), animations: 'disabled' });
  await dialog.getByRole('button', { name: 'Guardar corrección' }).click();
  await page.getByText(/Abono corregido\. Su ingreso en Movimientos cambió con él/).waitFor();
  const body = await page.evaluate(() => window.__paymentEditBody);
  assert.equal(body.amount, 450000);
  assert.match(body.reason, /450\.000/);
  assert.equal(body.paidAt, undefined, 'lo que no cambió no viaja');
  const card = page.getByRole('button', { name: /Cliente de muestra/ });
  assert.match(await card.innerText(), /750[.,]000/, 'el saldo baja a 750.000');
  await page.screenshot({ path: shot('abono-corregido.png'), animations: 'disabled', fullPage: true });

  // Foobspain tal como quedó: el abono se corrige al valor real y la cuenta queda pagada, en oscuro.
  await page.goto(`${base}?usd&foobspain`, { timeout: 90000, waitUntil: 'domcontentloaded' });
  await page.getByRole('navigation', { name: 'Paginación de movimientos' }).waitFor();
  await page.evaluate(() => document.documentElement.classList.add('dark'));
  await page.getByRole('tab', { name: 'Cuentas por cobrar' }).click();
  const foob = page.getByRole('button', { name: /Foobspain/ });
  assert.match(await foob.innerText(), /69[.,]856/);
  await foob.click();
  await page.locator('[data-receivable-payment-edit]').first().click();
  const edit = page.getByRole('dialog');
  await edit.getByLabel('Valor en pesos').fill('1205856');
  await edit.getByLabel('Motivo de la corrección').fill('Se registró por el máximo permitido; el depósito real fue 1.205.856.');
  await page.screenshot({ path: shot('foobspain-corregir-dark.png'), animations: 'disabled' });
  await edit.getByRole('button', { name: 'Guardar corrección' }).click();
  await page.getByText(/Abono corregido/).waitFor();
  assert.match(await page.getByRole('button', { name: /Foobspain/ }).innerText(), /\$\s0[\s\S]*Sin saldo pendiente/);
  assert.equal(await page.getByRole('button', { name: 'Registrar pago', exact: true }).count(), 0, 'quedó pagada');
  await page.screenshot({ path: shot('foobspain-pagada-dark.png'), animations: 'disabled', fullPage: true });

  assert.deepEqual(errors, []);
  console.log('OK', fileURLToPath(outDir));
} finally { await browser.close(); }
