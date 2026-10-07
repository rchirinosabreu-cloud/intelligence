import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright-core';
import { createBriaPreview } from '../../scripts/preview-bria.js';

// Recorrido real de «Preguntarle a Bria» (6 de octubre de 2026) sobre la muestra local: el componente real
// contra una API simulada. Deja capturas en `SCREENSHOT_DIR` (por defecto output/bria-asistente).
const outDir = path.resolve(process.env.SCREENSHOT_DIR || 'output/bria-asistente');
await mkdir(outDir, { recursive: true });

const preview = await createBriaPreview({ port: Number(process.env.BRIA_PREVIEW_PORT || 3721) });
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe' });

const open = async ({ query = '', dark = false, width = 1440, height = 900 }) => {
  const page = await browser.newPage({ viewport: { width, height } });
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error' && !message.text().startsWith('Failed to load resource') && !message.text().includes('[BriaAssistant]')) errors.push(message.text());
  });
  page.on('response', (response) => {
    if (response.status() >= 400 && !response.url().endsWith('/favicon.ico') && !response.url().includes('/api/bria/ask')) errors.push(`${response.status()} ${response.url()}`);
  });
  await page.goto(`${preview.origin}/?${query}${dark ? '&dark' : ''}`);
  try {
    // El primer arranque de Vite optimiza dependencias y puede tardar más que una espera normal.
    // Con el diálogo abierto, el resto de la página queda oculto para accesibilidad: se espera al diálogo.
    const target = query.includes('abierta') ? page.getByRole('dialog') : page.getByRole('button', { name: 'Preguntarle a Bria' });
    await target.waitFor({ timeout: 120_000 });
  } catch (error) {
    console.error('La muestra no pintó el botón de Bria.', { errors, body: (await page.textContent('body'))?.slice(0, 300) });
    throw error;
  }
  return { page, errors };
};

const ask = async (page, question) => {
  const input = page.getByLabel('Tu pregunta para Bria');
  await input.fill(question);
  await input.press('Enter');
};

try {
  {
    const { page, errors } = await open({});
    await page.getByRole('button', { name: 'Preguntarle a Bria' }).click();
    await page.getByRole('dialog').waitFor();
    assert.ok(await page.getByLabel('Tu pregunta para Bria').evaluate((node) => node === document.activeElement), 'el foco entra al campo de la pregunta');
    assert.match(await page.getByRole('dialog').textContent(), /Hola, Kamila/);
    await page.screenshot({ path: path.join(outDir, '1-vacio.png') });

    await ask(page, '¿Qué tengo pendiente hoy?');
    await page.locator('[data-bria-busy]').waitFor();
    await page.locator('[data-bria-turn="assistant"]').waitFor();
    const dialogText = await page.getByRole('dialog').textContent();
    assert.match(dialogText, /Subir los videos de Nattal/);
    assert.equal(await page.getByRole('list', { name: 'Fuentes de la respuesta' }).getByRole('button').count(), 3);
    assert.equal(await page.getByLabel('Tu pregunta para Bria').inputValue(), '', 'el campo queda vacío tras responder');
    await page.screenshot({ path: path.join(outDir, '2-respuesta.png') });

    await page.getByRole('list', { name: 'Fuentes de la respuesta' }).getByRole('button', { name: /Subir los videos de Nattal/ }).click();
    await page.getByRole('dialog').waitFor({ state: 'hidden' });
    assert.match(await page.locator('[data-preview-location]').textContent(), /\/gestion\?taskId=t1/, 'la fuente lleva al sitio de la plataforma');
    await page.screenshot({ path: path.join(outDir, '3-fuente.png') });

    // Un fallo del servidor: aviso, la pregunta vuelve al campo y no queda burbuja huérfana.
    await page.getByRole('button', { name: 'Preguntarle a Bria' }).click();
    await page.getByRole('dialog').waitFor();
    const turnsBefore = await page.locator('[data-bria-turn]').count();
    await ask(page, 'esto da error');
    await page.getByText('Bria no pudo responder').first().waitFor();
    await page.waitForFunction((expected) => document.querySelectorAll('[data-bria-turn]').length === expected, turnsBefore);
    assert.equal(await page.getByLabel('Tu pregunta para Bria').inputValue(), 'esto da error', 'lo escrito no se pierde');
    await page.screenshot({ path: path.join(outDir, '4-error.png') });
    assert.deepEqual(errors, []);
    await page.close();
  }
  {
    const { page, errors } = await open({ query: 'abierta', dark: true });
    await page.getByRole('dialog').waitFor();
    await page.getByRole('button', { name: '¿Cómo va la parrilla de este mes de Endova?' }).click();
    await page.locator('[data-bria-turn="assistant"]').waitFor();
    assert.match(await page.getByRole('dialog').textContent(), /Una parte de la consulta falló \(la memoria de reuniones\)/);
    await page.screenshot({ path: path.join(outDir, '5-oscuro.png') });
    assert.deepEqual(errors, []);
    await page.close();
  }
  {
    const { page } = await open({ query: 'abierta', width: 390, height: 844 });
    await page.getByRole('dialog').waitFor();
    await ask(page, '¿Qué sale esta semana en redes?');
    await page.locator('[data-bria-turn="assistant"]').waitFor();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    assert.equal(overflow, 0, 'sin desplazamiento horizontal en el celular');
    await page.screenshot({ path: path.join(outDir, '6-celular.png') });
    await page.close();
  }
  console.log(`Preguntarle a Bria: recorrido completo. Capturas en ${outDir}`);
} finally {
  await browser.close();
  await preview.close();
}
