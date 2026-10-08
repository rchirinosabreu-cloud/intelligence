import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
import { createBriaPreview } from '../../scripts/preview-bria.js';
const preview = await createBriaPreview({ port: 3732 });
const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = []; page.on('pageerror', error => errors.push(error.message));
const panel = page.getByRole('region', { name: 'Conversación con Bria' });
const ready = () => page.waitForFunction(() => !document.querySelector('[aria-label="Nueva conversación"]')?.disabled);
try {
  // Recording is a browser fixture, never the user's microphone.
  await page.addInitScript(() => {
    window.__recordingStops = 0;
    navigator.mediaDevices.getUserMedia = async () => ({ getTracks: () => [{ stop() { window.__recordingStops++; } }] });
    window.MediaRecorder = class {
      static isTypeSupported() { return true; }
      constructor() { this.state = 'inactive'; this.mimeType = 'audio/webm'; }
      start() { this.state = 'recording'; }
      stop() { this.state = 'inactive'; this.ondataavailable?.({ data: new Blob(['fixture audio'], { type: 'audio/webm' }) }); this.onstop?.(); }
    };
  });
  await page.goto(`${preview.origin}/?abierta&role=admin`); await panel.waitFor(); await ready();
  const before = await panel.boundingBox();
  await page.getByRole('button', { name: 'Menú de Bria' }).click();
  assert.deepEqual(await page.getByRole('menuitem').allTextContents(), ['Chat', 'Historial', 'Registro']);
  const after = await panel.boundingBox(); assert.deepEqual(after, before, 'opening the menu never shifts the panel');
  await page.getByRole('menuitem', { name: 'Registro', exact: true }).click();
  await panel.getByRole('heading', { name: 'Registro', exact: true }).waitFor();
  await page.getByRole('button', { name: 'Volver a la conversación' }).click();
  const input = page.getByLabel('Mensaje para Bria');
  await page.locator('input[type=file]').setInputFiles({ name: 'brief.txt', mimeType: 'text/plain', buffer: Buffer.from('Fecha de prueba: jueves. No son datos de un cliente.') });
  await panel.getByRole('button', { name: 'Quitar brief.txt' }).waitFor();
  await input.fill('esto da error'); await input.press('Enter'); await ready();
  assert.equal(await panel.getByRole('button', { name: 'Quitar brief.txt' }).count(), 1, 'failed message preserves attachments');
  await input.fill('Revisa este brief'); await input.press('Enter'); await ready();
  assert.equal(await panel.getByRole('button', { name: 'Quitar brief.txt' }).count(), 0);
  await panel.getByRole('button', { name: 'Descargar brief.txt' }).waitFor();
  const original = Buffer.from('Fecha de prueba: jueves. No son datos de un cliente.');
  await page.route('**/api/bria/conversations/*/attachments/*', route => route.fulfill({ status: 200, contentType: 'application/octet-stream', body: original }));
  const attachmentDownload = page.waitForEvent('download', { timeout: 3000 });
  await panel.getByRole('button', { name: 'Descargar brief.txt' }).click();
  const downloaded = await attachmentDownload;
  assert.equal(downloaded.suggestedFilename(), 'brief.txt');
  const bytes = []; for await (const chunk of await downloaded.createReadStream()) bytes.push(chunk);
  assert.deepEqual(Buffer.concat(bytes), original, 'default attachment action downloads the same file');
  await input.fill('Mi contexto escrito.');
  await page.getByRole('button', { name: 'Grabar dictado' }).click();
  await page.getByRole('button', { name: 'Terminar dictado' }).waitFor();
  await page.getByRole('button', { name: 'Terminar dictado' }).click();
  await page.waitForFunction(() => document.querySelector('#bria-message')?.value.includes('dictado de prueba'));
  assert.match(await input.inputValue(), /^Mi contexto escrito\.[\s\S]*dictado de prueba/);
  assert.equal(await page.locator('[data-conversation-turn="user"]').count(), 1, 'transcription is editable, never sent automatically');
  await page.getByRole('button', { name: 'Grabar dictado' }).click();
  await page.getByRole('button', { name: 'Cancelar dictado' }).click();
  await page.getByRole('button', { name: 'Grabar dictado' }).waitFor();
  assert.ok(await page.evaluate(() => window.__recordingStops) >= 2, 'stop and cancel release microphone tracks');
  await page.evaluate(() => { navigator.mediaDevices.getUserMedia = () => new Promise(resolve => { window.__resolveMicrophone = () => resolve({ getTracks: () => [{ stop() { window.__recordingStops++; } }] }); }); });
  await page.getByRole('button', { name: 'Grabar dictado' }).click();
  await page.getByRole('button', { name: 'Cerrar Bria' }).click();
  await page.evaluate(() => window.__resolveMicrophone());
  await page.getByRole('button', { name: 'Preguntarle a Bria' }).click();
  await page.getByRole('button', { name: 'Grabar dictado' }).waitFor();
  assert.ok(await page.evaluate(() => window.__recordingStops) >= 3, 'closing while permission is pending releases the eventual stream');
  await page.goto(`${preview.origin}/?abierta`); await ready();
  await page.getByRole('button', { name: 'Menú de Bria' }).click();
  assert.deepEqual(await page.getByRole('menuitem').allTextContents(), ['Chat', 'Historial']);
  await page.keyboard.press('Escape');
  assert.equal(await page.getByRole('button', { name: 'Adjuntar archivos', exact: true }).count(), 1, 'PM may attach');
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ passed: true, simulatedApi: true, checks: ['Admin menu', 'PM registry hidden', 'Stable geometry', 'Multipart attachments', 'Failed draft preserved', 'Editable dictation', 'Microphone released'] }));
} finally { await browser.close(); await preview.close(); }
