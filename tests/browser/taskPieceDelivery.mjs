import test from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
import { mkdir } from 'node:fs/promises';
import { createNavigationPreview } from '../../scripts/preview-navigation.js';

let preview, browser;
test.before(async () => {
  preview = await createNavigationPreview({ port: 0 });
  browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
  await mkdir('output/task-piece-delivery', { recursive: true });
});
test.after(async () => { await browser?.close(); await preview?.close(); });

async function setup(options = {}) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, ...options });
  page.setDefaultTimeout(6000);
  const writes = [];
  await page.route('**/api/**', async route => {
    if (route.request().method() === 'GET') return route.continue();
    if (route.request().url().endsWith('/trace-open')) return route.fulfill({ json: { ok: true } });
    writes.push(route.request().url());
    return route.fulfill({ status: 403, json: { error: 'Escritura no prevista por esta prueba.' } });
  });
  await page.goto(`${preview.origin}/gestion?taskId=navigation-task`);
  await page.getByRole('button', { name: 'Abrir Parrilla', exact: true }).waitFor();
  return { page, writes };
}

test('Ver pieza consulta encima de la tarea, conserva su borrador y Escape devuelve el foco', async () => {
  const { page, writes } = await setup();
  try {
    const url = page.url();
    await page.getByLabel('Escribe un mensaje al equipo...').fill('Este comentario todavía no se envía.');
    await page.getByRole('button', { name: 'Ver pieza', exact: true }).click();
    const peek = page.locator('[data-piece-peek]');
    await peek.getByText('Guion de prueba', { exact: true }).waitFor();
    await peek.getByText('Texto de prueba', { exact: true }).waitFor();
    await peek.getByText('Referencias', { exact: true }).waitFor();
    await peek.getByText('Insumos', { exact: true }).waitFor();
    await peek.getByText(/Sale el 5 nov/).waitFor();
    assert.equal(page.url(), url);
    const taskBox = await page.locator('[data-task-panel-content]').boundingBox();
    const pieceBox = await peek.boundingBox();
    assert.ok(pieceBox.width < taskBox.width);
    assert.equal(await peek.evaluate(el => getComputedStyle(el).zIndex > 100), true);
    assert.deepEqual(writes, []);
    await page.screenshot({ path: 'output/task-piece-delivery/ver-pieza-claro.png', fullPage: true });
    await page.keyboard.press('Escape');
    await peek.waitFor({ state: 'hidden' });
    assert.equal(await page.locator('[data-task-panel-content]').isVisible(), true);
    assert.equal(await page.getByLabel('Escribe un mensaje al equipo...').innerText(), 'Este comentario todavía no se envía.');
    assert.equal(await page.getByRole('button', { name: 'Ver pieza', exact: true }).evaluate(el => el === document.activeElement), true);
  } finally { await page.close(); }
});

test('Ver pieza conserva tamaño y lectura en móvil oscuro sin cerrar la tarea', async () => {
  const { page } = await setup({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  try {
    await page.evaluate(() => document.documentElement.classList.add('dark'));
    await page.getByRole('button', { name: 'Ver pieza', exact: true }).click();
    const peek = page.locator('[data-piece-peek]');
    await peek.getByText('Guion de prueba', { exact: true }).waitFor();
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(300);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), true);
    const box = await peek.boundingBox();
    assert.ok(box.x >= 0 && box.x + box.width <= 390);
    assert.ok(box.y >= 0 && box.y + box.height <= 844);
    await page.screenshot({ path: 'output/task-piece-delivery/ver-pieza-movil-oscuro.png', fullPage: true });
    await peek.getByRole('button', { name: 'Cerrar pieza', exact: true }).click();
    assert.equal(await page.locator('[data-task-panel-content]').isVisible(), true);
  } finally { await page.close(); }
});

