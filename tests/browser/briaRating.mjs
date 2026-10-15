// Recorrido real de «que Bria se mida» contra la muestra local (14 de octubre de 2026): cada respuesta de Bria lleva
// pulgar arriba y pulgar abajo junto a «Copiar»; el pulgar abajo se registra al instante y pregunta qué falló; la nota
// es opcional; el estado que se pinta es el que devolvió el servidor. Capturas en claro y oscuro.
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright-core';
import { createBriaPreview } from '../../scripts/preview-bria.js';

const output = process.env.SCREENSHOT_DIR || 'output/bria-rating'; await mkdir(output, { recursive: true });
const preview = await createBriaPreview({ port: 3744 });
const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } }), errors = [], sent = [];
page.on('pageerror', error => errors.push(error.message));
page.on('request', request => { if (request.url().includes('/rating')) sent.push({ method: request.method(), body: request.postDataJSON?.() }); });
const panel = page.locator('[data-bria-assistant-panel]');
const lastAnswer = () => page.locator('[data-conversation-turn="assistant"]').last();
try {
  await page.goto(`${preview.origin}/?abierta&sinavisos`);
  await panel.waitFor();
  await page.locator('header').getByRole('button', { name: 'Nueva conversación', exact: true }).click();
  await page.getByLabel('Mensaje para Bria', { exact: true }).fill('¿Qué tengo pendiente hoy?');
  await page.getByLabel('Mensaje para Bria', { exact: true }).press('Enter');
  await lastAnswer().waitFor();
  await page.waitForFunction(() => !document.querySelector('button[aria-label="Nueva conversación"]')?.disabled);
  const up = lastAnswer().getByRole('button', { name: 'Me sirvió', exact: true });
  const down = lastAnswer().getByRole('button', { name: 'No me sirvió', exact: true });
  assert.equal(await up.getAttribute('aria-pressed'), 'false');
  assert.equal(await down.getAttribute('aria-pressed'), 'false');
  await page.screenshot({ path: path.join(output, '1-respuesta-con-pulgares.png'), clip: { x: 1000, y: 0, width: 440, height: 900 } });

  await up.click();
  await page.waitForFunction(() => document.querySelector('[data-conversation-turn="assistant"] button[aria-label="Me sirvió"]')?.getAttribute('aria-pressed') === 'true');
  assert.equal(sent.length, 1); assert.equal(sent[0].body.rating, 'UP'); assert.match(sent[0].body.turnId, /:\d+$/);
  assert.equal(await page.locator('[data-bria-rating-note]').count(), 0, 'thumb up asks nothing');
  await page.screenshot({ path: path.join(output, '2-pulgar-arriba.png'), clip: { x: 1000, y: 0, width: 440, height: 900 } });

  await down.click();
  await page.locator('[data-bria-rating-note]').waitFor();
  assert.equal(await down.getAttribute('aria-pressed'), 'true', 'the thumb down is registered before any note');
  assert.equal(await up.getAttribute('aria-pressed'), 'false', 'one rating per answer');
  assert.equal(sent.length, 2); assert.equal(sent[1].body.rating, 'DOWN'); assert.equal('note' in sent[1].body, false);
  await page.screenshot({ path: path.join(output, '3-pulgar-abajo-pregunta.png'), clip: { x: 1000, y: 0, width: 440, height: 900 } });

  await page.getByLabel('¿Qué falló?', { exact: true }).fill('Se inventó la fecha de la primera tarea.');
  await page.getByRole('button', { name: 'Enviar', exact: true }).click();
  await page.locator('[data-bria-rating-note]').waitFor({ state: 'hidden' });
  assert.equal(sent.length, 3); assert.equal(sent[2].body.note, 'Se inventó la fecha de la primera tarea.'); assert.equal(sent[2].body.rating, 'DOWN');
  assert.equal(await down.getAttribute('aria-pressed'), 'true');
  await page.screenshot({ path: path.join(output, '4-nota-enviada.png'), clip: { x: 1000, y: 0, width: 440, height: 900 } });

  // Un chat recargado trae la valoración del servidor.
  await page.reload();
  await panel.waitFor();
  await lastAnswer().waitFor();
  assert.equal(await lastAnswer().getByRole('button', { name: 'No me sirvió', exact: true }).getAttribute('aria-pressed'), 'true', 'the rating survives a reload');

  await page.emulateMedia({ colorScheme: 'dark' });
  await page.goto(`${preview.origin}/?abierta&sinavisos&dark`);
  await panel.waitFor();
  await lastAnswer().waitFor();
  await lastAnswer().getByRole('button', { name: 'No me sirvió', exact: true }).click();
  await page.locator('[data-bria-rating-note]').waitFor();
  await page.screenshot({ path: path.join(output, '5-oscuro.png'), clip: { x: 1000, y: 0, width: 440, height: 900 } });

  assert.deepEqual(errors, []);
  console.log(`Recorrido de valoración completo. Capturas en ${path.resolve(output)}`);
} finally {
  await browser.close();
  await preview.close();
}
