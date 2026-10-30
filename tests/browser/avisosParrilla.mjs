// Recorrido real de los avisos de parrilla en la banda (Rodny, 30 de octubre de 2026).
//
// Se monta la banda de verdad (`ImportantNoticeBand`) y lo único ficticio es lo que responde el servidor. Se comprueba
// lo que no se ve en una prueba de nodo: que un aviso de parrilla **no** ofrece «Ya hice seguimiento» sino abrir la
// parrilla, que «Recordarme» sigue al final y que el salmón solo sale cuando el mes se está cerrando.
//
//   npx vite --host 127.0.0.1 --port 3021 --strictPort
//   node tests/browser/avisosParrilla.mjs
import { mkdir } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';

const BASE = `${process.env.PREVIEW_URL || 'http://127.0.0.1:3021'}/tests/fixtures/avisos-parrilla-preview.html`;
const OUT = process.env.SHOT_DIR || 'output/avisos-parrilla';
await mkdir(OUT, { recursive: true });

const browser = await chromium.launch({ channel: 'chrome' });
const problems = [];
// Una muestra suelta no tiene icono de pestaña: ese 404 es del favicon, no del aviso.
const noise = /Failed to load resource/i;

const open = async (context, caso, tema = 'light') => {
  const page = await context.newPage();
  page.on('console', (msg) => { if (msg.type() === 'error' && !noise.test(msg.text())) problems.push(`${caso}: ${msg.text()}`); });
  page.on('pageerror', (error) => { if (!noise.test(error.message)) problems.push(`${caso}: ${error.message}`); });
  await page.goto(`${BASE}?caso=${caso}&tema=${tema}`, { waitUntil: 'networkidle' });
  await page.waitForSelector('[data-important-notice]');
  return page;
};

try {
  for (const tema of ['light', 'dark']) {
    const context = await browser.newContext({ viewport: { width: 1280, height: 860 }, colorScheme: tema });

    // 1. El mes cerrando: salmón, y el botón principal abre la parrilla.
    const cierre = await open(context, 'cierre', tema);
    assert.equal(await cierre.getAttribute('[data-important-notice]', 'data-level'), 'IMPORTANTE');
    assert.equal(await cierre.locator('[data-notice-action="open-plan"]').textContent(), 'Abrir la parrilla');
    assert.equal(await cierre.locator('[data-notice-action="follow-up"]').count(), 0, 'una parrilla no tiene seguimiento que registrar');
    assert.equal(await cierre.locator('[data-notice-action="close"]').count(), 0);
    assert.match(await cierre.locator('.brain-notice-title').textContent(), /2 piezas pasaron su fecha/);
    // «Recordarme» va al final, como en todos los avisos.
    const botones = await cierre.locator('.brain-notice-content button').allTextContents();
    assert.match(botones.at(-1), /Recordarme/);
    await cierre.screenshot({ path: `${OUT}/cierre-${tema}.png` });

    // 2. Con mes por delante, el mismo aviso va en verde.
    const abierto = await open(context, 'abierto', tema);
    assert.equal(await abierto.getAttribute('[data-important-notice]', 'data-level'), 'SEGUIMIENTO');
    assert.match(await abierto.locator('.brain-notice-content p').first().textContent(), /Parrilla de octubre/);
    await abierto.screenshot({ path: `${OUT}/abierto-${tema}.png` });

    // 3. Varias cuentas: un solo aviso, que abre Operación.
    const resumen = await open(context, 'resumen', tema);
    assert.equal(await resumen.locator('[data-notice-action="open-plan"]').textContent(), 'Abrir Operación');
    assert.match(await resumen.locator('.brain-notice-title').textContent(), /5 cuentas/);
    await resumen.screenshot({ path: `${OUT}/resumen-${tema}.png` });

    // 4. «Recordarme» abre sus opciones sin cerrar el aviso, y Escape devuelve a sus botones.
    await cierre.locator('[data-notice-action="snooze"]').click();
    await cierre.waitForSelector('[data-notice-snooze="tomorrow"]');
    assert.equal(await cierre.getAttribute('[data-important-notice]', 'data-mode'), 'choose');
    await cierre.screenshot({ path: `${OUT}/recordarme-${tema}.png` });
    await cierre.keyboard.press('Escape');
    await cierre.waitForSelector('[data-notice-action="open-plan"]');

    await context.close();
  }

  // 5. En el celular, el título tiene que quedar sobre el color.
  const movil = await browser.newContext({ viewport: { width: 390, height: 844 }, colorScheme: 'light' });
  const page = await open(movil, 'cierre');
  await page.screenshot({ path: `${OUT}/cierre-movil.png` });
  await movil.close();

  assert.deepEqual(problems, [], 'la consola no puede traer errores');
  console.log(`Avisos de parrilla verificados en claro y oscuro. Capturas en ${OUT}`);
} finally {
  await browser.close();
}
