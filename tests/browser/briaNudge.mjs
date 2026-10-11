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
  await page.getByText('Melissa no tiene una tarea en proceso desde las 9:55', { exact: false }).waitFor();
  assert.equal(await card.getByRole('link', { name: 'Ver sus pendientes' }).getAttribute('href'), '/gestion?responsable=Melissa%20Casta%C3%B1o', 'the board link lands on her tasks');
  await page.screenshot({ path: path.join(output, 'bria-adelanta-sin-proceso.png') });
  // «Que Bria me resuma lo que tiene» deja el mensaje escrito, nunca lo manda.
  await card.getByRole('button', { name: 'Que Bria me resuma lo que tiene' }).click();
  await page.locator('[data-bria-assistant-panel]').waitFor({ state: 'visible' });
  const composer = page.getByLabel('Mensaje para Bria');
  assert.match(await composer.inputValue(), /Resúmeme qué tiene pendiente Melissa/);
  assert.equal(sent.some(line => line.endsWith('/messages')), false, 'nothing was sent');
  await page.screenshot({ path: path.join(output, 'bria-adelanta-mensaje-listo.png') });
  // La consulta rápida: lo que la persona escribe en «Haz tu consulta» sí se envía, al chat abierto.
  await page.getByRole('button', { name: 'Cerrar' }).first().click().catch(() => page.keyboard.press('Escape'));
  await card.waitFor();
  const quick = card.getByLabel('Haz tu consulta a Bria');
  await quick.fill('¿Qué tengo pendiente hoy?'); await quick.press('Enter');
  await page.locator('[data-bria-assistant-panel]').waitFor({ state: 'visible' });
  await page.getByText('Tienes tres tareas sin cerrar', { exact: false }).waitFor();
  assert.ok(sent.some(line => line.endsWith('/messages')), 'the quick question was sent');
  await page.screenshot({ path: path.join(output, 'bria-adelanta-consulta-rapida.png') });
  // Oscuro y móvil, con el panel cerrado (el estado abierto se recuerda por sesión).
  await page.evaluate(() => sessionStorage.clear());
  await page.goto(`${preview.origin}/?dark`);
  await card.waitFor();
  await page.screenshot({ path: path.join(output, 'bria-adelanta-oscuro.png') });
  // Sin avisos, la tarjeta es solo la caja con el recordatorio de Bria.
  await page.evaluate(() => sessionStorage.clear());
  await page.goto(`${preview.origin}/?sinavisos`);
  await card.waitFor();
  assert.equal(await card.getAttribute('data-bria-nudge'), 'CONSULTA');
  await card.locator('[data-bria-quick-reminder]').waitFor();
  await page.screenshot({ path: path.join(output, 'bria-adelanta-solo-consulta.png') });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => sessionStorage.clear());
  await page.goto(`${preview.origin}/`);
  await card.waitFor();
  const mobile = await card.boundingBox();
  assert.ok(mobile.x >= 8 && mobile.x + mobile.width <= 390 - 8, 'the card fits a phone width');
  await page.screenshot({ path: path.join(output, 'bria-adelanta-movil.png') });
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ passed: true, simulatedApi: true, realComponents: true, screenshots: 8, nudgeAboveMascot: true, nothingSentByItself: true, quickQuestionSent: true }));
} finally { await browser.close(); await preview.close(); }
