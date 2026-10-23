// Dos pestañas reales del componente compartido, con persistencia y respuestas simuladas locales.
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright-core';
import { createBriaPreview } from '../../scripts/preview-bria.js';

const id = '0b9f4a52-1c3e-4d8e-9f00-123456789abc', output = 'output/bria-conversation-revision';
const initial = () => ({ id, title: 'Revisar una propuesta', revision: 1, turns: [{ id: 'a1', role: 'assistant', text: 'Propongo mover la entrega al lunes. ¿Lo hago así?', quickReplies: ['Confirmar', 'Cancelar'] }] });
let chat = initial(), writes = 0, calls = [];
const service = {
  list: async () => [{ id, title: chat.title, revision: chat.revision }],
  read: async () => structuredClone(chat), authorizeInput: async () => {},
  send: async ({ question, expectedRevision, files }) => {
    calls.push({ question, expectedRevision, files: files.map(file => file.originalname) });
    if (expectedRevision !== chat.revision) throw Object.assign(new Error('La conversación cambió. Revisa su última respuesta antes de confirmar.'), { status: 409, code: 'BRIA_CONVERSATION_STALE' });
    if (question === 'Confirmar') writes++;
    chat = { ...chat, revision: chat.revision + 1, turns: [...chat.turns, { id: `u${chat.revision}`, role: 'user', text: question }, { id: `a${chat.revision + 1}`, role: 'assistant', text: question === 'Confirmar' ? 'Listo, quedó hecho una vez.' : 'Cambio la propuesta: mover la entrega al viernes. ¿Lo hago así?', quickReplies: question === 'Confirmar' ? [] : ['Confirmar', 'Cancelar'] }] };
    return structuredClone(chat);
  }
};
const preview = await createBriaPreview({ port: 3736, conversationService: service });
const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true, args: ['--disable-background-networking'] });
await mkdir(output, { recursive: true });
try {
  for (const scenario of [{ name: 'sse-claro', stream: true, files: false, viewport: { width: 1280, height: 900 } }, { name: 'json-oscuro-movil', stream: false, files: true, viewport: { width: 390, height: 844 } }]) {
    chat = initial(); calls = []; writes = 0;
    const context = await browser.newContext({ viewport: scenario.viewport });
    // Ni fuentes remotas ni proveedores: toda la prueba se queda en el servidor local de muestra.
    await context.route('**/*', route => new URL(route.request().url()).origin === preview.origin ? route.continue() : route.abort());
    if (!scenario.stream) await context.route('**/api/bria/conversations/*/messages', route => route.continue({ headers: { ...route.request().headers(), accept: 'application/json' } }));
    const pages = [await context.newPage(), await context.newPage()], errors = [];
    for (const page of pages) {
      page.on('pageerror', error => errors.push(error.message));
      await page.goto(`${preview.origin}/?abierta${scenario.files ? '&dark' : ''}`);
      await page.getByText('Propongo mover la entrega al lunes. ¿Lo hago así?', { exact: true }).waitFor();
    }
    const [oldPage, freshPage] = pages;
    await freshPage.getByLabel('Mensaje para Bria', { exact: true }).fill('Mejor el viernes');
    await freshPage.getByLabel('Mensaje para Bria', { exact: true }).press('Enter');
    await freshPage.getByText('Cambio la propuesta: mover la entrega al viernes. ¿Lo hago así?', { exact: true }).waitFor();
    assert.equal(chat.revision, 2);
    if (scenario.files) {
      await oldPage.getByLabel('Archivos para Bria', { exact: true }).setInputFiles({ name: 'mi-nota.txt', mimeType: 'text/plain', buffer: Buffer.from('No perder este adjunto') });
      await oldPage.getByLabel('Mensaje para Bria', { exact: true }).fill('Confirmar');
      await oldPage.getByLabel('Mensaje para Bria', { exact: true }).press('Enter');
    } else await oldPage.getByRole('button', { name: 'Confirmar', exact: true }).click();
    await oldPage.getByRole('alert').filter({ hasText: 'La conversación cambió' }).waitFor();
    await oldPage.getByText('Cambio la propuesta: mover la entrega al viernes. ¿Lo hago así?', { exact: true }).waitFor();
    assert.equal(await oldPage.getByLabel('Mensaje para Bria', { exact: true }).inputValue(), 'Confirmar');
    if (scenario.files) assert.equal(await oldPage.getByRole('list', { name: 'Archivos por enviar' }).getByText('mi-nota.txt').count(), 1);
    assert.equal(writes, 0, 'un resumen nuevo nunca queda confirmado por el clic de la pestaña vieja');
    assert.deepEqual(calls.map(call => call.expectedRevision), [1, 1], 'refrescar no vuelve a enviar el mensaje');
    assert.equal(await oldPage.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
    await oldPage.screenshot({ path: `${output}/${scenario.name}.png` });
    if (scenario.files) await oldPage.getByRole('button', { name: 'Quitar mi-nota.txt' }).click();
    await oldPage.getByRole('button', { name: 'Confirmar', exact: true }).click();
    await oldPage.getByText('Listo, quedó hecho una vez.', { exact: true }).waitFor();
    assert.equal(writes, 1, 'solo el nuevo gesto explícito aprueba la revisión visible');
    assert.equal(calls.at(-1).expectedRevision, 2);
    assert.deepEqual(errors, []);
    await context.close();
  }
  const report = { passed: true, checks: ['SSE y JSON', 'Dos pestañas reales', 'Confirmación anterior rechazada sin ejecutar', 'Resumen actualizado sin reintento', 'Texto y adjuntos conservados', 'Nueva confirmación explícita', 'Claro, oscuro y móvil'], realModelRequests: 0, databaseRequests: 0 };
  await writeFile(`${output}/verification.json`, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report));
} finally { await browser.close(); await preview.close(); }
