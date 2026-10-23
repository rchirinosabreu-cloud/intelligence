// Saldar una deuda sin dinero (Rodny, 20 de octubre de 2026): Salsipuedes debía 3.500.000, pagó
// 2.000.000 y por mutuo acuerdo se cierra; Nuva pagó con muebles. Recorrido real sobre la muestra
// local de Financiero en 3006: npx vite --port 3006
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import { chooseOption } from './selectHelpers.mjs';
const base = process.env.FINANCIAL_DEMO_URL || 'http://127.0.0.1:3006/tests/fixtures/financial-integrity.html';
const outDir = new URL('../../output/receivable-settlement/', import.meta.url);
const shot = name => fileURLToPath(new URL(name, outDir));
await mkdir(outDir, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1050 } });
  page.setDefaultTimeout(10000);
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  // La primera carga de Vite escanea el repositorio entero: se espera el DOM, no la carga completa.
  await page.goto(base, { timeout: 90000, waitUntil: 'domcontentloaded' });
  await page.getByRole('navigation', { name: 'Paginación de movimientos' }).waitFor();
  await page.getByRole('tab', { name: 'Cuentas por cobrar' }).click();
  const row = page.getByRole('button', { name: /Cliente de muestra/ });
  await row.waitFor();
  await row.click();

  // La deuda de muestra: 1.200.000, 400.000 pagados, 800.000 pendientes.
  const settle = page.getByRole('button', { name: 'Saldar de otra forma', exact: true });
  await settle.click();
  const dialog = page.getByRole('dialog');
  assert.match(await dialog.innerText(), /No se registra ningún ingreso/);
  await page.screenshot({ path: shot('dialog-acuerdo.png'), animations: 'disabled' });

  // Se intenta sin motivo: el campo lo frena con el aviso nativo, sin mandar nada.
  await dialog.getByLabel('Autorizado por').fill('Francisco Villa');
  await dialog.getByRole('button', { name: 'Saldar la deuda' }).click();
  assert.equal(await dialog.getByLabel('Motivo').evaluate(element => element.validity.valueMissing), true);
  assert.equal(await page.evaluate(() => window.__receivableSettlementBody), undefined, 'sin motivo no se envía');

  // Acuerdo por menor valor por el saldo entero: queda SALDADO, sin ingreso.
  await dialog.getByLabel('Motivo').fill('El negocio cerró. Por mutuo acuerdo se cierra con lo ya pagado.');
  await dialog.getByRole('button', { name: 'Saldar la deuda' }).click();
  await page.getByText(/La cuenta quedó saldada; no se creó ningún ingreso/).waitFor();
  const body = await page.evaluate(() => window.__receivableSettlementBody);
  assert.equal(body.kind, 'ACUERDO');
  assert.equal(body.amount, 800000);
  assert.equal(body.authorizedBy, 'Francisco Villa');
  await page.locator('[data-receivable-settled]').waitFor();
  assert.match(await page.locator('[data-receivable-settled]').innerText(), /800[.,]000/);
  await page.locator('[data-receivable-payment-kind="ACUERDO"]').waitFor();
  assert.match(await page.locator('[data-receivable-payment-kind="ACUERDO"]').innerText(), /Acuerdo por menor valor[\s\S]*Autorizó Francisco Villa/);
  assert.equal(await page.getByRole('button', { name: 'Registrar pago', exact: true }).count(), 0, 'cerrada: no se registra más dinero');
  assert.equal(await settle.count(), 0);
  await page.screenshot({ path: shot('saldada.png'), animations: 'disabled', fullPage: true });

  // Revertir el ajuste reabre la deuda; el diálogo dice que no había ingreso que anular.
  await page.locator('[data-receivable-payment-kind="ACUERDO"]').getByRole('button', { name: 'Revertir' }).click();
  const reverse = page.getByRole('dialog');
  assert.match(await reverse.innerText(), /Revertir ajuste[\s\S]*No había ingreso que anular/);
  await reverse.getByLabel('Motivo').fill('El cliente pagó al final el resto');
  await reverse.getByRole('button', { name: 'Revertir ajuste' }).click();
  await settle.waitFor();

  // Nuva: canje con muebles, parcial, en oscuro.
  await page.evaluate(() => document.documentElement.classList.add('dark'));
  await settle.click();
  const canje = page.getByRole('dialog');
  await chooseOption(canje.getByLabel('Forma de saldar'), 'CANJE');
  await canje.getByLabel('Valor que se da por saldado').fill('500000');
  assert.match(await canje.locator('[data-settlement-remaining]').innerText(), /300[.,]000/);
  await canje.getByLabel('Autorizado por').fill('Francisco Villa');
  await canje.getByLabel('Qué se recibió').fill('Muebles de oficina: 2 escritorios y 4 sillas');
  await canje.getByLabel(/A dónde fue/).fill('Uso personal de Francisco Villa');
  await canje.getByLabel('Motivo').fill('Francisco acordó recibir muebles por parte de la deuda.');
  await page.screenshot({ path: shot('dialog-canje-dark.png'), animations: 'disabled' });
  await canje.getByRole('button', { name: 'Saldar la deuda' }).click();
  await page.locator('[data-receivable-payment-kind="CANJE"]').waitFor();
  assert.match(await page.locator('[data-receivable-payment-kind="CANJE"]').innerText(), /Canje de bienes o servicios[\s\S]*Se recibió: Muebles de oficina[\s\S]*Destino: Uso personal de Francisco Villa/);
  assert.equal(await settle.count(), 1, 'parcial: la deuda sigue abierta');
  await page.screenshot({ path: shot('canje-parcial-dark.png'), animations: 'disabled', fullPage: true });

  assert.deepEqual(errors, []);
  console.log('OK', fileURLToPath(outDir));
} finally { await browser.close(); }
