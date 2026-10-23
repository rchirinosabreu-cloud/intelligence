// Terceros y cuentas por pagar (Rodny, 20 de octubre de 2026: «arranca con las cuentas por pagar y
// los terceros»): la pestaña «Por pagar», un tercero nuevo desde el propio formulario, una cuenta
// nueva, su pago (que crea el egreso en Movimientos) y los pagos plegados. Muestra local de
// Financiero en 3006: npx vite --host 127.0.0.1 --port 3006
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import { chooseOption } from './selectHelpers.mjs';
const base = process.env.FINANCIAL_DEMO_URL || 'http://127.0.0.1:3006/tests/fixtures/financial-integrity.html';
const outDir = new URL('../../output/accounts-payable/', import.meta.url);
const shot = name => fileURLToPath(new URL(name, outDir));
await mkdir(outDir, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
  page.setDefaultTimeout(10000);
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto(base, { timeout: 90000, waitUntil: 'domcontentloaded' });
  await page.getByRole('navigation', { name: 'Paginación de movimientos' }).waitFor();
  await page.getByRole('tab', { name: 'Cuentas por pagar' }).click();
  await page.locator('[data-payables-tab]').waitFor();

  // La pestaña abre con los totales y el arrendador con su arriendo vencido.
  assert.match(await page.locator('[data-payables-outstanding]').innerText(), /1\.500\.000/);
  await page.locator('[data-payable-group]').first().getByRole('button').first().click();
  await page.locator('[data-payable-row][data-payable-status="POR_PAGAR"]').waitFor();
  assert.equal(await page.locator('[data-payable-due="VENCIDA"]').count(), 1, 'el arriendo de octubre está vencido');
  await page.screenshot({ path: shot('por-pagar-abierta.png'), animations: 'disabled', fullPage: true });

  // Cancelar «Nuevo tercero» cierra todo y deja a la persona en la pestaña donde estaba (Rodny, 23 de octubre de 2026).
  await page.locator('[data-payable-new]').click();
  await page.locator('[data-payable-dialog]').waitFor();
  await page.locator('[data-payable-new-third-party]').click();
  await page.locator('[data-third-party-dialog]').getByRole('button', { name: 'Cancelar' }).click();
  await page.locator('[data-third-party-dialog]').waitFor({ state: 'detached' });
  assert.equal(await page.locator('[data-payable-dialog]').count(), 0, 'no vuelve a la cuenta por pagar: se sale de todo');
  assert.equal(await page.getByRole('dialog').count(), 0);

  // Un tercero nuevo desde el propio formulario de la cuenta: no hay que salir a crearlo aparte.
  await page.locator('[data-payable-new]').click();
  await page.locator('[data-payable-dialog]').waitFor();
  await page.locator('[data-payable-new-third-party]').click();
  const tpDialog = page.locator('[data-third-party-dialog]');
  await tpDialog.waitFor();
  await chooseOption(tpDialog.getByLabel('Clase'), 'PROVEEDOR');
  await tpDialog.getByLabel('Nombre', { exact: true }).fill('Papelería El Punto');
  await tpDialog.getByLabel('Banco').fill('Bancolombia');
  await tpDialog.getByRole('button', { name: 'Guardar tercero' }).click();
  await page.getByText('Tercero «Papelería El Punto» guardado.').waitFor();
  assert.equal((await page.evaluate(() => window.__thirdPartyBody))?.kind, 'PROVEEDOR');

  // De vuelta en la cuenta nueva, el tercero ya viene elegido.
  const payableDialog = page.locator('[data-payable-dialog]');
  await payableDialog.waitFor();
  assert.match(await payableDialog.getByRole('combobox', { name: 'Tercero' }).innerText(), /Papelería El Punto/);
  await payableDialog.getByLabel('Concepto').fill('Resmas y tóner de octubre');
  await payableDialog.getByLabel('Valor').fill('320000');
  await payableDialog.getByLabel('Número del documento').fill('FV-1021');
  await page.screenshot({ path: shot('cuenta-nueva.png'), animations: 'disabled' });
  await payableDialog.getByRole('button', { name: 'Registrar cuenta' }).click();
  await page.getByText('Cuenta por pagar registrada.').waitFor();
  const payableBody = await page.evaluate(() => window.__payableBody);
  assert.equal(payableBody.concept, 'Resmas y tóner de octubre');
  assert.equal(payableBody.amount, 320000);
  assert.equal(payableBody.category, 'OPERATIVO');

  // Pagar el arriendo: el egreso queda en Movimientos ligado al pago; los pagos van plegados.
  const arriendo = page.locator('[data-payable-row]', { hasText: 'Arriendo de octubre' });
  await arriendo.locator('[data-payable-pay]').click();
  const payDialog = page.locator('[data-payable-payment-dialog]');
  await payDialog.waitFor();
  assert.equal(await payDialog.getByLabel('Valor pagado').inputValue(), '1.500.000', 'viene puesto el saldo pendiente');
  await chooseOption(payDialog.getByLabel('Cuenta de la que salió'), 'demo-account');
  await payDialog.getByLabel('Referencia').fill('TRX-5521');
  await payDialog.getByRole('button', { name: 'Guardar pago' }).click();
  await page.getByText('Pago registrado. La cuenta quedó pagada.').waitFor();
  const paymentBody = await page.evaluate(() => window.__payablePaymentBody);
  assert.equal(paymentBody.amount, 1500000);
  assert.equal(paymentBody.reference, 'TRX-5521');
  await page.locator('[data-payable-row][data-payable-status="PAGADA"]').waitFor();
  assert.equal(await page.locator('[data-payable-payments]').count(), 0, 'los pagos van plegados');
  await page.locator('[data-payable-payments-toggle]').first().click();
  await page.locator('[data-payable-payment]').first().waitFor();
  assert.match(await page.locator('[data-payables-outstanding]').innerText(), /320\.000/, 'queda por pagar solo la cuenta nueva');
  await page.screenshot({ path: shot('pagada-y-pagos.png'), animations: 'disabled', fullPage: true });

  // En Movimientos, el egreso del pago queda bloqueado y dice a dónde ir.
  await page.getByRole('tab', { name: 'Movimientos' }).click();
  await page.getByRole('navigation', { name: 'Paginación de movimientos' }).waitFor();
  const row = page.locator('tr', { hasText: 'Pago a Inmobiliaria Norte' });
  await row.waitFor();
  const lockedLabel = await row.getByRole('button', { name: /No se puede anular aquí/ }).getAttribute('aria-label');
  assert.match(lockedLabel, /cuenta por pagar/);

  // En oscuro.
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.evaluate(() => document.documentElement.classList.add('dark'));
  await page.getByRole('tab', { name: 'Cuentas por pagar' }).click();
  await page.locator('[data-payables-tab]').waitFor();
  // «Terceros» lleva a su pestaña (23 de octubre de 2026): los dos terceros de pago, cada uno con su rol.
  await page.locator('[data-third-parties-open]').click();
  await page.locator('[data-financial-parties]').waitFor();
  await page.getByRole('combobox', { name: 'Rol' }).waitFor();
  // Los dos tienen rol de pago; el arrendador comparte NIT con el cliente de muestra y va en su fila.
  const payees = page.locator('[data-party-roles]').filter({ hasText: /Proveedor|Arrendador|Colaborador|Socio|Otro tercero/ });
  await payees.first().waitFor();
  assert.equal(await payees.count(), 2);
  await page.screenshot({ path: shot('terceros-oscuro.png'), animations: 'disabled' });

  assert.deepEqual(errors, []);
  console.log('OK', fileURLToPath(outDir));
} finally { await browser.close(); }
