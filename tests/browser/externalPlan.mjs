import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright-core';

// Lectura de las parrillas de MIO (Rodny, 29 de octubre de 2026), sobre la muestra de Operación de clientes
// (node scripts/preview-client-operations.js --port=3700, «hoy» es el 2 de octubre de 2026). Lettufresh tiene su
// parrilla en una hoja de Google. Capturas en output/recorrido-parrilla-mio.
const BASE = process.env.CLIENT_OPERATIONS_URL || 'http://127.0.0.1:3700';
const OUT = 'output/recorrido-parrilla-mio';
let browser;
test.before(async () => {
  browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
  await mkdir(OUT, { recursive: true });
});
test.after(async () => { await browser?.close(); });

const open = async (query = '', options = {}) => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, ...options });
  page.setDefaultTimeout(15000);
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(`${BASE}/clientes/operacion/lettufresh${query}`, { timeout: 90000, waitUntil: 'domcontentloaded' });
  await page.locator('[data-external-plan]').waitFor({ timeout: 60000 });
  return { page, errors };
};
const shot = (page, name) => page.screenshot({ path: `${OUT}/${name}.png`, fullPage: true });

test('el avance del mes sale de la hoja de MIO, se puede leer de nuevo y un cierre se reabre', async () => {
  const { page, errors } = await open();
  assert.match(await page.locator('[data-cycle-source="HOJA_MIO"]').innerText(), /Leído de la hoja de MIO, pestaña OCTUBRE/);
  const sheet = page.locator('[data-external-plan]');
  assert.match(await sheet.innerText(), /Octubre: 13 piezas/);
  assert.match(await sheet.innerText(), /Noviembre: 12 piezas/);
  assert.equal(await page.getByRole('button', { name: 'Ya se publicó' }).count(), 0, 'una pieza de la hoja no se marca publicada aquí');
  await page.waitForTimeout(300);
  await shot(page, '01-cliente-de-mio');

  await sheet.locator('[data-external-plan-refresh]').click();
  await page.getByText('Hoja de MIO leída.').waitFor();

  const september = page.locator('[data-history-close="Septiembre"]');
  await september.locator('[data-close-open]').click();
  await page.locator('[data-close-confirm]').click();
  await september.locator('[data-close-status="confirmed"]').waitFor();
  await september.locator('[data-close-reopen]').click();
  await page.getByText('Cierre de septiembre reabierto.').waitFor();
  await september.locator('[data-close-open]').waitFor();
  await shot(page, '02-cierre-reabierto');

  await page.getByRole('button', { name: 'Editar' }).first().click();
  const url = page.locator('[data-external-plan-url]');
  await url.waitFor();
  assert.match(await url.inputValue(), /docs\.google\.com\/spreadsheets/);
  await page.waitForTimeout(200);
  await shot(page, '03-enlace-en-la-ficha');
  assert.deepEqual(errors, []);
  await page.close();
});

test('en oscuro y en el celular se lee entero', async () => {
  const dark = await open('?dark');
  await dark.page.waitForTimeout(300);
  await shot(dark.page, '04-oscuro');
  await dark.page.close();

  const phone = await open('', { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  assert.equal(await phone.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, 'sin desplazamiento horizontal');
  await shot(phone.page, '05-celular');
  await phone.page.close();
});
