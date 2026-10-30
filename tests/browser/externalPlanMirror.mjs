import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright-core';

// El espejo de las parrillas de MIO en Parrillas (29 de octubre de 2026), sobre la muestra local
// (npx vite --host 127.0.0.1 --port 3006 → /tests/fixtures/external-plan-preview.html). Capturas en output/recorrido-espejo-mio.
const BASE = process.env.PREVIEW_URL || 'http://127.0.0.1:3006/tests/fixtures/external-plan-preview.html';
const OUT = 'output/recorrido-espejo-mio';
let browser;
test.before(async () => {
  browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
  await mkdir(OUT, { recursive: true });
});
test.after(async () => { await browser?.close(); });

const open = async (query = '', options = {}) => {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 }, ...options });
  page.setDefaultTimeout(15000);
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(`${BASE}${query}`, { timeout: 90000, waitUntil: 'domcontentloaded' });
  return { page, errors };
};
const shot = (page, name) => page.screenshot({ path: `${OUT}/${name}.png`, fullPage: true });

test('la hoja de MIO aparece sola en Parrillas y su mes muestra piezas, cambios y comentarios', async () => {
  const { page, errors } = await open();
  await page.getByText('Villa Montaña').first().click();
  const november = page.locator('[data-external-month="noviembre-2026"]');
  await november.waitFor();
  assert.match(await november.innerText(), /Hoja de MIO · 16 piezas/);
  assert.match(await november.locator('[data-external-changes-count]').innerText(), /3 cambios/);
  assert.equal(await page.getByText('PLANIFICACION').count(), 0, 'la parrilla creada a mano para un mes de la hoja no se repite');
  await page.waitForTimeout(300);
  await shot(page, '01-lista');

  await november.click();
  await page.locator('[data-external-plan-view]').waitFor();
  await page.locator('[data-external-piece="4"]').waitFor();
  assert.equal(await page.locator('[data-external-piece]').count(), 4);
  assert.match(await page.locator('[data-external-changes]').innerText(), /Post 1: REVISIÓN DE CLIENTE → APROBADO/);
  const reel = page.locator('[data-external-piece="4"]');
  assert.match(await reel.innerText(), /En revisión/, 'el estado se nombra como en la plataforma');
  assert.match(await reel.locator('[data-google-comment="g1"]').innerText(), /cambien la canción/);
  assert.equal(await reel.locator('[data-piece-open-sheet]').getAttribute('href'), 'https://docs.google.com/spreadsheets/d/1gfXyBV33FSONj88kJyHklSOUZug1nbSGhOttqICQs0A/edit#gid=1098554346&range=A4');
  assert.match(await page.locator('[data-external-loose-comments]').innerText(), /Luna Bar/);
  await page.waitForTimeout(400);
  await shot(page, '02-mes');

  await page.locator('[data-external-refresh]').click();
  await page.getByText('Hoja de MIO leída.').waitFor();
  await page.waitForTimeout(200);
  assert.deepEqual(errors, []);
  await page.close();
});

test('desde la plataforma se cambia el estado en la hoja y se responde un comentario', async () => {
  const { page, errors } = await open('?ruta=hoja');
  const reel = page.locator('[data-external-piece="4"]');
  await reel.waitFor();
  await reel.locator('[data-piece-status-picker] [data-brain-select="true"]').click();
  await page.getByRole('option', { name: 'APROBADO' }).click();
  await page.getByText('Estado cambiado a APROBADO en la hoja.').waitFor();
  assert.match(await reel.innerText(), /Aprobada/, 'el estado nuevo se ve en cuanto la hoja lo confirma');

  await reel.locator('[data-reply-open]').click();
  await reel.locator('[data-reply-text]').fill('Perfecto, ya cambiamos la canción.');
  await reel.locator('[data-reply-resolve]').check();
  await page.waitForTimeout(200);
  await shot(page, '05-respondiendo');
  await reel.locator('[data-reply-send]').click();
  await page.getByText('Respuesta publicada en la hoja.').waitFor();
  assert.match(await reel.locator('[data-google-comment="g1"]').innerText(), /Rodny Chirinos \(Brain Studio\): Perfecto, ya cambiamos la canción\./);
  assert.match(await reel.locator('[data-google-comment="g1"]').innerText(), /Resuelto/);
  assert.match(await page.locator('[data-external-edits]').innerText(), /Hecho desde la plataforma \(2\)/);
  await page.waitForTimeout(300);
  await shot(page, '06-despues-de-escribir');
  assert.deepEqual(errors, []);
  await page.close();

  const readOnly = await open('?ruta=hoja&soloLectura');
  await readOnly.page.locator('[data-external-piece="4"]').waitFor();
  assert.equal(await readOnly.page.locator('[data-piece-status-picker]').count(), 0, 'sin cuenta de Google no se ofrece escribir');
  assert.equal(await readOnly.page.locator('[data-reply-open]').count(), 0);
  await readOnly.page.close();
});

test('en oscuro y en el celular se lee entero', async () => {
  const dark = await open('?ruta=hoja&dark');
  await dark.page.locator('[data-external-piece="6"]').waitFor();
  await dark.page.waitForTimeout(400);
  await shot(dark.page, '03-oscuro');
  await dark.page.close();

  const phone = await open('?ruta=hoja', { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  await phone.page.locator('[data-external-piece="6"]').waitFor();
  assert.equal(await phone.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, 'sin desplazamiento horizontal');
  await phone.page.waitForTimeout(400);
  await shot(phone.page, '04-celular');
  await phone.page.close();
});
