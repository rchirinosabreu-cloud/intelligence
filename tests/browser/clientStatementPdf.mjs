// El estado de cuenta en PDF desde Cartera (Rodny, 20 de octubre de 2026: «necesito poder tener
// mi documento de seguimiento y también el poder generarlo»). Muestra local de Financiero en
// 3006: npx vite --host 127.0.0.1 --port 3006
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
const base = process.env.FINANCIAL_DEMO_URL || 'http://127.0.0.1:3006/tests/fixtures/financial-integrity.html';
const outDir = new URL('../../output/client-statement-pdf/', import.meta.url);
const shot = name => fileURLToPath(new URL(name, outDir));
await mkdir(outDir, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1050 } });
  page.setDefaultTimeout(10000);
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  let popups = 0; page.on('popup', () => { popups += 1; });
  await page.goto(base, { timeout: 90000, waitUntil: 'domcontentloaded' });
  await page.getByRole('navigation', { name: 'Paginación de movimientos' }).waitFor();
  await page.getByRole('button', { name: 'Cartera', exact: true }).click();
  await page.getByRole('button', { name: /Cliente de muestra/ }).click();

  // Desde la cartera se abre el estado de cuenta del cliente, con la fecha de corte de hoy.
  await page.locator('[data-receivable-statement]').click();
  const dialog = page.getByRole('dialog');
  await dialog.locator('[data-statement-document]').waitFor();
  const cutoff = dialog.getByLabel('Fecha de corte del estado de cuenta');
  assert.match(await cutoff.inputValue(), /^\d{2}\/\d{2}\/\d{4}$/, 'la fecha de corte viene puesta a hoy');
  assert.equal(await page.locator('.react-datepicker').count(), 0, 'el calendario no se abre solo al abrir el diálogo');
  await page.screenshot({ path: shot('estado-de-cuenta-dialogo.png'), animations: 'disabled' });

  // «Ver PDF» lo pide a la API con el corte y lo abre en el visor de la plataforma, sin otra ventana.
  await dialog.getByRole('button', { name: 'Ver PDF', exact: true }).click();
  await page.getByText('Estado de cuenta - Cliente de muestra - corte.pdf', { exact: true }).waitFor();
  // La primera vez, el servidor de desarrollo compila el lector de PDF: se le da margen.
  await page.locator('canvas').first().waitFor({ timeout: 45000 });
  const requests = await page.evaluate(() => window.__documentRequests || []);
  assert.equal(requests.length, 1);
  assert.match(requests[0], /\/api\/financials\/clients\/demo-client\/statement\/document\?cutoff=\d{4}-\d{2}-\d{2}$/);
  assert.equal(popups, 0, 'el visor no abre otra ventana');
  await page.screenshot({ path: shot('estado-de-cuenta-visor.png'), animations: 'disabled' });

  assert.deepEqual(errors, []);
  console.log('OK', fileURLToPath(outDir));
} finally { await browser.close(); }
