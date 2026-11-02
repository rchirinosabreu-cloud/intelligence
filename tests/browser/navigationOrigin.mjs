import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright-core';
import { createClientOperationsPreview } from '../../scripts/preview-client-operations.js';

// «Viajar y regresar» (Rodny, 30 de octubre de 2026), sobre la muestra de Operación: una pieza se mira sin salir de la
// página del cliente; abrirla en la parrilla ofrece «Volver a Operación · …», que deja la página donde estaba.
// Capturas en output/recorrido-volver.
const OUT = 'output/recorrido-volver';
let browser;
let preview;
test.before(async () => {
  preview = await createClientOperationsPreview({ port: 0 });
  browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
  await mkdir(OUT, { recursive: true });
});
test.after(async () => { await browser?.close(); await preview?.close(); });

const open = async (path, options = {}) => {
  const page = await browser.newPage({ viewport: { width: 1280, height: 860 }, ...options });
  page.setDefaultTimeout(20000);
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(`${preview.origin}${path}`, { timeout: 90000, waitUntil: 'domcontentloaded' });
  return { page, errors };
};
const shot = (page, name, fullPage = false) => page.screenshot({ path: `${OUT}/${name}.png`, fullPage });

test('una pieza de la plataforma se mira en una ventana sin salir de Operación', async () => {
  const { page, errors } = await open('/clientes/operacion/titanes');
  const row = page.locator('[data-piece-peek-open="titanes-1"]');
  await row.scrollIntoViewIfNeeded();
  await row.click();
  const dialog = page.locator('[data-piece-peek]');
  await dialog.locator('[data-piece-peek-native]').waitFor();
  assert.match(await dialog.innerText(), /Un día con el equipo/);
  assert.match(await dialog.innerText(), /Guion · solo el equipo/);
  assert.match(await dialog.innerText(), /cambien la canción/, 'el feedback del cliente se ve en la ventana');
  assert.equal(new URL(page.url()).pathname, '/clientes/operacion/titanes', 'mirar la pieza no cambia de página');
  await page.waitForTimeout(300);
  await shot(page, '01-vista-rapida');
  await page.keyboard.press('Escape');
  await dialog.waitFor({ state: 'detached' });
  assert.deepEqual(errors, []);
  await page.close();
});

test('abrir la pieza en la parrilla ofrece volver, y volver deja la página donde estaba', async () => {
  const { page, errors } = await open('/clientes/operacion/titanes');
  const row = page.locator('[data-piece-peek-open="titanes-4"]');
  await row.scrollIntoViewIfNeeded();
  await page.evaluate(() => window.scrollBy(0, 120));
  await page.waitForTimeout(300);
  const before = await page.evaluate(() => window.scrollY);
  assert.ok(before > 200, 'la prueba parte con la página bajada');
  await row.click();
  await page.locator('[data-piece-peek-open]:not([data-piece-peek-open^="titanes"])').click();
  await page.locator('[data-preview-destination]').waitFor();
  assert.equal(new URL(page.url()).pathname, '/parrillas/plan-titanes');
  const back = page.locator('[data-back-to-origin] button');
  assert.equal((await back.innerText()).trim(), 'Volver a Operación · Corporación Deportiva Titanes');
  await page.waitForTimeout(300);
  await shot(page, '02-volver-arriba');

  await back.click();
  await page.locator('[data-piece-peek-open="titanes-4"]').waitFor();
  await page.waitForTimeout(900);
  const after = await page.evaluate(() => window.scrollY);
  assert.ok(Math.abs(after - before) < 8, `vuelve a la misma altura (antes ${before}, después ${after})`);
  assert.equal(await page.locator('[data-back-to-origin]').count(), 0, 'de vuelta en el origen no se ofrece volver');
  await shot(page, '03-de-vuelta');

  // «Atrás» del navegador también vuelve a la altura de la página.
  await page.goBack();
  await page.locator('[data-preview-destination]').waitFor();
  await page.goBack();
  await page.locator('[data-piece-peek-open="titanes-4"]').waitFor();
  await page.waitForTimeout(900);
  assert.ok(Math.abs(await page.evaluate(() => window.scrollY) - before) < 8, 'atrás también deja la página donde estaba');
  assert.deepEqual(errors, []);
  await page.close();
});

test('una pieza de la hoja de MIO se mira igual, y en oscuro y en el celular se lee entera', async () => {
  const { page, errors } = await open('/clientes/operacion/lettufresh?dark');
  const row = page.locator('[data-piece-peek-open]').first();
  await row.scrollIntoViewIfNeeded();
  await row.click();
  const dialog = page.locator('[data-piece-peek]');
  await dialog.waitFor();
  await dialog.locator('[data-external-piece]').waitFor();
  assert.match(await dialog.innerText(), /de la hoja de MIO/);
  assert.match(await dialog.innerText(), /Abrir en Parrillas/);
  assert.equal(await dialog.locator('[data-piece-status-picker]').count(), 0, 'la vista rápida no cambia nada: solo se mira');
  await page.waitForTimeout(300);
  await shot(page, '04-hoja-oscuro');
  await page.close();

  const phone = await open('/clientes/operacion/titanes', { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const phoneRow = phone.page.locator('[data-piece-peek-open="titanes-1"]');
  await phoneRow.scrollIntoViewIfNeeded();
  await phoneRow.click();
  await phone.page.locator('[data-piece-peek]').waitFor();
  await phone.page.waitForTimeout(300);
  assert.equal(await phone.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, 'sin desplazamiento horizontal');
  await shot(phone.page, '05-celular');
  assert.deepEqual([...errors, ...phone.errors], []);
  await phone.page.close();
});
