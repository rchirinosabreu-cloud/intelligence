import { chromium } from 'playwright-core';
import assert from 'node:assert/strict';
const origin = process.env.PERSON_PREVIEW_URL || 'http://127.0.0.1:3866';
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1050 } });
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto(`${origin}/financiero?tab=nomina&year=2026&month=11`);
  await page.getByRole('button', { name: /Jesús Arnedo/ }).waitFor();
  for (const name of ['Francisco Villa', 'Francys Caballero', 'Jesús Arnedo']) {
    const person = page.locator('[data-payroll-person]').filter({ hasText: name });
    assert.equal(await person.count(), 1);
    const photo = person.getByRole('img', { name, exact: true });
    await photo.waitFor();
    await page.waitForFunction(name => { const img = [...document.querySelectorAll('[data-payroll-person] img')].find(img => img.alt === name); return img?.complete && img.naturalWidth > 0; }, name, { timeout: 20000 });
    assert.ok(await photo.evaluate(img => img.naturalWidth > 0 && getComputedStyle(img).display !== 'none'));
  }
  await page.getByRole('heading', { name: 'Nómina', exact: true }).evaluate(el => el.scrollIntoView({ block: 'start' }));
  await page.screenshot({ path: 'output/payroll-avatars-fixed.png' });
  // An unlinked homonym retains initials; reading the screen never assigns another person's photo.
  await page.route('**/preview-api/payroll-ledger**', async route => {
    const response = await route.fetch(), data = await response.json();
    data.items.push({ id: 'unlinked-local', collaboratorId: 'unlinked-local', name: 'Francys Caballero', transactions: [] });
    await route.fulfill({ json: data });
  });
  await page.reload();
  await page.getByRole('button', { name: /Jesús Arnedo/ }).waitFor();
  const homonyms = page.locator('[data-payroll-person]').filter({ hasText: 'Francys Caballero' });
  assert.equal(await homonyms.count(), 2);
  assert.equal(await homonyms.locator('img').count(), 1);
  assert.deepEqual(errors, []);
  console.log('Fotos reales por vínculo, una fila por persona y fallback sin emparejar homónimos: OK.');
} finally { await browser.close(); }
