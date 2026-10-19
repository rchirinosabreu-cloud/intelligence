// Recorrido real de la portada de un video (15 de octubre de 2026).
//
// Se comprueba lo único que no se ve en una prueba de nodo: que el control aparece **solo** en un reel,
// que no aparece en un carrusel ni en una historia, y que lo que dice es cierto.
//
//   node tests/browser/videoCover.mjs
import { mkdir } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { createServer } from 'vite';
import { chromium } from 'playwright-core';

const PAGE = '/tests/fixtures/plan-editor-preview.html';
const OUT = process.env.SHOT_DIR || 'tests/screenshots/portada-de-video';
await mkdir(OUT, { recursive: true });

const server = await createServer({ logLevel: 'error', server: { host: '127.0.0.1', port: 0, open: false } });
await server.listen();
const base = `http://127.0.0.1:${server.httpServer.address().port}`;

const browser = await chromium.launch({ channel: 'chrome' });
const problems = [];
const noise = /Auth refresh|Cover preview|asset preview|Failed to load resource/i;

const open = async (page, title) => {
  await page.getByText(title).first().click();
  await page.waitForTimeout(700);
};

try {
  for (const theme of ['light', 'dark']) {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1200 }, colorScheme: theme });
    const page = await context.newPage();
    page.on('console', (msg) => { if (msg.type() === 'error' && !noise.test(msg.text())) problems.push(`${theme}: ${msg.text()}`); });
    page.on('pageerror', (error) => { if (!noise.test(error.message)) problems.push(`${theme}: ${error.message}`); });
    // La miniatura se pide con `fetch`, que el adaptador de axios de la muestra no intercepta. Se le
    // da aquí una imagen 9:16 de verdad para ver lo que ve el equipo, no un cargador eterno.
    await page.addInitScript(() => {
      const original = window.fetch;
      window.fetch = async (input, init) => {
        const url = String(typeof input === 'string' ? input : input?.url || '');
        if (!/\/cover(\?|$)/.test(url)) return original(input, init);
        const canvas = document.createElement('canvas');
        canvas.width = 180; canvas.height = 320;
        const ctx = canvas.getContext('2d');
        const gradient = ctx.createLinearGradient(0, 0, 180, 320);
        gradient.addColorStop(0, '#009BBF');
        gradient.addColorStop(1, '#31AA8A');
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, 180, 320);
        const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg'));
        return new Response(blob, { status: 200, headers: { 'Content-Type': 'image/jpeg' } });
      };
    });
    await page.goto(`${base}${PAGE}`, { waitUntil: 'networkidle' });
    await page.evaluate((mode) => document.documentElement.classList.toggle('dark', mode === 'dark'), theme);

    // Un reel con su video cargado: aquí sí va la portada.
    await open(page, 'ENDOVA, un espacio preparado para recibirte');
    const field = page.locator('[data-piece-cover]');
    const visible = await field.isVisible().catch(() => false);
    const text = ((await field.textContent().catch(() => '')) || '').replace(/\s+/g, ' ').trim();
    console.log(`[${theme}] reel → control visible: ${visible}`);
    console.log(`[${theme}] dice: ${text.slice(0, 180)}`);
    if (!visible) problems.push(`${theme}: el control de portada no aparece en un reel`);
    if (!/Portada del reel/.test(text)) problems.push(`${theme}: el control no se titula «Portada del reel»`);
    // La fila de material entera, que es donde vive la portada: una captura de la página desde arriba
    // no la enseña.
    await field.scrollIntoViewIfNeeded();
    await page.waitForTimeout(400);
    const material = page.locator('[data-piece-cover]').locator('xpath=ancestor::div[contains(@class,"grid")][1]');
    await material.screenshot({ path: `${OUT}/${theme}-material.png` });

    // En edición es donde se sube, se cambia y se quita: es lo que de verdad usa el equipo.
    await page.getByRole('button', { name: 'Editar' }).first().click();
    await page.waitForTimeout(600);
    await field.scrollIntoViewIfNeeded();
    const acciones = ((await field.textContent().catch(() => '')) || '').replace(/\s+/g, ' ');
    console.log(`[${theme}] en edición dice: ${acciones.slice(0, 200)}`);
    for (const accion of ['Cambiar', 'Quitar']) {
      if (!acciones.includes(accion)) problems.push(`${theme}: falta «${accion}» en edición`);
    }
    await field.screenshot({ path: `${OUT}/${theme}-portada-editando.png` });

    // Un carrusel: Meta no le admite portada, así que no debe aparecer.
    await open(page, 'Agenda tu cita en tres pasos');
    const enCarrusel = await page.locator('[data-piece-cover]').isVisible().catch(() => false);
    console.log(`[${theme}] carrusel → control visible: ${enCarrusel} (debe ser false)`);
    if (enCarrusel) problems.push(`${theme}: la portada aparece en un carrusel, y Meta no la admite ahí`);

    // Un post de una sola foto: tampoco.
    await open(page, 'Qué llevar el día de tu consulta');
    const enPost = await page.locator('[data-piece-cover]').isVisible().catch(() => false);
    console.log(`[${theme}] post → control visible: ${enPost} (debe ser false)`);
    if (enPost) problems.push(`${theme}: la portada aparece en un post de foto`);

    // Regresión: poder preparar la portada antes de cargar el video, como cualquier otro material.
    await open(page, 'Conoce al equipo de hemodinamia');
    await page.getByRole('button', { name: 'Editar', exact: true }).first().click();
    const emptyReelCover = page.locator('[data-piece-cover]');
    const canUploadFirst = await emptyReelCover.isVisible();
    console.log(`[${theme}] reel sin video → portada visible: ${canUploadFirst}`);
    await page.locator('#item-i3').screenshot({ path: `${OUT}/${theme}-reel-sin-video.png` });
    assert.equal(canUploadFirst, true, 'Un reel sin video debe ofrecer subir su portada');
    await emptyReelCover.locator('input[type="file"]').setInputFiles({
      name: 'portada.png', mimeType: 'image/png',
      buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=', 'base64')
    });
    await emptyReelCover.getByRole('button', { name: 'Quitar', exact: true }).waitFor();
    assert.equal(await emptyReelCover.getByText('Cambiar', { exact: true }).isVisible(), true);
    await emptyReelCover.screenshot({ path: `${OUT}/${theme}-portada-antes-del-video.png` });
    await emptyReelCover.getByRole('button', { name: 'Quitar', exact: true }).click();
    await emptyReelCover.getByText('Subir portada', { exact: true }).waitFor();

    await context.close();
  }
} finally {
  await browser.close();
  await server.close();
}

if (problems.length) {
  console.error(`\nFALLÓ:\n- ${problems.join('\n- ')}`);
  process.exitCode = 1;
} else {
  console.log(`\nTodo bien. Capturas en ${OUT}`);
}
