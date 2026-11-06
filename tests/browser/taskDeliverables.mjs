import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright-core';
import { createNavigationPreview } from '../../scripts/preview-navigation.js';

let preview, browser;
test.before(async () => {
  preview = await createNavigationPreview({ port: 0 });
  browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
  await mkdir('output/task-deliverables', { recursive: true });
});
test.after(async () => { await browser?.close(); await preview?.close(); });
const MB = 1024 * 1024;
const file = (id, name, position = 0) => ({ id, name, position, mimeType: name.endsWith('.pdf') ? 'application/pdf' : 'image/png', size: 10,
  createdAt: '2026-11-05T15:00:00Z', authorName: 'Lucía Faro', fileUrl: `/api/tasks/navigation-task/deliverables/files/${id}`, downloadUrl: `/api/tasks/navigation-task/deliverables/files/${id}/download` });
const ids = scope => scope.locator('[data-final-asset-tile]').evaluateAll(nodes => nodes.map(node => node.dataset.finalAssetTile));

async function setup({ files = [], readonly = false, mobile = false, dark = false } = {}) {
  const page = await browser.newPage({ viewport: { width: mobile ? 390 : 1440, height: mobile ? 844 : 1000 }, isMobile: mobile, hasTouch: mobile });
  page.setDefaultTimeout(6000);
  const state = { snapshot: { taskId: 'navigation-task', revision: 0, files, history: [], canUpload: !readonly, canReorder: !readonly,
    writeBlockedReason: readonly ? 'Solo puedes consultar esta entrega.' : null,
    limits: { maxFiles: 20, maxServerBytes: 200 * MB, maxServerTotalBytes: 200 * MB, maxDirectBytes: 2048 * MB } },
    requests: [], otherWrites: [], binaryAuth: [], conflict: false, deny: false, loseResponse: false, gate: null, receipts: new Map() };
  await page.route('**/api/**', async route => {
    const request = route.request();
    const pathname = new URL(request.url()).pathname;
    if (request.method() === 'GET') {
      if (pathname === '/api/tasks' || pathname === '/api/tasks/navigation-task') {
        const response = await route.fetch();
        const body = await response.json();
        const unlinked = row => ({ ...row, contentItemId: null, contentItem: null, contentPlanId: null, plan: null });
        return route.fulfill({ response, json: Array.isArray(body) ? body.map(unlinked) : unlinked(body) });
      }
      return route.continue();
    }
    if (pathname.endsWith('/trace-open')) return route.fulfill({ json: { ok: true } });
    state.otherWrites.push({ method: request.method(), pathname });
    return route.fulfill({ status: 403, json: { error: 'No debe cambiar la tarea ni sus comentarios.' } });
  });
  await page.route('**/api/tasks/navigation-task/deliverables**', async route => {
    const request = route.request();
    const pathname = new URL(request.url()).pathname;
    if (request.method() === 'GET') {
      if (state.deny) return route.fulfill({ status: 403, json: { error: 'No tienes acceso a los entregables.' } });
      if (pathname.includes('/files/')) {
        state.binaryAuth.push(request.headers().authorization);
        return route.fulfill({ contentType: 'image/png', body: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j6loAAAAASUVORK5CYII=', 'base64') });
      }
      return route.fulfill({ json: state.snapshot });
    }
    const body = request.method() === 'PUT' ? request.postDataJSON() : request.postData();
    const requestId = typeof body === 'string' ? body.match(/name="requestId"\r\n\r\n([^\r]+)/)?.[1] : body.requestId;
    const revision = typeof body === 'string' ? Number(body.match(/name="expectedRevision"\r\n\r\n([^\r]+)/)?.[1]) : body.expectedRevision;
    state.requests.push({ pathname, requestId, revision, body });
    assert.match(requestId, /^[0-9a-f-]{36}$/i);
    if (state.gate) await state.gate;
    if (state.receipts.has(requestId)) return route.fulfill({ json: { ...state.snapshot, receipt: { ...state.receipts.get(requestId), duplicate: true } } });
    if (state.conflict) {
      state.snapshot = { ...state.snapshot, revision: 2, files: [file('other', 'cambio-del-equipo.pdf')] };
      return route.fulfill({ status: 409, json: { error: 'La entrega cambió. Revisa los archivos actuales antes de guardar.' } });
    }
    assert.equal(revision, state.snapshot.revision);
    const previousFiles = state.snapshot.files;
    const action = request.method() === 'PUT' ? 'REORDERED' : previousFiles.length ? 'REPLACED' : 'DELIVERED';
    const names = typeof body === 'string' ? [...body.matchAll(/filename="([^"]+)"/g)].map(match => match[1]) : [];
    const next = request.method() === 'PUT' ? body.order.map((id, index) => ({ ...previousFiles.find(row => row.id === id), position: index }))
      : names.map((name, index) => file(`rev-${state.snapshot.revision + 1}-${index}`, name, index));
    const history = { id: requestId, action, revision: state.snapshot.revision + 1, at: '2026-11-05T16:00:00Z', actorName: 'Lucía Faro',
      files: next.map(({ name, mimeType, size, position }) => ({ name, mimeType, size, position })),
      previousFiles: previousFiles.map(({ name, mimeType, size, position }) => ({ name, mimeType, size, position })) };
    const receipt = { requestId, revision: history.revision, action, duplicate: false };
    state.receipts.set(requestId, receipt);
    state.snapshot = { ...state.snapshot, revision: history.revision, files: next, history: [history, ...state.snapshot.history] };
    if (state.loseResponse) { state.loseResponse = false; return route.abort('failed'); }
    return route.fulfill({ json: { ...state.snapshot, receipt } });
  });
  await page.goto(`${preview.origin}/gestion?taskId=navigation-task`);
  if (dark) await page.evaluate(() => document.documentElement.classList.add('dark'));
  const scope = page.getByRole('region', { name: 'Entregables de la tarea' });
  return { page, scope, state };
}

test('la tarea independiente entrega varios archivos con un clic y actualizar sustituye todo el conjunto, conservando historial', async () => {
  const { page, scope, state } = await setup();
  try {
    await scope.waitFor();
    const chooser = page.waitForEvent('filechooser');
    await scope.getByRole('button', { name: 'Entregar archivos', exact: true }).click();
    await (await chooser).setFiles([
      { name: 'presentacion.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4 local') },
      { name: 'imagen.png', mimeType: 'image/png', buffer: Buffer.from('imagen local') },
    ]);
    await scope.getByRole('status').filter({ hasText: /^Entrega guardada$/ }).waitFor();
    assert.deepEqual(state.snapshot.files.map(row => row.name), ['presentacion.pdf', 'imagen.png']);
    await scope.getByRole('button', { name: 'Descargar presentacion.pdf', exact: true }).waitFor();
    const nextChooser = page.waitForEvent('filechooser');
    await scope.getByRole('button', { name: 'Actualizar entrega', exact: true }).click();
    await (await nextChooser).setFiles([{ name: 'version-corregida.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4 nueva') }]);
    await scope.getByText('version-corregida.pdf', { exact: true }).first().waitFor();
    assert.deepEqual(state.snapshot.files.map(row => row.name), ['version-corregida.pdf']);
    assert.deepEqual(await ids(scope), ['rev-2-0']);
    await scope.getByText('Historial de entregas (2)', { exact: true }).click();
    await scope.getByText(/^presentacion\.pdf(?: ·|$)/).first().waitFor();
    assert.equal(await scope.getByRole('button', { name: 'Descargar presentacion.pdf', exact: true }).count(), 0, 'el historial no conserva descarga del reemplazado');
    assert.deepEqual(state.requests.map(row => row.revision), [0, 1]);
    assert.deepEqual(state.otherWrites, []);
    await page.screenshot({ path: 'output/task-deliverables/entrega-e-historial.png', fullPage: true, animations: 'disabled' });
  } finally { await page.close(); }
});

