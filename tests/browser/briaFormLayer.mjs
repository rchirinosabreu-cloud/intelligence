import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright-core';
import { createBriaPreview } from '../../scripts/preview-bria.js';

let preview, browser;
test.before(async () => {
  preview = await createBriaPreview({ port: 0 });
  browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
  await mkdir('output/bria-formularios', { recursive: true });
});
test.after(async () => { await browser?.close(); await preview?.close(); });

for (const variant of [{ name: 'claro', width: 1440 }, { name: 'oscuro', width: 1440, dark: true }, { name: 'movil', width: 390 }]) {
  test(`${variant.name}: a shared form stays above Bria and closing it preserves the conversation draft`, async () => {
    const page = await browser.newPage({ viewport: { width: variant.width, height: 900 } });
    page.setDefaultTimeout(10000);
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    try {
      await page.goto(`${preview.origin}/?abierta&sinavisos&formulario${variant.dark ? '&dark' : ''}`, { timeout: 120000 });
      const input = page.getByLabel('Mensaje para Bria');
      await input.fill('Conservar este borrador mientras registro un pago');
      // Programmatic opening also covers a module opening a form from a notification while
      // the mobile dock covers its launch button. Both real components remain mounted.
      await page.getByRole('button', { name: 'Abrir formulario de prueba' }).evaluate(button => button.click());
      const dialog = page.getByRole('dialog', { name: 'Formulario de prueba' });
      await dialog.waitFor();
      const save = page.locator('[data-preview-save]');
      await page.screenshot({ path: `output/bria-formularios/${variant.name}.png` });
      assert.equal(await dialog.evaluate(form => Number(getComputedStyle(form).zIndex) > Number(getComputedStyle(document.querySelector('[data-bria-assistant-panel]')).zIndex)), true,
        'the form must be visually above Bria even when Radix disables outside pointer events');
      assert.equal(await save.evaluate(button => {
        const r = button.getBoundingClientRect();
        return button.contains(document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2));
      }), true, 'the form action must receive the pointer, not the Bria panel');
      await page.getByLabel('Detalle del registro').fill('Soporte del registro');
      await page.keyboard.press('Tab');
      assert.equal(await page.evaluate(() => Boolean(document.activeElement?.closest('[role="dialog"]'))), true, 'keyboard focus stays in the modal');
      await save.click();
      await dialog.waitFor({ state: 'hidden' });
      assert.equal(await input.inputValue(), 'Conservar este borrador mientras registro un pago');
      assert.equal(await input.isVisible(), true);
      assert.deepEqual(errors, []);
    } finally { await page.close(); }
  });
}
