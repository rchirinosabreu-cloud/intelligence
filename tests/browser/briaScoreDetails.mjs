import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { createServer } from 'vite';
import { chromium } from 'playwright-core';
const server = await createServer({ logLevel: 'error', server: { host: '127.0.0.1', port: 0 } });
let browser;
try {
  await mkdir('output', { recursive: true }); await server.listen();
  browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
  for (const [name, width, height, dark] of [['desktop', 1366, 1000, false], ['mobile', 390, 844, false], ['tablet', 768, 1024, false], ['mobile-dark', 390, 844, true]]) {
    const page = await browser.newPage({ viewport: { width, height }, reducedMotion: 'reduce' }); page.setDefaultTimeout(8000);
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.route('**/api/**', route => route.fulfill({ status: 404, json: { error: 'No API calls allowed in score fixture.' } }));
    await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/tests/fixtures/bria-score.html`);
    await page.evaluate(dark => document.documentElement.classList.toggle('dark', dark), dark);
    await page.getByRole('button', { name: 'Detalle del puntaje' }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByText('Nuestros diseños comunica tu idea.', { exact: true }).waitFor();
    await dialog.getByText('Alcance parcial', { exact: true }).waitFor();
    await dialog.getByText('Cálculo candidato', { exact: true }).waitFor();
    await page.evaluate(() => document.fonts.ready);
    await page.waitForFunction(() => { const element = document.querySelector('[role=dialog]'); return Number(getComputedStyle(element).opacity) === 1 && Math.abs(element.getBoundingClientRect().width - element.offsetWidth) < 1; });
    await page.screenshot({ path: `output/bria-score-${name}.png`, fullPage: true });
    const box = await dialog.boundingBox();
    assert.ok(box.x >= 0 && box.y >= 0 && box.x + box.width <= width && box.y + box.height <= height + 1);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await page.keyboard.press('Escape'); await dialog.waitFor({ state: 'hidden' });
    assert.deepEqual(errors, []); await page.close();
    console.log(`${name}: traceable quote, partial coverage, candidate label, no overflow, ESC OK`);
  }
} finally { await browser?.close(); await server.close(); }