test('soltar varios archivos mantiene la tarea abierta durante el guardado y no los convierte en adjuntos de comentarios', async () => {
  const { page, scope, state } = await setup({ files: [file('a', 'anterior.pdf')] });
  let release;
  state.gate = new Promise(resolve => { release = resolve; });
  try {
    await scope.getByText('anterior.pdf', { exact: true }).waitFor();
    const transfer = await page.evaluateHandle(() => {
      const data = new DataTransfer();
      data.items.add(new File(['nuevo pdf'], 'nuevo.pdf', { type: 'application/pdf' }));
      data.items.add(new File(['nueva imagen'], 'nuevo.png', { type: 'image/png' }));
      return data;
    });
    await scope.getByLabel('Zona de entrega').dispatchEvent('drop', { dataTransfer: transfer });
    await scope.getByRole('status').filter({ hasText: 'Guardando entrega…' }).waitFor();
    assert.equal(await scope.getByLabel('Archivos del entregable').isDisabled(), true);
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('[data-task-panel-content]').isVisible(), true);
    assert.deepEqual(state.snapshot.files.map(row => row.name), ['anterior.pdf'], 'el material vigente permanece hasta confirmar');
    release();
    await scope.getByRole('status').filter({ hasText: /^Entrega guardada$/ }).waitFor();
    assert.deepEqual(state.snapshot.files.map(row => row.name), ['nuevo.pdf', 'nuevo.png']);
    assert.deepEqual(state.otherWrites, []);
    await transfer.dispose();
  } finally { release(); await page.close(); }
});

