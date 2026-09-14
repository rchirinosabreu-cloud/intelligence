import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright-core';
import { createRecognitionPreview } from '../../scripts/preview-recognitions.js';

let preview, browser;
before(async () => {
  preview = await createRecognitionPreview({ port: 0 });
  browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
  await mkdir('output/weekly-announcements', { recursive: true });
});
after(async () => { await browser?.close(); await preview?.close(); });

for (const mobile of [false, true]) test(`announcements clear at Bogota Monday midnight with history preserved (${mobile ? 'mobile dark' : 'desktop light'})`, async () => {
  const page = await browser.newPage({ viewport: mobile ? { width: 390, height: 844 } : { width: 1280, height: 850 }, isMobile: mobile, hasTouch: mobile, timezoneId: 'Asia/Tokyo', reducedMotion: 'reduce' });
  const errors = [], writes = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/api/**', route => { writes.push(route.request().method()); return route.abort(); });
  await page.clock.install({ time: new Date('2026-09-14T04:59:50Z') });
  await page.clock.pauseAt(new Date('2026-09-14T04:59:55Z'));
  try {
    await page.goto(`${preview.origin}/tests/fixtures/weekly-announcements.html${mobile ? '?dark' : ''}`, { timeout: 60000 });
    const board = page.locator('[data-announcements-preview]');
    await board.getByText('Recordatorio personal de la semana anterior.', { exact: true }).waitFor();
    assert.equal(await board.getByRole('article').count(), 2, 'still Sunday in Bogota, despite Monday in Tokyo');
    await page.clock.runFor(6000);
    await board.getByText('Sin anuncios esta semana', { exact: true }).waitFor({ timeout: 5000 });
    assert.equal(await board.getByRole('article').count(), 0);
    assert.equal(Math.round((await board.boundingBox()).height), 470, 'preserve the shared dashboard height');
    await page.screenshot({ path: `output/weekly-announcements/monday-${mobile ? 'mobile-dark' : 'desktop-light'}.png` });
    await page.getByRole('button', { name: 'Ver historial de anuncios' }).click();
    const history = page.getByRole('dialog');
    await history.getByText('Recordatorio personal de la semana anterior.', { exact: true }).waitFor();
    await history.getByText('Reunión general de la semana anterior.', { exact: true }).waitFor();
    await page.keyboard.press('Escape');
    await page.clock.runFor(500);
    await page.getByRole('button', { name: 'Añadir anuncio simulado' }).click();
    await board.getByText('Prioridades de la nueva semana.', { exact: true }).waitFor();
    assert.equal(await board.getByRole('article').count(), 1);
    await page.reload();
    await board.getByText('Sin anuncios esta semana', { exact: true }).waitFor();
    assert.deepEqual(writes, [], 'weekly reset must not delete or mutate announcements');
    assert.deepEqual(errors, []);
  } finally { await page.close(); }
});
