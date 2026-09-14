import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright-core';
import { createRecognitionPreview } from '../../scripts/preview-recognitions.js';

let preview, browser;
test.before(async () => {
  preview = await createRecognitionPreview({ port: 0 });
  browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
  await mkdir('output/client-links', { recursive: true });
});
test.after(async () => { await browser?.close(); await preview?.close(); });

for (const variant of [
  { name: 'desktop-light', width: 1440, height: 1000, count: 5 },
  { name: 'desktop-dark', width: 1440, height: 1000, count: 12, dark: true },
  { name: 'mobile-dark', width: 390, height: 844, count: 25, dark: true, mobile: true }
]) {
  test(`${variant.name}: keeps adding and reading links beyond five without replacing existing links`, async () => {
    const page = await browser.newPage({ viewport: { width: variant.width, height: variant.height }, isMobile: !!variant.mobile, hasTouch: !!variant.mobile });
    page.setDefaultTimeout(5000);
    page.setDefaultNavigationTimeout(60000);
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    const titles = ['Post', 'Sold Residence at Rio - POST', 'POST JULIO 2026', 'POST AGOS 2026', 'HISTORIAS'];
    const original = Array.from({ length: variant.count }, (_, index) => ({ id: `link-${index}`, title: titles[index] || `Referencia ${index + 1}`, url: `https://example.com/referencia-${index + 1}` }));
    let links = structuredClone(original);
    const writes = [];
    await page.route('**/api/**', route => {
      assert.equal(new URL(route.request().url()).pathname, '/api/db/clients/client-links-preview/links');
      if (route.request().method() === 'GET') return route.fulfill({ json: links });
      assert.equal(route.request().method(), 'POST');
      const body = route.request().postDataJSON();
      writes.push(body);
      const created = { id: `created-${writes.length}`, ...body };
      links.push(created);
      return route.fulfill({ status: 201, json: created });
    });
    try {
      const address = `${preview.origin}/tests/fixtures/client-links-preview.html${variant.dark ? '?dark' : ''}`;
      await page.goto(address);
      await page.getByRole('link', { name: 'HISTORIAS', exact: false }).waitFor();
      const add = page.getByRole('button', { name: 'Añadir enlace', exact: true });
      assert.equal(await add.count(), 1, 'Adding must remain available when five or more links already exist');
      for (const title of ['POST SEPTIEMBRE 2026', 'Guía de marca']) {
        await add.click();
        const dialog = page.getByRole('dialog');
        await dialog.getByPlaceholder('Ej. Sitio Web').fill(title);
        await dialog.getByPlaceholder('https://...').fill(`https://example.com/nuevo-${writes.length + 1}`);
        await dialog.getByRole('button', { name: 'Guardar', exact: true }).click();
        await dialog.waitFor({ state: 'hidden' });
        await page.getByRole('link', { name: title, exact: false }).waitFor();
      }
      assert.equal(writes.length, 2);
      assert.deepEqual(links.slice(0, original.length), original);
      await page.reload();
      await page.getByRole('link', { name: 'Guía de marca', exact: false }).waitFor();
      assert.equal(await page.getByRole('link').count(), variant.count + 2);
      assert.equal(await add.count(), 1);
      assert.doesNotMatch(await page.locator('main').innerText(), /límite de enlaces|5\/5/i);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
      assert.deepEqual(errors, []);
      await page.screenshot({ path: `output/client-links/${variant.name}.png`, fullPage: true });
    } finally { await page.close(); }
  });
}
