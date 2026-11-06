import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright-core';
import { createNavigationPreview } from '../../scripts/preview-navigation.js';

let preview, browser;
test.before(async () => {
  preview = await createNavigationPreview({ port: 0 });
  browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
  await mkdir('output/task-piece-ordering', { recursive: true });
});
test.after(async () => { await browser?.close(); await preview?.close(); });

const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };
const orderedIds = scope => scope.locator('[data-final-asset-tile]').evaluateAll(nodes => nodes.map(node => node.dataset.finalAssetTile));

async function setup({ mobile = false, dark = false, stalePlan = false } = {}) {
  const page = await browser.newPage({ viewport: { width: mobile ? 390 : 1440, height: mobile ? 844 : 1000 }, isMobile: mobile, hasTouch: mobile });
  page.setDefaultTimeout(6000);
  const state = { assets: ['a', 'b', 'c'].map((id, position) => ({ id, position, name: `${position + 1}.png`, mimeType: 'image/png', storageKey: id })),
    revision: 4, orders: [], revisions: [], otherWrites: [], reject: false, denyRead: false, denyDelivery: false, gate: null, requested: deferred() };
  await page.route('**/api/**', async route => {
    const request = route.request();
    if (request.method() === 'GET') return route.continue();
    if (request.url().endsWith('/trace-open')) return route.fulfill({ json: { ok: true } });
    state.otherWrites.push({ method: request.method(), path: new URL(request.url()).pathname });
    return route.fulfill({ status: 403, json: { error: 'Escritura ajena al orden.' } });
  });
  await page.route('**/api/content/plans/navigation-plan', async route => {
    if (state.denyRead) return route.fulfill({ status: 403, json: { error: 'Sin acceso a la parrilla.' } });
    const response = await route.fetch();
    const plan = await response.json();
    plan.items[0].finalAssets = stalePlan ? [] : state.assets;
    plan.items[0].finalAssetsRevision = stalePlan ? 0 : state.revision;
    return route.fulfill({ response, json: plan });
  });
  await page.route('**/api/content/items/uno/delivery', route => route.fulfill(state.denyDelivery
    ? { status: 403, json: { error: 'No puedes consultar esta entrega.' } }
    : { json: { revision: state.revision, files: state.assets, history: [] } }));
  await page.route('**/api/content/items/uno/final-assets/*', async route => {
    if (new URL(route.request().url()).pathname.endsWith('/order')) {
      assert.equal(route.request().method(), 'PUT');
      const { order, expectedRevision } = route.request().postDataJSON();
      state.orders.push(order);
      state.revisions.push(expectedRevision);
      state.requested.resolve();
      if (state.gate) await state.gate.promise;
      if (state.reject) return route.fulfill({ status: 403, json: { error: 'No tienes permiso para ordenar esta pieza.' } });
      assert.deepEqual([...order].sort(), ['a', 'b', 'c']);
      state.assets = order.map((id, position) => ({ ...state.assets.find(asset => asset.id === id), position }));
      state.revision += 1;
      return route.fulfill({ json: state.assets });
    }
    return route.fulfill({ contentType: 'image/png', body: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j6loAAAAASUVORK5CYII=', 'base64') });
  });
  await page.goto(`${preview.origin}/gestion?taskId=navigation-task`);
  if (dark) await page.evaluate(() => document.documentElement.classList.add('dark'));
  await page.getByRole('button', { name: 'Ver pieza', exact: true }).click();
  const peek = page.locator('[data-piece-peek]');
  await peek.getByText('Guion de prueba', { exact: true }).waitFor();
  return { page, peek, state };
}

test('ordenar el carrusel desde la tarea espera el recibo y conserva el orden al recargar y abrir la parrilla', async () => {
  const { page, peek, state } = await setup();
  state.gate = deferred();
  try {
    assert.equal(await peek.locator('[data-final-asset-tile="c"]').getAttribute('draggable'), 'true');
    assert.equal(await peek.getByRole('button', { name: /^Eliminar / }).count(), 0, 'ordenar no habilita eliminar');
    await peek.locator('[data-final-asset-tile="c"]').dragTo(peek.locator('[data-final-asset-tile="a"]'));
    await state.requested.promise;
    await peek.getByText('Guardando orden…', { exact: true }).waitFor();
    assert.deepEqual(state.orders, [['c', 'a', 'b']]);
    assert.deepEqual(state.revisions, [4], 'guarda sobre la revisión que vio la persona');
    assert.equal(await peek.getByRole('button', { name: 'Actualizar entrega', exact: true }).isDisabled(), true);
    assert.equal(await peek.locator('[data-piece-peek-open]').isDisabled(), true);
    await page.keyboard.press('Escape');
    assert.equal(await peek.isVisible(), true, 'no se cierra durante el guardado');
    state.gate.resolve();
    await peek.getByText('Orden guardado', { exact: true }).waitFor();
    assert.deepEqual(await orderedIds(peek), ['c', 'a', 'b']);
    assert.equal(await peek.getByRole('button', { name: 'Actualizar entrega', exact: true }).isDisabled(), false);
    await page.screenshot({ path: 'output/task-piece-ordering/orden-confirmado.png', fullPage: true, animations: 'disabled' });
    // Gestión consume taskId al abrir: una carga nueva del enlace vuelve a consultar la misma tarea.
    await page.goto(`${preview.origin}/gestion?taskId=navigation-task`);
    await page.getByRole('button', { name: 'Ver pieza', exact: true }).click();
    await peek.getByText('3.png', { exact: true }).waitFor();
    assert.deepEqual(await orderedIds(peek), ['c', 'a', 'b']);
    await peek.locator('[data-piece-peek-open]').click();
    await page.locator('#item-uno').getByText('3.png', { exact: true }).waitFor();
    assert.deepEqual(await orderedIds(page.locator('#item-uno')), ['c', 'a', 'b']);
    assert.deepEqual(state.otherWrites, [], 'no cambia tareas, participantes, entrega ni publicación');
  } finally { state.gate.resolve(); await page.close(); }
});

test('el rechazo al ordenar devuelve las miniaturas a su orden confirmado y permite reintentar con teclado', async () => {
  const { page, peek, state } = await setup({ mobile: true, dark: true });
  state.reject = true;
  try {
    await peek.locator('[data-final-asset-grip="a"]').press('ArrowRight');
    await peek.getByRole('alert').getByText('No tienes permiso para ordenar esta pieza.', { exact: true }).waitFor();
    assert.deepEqual(await orderedIds(peek), ['a', 'b', 'c']);
    assert.equal(await peek.getByText('Orden guardado', { exact: true }).count(), 0);
    assert.equal(await peek.getByRole('button', { name: 'Actualizar entrega', exact: true }).isDisabled(), false);
    state.reject = false;
    await peek.locator('[data-final-asset-grip="a"]').press('ArrowRight');
    await peek.getByText('Orden guardado', { exact: true }).waitFor();
    assert.deepEqual(await orderedIds(peek), ['b', 'a', 'c']);
    assert.deepEqual(state.orders, [['b', 'a', 'c'], ['b', 'a', 'c']]);
    assert.deepEqual(state.revisions, [4, 4]);
    assert.equal(await peek.getByRole('alert').count(), 0);
    assert.deepEqual(state.otherWrites, []);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth));
    await page.screenshot({ path: 'output/task-piece-ordering/orden-movil-oscuro.png', fullPage: true, animations: 'disabled' });
  } finally { await page.close(); }
});

