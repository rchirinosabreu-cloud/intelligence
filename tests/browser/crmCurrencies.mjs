import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright-core';
import { createCrmPreview } from '../../scripts/preview-crm.js';

let preview, browser;
test.before(async () => {
  preview = await createCrmPreview({ port: 0 });
  await preview.db.crmLead.update({ where: { id: 'lead-jaraba' }, data: { currency: 'USD', quotedValue: '1000.25', stage: 'GANADO' } });
  browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
  await mkdir('output/crm-monedas', { recursive: true });
});
test.after(async () => { await browser?.close(); await preview?.close(); });

for (const variant of [{ name: 'claro', width: 1440 }, { name: 'oscuro', width: 1440, dark: true }, { name: 'movil', width: 390 }]) {
  test(`${variant.name}: CRM labels each currency and retains dollar cents`, async () => {
    const page = await browser.newPage({ viewport: { width: variant.width, height: 1000 } });
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    try {
      await page.goto(`${preview.origin}/crm${variant.dark ? '?dark' : ''}`, { timeout: 120000 });
      const heading = page.getByRole('heading', { name: 'Valor', exact: true });
      await heading.waitFor({ timeout: 30000 });
      const panel = heading.locator('../..').locator('..');
      const text = await panel.innerText();
      assert.match(text, /USD\s+1\.000,25/);
      assert.match(text, /COP/);
      assert.doesNotMatch(text, /Valores en COP/);
      await page.screenshot({ path: `output/crm-monedas/${variant.name}.png`, fullPage: true });
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
      assert.deepEqual(errors, []);
    } finally { await page.close(); }
  });
}
