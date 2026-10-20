// IVA por emisor (Elisa, 20 de octubre de 2026: «cuando uno pone a nombre de Francisco, ahí no
// debería aparecer la opción de IVA»). Con Francisco Villa como emisor la cotización es exenta y el
// interruptor no se dibuja; con Brain Studio vuelve. Requiere la muestra local en 3007:
// npx vite --config tests/fixtures/quotation-vite.config.mjs
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
const base = process.env.QUOTATION_DEMO_URL || 'http://127.0.0.1:3007/tests/fixtures/quotation-proposal.html';
const outDir = new URL('../../output/quotation-issuer-tax/', import.meta.url);
const shot = name => fileURLToPath(new URL(name, outDir));
await mkdir(outDir, { recursive: true });
const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  page.setDefaultTimeout(10000);
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto(`${base}?view=new`, { timeout: 60000, waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: 'Añadir servicio personalizado', exact: true }).click();
  await page.getByLabel('Nombre del servicio 1').fill('Asesoría de muestra');
  await page.getByLabel('Precio de Asesoría de muestra').fill('1000000');
  const clientTypeText = () => page.getByLabel('Tipo de Propuesta').textContent();
  const totalText = () => page.locator('span', { hasText: /^Total$/ }).locator('xpath=following-sibling::span').first().textContent();

  // Brain Studio: el IVA es decisión de quien cotiza y el interruptor está a la vista.
  const toggle = page.getByRole('button', { name: /Marcar exenta de IVA|Aplicar IVA/ });
  await toggle.waitFor();
  assert.equal(await page.locator('[data-quotation-tax-locked]').count(), 0, 'con Brain Studio nada bloquea el IVA');
  assert.match(await clientTypeText(), /Para Empresa \(Aplica IVA 19%\)/);
  assert.match(await totalText(), /1\.190\.000/, 'con Brain Studio y empresa el total lleva IVA');
  await page.screenshot({ path: shot('brain-studio.png') });

  // Alguien deja el IVA marcado y cambia el emisor a Francisco: la cotización queda exenta igual.
  await page.getByRole('button', { name: /Francisco Villa/ }).click();
  await page.locator('[data-quotation-tax-locked="ISSUER"]').waitFor();
  assert.equal(await toggle.count(), 0, 'con Francisco no hay interruptor de IVA');
  await page.getByText('Francisco Villa emite como persona natural.', { exact: true }).waitFor();
  assert.equal((await clientTypeText()).trim(), 'Para Empresa', 'sin la ayuda del IVA, que con Francisco no aplica');
  assert.match(await totalText(), /1\.000\.000/, 'el total no lleva IVA');
  await page.screenshot({ path: shot('francisco-villa.png') });

  // Lo que viaja al servidor es la exención efectiva.
  await page.getByRole('button', { name: 'Guardar como Borrador' }).click();
  await page.getByText('Borrador guardado', { exact: true }).waitFor();
  const saved = await page.evaluate(() => window.__quotationDemo());
  assert.equal(saved.emisor_type, 'FRANCISCO_VILLA');
  assert.equal(saved.is_tax_exempt, true, 'la cotización de Francisco viaja exenta');
  assert.equal(saved.tax_amount, 0);

  // De vuelta a Brain Studio el interruptor reaparece.
  await page.getByRole('button', { name: /Brain Studio/ }).click();
  await toggle.waitFor();
  assert.equal(await page.locator('[data-quotation-tax-locked]').count(), 0);

  // En oscuro se lee igual.
  await page.evaluate(() => document.documentElement.classList.add('dark'));
  await page.getByRole('button', { name: /Francisco Villa/ }).click();
  await page.locator('[data-quotation-tax-locked="ISSUER"]').waitFor();
  await page.screenshot({ path: shot('francisco-villa-dark.png') });

  assert.deepEqual(errors, []);
  console.log('OK', fileURLToPath(outDir));
} finally { await browser.close(); }