test('la galería editable usa archivos y revisión del recibo de entrega, no una copia anterior de la parrilla', async () => {
  const { page, peek, state } = await setup({ stalePlan: true });
  try {
    await peek.getByRole('button', { name: 'Actualizar entrega', exact: true }).waitFor();
    assert.deepEqual(await orderedIds(peek), ['a', 'b', 'c']);
    await peek.locator('[data-final-asset-grip="a"]').press('ArrowRight');
    await peek.getByText('Orden guardado', { exact: true }).waitFor();
    assert.deepEqual(state.revisions, [4]);
    assert.deepEqual(await orderedIds(peek), ['b', 'a', 'c']);
    await page.keyboard.press('Escape');
    state.denyDelivery = true;
    await page.getByRole('button', { name: 'Ver pieza', exact: true }).click();
    await peek.getByRole('alert').getByText('No puedes consultar esta entrega.', { exact: true }).waitFor();
    assert.equal(await peek.locator('[data-final-asset-grip]').count(), 0);
    assert.equal(await peek.getByRole('button', { name: 'Entregar pieza', exact: true }).isDisabled(), true);
    state.denyDelivery = false;
    await peek.getByRole('button', { name: 'Reintentar consulta de entrega', exact: true }).click();
    await peek.getByRole('button', { name: 'Actualizar entrega', exact: true }).waitFor();
    assert.deepEqual(await orderedIds(peek), ['b', 'a', 'c']);
  } finally { await page.close(); }
});

test('una consulta denegada no conserva controles de orden desde la copia de la tarea', async () => {
  const { page, peek, state } = await setup();
  try {
    await page.keyboard.press('Escape');
    state.denyRead = true;
    await page.getByRole('button', { name: 'Ver pieza', exact: true }).click();
    await peek.getByRole('alert').getByText('No tienes acceso a esta parrilla.', { exact: true }).waitFor();
    assert.equal(await peek.locator('[data-final-asset-grip]').count(), 0);
    assert.equal(await peek.getByRole('button', { name: 'Entregar pieza', exact: true }).count(), 0);
    assert.deepEqual(state.orders, []);
    assert.deepEqual(state.otherWrites, []);
  } finally { await page.close(); }
});
