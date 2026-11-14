// «Ya la emití en Word» (Elisa, 13 de noviembre de 2026, con Haad): la obligación de muestra sin cuenta de cobro
// recibe el número y la fecha de la que ya se mandó desde Word; la tarjeta la nombra y no ofrece PDF ni «Corregir».
// Muestra local de Financiero en 3006: npx vite --host 127.0.0.1 --port 3006
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
const base = process.env.FINANCIAL_DEMO_URL || 'http://127.0.0.1:3006/tests/fixtures/financial-integrity.html';
const outDir = new URL('../../output/receivable-external-document/', import.meta.url);
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
  await page.getByRole('button', { name: /Cliente de muestra/ }).click();

  // Sin número: «Emitir cuenta de cobro» y, al lado, «Ya la emití en Word».
  const record = page.locator('[data-receivable-external-record]').first();
  await record.waitFor();
  assert.ok(await page.getByRole('button', { name: 'Emitir cuenta de cobro' }).first().isVisible());
  await record.click();
  const dialog = page.getByRole('dialog');
  assert.match(await dialog.innerText(), /Ya la emití en Word[\s\S]*No se genera otro PDF/);
  // La regla frena antes de enviar: sin número no se manda nada.
  await dialog.getByRole('button', { name: 'Anotar cuenta de cobro' }).click();
  assert.equal(await page.evaluate(() => (window.__externalDocuments || []).length), 0);
  await dialog.getByLabel('Número de la cuenta de cobro').fill('380');
  await dialog.getByLabel('Fecha de emisión de la cuenta de cobro').fill('31/07/2026');
  await dialog.getByLabel('Fecha de emisión de la cuenta de cobro').press('Tab');
  await dialog.getByLabel(/Periodo del servicio/).fill('1 al 31 de julio');
  await page.screenshot({ path: shot('dialogo.png'), animations: 'disabled' });
  await dialog.getByRole('button', { name: 'Anotar cuenta de cobro' }).click();
  await page.getByText(/Cuenta de cobro No\. 0380 anotada/).waitFor();
  const body = await page.evaluate(() => window.__externalDocuments[0]);
  assert.deepEqual(body, { number: 380, issuedAt: '2026-07-31', servicePeriod: '1 al 31 de julio' });

  // La tarjeta la nombra, dice que se hizo en Word y no ofrece PDF ni «Corregir»; el valor se sigue editando con el lápiz.
  const badge = page.locator('[data-receivable-external-document]').first();
  assert.match(await badge.innerText(), /Cuenta de cobro No\. 0380[\s\S]*hecha en Word/);
  // La fila de acciones de esa obligación: la misma que antes ofrecía «Emitir».
  const row = badge.locator('xpath=..');
  assert.equal(await row.getByRole('button', { name: 'Ver PDF' }).count(), 0);
  assert.equal(await row.getByRole('button', { name: 'Corregir' }).count(), 0);
  assert.equal(await row.getByRole('button', { name: 'Emitir cuenta de cobro' }).count(), 0);
  assert.ok(await row.locator('[data-receivable-external-change]').isVisible());
  assert.ok(await page.getByRole('button', { name: /Editar valor de la obligación/ }).first().isVisible(), 'el lápiz sigue editando el valor');
  await page.screenshot({ path: shot('tarjeta-claro.png'), animations: 'disabled' });

  // «Cambiar número» abre la misma ventana con el número puesto, también en oscuro.
  await page.evaluate(() => document.documentElement.classList.add('dark'));
  await page.locator('[data-receivable-external-change]').first().click();
  assert.match(await page.getByRole('dialog').innerText(), /Cambiar el número de la cuenta de cobro No\. 0380/);
  assert.equal(await page.getByRole('dialog').getByLabel('Número de la cuenta de cobro').inputValue(), '380');
  await page.screenshot({ path: shot('cambiar-oscuro.png'), animations: 'disabled' });
  await page.keyboard.press('Escape');
  assert.deepEqual(errors, []);
  console.log('Capturas en', fileURLToPath(outDir));
} finally {
  await browser.close();
}
