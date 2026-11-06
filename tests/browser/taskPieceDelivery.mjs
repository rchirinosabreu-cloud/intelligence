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

const previewImage = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j6loAAAAASUVORK5CYII=', 'base64');
const asset = (id, name, position = 0) => ({ id, name, position, mimeType: 'image/png', storageKey: id, size: 10 });
async function deliverySnapshot(page, initial = {}) {
  const state = { revision: 0, files: [], history: [], ...initial };
  await page.route('**/api/content/items/uno/delivery', route => route.fulfill({ json: state }));
  await page.route('**/api/content/plans/navigation-plan', async route => {
    const response = await route.fetch();
    const plan = await response.json();
    plan.items[0].finalAssets = state.files;
    return route.fulfill({ response, json: plan });
  });
  await page.route('**/api/content/items/uno/final-assets/*', route => route.fulfill({ contentType: 'image/png', body: previewImage }));
  return state;
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

test('Entregar pieza abre directamente el selector nativo y permite varios archivos', async () => {
  const { page, writes } = await setup();
  try {
    await page.getByRole('button', { name: 'Ver pieza', exact: true }).click();
    const [chooser] = await Promise.all([
      page.waitForEvent('filechooser', { timeout: 2000 }),
      page.getByRole('button', { name: 'Entregar pieza', exact: true }).click(),
    ]);
    assert.equal(chooser.isMultiple(), true);
    assert.equal(await page.getByLabel('Archivos de la pieza final').isVisible(), false);
    assert.deepEqual(writes, [], 'abrir o cancelar el selector no entrega nada');
  } finally { await page.close(); }
});

test('arrastrar varios archivos entrega el conjunto y una segunda caída no duplica una carga pendiente', async () => {
  const { page, writes } = await setup();
  let finish;
  try {
    const snapshot = await deliverySnapshot(page);
    const sent = [];
    const pending = new Promise(resolve => { finish = resolve; });
    await page.route('**/api/content/items/uno/delivery/replace', async route => {
      sent.push(route.request().postDataBuffer().toString());
      await pending;
      snapshot.files = [asset('first', 'carrusel-uno.png'), asset('second', 'carrusel-dos.png', 1)];
      snapshot.revision = 1;
      await route.fulfill({ status: 201, json: snapshot });
    });
    await page.getByRole('button', { name: 'Ver pieza', exact: true }).click();
    const dropzone = page.getByRole('region', { name: 'Entregar pieza final', exact: true });
    await dropzone.waitFor();
    const drop = names => dropzone.evaluate((element, filenames) => {
      const transfer = new DataTransfer();
      filenames.forEach(name => transfer.items.add(new File(['image'], name, { type: 'image/png' })));
      element.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: transfer }));
      element.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: transfer }));
    }, names);
    await drop(['carrusel-uno.png', 'carrusel-dos.png']);
    await page.getByText('Guardando entrega…', { exact: true }).waitFor({ timeout: 2000 });
    await drop(['no-duplicar.png']);
    assert.equal(sent.length, 1);
    assert.match(sent[0], /carrusel-uno\.png/);
    assert.match(sent[0], /carrusel-dos\.png/);
    assert.doesNotMatch(sent[0], /no-duplicar\.png/);
    finish();
    await page.getByText('Entrega guardada', { exact: true }).waitFor();
    await page.locator('[data-piece-peek]').getByText('carrusel-dos.png', { exact: true }).waitFor();
    assert.deepEqual(writes, [], 'la entrega no modifica el estado de la tarea');
  } finally { finish?.(); await page.close(); }
});

