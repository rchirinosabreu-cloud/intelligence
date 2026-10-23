// Retenciones en cartera (Elisa, 22 de octubre de 2026, Fundación Grit: «no pagan el valor de la
// cuenta completo porque aplican retención en la fuente … que quede cerrado … pero que no cuente
// como ingreso»). Recorrido real sobre la muestra local de Financiero en 3006: primero una
// retención de ICA con «Saldar de otra forma», después el pago con su retención en la fuente en el
// mismo diálogo, el certificado adjunto y el resumen de ajustes.
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import { chooseOption } from './selectHelpers.mjs';
const base = process.env.FINANCIAL_DEMO_URL || 'http://127.0.0.1:3006/tests/fixtures/financial-integrity.html';
const outDir = new URL('../../output/receivable-retention/', import.meta.url);
const shot = name => fileURLToPath(new URL(name, outDir));
await mkdir(outDir, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
  page.setDefaultTimeout(10000);
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto(base, { timeout: 90000, waitUntil: 'domcontentloaded' });
  await page.getByRole('navigation', { name: 'Paginación de movimientos' }).waitFor();
  await page.getByRole('tab', { name: 'Cuentas por cobrar' }).click();
  const row = page.getByRole('button', { name: /Cliente de muestra/ });
  await row.waitFor();
  await row.click();

  // La deuda de muestra: 1.200.000, 400.000 pagados, 800.000 pendientes.
  // 1) Una retención de ICA que ya quedó colgando: «Saldar de otra forma» → retención, sin autorización ni motivo.
  await page.getByRole('button', { name: 'Saldar de otra forma', exact: true }).click();
  const settle = page.getByRole('dialog');
  await chooseOption(settle.getByLabel('Forma de saldar'), 'RETENCION');
  assert.equal(await settle.getByLabel('Autorizado por').count(), 0, 'una retención no pide quién autorizó');
  await chooseOption(settle.getByLabel(/^Retención/).first(), 'RETEICA');
  await settle.getByLabel('Valor que se da por saldado').fill('8000');
  await settle.getByLabel(/N\.º del certificado/).fill('ICA-2026-14');
  await page.screenshot({ path: shot('dialog-retencion.png'), animations: 'disabled' });
  await settle.getByRole('button', { name: 'Registrar retención' }).click();
  await page.getByText('Retención registrada. No se creó ningún ingreso.').waitFor();
  const settleBody = await page.evaluate(() => window.__receivableSettlementBody);
  assert.equal(settleBody.kind, 'RETENCION');
  assert.equal(settleBody.retentionType, 'RETEICA');
  assert.equal(settleBody.amount, 8000);
  await page.locator('[data-receivable-retained]').waitFor();
  assert.match(await page.locator('[data-receivable-retained]').innerText(), /8[.,]000/);

  // 2) El pago con su retención en la fuente, en el mismo paso: el valor que entró baja solo.
  await page.getByRole('button', { name: 'Registrar pago', exact: true }).click();
  const pay = page.getByRole('dialog');
  await chooseOption(pay.getByLabel('Concepto del ingreso'), 'MEMBRESIA');
  assert.equal(await pay.getByLabel('Valor', { exact: true }).inputValue(), '792.000');
  await pay.getByLabel('Retención en la fuente').fill('31680');
  assert.equal(await pay.getByLabel(/Valor que entró a la cuenta/).inputValue(), '760.320', 'lo retenido sale del valor que entró');
  assert.match(await pay.locator('[data-receivable-payment-after]').innerText(), /la cuenta queda pagada/);
  await chooseOption(pay.getByRole('combobox', { name: 'Cuenta' }), 'demo-account');
  await page.screenshot({ path: shot('pago-con-retencion.png'), animations: 'disabled' });
  await pay.getByRole('button', { name: 'Guardar pago' }).click();
  await page.getByText('Pago y retenciones registrados. La cuenta quedó pagada.').waitFor();
  const payBody = await page.evaluate(() => window.__receivablePaymentBody);
  assert.equal(payBody.amount, 760320);
  assert.deepEqual(payBody.retentions, [{ type: 'RETEFUENTE', amount: 31680 }]);
  assert.equal(await page.getByRole('button', { name: 'Registrar pago', exact: true }).count(), 0, 'pagada: no se registra más dinero');
  assert.match(await page.locator('[data-receivable-retained]').innerText(), /39[.,]680/);
  const fuente = page.locator('[data-receivable-payment-kind="RETENCION"]', { hasText: 'Retención en la fuente' });
  await fuente.waitFor();

  // 3) El certificado se adjunta a la propia retención.
  await fuente.locator('input[type="file"]').setInputFiles({ name: 'certificado-retencion-grit.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4\n%demo') });
  await page.getByText('Certificado guardado.').waitFor();
  assert.ok(await page.evaluate(() => window.__certificateUpload));
  await fuente.getByText('certificado-retencion-grit.pdf').waitFor();
  await page.screenshot({ path: shot('cuenta-pagada-con-retenciones.png'), animations: 'disabled', fullPage: true });

  // 4) El resumen de ajustes suma lo retenido aparte, por tipo.
  const summary = page.locator('[data-adjustment-retention]');
  await summary.waitFor();
  assert.match(await summary.innerText(), /39[.,]680[\s\S]*Fuente[\s\S]*31[.,]680[\s\S]*ICA[\s\S]*8[.,]000/);

  // En oscuro.
  await page.evaluate(() => document.documentElement.classList.add('dark'));
  await page.locator('[data-receivable-adjustments]').scrollIntoViewIfNeeded();
  await page.screenshot({ path: shot('resumen-retenciones-oscuro.png'), animations: 'disabled', fullPage: true });

  assert.deepEqual(errors, []);
  console.log('OK', fileURLToPath(outDir));
} finally { await browser.close(); }
