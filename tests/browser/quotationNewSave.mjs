// «Nueva propuesta»: guardar el borrador y después emitir deja UNA cotización (Elisa, 6 de octubre
// de 2026: quedaron COT-0040 en borrador y COT-0041 activa). Requiere la muestra local en 3007:
// npx vite --config tests/fixtures/quotation-vite.config.mjs
import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
const base = process.env.QUOTATION_DEMO_URL || 'http://127.0.0.1:3007/tests/fixtures/quotation-proposal.html';
const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  page.setDefaultTimeout(10000);
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto(`${base}?view=new`, { timeout: 60000, waitUntil: 'domcontentloaded' });
  await page.getByPlaceholder('Ej: Acme Corp SAS').fill('Café Altura');
  assert.match(await page.locator('[data-quotation-party="NONE"]').innerText(), /Al guardar, la cotización se liga con su cliente/);
  await page.getByRole('button', { name: 'Añadir servicio personalizado', exact: true }).click();
  await page.getByLabel('Nombre del servicio 1').fill('Asesoría de muestra');
  await page.getByRole('button', { name: 'Guardar como Borrador' }).click();
  await page.getByText('Borrador guardado', { exact: true }).waitFor();
  assert.deepEqual(await page.evaluate(() => window.__quotationDemoCalls()), ['POST /api/quotations']);
  // Guardada, dice a qué tercero quedó ligada (punto 1 de la solicitud de Elisa, 23 de octubre de 2026).
  const party = page.locator('[data-quotation-party="CLIENTE_POTENCIAL"]');
  await party.waitFor();
  assert.match(await party.innerText(), /Cliente potencial: .+ · CRM-0187 en el CRM/);
  await party.scrollIntoViewIfNeeded();
  await page.screenshot({ path: 'output/quotation-party.png', animations: 'disabled' });
  await page.getByText('Borrador guardado', { exact: true }).waitFor({ state: 'hidden' });
  // Se vuelve a guardar dos veces seguidas, como un doble toque: tiene que actualizar la misma.
  const save = page.getByRole('button', { name: 'Guardar como Borrador' });
  await Promise.all([save.click(), save.click({ force: true }).catch(() => {})]);
  await page.getByText('Borrador guardado', { exact: true }).first().waitFor();
  const calls = await page.evaluate(() => window.__quotationDemoCalls());
  assert.equal(calls[0], 'POST /api/quotations');
  assert.ok(calls.slice(1).length >= 1 && calls.slice(1).every(call => call === 'PUT /api/quotations/local-sunpartners'), calls.join(', '));
  assert.equal(calls.filter(call => call.startsWith('POST')).length, 1, 'una sola cotización creada');
  assert.deepEqual(errors, []);
  console.log('OK', calls);
} finally { await browser.close(); }
