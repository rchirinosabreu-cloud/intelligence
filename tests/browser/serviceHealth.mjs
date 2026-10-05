import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright-core';
import { createServiceHealthPreview } from '../../scripts/preview-service-health.js';

// Recorrido real del semáforo de servicios (4 de octubre de 2026) sobre la muestra local: ruta, servicio
// y reglas reales, comprobaciones simuladas. Deja capturas en `SCREENSHOT_DIR` (por defecto output/semaforo).
const outDir = path.resolve(process.env.SCREENSHOT_DIR || 'output/semaforo');
await mkdir(outDir, { recursive: true });

const preview = await createServiceHealthPreview({ port: Number(process.env.SERVICE_HEALTH_PREVIEW_PORT || 3711) });
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe' });

const open = async ({ scenario, dark = false, width = 1440, height = 900 }) => {
  const page = await browser.newPage({ viewport: { width, height } });
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error' && !message.text().startsWith('Failed to load resource')) errors.push(message.text());
  });
  // El icono de la pestaña no existe en la muestra; cualquier otra respuesta fallida sí cuenta.
  page.on('response', (response) => {
    if (response.status() >= 400 && !response.url().endsWith('/favicon.ico')) errors.push(`${response.status()} ${response.url()}`);
  });
  await page.goto(`${preview.origin}/?escenario=${scenario}${dark ? '&dark' : ''}`);
  await page.getByRole('heading', { name: 'Estado de los servicios' }).waitFor();
  await page.waitForFunction(() => !document.body.textContent.includes('Leyendo el estado'));
  return { page, errors };
};

try {
  {
    const { page, errors } = await open({ scenario: 'problemas' });
    const lights = await page.locator('[data-service-light]').evaluateAll((cards) => cards.map((card) => card.getAttribute('aria-label')));
    assert.deepEqual(lights, ['Fireflies: Caído', 'OpenAI: Con problemas', 'Google Calendar y Meet: Con problemas', 'Correo: Con problemas']);
    await page.screenshot({ path: path.join(outDir, '1-problemas.png'), fullPage: true });

    await page.getByRole('button', { name: 'Ver los 12' }).click();
    assert.equal(await page.locator('[data-service-light]').count(), 12);
    await page.screenshot({ path: path.join(outDir, '2-problemas-todos.png'), fullPage: true });

    await page.getByRole('button', { name: 'Comprobar ahora' }).click();
    await page.getByText('Servicios comprobados.').waitFor();
    assert.deepEqual(errors, []);
    await page.close();
  }
  {
    const { page, errors } = await open({ scenario: 'bien' });
    assert.match(await page.textContent('body'), /Todos los servicios funcionan/);
    assert.equal(await page.locator('[data-service-light]').count(), 0, 'con todo bien no se pintan doce tarjetas');
    await page.screenshot({ path: path.join(outDir, '3-todo-bien.png'), fullPage: true });
    assert.deepEqual(errors, []);
    await page.close();
  }
  {
    const { page } = await open({ scenario: 'problemas', dark: true });
    await page.screenshot({ path: path.join(outDir, '4-oscuro.png'), fullPage: true });
    await page.close();
  }
  {
    const { page } = await open({ scenario: 'problemas', width: 390, height: 844 });
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    assert.equal(overflow, 0, 'sin desplazamiento horizontal en el celular');
    await page.screenshot({ path: path.join(outDir, '5-celular.png'), fullPage: true });
    await page.close();
  }
  console.log(`Semáforo de servicios: recorrido completo. Capturas en ${outDir}`);
} finally {
  await browser.close();
  await preview.close();
}
