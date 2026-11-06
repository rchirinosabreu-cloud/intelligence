// Recorrido real del visor de PDF (30 de octubre de 2026, al subir pdf.js de la 5 a la 6).
//
// Comprueba lo único que no se ve al compilar ni en una prueba de nodo: que el worker y la librería sean de la misma
// versión y que el PDF se pinte de verdad. Si no coincidieran, pdf.js falla con «The API version does not match the
// Worker version» y el lienzo queda en blanco — que es lo que habría pasado en producción al fusionar el PR a secas.
//
//   npx vite --host 127.0.0.1 --port 3031 --strictPort
//   node tests/browser/pdfViewer.mjs
import { mkdir } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';

const BASE = `${process.env.PREVIEW_URL || 'http://127.0.0.1:3031'}/tests/fixtures/pdf-viewer-preview.html`;
const OUT = process.env.SHOT_DIR || 'output/visor-pdf';
await mkdir(OUT, { recursive: true });

const browser = await chromium.launch({ channel: 'chrome' });
const problems = [];
const noise = /Failed to load resource/i;

try {
  for (const tema of ['light', 'dark']) {
    const context = await browser.newContext({ viewport: { width: 1100, height: 1000 }, colorScheme: tema });
    const page = await context.newPage();
    page.on('console', (msg) => { if (msg.type() === 'error' && !noise.test(msg.text())) problems.push(`${tema}: ${msg.text()}`); });
    page.on('pageerror', (error) => { if (!noise.test(error.message)) problems.push(`${tema}: ${error.message}`); });
    await page.goto(`${BASE}?tema=${tema}`, { waitUntil: 'commit' });

    // Las dos páginas del PDF se dibujan en sendos lienzos.
    await page.waitForSelector('[data-pdf-viewer] canvas', { timeout: 60000 });
    await page.waitForFunction(() => document.querySelectorAll('[data-pdf-viewer] canvas').length >= 2, { timeout: 20000 });

    // Y pintan de verdad: un lienzo en blanco pasaría el selector pero no esto.
    const pintado = await page.evaluate(() => {
      const canvas = document.querySelector('[data-pdf-viewer] canvas');
      const pixels = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
      let tinta = 0;
      for (let i = 0; i < pixels.length; i += 4) if (pixels[i] < 200 || pixels[i + 1] < 200 || pixels[i + 2] < 200) tinta += 1;
      return { tinta, ancho: canvas.width, alto: canvas.height };
    });
    assert.ok(pintado.tinta > 500, `el lienzo salió casi vacío (${pintado.tinta} píxeles con tinta)`);

    const version = await page.locator('[data-pdfjs-version]').textContent();
    assert.match(version, /pdf\.js 6\./, 'tiene que estar corriendo la versión nueva');

    // Cargar el primer documento no prueba su cierre: el fallo productivo ocurría
    // al liberar un PDF ya abierto, tanto al sustituirlo como al salir del visor.
    await page.getByRole('button', { name: 'Abrir otro PDF' }).click();
    await page.waitForFunction(() => document.querySelectorAll('[data-pdf-viewer] canvas').length === 2);
    await page.getByRole('button', { name: 'Cerrar PDF' }).click();
    assert.equal(await page.locator('[data-pdf-viewer] canvas').count(), 0);
    await page.getByRole('button', { name: 'Abrir otro PDF' }).click();
    await page.waitForFunction(() => document.querySelectorAll('[data-pdf-viewer] canvas').length === 2);
    assert.deepEqual(problems, [], 'cambiar, cerrar y volver a abrir no puede romper la pantalla');
    await page.waitForFunction(() => {
      const canvas = document.querySelector('[data-pdf-viewer] canvas');
      if (!canvas?.width || !canvas.height) return false;
      const pixels = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
      let ink = 0;
      for (let i = 0; i < pixels.length; i += 4) if (pixels[i + 3] && (pixels[i] < 200 || pixels[i + 1] < 200 || pixels[i + 2] < 200)) ink++;
      return ink > 500;
    });

    await page.screenshot({ path: `${OUT}/visor-${tema}.png` });
    console.log(`${tema}: ${version.trim()} · ${pintado.tinta} píxeles con tinta en la primera página`);
    await context.close();
  }

  // Cerrar mientras aún se importa el worker no debe crear un worker huérfano
  // al terminar esa importación, ni impedir abrir otro documento después.
  const context = await browser.newContext();
  const page = await context.newPage();
  let releaseImport, importSeen, importTimer;
  const held = new Promise(resolve => { releaseImport = resolve; });
  const seen = new Promise(resolve => { importSeen = resolve; });
  let workers = 0;
  page.on('worker', () => workers++);
  page.on('pageerror', error => problems.push(`cierre durante carga: ${error.message}`));
  await page.route('**/pdf.worker.min.mjs?*', async route => {
    if (new URL(route.request().url()).searchParams.has('url')) {
      importSeen();
      await held;
    }
    await route.continue();
  });
  try {
    await page.goto(BASE, { waitUntil: 'commit' });
    await Promise.race([seen, new Promise((_, reject) => { importTimer = setTimeout(() => reject(new Error('No se solicitó el worker')), 10000); })]);
    clearTimeout(importTimer);
    await page.getByRole('button', { name: 'Cerrar PDF' }).click();
    releaseImport();
    await page.waitForTimeout(1000);
    assert.equal(workers, 0, 'el visor cerrado no debe iniciar la carga del documento');
    await page.getByRole('button', { name: 'Abrir otro PDF' }).click();
    await page.waitForSelector('[data-pdf-viewer] canvas');
    await page.getByRole('button', { name: 'Cerrar PDF' }).click();
  } finally { clearTimeout(importTimer); releaseImport(); await context.close(); }

  assert.deepEqual(problems, [], 'la consola no puede traer errores');
  console.log(`Visor de PDF verificado. Capturas en ${OUT}`);
} catch (error) {
  console.error(JSON.stringify({ problems }));
  throw error;
} finally {
  await browser.close();
}
