// Volver a un chat de Bria lo deja en lo último conversado (Rodny, 23 de octubre de 2026: «cuando vuelvo a abrir un
// chat no me abre donde iba … debe quedar donde lo dejé»). Muestra local: scripts/preview-bria.js.
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright-core';
import { createBriaPreview } from '../../scripts/preview-bria.js';
const preview = await createBriaPreview({ port: 3734 });
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
await mkdir('output/bria-chat-scroll', { recursive: true });
const longAnswer = Array.from({ length: 40 }, (_, index) => `- Línea ${index + 1} de una respuesta larga, para que el chat tenga desplazamiento.`).join('\n');
const atBottom = (page) => page.evaluate(() => { const box = document.querySelector('[data-conversation-turn]')?.closest('.overflow-y-auto'); return box ? Math.round(box.scrollHeight - box.scrollTop - box.clientHeight) : null; });
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 860 } });
  const errors = []; page.on('pageerror', (error) => errors.push(error.message));
  await page.route('**/api/bria/conversations/*/messages', async (route) => {
    const original = await route.fetch(); const row = await original.json(); row.turns.at(-1).text = longAnswer;
    await route.fulfill({ response: original, json: row });
  });
  await page.goto(`${preview.origin}/?abierta`);
  for (const text of ['Primera pregunta', 'Segunda pregunta', 'Tercera pregunta']) {
    await page.getByLabel('Mensaje para Bria').fill(text);
    await page.getByLabel('Mensaje para Bria').press('Enter');
    await page.waitForFunction((count) => document.querySelectorAll('[data-conversation-turn="assistant"]').length >= count, 1);
    await page.waitForTimeout(300);
  }
  // Una respuesta que acaba de llegar se muestra desde su comienzo, para leerla.
  assert.ok((await atBottom(page)) > 40, 'la respuesta nueva se lee desde arriba, no desde el final');

  // Cerrar el panel y volver a abrirlo: queda en lo último conversado.
  await page.getByRole('button', { name: /Cerrar/ }).first().click();
  await page.locator('[data-bria-assistant-trigger]').click();
  await page.waitForTimeout(300);
  assert.ok((await atBottom(page)) <= 2, `al volver queda al final (faltaban ${await atBottom(page)} px)`);
  await page.screenshot({ path: 'output/bria-chat-scroll/al-volver.png' });
  assert.deepEqual(errors, []);
  console.log('Chat de Bria al volver: OK');
} finally {
  await browser.close(); await preview.close();
}