test('una entrega usa el servicio de pieza final y muestra el material solo tras confirmarse', async () => {
  const { page, writes } = await setup();
  try {
    let finish;
    const confirmed = new Promise(resolve => { finish = resolve; });
    const snapshot = await deliverySnapshot(page);
    await page.route('**/api/content/items/uno/delivery/replace', async route => {
      assert.equal(route.request().method(), 'POST');
      assert.match(route.request().headers()['content-type'], /multipart\/form-data/);
      await confirmed;
      snapshot.files = [asset('delivered-local', 'entrega.png')];
      snapshot.revision = 1;
      await route.fulfill({ status: 201, json: snapshot });
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

test('actualizar entrega sustituye todo el conjunto y un409 refresca sin volver a enviarlo', async () => {
  const { page, writes } = await setup();
  const snapshot = await deliverySnapshot(page, { revision: 3, files: [asset('old-a', 'antes-uno.png'), asset('old-b', 'antes-dos.png', 1)] });
  const requests = [];
  let conflict = false;
  await page.route('**/api/content/items/uno/delivery/replace', async route => {
    const body = route.request().postData();
    const revision = Number(body.match(/name="expectedRevision"\r\n\r\n([^\r]+)/)?.[1]);
    const names = [...body.matchAll(/filename="([^"]+)"/g)].map(match => match[1]);
    requests.push({ revision, names });
    if (conflict) {
      snapshot.revision = 5; snapshot.files = [asset('other', 'actual-del-equipo.png')];
      return route.fulfill({ status: 409, json: { error: 'La entrega cambió. Revisa los archivos actuales antes de guardar.' } });
    }
    const previousFiles = snapshot.files.map(({ name, size, position, mimeType }) => ({ name, size, position, mimeType }));
    snapshot.revision += 1; snapshot.files = names.map((name, index) => asset(`current-${snapshot.revision}-${index}`, name, index));
    snapshot.history.unshift({ id: `event-${snapshot.revision}`, revision: snapshot.revision, action: 'REPLACED', at: '2026-11-05T16:00:00Z', actorName: 'Lucía Faro',
      files: snapshot.files.map(({ name, size, position, mimeType }) => ({ name, size, position, mimeType })), previousFiles });
    return route.fulfill({ json: snapshot });
  });
  try {
    await page.getByRole('button', { name: 'Ver pieza', exact: true }).click();
    const peek = page.locator('[data-piece-peek]');
    await peek.getByRole('button', { name: 'Actualizar entrega', exact: true }).waitFor();
    await peek.getByLabel('Archivos de la pieza final').setInputFiles({ name: 'nombre-distinto.png', mimeType: 'image/png', buffer: Buffer.from('new') });
    await peek.locator('[data-final-asset-tile="current-4-0"]').waitFor();
    assert.equal(await peek.locator('[data-final-asset-tile]').count(), 1);
    assert.equal(await peek.locator('[data-final-asset-tile="old-a"]').count(), 0);
    await peek.getByText('Historial de entregas (1)', { exact: true }).click();
    await peek.getByText(/^antes-uno\.png/).waitFor();
    conflict = true;
    await peek.getByLabel('Archivos de la pieza final').setInputFiles({ name: 'desactualizado.png', mimeType: 'image/png', buffer: Buffer.from('stale') });
    await peek.getByRole('alert').getByText('La entrega cambió. Revisa los archivos actuales antes de guardar.', { exact: true }).waitFor();
    await peek.locator('[data-final-asset-tile="other"]').waitFor();
    assert.equal(requests.length, 2);
    assert.deepEqual(requests.map(request => request.revision), [3, 4]);
    assert.equal(await peek.getByRole('button', { name: 'Reintentar entrega', exact: true }).count(), 0);
    conflict = false;
    await peek.getByLabel('Archivos de la pieza final').setInputFiles({ name: 'revision-vigente.png', mimeType: 'image/png', buffer: Buffer.from('current') });
    await peek.locator('[data-final-asset-tile="current-6-0"]').waitFor();
    assert.equal(requests[2].revision, 5);
    assert.deepEqual(writes, []);
  } finally { await page.close(); }
});

test('un reintento de pieza tras perder la respuesta conserva archivos, revisión e identidad sin duplicar el cambio', async () => {
  const { page, writes } = await setup();
  const snapshot = await deliverySnapshot(page);
  const requests = [];
  await page.route('**/api/content/items/uno/delivery/replace', async route => {
    const body = route.request().postData();
    requests.push({ id: body.match(/name="requestId"\r\n\r\n([^\r]+)/)?.[1], revision: body.match(/name="expectedRevision"\r\n\r\n([^\r]+)/)?.[1], body });
    if (requests.length === 1) {
      snapshot.revision = 1; snapshot.files = [asset('confirmed', 'confirmada.png')];
      snapshot.history = [{ id: 'event-1', action: 'DELIVERED', revision: 1, at: '2026-11-05T16:00:00Z', actorName: 'Lucía Faro', files: [{ name: 'confirmada.png' }], previousFiles: [] }];
      return route.abort('failed');
    }
    return route.fulfill({ json: snapshot });
  });
  try {
    await page.getByRole('button', { name: 'Ver pieza', exact: true }).click();
    const peek = page.locator('[data-piece-peek]');
    await peek.getByRole('button', { name: 'Entregar pieza', exact: true }).click();
    await peek.getByLabel('Archivos de la pieza final').setInputFiles({ name: 'confirmada.png', mimeType: 'image/png', buffer: Buffer.from('stored') });
    await peek.getByRole('alert').waitFor();
    assert.equal(requests.length, 1, 'el servidor recibió y confirmó la primera entrega');
    await peek.getByRole('button', { name: 'Reintentar entrega', exact: true }).click();
    await peek.locator('[data-final-asset-tile="confirmed"]').waitFor();
    assert.equal(requests.length, 2);
    assert.equal(requests[0].id, requests[1].id);
    assert.deepEqual(requests.map(request => request.revision), ['0', '0']);
    assert.match(requests[1].body, /confirmada\.png/);
    assert.equal(snapshot.history.length, 1);
    assert.deepEqual(writes, []);
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
