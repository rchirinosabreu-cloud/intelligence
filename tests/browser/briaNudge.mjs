// Recorrido real de «Bria se adelanta» (10 de octubre de 2026) contra la muestra local: el aviso aparece encima de
// la mascota sin abrir el chat; «Pedírselo a Bria» deja el mensaje escrito; «Leer en Bria» abre el foco de la semana;
// la X lo oculta en el servidor. Capturas en claro, oscuro y móvil.
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright-core';
import { createBriaPreview } from '../../scripts/preview-bria.js';

const output = process.env.SCREENSHOT_DIR || 'output/bria-nudge'; await mkdir(output, { recursive: true });
const preview = await createBriaPreview({ port: 3743 });
const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } }), errors = [], sent = [];
page.on('pageerror', error => errors.push(error.message));
page.on('request', request => { if (request.url().includes('/api/bria/')) sent.push(`${request.method()} ${new URL(request.url()).pathname}`); });
try {
  await page.goto(`${preview.origin}/`);
  const card = page.getByRole('status', { name: 'Aviso de Bria' });
  await card.waitFor();
  assert.equal(await page.locator('[data-bria-assistant-panel]').isHidden(), true, 'the chat stays closed');
  assert.equal(await card.getAttribute('data-bria-nudge'), 'FOCO_SEMANAL', 'the weekly focus comes first');
  assert.match(await card.locator('[data-bria-nudge-count]').innerText(), /1 de 3/);
  const box = await card.boundingBox(), mascot = await page.locator('[data-bria-assistant-trigger]').boundingBox();
  assert.ok(box.y + box.height <= mascot.y + 4, 'the card sits above the mascot');
  await page.screenshot({ path: path.join(output, 'bria-adelanta-foco.png') });
  // «Leer en Bria» abre el panel en el chat del foco.
  await card.getByRole('button', { name: 'Leer en Bria' }).click();
  await page.locator('[data-bria-assistant-panel]').waitFor({ state: 'visible' });
  await page.getByText('Este es tu foco de la semana', { exact: false }).waitFor();
  await page.screenshot({ path: path.join(output, 'bria-adelanta-foco-abierto.png') });
  assert.equal(await card.isHidden(), true, 'with the panel open the card hides');
  await page.getByRole('button', { name: 'Cerrar' }).first().click().catch(() => page.keyboard.press('Escape'));
  await card.waitFor();
  // La X oculta por hoy en el servidor y pasa al siguiente.
  await card.getByRole('button', { name: 'Ocultar por hoy' }).click();
  await page.waitForFunction(() => document.querySelector('[data-bria-nudge]')?.getAttribute('data-bria-nudge') === 'SIN_PROCESO');
  assert.ok(sent.includes('POST /api/bria/nudges/dismiss'));
  await page.getByText('Melissa lleva 35 minutos', { exact: false }).waitFor();
  await page.screenshot({ path: path.join(output, 'bria-adelanta-sin-proceso.png') });
  // «Pedírselo a Bria» deja el mensaje escrito, nunca lo manda.
  await card.getByRole('button', { name: 'Pedírselo a Bria' }).click();
  await page.locator('[data-bria-assistant-panel]').waitFor({ state: 'visible' });
  const composer = page.getByLabel('Mensaje para Bria');
  assert.match(await composer.inputValue(), /escribirle a Melissa/);
  assert.equal(sent.some(line => line.endsWith('/messages')), false, 'nothing was sent');
  await page.screenshot({ path: path.join(output, 'bria-adelanta-mensaje-listo.png') });
  // Oscuro y móvil, con el panel cerrado (el estado abierto se recuerda por sesión).
  await page.evaluate(() => sessionStorage.clear());
  await page.goto(`${preview.origin}/?dark`);
  await card.waitFor();
  await page.screenshot({ path: path.join(output, 'bria-adelanta-oscuro.png') });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => sessionStorage.clear());
  await page.goto(`${preview.origin}/`);
  await card.waitFor();
  const mobile = await card.boundingBox();
  assert.ok(mobile.x >= 8 && mobile.x + mobile.width <= 390 - 8, 'the card fits a phone width');
  await page.screenshot({ path: path.join(output, 'bria-adelanta-movil.png') });
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ passed: true, simulatedApi: true, realComponents: true, screenshots: 6, nudgeAboveMascot: true, nothingSentByItself: true }));
} finally { await browser.close(); await preview.close(); }