test('el encabezado usa el estado y la fecha actuales de la pieza, no la copia de la tarea', async () => {
  const { page } = await setup();
  try {
    await page.route('**/api/content/plans/navigation-plan', async route => {
      const response = await route.fetch();
      const plan = await response.json();
      Object.assign(plan.items[0], { status: 'PUBLICADO', publishDate: '2026-12-18T12:00:00.000Z', objective: 'Pieza corregida' });
      await route.fulfill({ response, json: plan });
    });
    await page.getByRole('button', { name: 'Ver pieza', exact: true }).click();
    const peek = page.locator('[data-piece-peek]');
    await peek.getByRole('heading', { name: /Pieza corregida/ }).waitFor();
    await peek.getByText('Sale el 18 dic', { exact: true }).waitFor();
    assert.equal(await peek.getByText('En producción', { exact: true }).count(), 0);
  } finally { await page.close(); }
});

test('una entrega usa el servicio de pieza final y muestra el material solo tras confirmarse', async () => {
  const { page, writes } = await setup();
  try {
    let finish;
    const confirmed = new Promise(resolve => { finish = resolve; });
    let uploaded = false;
    await page.route('**/api/content/plans/navigation-plan', async route => {
      const response = await route.fetch();
      const plan = await response.json();
      if (uploaded) plan.items[0].finalAssets = [{ id: 'delivered-local', name: 'entrega.png', mimeType: 'image/png', storageKey: 'local' }];
      await route.fulfill({ response, json: plan });
    });
    await page.route('**/api/content/items/uno/final-assets', async route => {
      assert.equal(route.request().method(), 'POST');
      assert.match(route.request().headers()['content-type'], /multipart\/form-data/);
      await confirmed;
      uploaded = true;
      await route.fulfill({ status: 201, json: [{ id: 'delivered-local' }] });
    });
    await page.route('**/api/content/items/uno/final-assets/delivered-local?*', route => route.fulfill({ contentType: 'image/png', body: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j6loAAAAASUVORK5CYII=', 'base64') }));
    await page.getByRole('button', { name: 'Ver pieza', exact: true }).click();
    await page.getByRole('button', { name: 'Entregar pieza', exact: true }).click();
    await page.getByLabel('Archivos de la pieza final').setInputFiles({ name: 'entrega.png', mimeType: 'image/png', buffer: Buffer.from('local-file') });
    await page.getByText('Guardando entrega…', { exact: true }).waitFor();
    assert.equal(await page.getByText('Entrega guardada', { exact: true }).count(), 0);
    finish();
    await page.getByText('entrega.png', { exact: true }).waitFor();
    await page.getByText('Entrega guardada', { exact: true }).waitFor();
    assert.deepEqual(writes, [], 'no cierra tareas, programa ni publica');
    await page.screenshot({ path: 'output/task-piece-delivery/entrega-confirmada.png', fullPage: true });
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'Abrir Parrilla', exact: true }).click();
    await page.locator('#item-uno').getByText('entrega.png', { exact: true }).waitFor();
    await page.locator('[data-back-to-origin] button').click();
    await page.getByRole('button', { name: 'Ver pieza', exact: true }).waitFor();
  } finally { await page.close(); }
});

test('un fallo de consulta no revela la pieza ni permite entregar; el fallo de entrega deja reintentar', async () => {
  const { page } = await setup();
  try {
    await page.route('**/api/content/plans/navigation-plan', route => route.fulfill({ status: 403, json: { error: 'Sin acceso a esta parrilla.' } }));
    await page.getByRole('button', { name: 'Ver pieza', exact: true }).click();
    await page.locator('[data-piece-peek]').getByRole('alert').waitFor();
    assert.equal(await page.getByRole('button', { name: 'Entregar pieza', exact: true }).count(), 0);
    await page.keyboard.press('Escape');
    await page.unroute('**/api/content/plans/navigation-plan');
    await page.getByRole('button', { name: 'Ver pieza', exact: true }).click();
    await page.getByRole('button', { name: 'Entregar pieza', exact: true }).click();
    await page.getByLabel('Archivos de la pieza final').setInputFiles({ name: 'error.png', mimeType: 'image/png', buffer: Buffer.from('file') });
    await page.locator('[data-piece-peek]').getByRole('alert').getByText('Escritura no prevista por esta prueba.').waitFor();
    assert.equal(await page.getByText('Entrega guardada', { exact: true }).count(), 0);
    assert.equal(await page.getByLabel('Archivos de la pieza final').isEnabled(), true);
  } finally { await page.close(); }
});
