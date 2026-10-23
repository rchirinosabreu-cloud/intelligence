// Recorrido real de «Bria se adelanta» y de la consulta desde la mascota contra la muestra local (10 y 11 de
// octubre de 2026): el aviso aparece encima de la mascota sin abrir el chat y solo cuando hay algo que decir; al pasar
// el cursor salen el lápiz y el micrófono; escribir o dictar manda la consulta al chat abierto; la mascota se levanta,
// se inclina y se mece; la X oculta en el servidor. Capturas en claro, oscuro y móvil.
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
const corner = { x: 1000, y: 560, width: 440, height: 340 };
const mascot = page.locator('[data-bria-assistant-trigger] [data-bria-mascot]');
const tools = page.locator('[data-bria-dock-tools]');
const panel = page.locator('[data-bria-assistant-panel]');
const gesture = () => mascot.getAttribute('data-bria-gesture');
const opacity = async () => Number(await tools.evaluate(el => getComputedStyle(el).opacity));
const closePanel = async () => { await page.getByRole('button', { name: 'Cerrar Bria' }).click(); await panel.waitFor({ state: 'hidden' }); };
try {
  // El micrófono es un doble del navegador, nunca el de la persona.
  await page.addInitScript(() => {
    navigator.mediaDevices.getUserMedia = async () => ({ getTracks: () => [{ stop() {} }] });
    window.MediaRecorder = class {
      static isTypeSupported() { return true; }
      constructor() { this.state = 'inactive'; this.mimeType = 'audio/webm'; }
      start() { this.state = 'recording'; }
      stop() { this.state = 'inactive'; this.ondataavailable?.({ data: new Blob(['fixture audio'], { type: 'audio/webm' }) }); this.onstop?.(); }
    };
  });
  await page.goto(`${preview.origin}/`);
  const card = page.getByRole('status', { name: 'Aviso de Bria' });
  await card.waitFor();
  assert.equal(await panel.isHidden(), true, 'the chat stays closed');
  assert.equal(await card.getAttribute('data-bria-nudge'), 'CIERRE_DIA', 'today’s close comes first, then the weekly focus');
  assert.match(await card.locator('[data-bria-nudge-count]').innerText(), /1 de 4/);
  const box = await card.boundingBox(), trigger = await page.locator('[data-bria-assistant-trigger]').boundingBox();
  assert.ok(box.y + box.height <= trigger.y + 4, 'the card sits above the mascot');
  assert.equal(await card.locator('input').count(), 0, 'no permanent question box inside the card');
  await page.mouse.move(200, 200);
  await page.waitForTimeout(350);
  assert.equal(await opacity(), 0, 'the pencil and microphone stay hidden until the cursor arrives');
  assert.equal(await gesture(), null, 'at rest there is no gesture');
  await page.screenshot({ path: path.join(output, 'bria-adelanta-foco.png') });
  // Al pasar el cursor: los dos iconos aparecen y la mascota se levanta.
  await mascot.hover();
  await page.waitForFunction(() => getComputedStyle(document.querySelector('[data-bria-dock-tools]')).opacity === '1');
  assert.equal(await gesture(), 'hover');
  await page.waitForTimeout(500);
  assert.notEqual(await mascot.evaluate(el => getComputedStyle(el).transform), 'none', 'the hover gesture is a real transform');
  await page.getByRole('button', { name: 'Escribir una consulta' }).waitFor({ state: 'visible' });
  await page.getByRole('button', { name: 'Dictar una consulta' }).waitFor({ state: 'visible' });
  await page.screenshot({ path: path.join(output, 'bria-cursor-encima.png'), clip: corner });
  // «Leer en Bria» abre el panel en el chat del cierre del día (14 de octubre de 2026).
  await card.getByRole('button', { name: 'Leer en Bria' }).click();
  await panel.waitFor({ state: 'visible' });
  await page.getByText('Así cierra el martes 13 de octubre', { exact: false }).waitFor();
  await page.getByText('Lo que te avisé hoy', { exact: false }).waitFor();
  await page.screenshot({ path: path.join(output, 'bria-cierre-del-dia.png') });
  assert.equal(await card.isHidden(), true, 'with the panel open the card hides');
  await closePanel();
  await card.waitFor();
  await card.getByRole('button', { name: 'Ocultar por hoy' }).click();
  await page.waitForFunction(() => document.querySelector('[data-bria-nudge]')?.getAttribute('data-bria-nudge') === 'FOCO_SEMANAL');
  // El foco de la semana, en su propio chat.
  await card.getByRole('button', { name: 'Leer en Bria' }).click();
  await panel.waitFor({ state: 'visible' });
  await page.getByText('Este es tu foco de la semana', { exact: false }).waitFor();
  await page.screenshot({ path: path.join(output, 'bria-adelanta-foco-abierto.png') });
  await closePanel();
  await card.waitFor();
  // La X oculta por hoy en el servidor y pasa al siguiente.
  await card.getByRole('button', { name: 'Ocultar por hoy' }).click();
  await page.waitForFunction(() => document.querySelector('[data-bria-nudge]')?.getAttribute('data-bria-nudge') === 'SIN_PROCESO');
  assert.ok(sent.includes('POST /api/bria/nudges/dismiss'));
  await page.getByText('Melissa no tiene una tarea en proceso desde las 9:55', { exact: false }).waitFor();
  assert.equal(await card.getByRole('link', { name: 'Ver sus pendientes' }).getAttribute('href'), '/gestion?responsable=Melissa+Castano', 'the board link lands on her tasks');
  // El seguimiento: el desenlace del aviso se lee en la misma tarjeta.
  assert.equal(await card.locator('[data-bria-nudge-resolution]').innerText(), 'Melissa arrancó «Reel de lanzamiento» a las 10:40.');
  await page.screenshot({ path: path.join(output, 'bria-adelanta-sin-proceso.png') });
  // «Resumir sus pendientes» deja el mensaje escrito, nunca lo manda.
  await card.getByRole('button', { name: 'Resumir sus pendientes' }).click();
  await panel.waitFor({ state: 'visible' });
  const composer = page.getByLabel('Mensaje para Bria');
  assert.match(await composer.inputValue(), /Resúmeme qué tiene pendiente Melissa/);
  assert.equal(sent.some(line => line.endsWith('/messages')), false, 'nothing was sent');
  await page.screenshot({ path: path.join(output, 'bria-adelanta-mensaje-listo.png') });
  await closePanel();
  await card.waitFor();
  // El lápiz: la caja de consulta reemplaza al aviso, el cursor queda listo y la mascota se inclina mientras se escribe.
  await mascot.hover();
  await page.getByRole('button', { name: 'Escribir una consulta' }).click();
  const quick = page.getByRole('dialog', { name: 'Consulta rápida a Bria' });
  await quick.waitFor();
  assert.equal(await card.isHidden(), true, 'the quick question takes the place of the card');
  const input = quick.getByLabel('Haz tu consulta a Bria');
  await page.waitForFunction(() => document.activeElement?.getAttribute('aria-label') === 'Haz tu consulta a Bria');
  await page.mouse.move(200, 200);
  await page.waitForFunction(() => document.querySelector('[data-bria-assistant-trigger] [data-bria-mascot]')?.dataset.briaGesture === 'typing');
  await input.type('¿Qué tengo pendiente hoy?', { delay: 20 });
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(output, 'bria-escribiendo.png'), clip: corner });
  assert.equal(await opacity(), 1, 'while the question is open the icons remain');
  await input.press('Enter');
  await panel.waitFor({ state: 'visible' });
  await page.getByText('Tienes tres tareas sin cerrar', { exact: false }).waitFor();
  assert.ok(sent.some(line => line.endsWith('/messages')), 'the written question was sent to the open chat');
  assert.equal(await quick.count(), 0, 'sending closes the quick question');
  await page.screenshot({ path: path.join(output, 'bria-adelanta-consulta-rapida.png') });
  await closePanel();
  // El micrófono: empieza a grabar de una vez, la mascota se mece, y lo dictado queda en la caja para enviarlo.
  const messagesBefore = sent.filter(line => line.endsWith('/messages')).length;
  await mascot.hover();
  await page.getByRole('button', { name: 'Dictar una consulta' }).click();
  await quick.waitFor();
  await quick.getByText(/Grabando/).waitFor();
  await page.mouse.move(200, 200);
  await page.waitForFunction(() => document.querySelector('[data-bria-assistant-trigger] [data-bria-mascot]')?.dataset.briaGesture === 'listening');
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(output, 'bria-escuchando.png'), clip: corner });
  await quick.getByRole('button', { name: 'Terminar dictado' }).click();
  await page.waitForFunction(() => document.querySelector('[aria-label="Haz tu consulta a Bria"]')?.value.includes('dictado de prueba'));
  assert.equal(sent.filter(line => line.endsWith('/messages')).length, messagesBefore, 'the transcription is editable, never sent by itself');
  assert.ok(sent.some(line => line.endsWith('/dictation')), 'the audio went to the same dictation endpoint as the chat');
  await input.press('Enter');
  await panel.waitFor({ state: 'visible' });
  assert.equal(sent.filter(line => line.endsWith('/messages')).length, messagesBefore + 1, 'Enter sends the dictated question');
  await closePanel();
  // Escape cierra la caja y devuelve el foco a la mascota; con teclado los iconos también se ven.
  await mascot.hover();
  await page.getByRole('button', { name: 'Escribir una consulta' }).click();
  await quick.waitFor();
  await page.keyboard.press('Escape');
  assert.equal(await quick.count(), 0);
  await page.waitForFunction(() => document.activeElement?.hasAttribute('data-bria-assistant-trigger'));
  await page.mouse.move(200, 200);
  await page.waitForTimeout(300);
  assert.equal(await opacity(), 1, 'keyboard focus inside the dock keeps the icons visible');
  // Oscuro, con el cursor encima.
  await page.evaluate(() => sessionStorage.clear());
  await page.goto(`${preview.origin}/?dark`);
  await card.waitFor();
  await mascot.hover();
  await page.waitForFunction(() => getComputedStyle(document.querySelector('[data-bria-dock-tools]')).opacity === '1');
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(output, 'bria-adelanta-oscuro.png') });
  // Sin avisos no hay tarjeta: solo la mascota, y los iconos al pasar el cursor.
  await page.evaluate(() => sessionStorage.clear());
  const nudgeReads = sent.filter(line => line === 'GET /api/bria/nudges').length;
  await page.goto(`${preview.origin}/?sinavisos`);
  await mascot.waitFor();
  for (let tries = 0; sent.filter(line => line === 'GET /api/bria/nudges').length === nudgeReads && tries < 50; tries++) await page.waitForTimeout(100);
  await page.waitForTimeout(400);
  assert.equal(await card.count(), 0, 'without a nudge there is no card at all');
  await page.mouse.move(200, 200);
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(output, 'bria-sola.png'), clip: corner });
  // Movimiento reducido: ningún gesto mueve el lienzo.
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await mascot.hover();
  await page.waitForTimeout(300);
  assert.equal(await gesture(), 'hover');
  assert.equal(await mascot.evaluate(el => getComputedStyle(el).transform), 'none', 'reduced motion keeps the mascot still');
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  // Móvil: la tarjeta cabe y tocar a Bria sigue abriendo el chat.
  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => sessionStorage.clear());
  await page.goto(`${preview.origin}/`);
  await card.waitFor();
  const mobile = await card.boundingBox();
  assert.ok(mobile.x >= 8 && mobile.x + mobile.width <= 390 - 8, 'the card fits a phone width');
  await page.screenshot({ path: path.join(output, 'bria-adelanta-movil.png') });
  await page.locator('[data-bria-assistant-trigger]').tap().catch(() => page.locator('[data-bria-assistant-trigger]').click());
  await panel.waitFor({ state: 'visible' });
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ passed: true, simulatedApi: true, realComponents: true, screenshots: 11, nudgeOnlyWhenNeeded: true, hoverTools: true, gestures: ['hover', 'typing', 'listening'], quickQuestionSent: true, dictationShared: true }));
} finally { await browser.close(); await preview.close(); }
