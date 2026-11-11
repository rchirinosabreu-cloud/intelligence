import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright-core';

// Rodny, 10 de noviembre de 2026: un ciclo que va de mitad a mitad de mes se nombra con los dos meses,
// para que no parezca que «noviembre» está vacío cuando se trabajó en octubre. Sobre la muestra de
// Operación (node scripts/preview-client-operations.js --port=3700); Mimas corta el 15.
const BASE = process.env.CLIENT_OPERATIONS_URL || 'http://127.0.0.1:3700';
const OUT = 'output/operacion-ciclo-de-corte';
let browser;
test.before(async () => {
  browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
  await mkdir(OUT, { recursive: true });
});
test.after(async () => { await browser?.close(); });

for (const theme of ['light', 'dark']) {
  test(`el ciclo con corte se lee con sus dos meses (${theme})`, async () => {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, colorScheme: theme });
    page.setDefaultTimeout(15000);
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto(`${BASE}/clientes`, { timeout: 90000, waitUntil: 'domcontentloaded' });
    const row = page.locator('[aria-label="Clientes"] li', { hasText: 'Mimas Kitchen' });
    await row.waitFor({ timeout: 60000 });
    await page.evaluate((dark) => document.documentElement.classList.toggle('dark', dark), theme === 'dark');
    assert.match(await row.innerText(), /Septiembre–octubre/);
    assert.match(await row.innerText(), /Ago–Sep 12\/12/);
    await row.scrollIntoViewIfNeeded();
    await page.waitForTimeout(200);
    await page.screenshot({ path: `${OUT}/tablero-${theme}.png` });
    assert.deepEqual(errors, []);
    await page.close();
  });
}