test('una consulta revocada no muestra archivos cacheados ni controles de entrega y permite recuperar la lectura', async () => {
  const { page, scope, state } = await setup({ files: [file('a', 'privado.pdf')] });
  try {
    await scope.getByText('privado.pdf', { exact: true }).waitFor();
    state.deny = true;
    await page.goto(`${preview.origin}/gestion?taskId=navigation-task`);
    await scope.getByRole('alert').getByText('No tienes acceso a los entregables.', { exact: true }).waitFor();
    assert.equal(await scope.locator('[data-final-asset-tile]').count(), 0);
    assert.equal(await scope.getByRole('button', { name: /Entregar archivos|Actualizar entrega/ }).count(), 0);
    state.deny = false;
    await scope.getByRole('button', { name: 'Reintentar consulta', exact: true }).click();
    await scope.getByText('privado.pdf', { exact: true }).waitFor();
    assert.deepEqual(state.requests, []);
  } finally { await page.close(); }
});

test('ordenar usa revisión; un conflicto refresca el conjunto sin reenviar y deja decidir sobre el estado nuevo', async () => {
  const { page, scope, state } = await setup({ files: [file('a', 'uno.png'), file('b', 'dos.pdf', 1)] });
  try {
    await scope.locator('[data-final-asset-grip="a"]').press('ArrowRight');
    await scope.getByText('Orden guardado', { exact: true }).waitFor();
    assert.deepEqual(await ids(scope), ['b', 'a']);
    state.conflict = true;
    await scope.locator('[data-final-asset-grip="a"]').press('ArrowLeft');
    await scope.getByRole('alert').getByText('La entrega cambió. Revisa los archivos actuales antes de guardar.', { exact: true }).waitFor();
    await scope.getByText('cambio-del-equipo.pdf', { exact: true }).waitFor();
    assert.deepEqual(await ids(scope), ['other']);
    assert.equal(state.requests.length, 2, 'ningún reenvío automático tras409');
    assert.equal(await scope.getByRole('button', { name: /Reintentar entrega/ }).count(), 0);
    assert.deepEqual(state.otherWrites, []);
  } finally { await page.close(); }
});

test('un timeout conserva archivos e identidad del intento y recupera el recibo sin duplicar el historial', async () => {
  const { page, scope, state } = await setup();
  state.loseResponse = true;
  try {
    await scope.getByLabel('Archivos del entregable').setInputFiles({ name: 'reporte.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-local') });
    await scope.getByRole('button', { name: 'Reintentar entrega', exact: true }).click();
    await scope.getByRole('status').filter({ hasText: /^Entrega guardada$/ }).waitFor();
    assert.equal(state.requests.length, 2);
    assert.equal(state.requests[0].requestId, state.requests[1].requestId);
    assert.equal(state.snapshot.history.length, 1);
    assert.equal(state.snapshot.files.length, 1);
    assert.deepEqual(state.otherWrites, []);
  } finally { await page.close(); }
});

test('la consulta sin permiso de escritura conserva archivos y descarga autenticada, sin ofrecer entrega ni orden', async () => {
  const { page, scope, state } = await setup({ files: [file('a', 'informe.pdf'), file('b', 'lamina.png', 1)], readonly: true, mobile: true, dark: true });
  try {
    await scope.getByText('Solo puedes consultar esta entrega.', { exact: true }).waitFor();
    assert.equal(await scope.getByRole('button', { name: /Entregar archivos|Actualizar entrega/ }).count(), 0);
    assert.equal(await scope.locator('[data-final-asset-grip]').count(), 0);
    const download = page.waitForEvent('download');
    await scope.getByRole('button', { name: 'Descargar informe.pdf', exact: true }).click();
    assert.equal((await download).suggestedFilename(), 'informe.pdf');
    assert.ok(state.binaryAuth.every(value => value?.startsWith('Bearer ')));
    assert.deepEqual(state.requests, []);
    assert.deepEqual(state.otherWrites, []);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth));
    await page.screenshot({ path: 'output/task-deliverables/consulta-movil-oscuro.png', fullPage: true, animations: 'disabled' });
  } finally { await page.close(); }
});
