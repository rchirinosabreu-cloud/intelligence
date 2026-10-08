import assert from 'node:assert/strict';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright-core';
import { zipSync, strToU8 } from 'fflate';
import XLSX from 'xlsx';
import { jsPDF } from 'jspdf';
import sharp from 'sharp';
const output = process.env.BRIA_BROWSER_OUTPUT;
if (!output) throw new Error('Indica una carpeta privada de capturas.');
await mkdir(output, { recursive: true });
const fixtures = path.join(output, 'media-fixtures'); await mkdir(fixtures, { recursive: true });
const book = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet([['Tipo', 'Dato'], ['DEMO FICTICIA', 'Fecha: jueves 22'], ['Cantidad', '3 piezas']]), 'Producción');
const pdf = new jsPDF(); pdf.text('FICTITIOUS DEMO. Color: yellow. No real client.', 12, 20);
const files = [
  ['demostracion.xlsx', XLSX.write(book, { type: 'buffer', bookType: 'xlsx' })],
  ['demostracion.pdf', Buffer.from(pdf.output('arraybuffer'))],
  ['demostracion.pptx', Buffer.from(zipSync({ 'ppt/slides/slide1.xml': strToU8('<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:t>DEMO FICTICIA. Canal: Instagram.</a:t></p:sld>') }))],
  ['demostracion.docx', Buffer.from(zipSync({ '[Content_Types].xml': strToU8('<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>'), '_rels/.rels': strToU8('<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>'), 'word/document.xml': strToU8('<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>DEMO FICTICIA. Responsable: Persona Demo. No guardar como aprendizaje.</w:t></w:r></w:p></w:body></w:document>') }))],
  ['demostracion.png', await sharp({ create: { width: 200, height: 120, channels: 3, background: 'yellow' } }).png().toBuffer()]
];
for (const [name, bytes] of files) await writeFile(path.join(fixtures, name), bytes);
const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } }), page = await context.newPage();
const errors = []; page.on('pageerror', error => errors.push(error.message));
const panel = page.getByRole('region', { name: 'Conversación con Bria' });
const ready = () => page.waitForFunction(() => !document.querySelector('[aria-label="Nueva conversación"]')?.disabled);
try {
  await page.goto('http://127.0.0.1:3017/'); await panel.waitFor(); await ready();
  await page.getByRole('button', { name: 'Nueva conversación', exact: true }).click(); await ready();
  await page.locator('input[type=file]').setInputFiles(files.map(([name]) => path.join(fixtures, name)));
  await page.getByLabel('Mensaje para Bria').fill('PRUEBA FICTICIA DE ADJUNTOS. Resume los datos de estos cinco archivos: fecha, cantidad, responsable, canal y color. Revisa también la imagen. Son datos inventados de demostración; no consultes clientes reales ni los guardes como aprendizaje.');
  const response = page.waitForResponse(res => /\/conversations\/[^/]+\/messages$/.test(res.url()) && res.request().method() === 'POST', { timeout: 180000 });
  await page.getByLabel('Mensaje para Bria').press('Enter');
  const received = await response; assert.equal(received.status(), 200, await received.text());
  const chat = await received.json(), answer = chat.turns.at(-1).text;
  assert.equal(chat.turns[0].attachments.length, 5);
  assert.match(answer, /jueves|22/i); assert.match(answer, /3|tres/i); assert.match(answer, /Persona Demo/i); assert.match(answer, /Instagram/i); assert.match(answer, /amarill|yellow/i);
  await ready(); await page.reload(); await panel.waitFor(); await ready();
  assert.equal(await page.getByRole('button', { name: /Descargar demostracion/ }).count(), 5);
  const download = await context.request.get(`http://127.0.0.1:3017/api/bria/conversations/${chat.id}/attachments/${chat.turns[0].attachments[0].id}`);
  assert.equal(download.status(), 200); assert.deepEqual(await download.body(), files[0][1]);
  assert.match(download.headers()['content-disposition'], /attachment/);
  const anonymous = await browser.newContext(); const denied = await anonymous.request.get(`http://127.0.0.1:3017/api/bria/conversations/${chat.id}/attachments/${chat.turns[0].attachments[0].id}`); assert.equal(denied.status(), 401); await anonymous.close();
  const before = await panel.boundingBox(); await page.getByRole('button', { name: 'Menú de Bria' }).click();
  assert.deepEqual(await page.getByRole('menuitem').allTextContents(), ['Chat', 'Historial', 'Registro']); assert.deepEqual(await panel.boundingBox(), before);
  await page.screenshot({ path: path.join(output, 'bria-menu-y-adjuntos.jpg'), type: 'jpeg', quality: 88 }); await page.keyboard.press('Escape');
  if (process.env.BRIA_TEST_AUDIO) {
    const audio = await readFile(process.env.BRIA_TEST_AUDIO);
    const dictation = await context.request.post('http://127.0.0.1:3017/api/bria/conversations/dictation', { multipart: { audio: { name: 'dictado-prueba.wav', mimeType: 'audio/wav', buffer: audio } } });
    assert.equal(dictation.status(), 200, await dictation.text()); const result = await dictation.json(); assert.match(result.text, /prueba|dictado|Brain|Bria/i);
    await writeFile(path.join(output, 'dictado-prueba-resultado.json'), JSON.stringify({ syntheticAudio: true, transcript: result.text }, null, 2));
  }
  await page.getByLabel('Mensaje para Bria').fill('PRUEBA FICTICIA: dime de nuevo la fecha y el responsable que estaban en mis archivos anteriores. No es conocimiento de clientes reales.');
  const followup = page.waitForResponse(res => /\/conversations\/[^/]+\/messages$/.test(res.url()) && res.request().method() === 'POST', { timeout: 180000 }); await page.getByLabel('Mensaje para Bria').press('Enter');
  const follow = await followup; assert.equal(follow.status(), 200, await follow.text()); const remembered = await follow.json(); assert.match(remembered.turns.at(-1).text, /Persona Demo/); assert.match(remembered.turns.at(-1).text, /22|jueves/i); await ready();
  await page.getByRole('button', { name: 'Modo oscuro' }).click(); await page.screenshot({ path: path.join(output, 'bria-dictado-adjuntos-oscuro.jpg'), type: 'jpeg', quality: 88 });
  await page.setViewportSize({ width: 390, height: 844 }); assert.equal(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth), 0); await page.screenshot({ path: path.join(output, 'bria-dictado-adjuntos-movil.jpg'), type: 'jpeg', quality: 88 });
  assert.deepEqual(errors, []);
  await writeFile(path.join(output, 'media-live-verification.json'), JSON.stringify({ passed: true, actualApi: true, syntheticFiles: true, realClientWrites: false, conversationId: chat.id, modelCalls: 2, syntheticDictation: !!process.env.BRIA_TEST_AUDIO, checks: ['Five readable formats', 'Native PDF/image vision', 'PostgreSQL file survival on reload', 'Byte-exact download', 'Anonymous denial', 'Stable menu', 'Prior file context', 'Dark and mobile'] }, null, 2));
  console.log(JSON.stringify({ passed: true, actualApi: true, modelCalls: 2, syntheticDictation: !!process.env.BRIA_TEST_AUDIO }));
} finally { await browser.close(); }
