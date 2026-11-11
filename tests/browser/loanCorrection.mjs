// Corregir un préstamo sin eliminarlo (Elisa, noviembre de 2026: «todo lo que haga un movimiento
// se tiene que poder modificar»). Recorrido real sobre la muestra local de Financiero:
// npx vite --host 127.0.0.1 --port 3006 (o FINANCIAL_DEMO_URL).
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import { chooseOption } from './selectHelpers.mjs';
const base = process.env.FINANCIAL_DEMO_URL || 'http://127.0.0.1:3006/tests/fixtures/financial-integrity.html';
const outDir = new URL('../../output/loan-correction/', import.meta.url);
const shot = name => fileURLToPath(new URL(name, outDir));
await mkdir(outDir, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1050 } });
  page.setDefaultTimeout(10000);
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto(base, { timeout: 90000, waitUntil: 'domcontentloaded' });
  await page.getByRole('navigation', { name: 'Paginación de movimientos' }).waitFor();
  await page.getByRole('tab', { name: 'Cuentas por cobrar' }).click();
  await page.getByRole('button', { name: /Cliente de muestra/ }).waitFor();

  // Un préstamo con un reintegro: antes solo se podía revertir el reintegro y eliminarlo.
  await page.getByRole('button', { name: 'Registrar préstamo', exact: true }).click();
  const create = page.getByRole('dialog');
  await chooseOption(create.getByLabel('Persona de Terceros'), 'tp-jarlan');
  await create.getByLabel('Valor prestado').fill('500000');
  await chooseOption(create.getByLabel('Cuenta de la que salió'), 'demo-account');
  await create.getByRole('button', { name: 'Registrar préstamo' }).click();
  await page.getByText(/Préstamo registrado/).waitFor();
  await page.getByRole('button', { name: /Jarlan/ }).first().click();
  const card = page.locator('[data-receivable-loan]').locator('xpath=ancestor::div[contains(@class,"rounded-xl")][1]');
  await card.getByRole('button', { name: 'Registrar pago', exact: true }).click();
  const payment = page.getByRole('dialog');
  await payment.getByLabel(/^Valor/).fill('200000');
  await chooseOption(payment.getByLabel('Cuenta'), 'demo-account');
  await payment.getByRole('button', { name: 'Guardar reintegro' }).click();
  await page.getByText(/Reintegro registrado/).waitFor();

  // El lápiz del valor abre «Corregir préstamo»: valor, fecha, cuenta y motivo.
  await card.locator('[data-loan-correct]').click();
  const dialog = page.locator('[data-loan-correction]');
  await dialog.waitFor();
  assert.match(await dialog.innerText(), /el egreso en Movimientos cambia con el préstamo/);
  assert.match(await dialog.innerText(), /Ya se aplicaron \$\s?200\.000/);
  await dialog.getByLabel('Valor prestado').fill('150000');
  await dialog.getByLabel('Motivo de la corrección').fill('El valor se digitó mal.');
  assert.match(await dialog.innerText(), /No puede quedar por debajo de lo ya aplicado/);
  assert.equal(await dialog.getByRole('button', { name: 'Guardar corrección' }).isDisabled(), true);
  await dialog.getByLabel('Valor prestado').fill('550000');
  await page.screenshot({ path: shot('corregir-prestamo.png'), animations: 'disabled' });
  await dialog.getByRole('button', { name: 'Guardar corrección' }).click();
  await page.getByText(/Préstamo corregido: el egreso en Movimientos cambió con él/).waitFor();
  const body = await page.evaluate(() => window.__loanCorrectionBody);
  assert.equal(body.amount, '550000');
  assert.equal(body.accountId, 'demo-account');
  assert.equal(body.reason, 'El valor se digitó mal.');
  await page.screenshot({ path: shot('prestamo-corregido.png'), animations: 'disabled', fullPage: true });

  // En oscuro y en el celular el cuadro se lee y no se sale de la pantalla.
  await page.evaluate(() => document.documentElement.classList.add('dark'));
  await card.locator('[data-loan-correct]').click();
  await dialog.waitFor();
  await page.screenshot({ path: shot('corregir-prestamo-oscuro.png'), animations: 'disabled' });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(400);
  const box = await page.evaluate(() => { const rect = document.querySelector('[data-loan-correction]').getBoundingClientRect(); return { left: rect.left, right: rect.right, width: window.innerWidth }; });
  assert.ok(box.left >= 0 && box.right <= box.width, `el cuadro cabe en el celular: ${JSON.stringify(box)}`);
  await page.screenshot({ path: shot('corregir-prestamo-movil.png'), animations: 'disabled' });
  assert.deepEqual(errors, []);
  console.log('Corregir préstamo: recorrido aprobado.');
} finally {
  await browser.close();
}
