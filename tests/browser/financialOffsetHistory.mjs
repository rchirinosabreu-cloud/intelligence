import { chromium } from 'playwright-core';
import assert from 'node:assert/strict';
import fs from 'node:fs';
// Private read-only export; no production requests or writes from this browser.
const snapshot = JSON.parse(fs.readFileSync(process.env.OFFSET_HISTORY_SNAPSHOT || 'output/brieva-offset-detail.json', 'utf8'));
const origin = process.env.PERSON_PREVIEW_URL || 'http://127.0.0.1:3866';
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1050 } });
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  if (!process.env.OFFSET_PREVIEW_NATIVE) {
    await page.route('**/preview-api/payables-ledger**', route => route.fulfill({ json: snapshot.ledger }));
    await page.route('**/preview-api/offsets/**', route => route.request().method() === 'GET' ? route.fulfill({ json: snapshot.context }) : route.abort());
  }
  await page.goto(`${origin}/financiero?tab=por-pagar&year=2026`);
  // Obligations are inside collapsed groups, so open the group first.
  await page.locator('[data-payable-group]').getByRole('button', { name: /Grupo Brieva/ }).first().click();
  await page.locator('[data-payable-payments-toggle]').first().click();
  await page.getByRole('button', { name: 'Ver cruce', exact: true }).first().click();
  await page.waitForTimeout(800);
  assert.deepEqual(errors, []);
  const dialog = page.locator('[data-financial-offset]');
  await dialog.getByRole('heading', { name: 'Detalle del cruce', exact: true }).waitFor();
  await dialog.locator('[data-offset-history] summary').click();
  const entries = dialog.locator('[data-offset-history] li');
  assert.equal(await entries.count(), 2);
  assert.match(await entries.nth(0).innerText(), /Compensación registrada en Cartera/);
  assert.match(await entries.nth(0).innerText(), /960\.000/);
  assert.doesNotMatch(await entries.nth(0).innerText(), /Debemos:/);
  assert.match(await entries.nth(1).innerText(), /Contrapartida vinculada en Por pagar/);
  assert.match(await entries.nth(1).innerText(), /40\.000/);
  await page.screenshot({ path: 'output/brieva-offset-fixed.png' });
  await dialog.getByLabel('Motivo de reversión').fill('Revisión local, sin confirmar ni modificar datos reales.');
  await dialog.getByRole('button', { name: 'Revisar reversión' }).click();
  assert.match(await dialog.innerText(), /960\.000/);
  assert.doesNotMatch(await dialog.locator('[data-offset-balances]').innerText(), /1\.000\.000/);
  await page.screenshot({ path: 'output/brieva-offset-reversal-review.png' });
  await page.keyboard.press('Escape');
  assert.deepEqual(errors, []);
  console.log('Historial antiguo, contrapartida, apertura desde Por pagar y revisión de reversión preservando pago de $40.000: OK.');
} finally { await browser.close(); }
