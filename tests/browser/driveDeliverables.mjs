import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright-core';
import { createNavigationPreview } from '../../scripts/preview-navigation.js';

let preview, browser;
test.before(async () => {
  preview = await createNavigationPreview({ port: 0 });
  browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
  await mkdir('output/drive-deliverables', { recursive: true });
});
test.after(async () => { await browser?.close(); await preview?.close(); });

const folder = (id, name) => ({ id, name, system: true, readOnly: true, virtual: true });
const root = folder('deliverables', 'Entregables');
// Folder IDs are deliberately opaque: only the API knows their structure.
const client = folder('deliverables:opaque-client', 'Cuenta Faro');
const year = folder('deliverables:opaque-year', '2026');
const month = folder('deliverables:opaque-month', 'Noviembre');
const category = folder('deliverables:opaque-pieces', 'Parrillas');
const resource = folder('deliverables:opaque-piece', 'Presentación de campaña');
const chain = [root, client, year, month, category, resource];
const pieceFile = { id: 'content:asset-a', name: 'Cuenta_Faro_2026-11_Presentacion_comercial_y_estrategia_de_contenidos_para_la_campana_01.png', downloadName: 'Cuenta_Faro_2026-11_Presentacion_comercial_y_estrategia_de_contenidos_para_la_campana_01.png',
  originalName: 'final-final.png', kind: 'CONTENT_DELIVERABLE', canOpenSource: true, mimeType: 'image/png', sizeBytes: 100, createdAt: '2026-11-05T15:00:00Z',
  source: { clientId: 'navigation-client', clientName: 'Cuenta Faro', title: 'Presentación de campaña', planId: 'navigation-plan', itemId: 'uno' },
  fileUrl: '/api/content/items/uno/final-assets/asset-a', downloadUrl: '/api/content/items/uno/final-assets/asset-a?download=true' };
const taskFile = { ...pieceFile, id: 'task:asset-b', name: 'Cuenta-Faro_2026-11_Propuesta-comercial_01.pdf', downloadName: 'Cuenta-Faro_2026-11_Propuesta-comercial_01.pdf',
  originalName: 'propuesta.pdf', kind: 'TASK_DELIVERABLE', mimeType: 'application/pdf',
  source: { clientId: 'navigation-client', clientName: 'Cuenta Faro', title: 'Propuesta comercial', taskId: 'navigation-task' },
  fileUrl: '/api/tasks/navigation-task/deliverables/asset-b/file', downloadUrl: '/api/tasks/navigation-task/deliverables/asset-b/download' };
const pixel = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j6loAAAAASUVORK5CYII=', 'base64');

async function setup({ mobile = false } = {}) {
  const page = await browser.newPage({ viewport: { width: mobile ? 390 : 1440, height: mobile ? 844 : 1000 }, isMobile: mobile, hasTouch: mobile });
  page.setDefaultTimeout(7000);
  const state = { writes: [], reads: [], auth: [], deny: false, denyBinary: false, canOpenSource: true, searchFiles: [pieceFile, taskFile] };
  await page.route('**/api/drive/**', async route => {
    const request = route.request();
    const url = new URL(request.url());
    if (request.method() !== 'GET') { state.writes.push(url.pathname); return route.fulfill({ status: 403, json: { message: 'Esta ubicación es de consulta.' } }); }
    if (url.pathname !== '/api/drive/contents') return route.fulfill({ status: 404, json: { message: 'No es un archivo manual de Drive.' } });
    const folderId = url.searchParams.get('folderId');
    state.reads.push({ folderId, query: url.searchParams.get('query') });
    if (state.deny) return route.fulfill({ status: 403, json: { message: 'Ya no tienes acceso a esta entrega.' } });
    const index = chain.findIndex(row => row.id === folderId);
    const files = url.searchParams.get('query') ? state.searchFiles : index === chain.length - 1 ? [pieceFile] : [];
    return route.fulfill({ json: { currentFolder: index < 0 ? null : chain[index], breadcrumbs: chain.slice(0, index + 1),
      folders: files.length ? [] : index < 0 ? [root] : chain[index + 1] ? [chain[index + 1]] : [], files: files.map(file => ({ ...file, canOpenSource: state.canOpenSource })) } });
  });
  await page.route('**/api/content/items/uno/final-assets/asset-a**', async route => {
    state.auth.push(route.request().headers().authorization);
    if (state.denyBinary) return route.fulfill({ status: 403, json: { error: 'Tu acceso al archivo cambió.' } });
    return route.fulfill({ contentType: 'image/png', body: pixel });
  });
  await page.route('**/api/tasks/navigation-task/deliverables/asset-b/**', async route => {
    state.auth.push(route.request().headers().authorization);
    return route.fulfill({ contentType: 'application/pdf', body: Buffer.from('%PDF-1.4 local download') });
  });
  return { page, state };
}

test('Drive abre el árbol de entregables sin acciones manuales y consulta los mismos bytes autenticados', async () => {
  const { page, state } = await setup();
  try {
    await page.goto(`${preview.origin}/drive`);
    for (const row of chain) {
      await page.getByRole('button', { name: new RegExp(`^${row.name}`) }).last().click();
      await page.waitForURL(url => url.searchParams.get('folderId') === row.id);
    }
    await page.getByRole('button', { name: `Ver ${pieceFile.name}`, exact: true }).waitFor();
    assert.equal(await page.getByRole('button', { name: /^(Nueva carpeta|Subir archivos)$/ }).count(), 0);
    assert.equal(await page.locator('[data-drive-dropzone="true"]').count(), 0);
    assert.equal(await page.getByRole('button', { name: /Renombrar|a papelera|Mover a raíz/ }).count(), 0);
    await page.getByText(pieceFile.originalName, { exact: true }).waitFor();
    await page.getByRole('button', { name: `Ver ${pieceFile.name}`, exact: true }).click();
    const dialog = page.getByRole('dialog', { name: pieceFile.name, exact: true });
    await dialog.getByRole('img', { name: pieceFile.name }).waitFor();
    await dialog.getByRole('button', { name: 'Cerrar visor', exact: true }).click();
    const download = page.waitForEvent('download');
    await page.getByRole('button', { name: `Descargar ${pieceFile.name}`, exact: true }).click();
    assert.equal((await download).suggestedFilename(), pieceFile.downloadName);
    assert.equal(state.auth.length, 2);
    assert.ok(state.auth.every(header => header?.startsWith('Bearer ')));
    assert.deepEqual(state.writes, []);
    await page.screenshot({ path: 'output/drive-deliverables/consulta-claro.png', fullPage: false });
  } finally { await page.close(); }
});

test('un archivo consultable sin permiso de abrir origen no ofrece el salto a tarea o pieza', async () => {
  const { page, state } = await setup();
  state.canOpenSource = false;
  try {
    await page.goto(`${preview.origin}/drive?folderId=${encodeURIComponent(resource.id)}&q=campaña`);
    await page.getByRole('button', { name: `Ver ${pieceFile.name}`, exact: true }).waitFor();
    assert.equal(await page.getByRole('button', { name: /Abrir (pieza|tarea)/ }).count(), 0);
    assert.equal(await page.getByRole('button', { name: /^Descargar / }).count(), 2);
  } finally { await page.close(); }
});

test('una pieza enlazada a Google Drive reutiliza su visor vertical sin prometer una descarga nativa', async () => {
  const { page, state } = await setup();
  const linked = { ...pieceFile, name: 'Reel de campaña', externalProvider: 'DRIVE', externalFileId: 'fictitious-drive-id',
    fileUrl: null, downloadUrl: null, source: { ...pieceFile.source, format: 'Reel' } };
  state.searchFiles = [linked];
  try {
    await page.goto(`${preview.origin}/drive?folderId=${encodeURIComponent(resource.id)}&q=campaña`);
    await page.getByRole('button', { name: `Ver ${linked.name}`, exact: true }).click();
    const dialog = page.getByRole('dialog', { name: linked.name, exact: true });
    const embed = dialog.locator('iframe');
    await embed.waitFor({ state: 'attached' });
    assert.match(await embed.getAttribute('src'), /drive\.google\.com\/file\/d\/fictitious-drive-id\/preview/);
    assert.equal(await embed.evaluate(node => node.parentElement.style.aspectRatio), '9 / 16');
    assert.equal(await dialog.getByRole('button', { name: 'Descargar', exact: true }).count(), 0);
    assert.equal(await page.getByRole('button', { name: `Descargar ${linked.name}`, exact: true }).count(), 0);
    assert.deepEqual(state.auth, [], 'un enlace externo no pide bytes inexistentes a las rutas de archivos nativos');
    assert.deepEqual(state.writes, []);
  } finally { await page.close(); }
});

test('listar y abrir un video grande o un formato sin visor no descarga sus bytes automáticamente', async () => {
  const { page, state } = await setup();
  const video = { ...pieceFile, name: 'grabacion-completa.mp4', mimeType: 'video/mp4', sizeBytes: 2 * 1024 ** 3 };
  const zip = { ...taskFile, id: 'task:zip', name: 'editables.zip', mimeType: 'application/zip', sizeBytes: 1024 ** 3 };
  state.searchFiles = [video, zip];
  try {
    await page.goto(`${preview.origin}/drive?folderId=${encodeURIComponent(resource.id)}&q=campaña`);
    await page.getByRole('button', { name: `Ver ${video.name}`, exact: true }).waitFor();
    assert.deepEqual(state.auth, [], 'entrar en una carpeta solo consulta metadatos');
    await page.getByRole('button', { name: `Ver ${video.name}`, exact: true }).click();
    let dialog = page.getByRole('dialog', { name: video.name, exact: true });
    await dialog.getByText(/supera el límite de vista previa/).waitFor();
    assert.equal(await dialog.getByRole('button', { name: 'Descargar', exact: true }).isVisible(), true);
    await dialog.getByRole('button', { name: 'Cerrar visor', exact: true }).click();
    await page.getByRole('button', { name: `Ver ${zip.name}`, exact: true }).click();
    dialog = page.getByRole('dialog', { name: zip.name, exact: true });
    await dialog.getByText('Vista previa no disponible', { exact: true }).waitFor();
    assert.deepEqual(state.auth, [], 'no se descargan gigabytes para ofrecer la descarga manual');
    assert.deepEqual(state.writes, []);
  } finally { await page.close(); }
});

test('buscar y abrir tarea o pieza conserva la carpeta y búsqueda al regresar desde el origen', async () => {
  const { page, state } = await setup();
  try {
    await page.goto(`${preview.origin}/drive?folderId=${encodeURIComponent(resource.id)}&q=campaña`);
    await page.getByRole('button', { name: 'Abrir tarea', exact: true }).click();
    await page.locator('[data-task-panel-content]').waitFor();
    await page.locator('[data-task-panel-content]').getByRole('button', { name: 'Cerrar', exact: true }).first().click();
    await page.getByRole('button', { name: /Volver a Drive/ }).click();
    await page.getByRole('button', { name: 'Abrir pieza', exact: true }).waitFor();
    assert.equal(new URL(page.url()).searchParams.get('folderId'), resource.id);
    assert.equal(await page.getByPlaceholder('Buscar archivos').inputValue(), 'campaña');
    const download = page.waitForEvent('download');
    await page.getByRole('button', { name: `Descargar ${taskFile.name}`, exact: true }).click();
    assert.equal((await download).suggestedFilename(), taskFile.downloadName);
    await page.getByRole('button', { name: 'Abrir pieza', exact: true }).click();
    await page.waitForURL(url => url.pathname === '/parrillas/navigation-plan' && url.searchParams.get('item') === 'uno');
    await page.getByRole('button', { name: /Volver a Drive/ }).click();
    await page.getByRole('button', { name: 'Abrir tarea', exact: true }).waitFor();
    await page.reload();
    await page.getByRole('button', { name: 'Abrir tarea', exact: true }).waitFor();
    assert.equal(await page.getByPlaceholder('Buscar archivos').inputValue(), 'campaña');
    assert.deepEqual(state.writes, []);
  } finally { await page.close(); }
});

test('un acceso revocado no muestra el archivo anterior ni permite acciones; móvil oscuro conserva contexto legible', async () => {
  const { page, state } = await setup({ mobile: true });
  try {
    await page.goto(`${preview.origin}/drive?folderId=${encodeURIComponent(resource.id)}&q=campaña&dark`);
    await page.getByRole('button', { name: `Ver ${pieceFile.name}`, exact: true }).waitFor();
    assert.ok(await page.getByRole('button', { name: client.name, exact: true }).evaluate(node => node.clientWidth > 60), 'las migas conservan un ancho legible y se desplazan horizontalmente');
    const card = await page.locator('article').first().boundingBox();
    const container = await page.locator('section').filter({ has: page.getByPlaceholder('Buscar archivos') }).boundingBox();
    assert.ok(card.x + card.width <= container.x + container.width, 'un nombre automático largo no desborda la tarjeta de la ubicación');
    await page.screenshot({ path: 'output/drive-deliverables/consulta-movil-oscuro.png', fullPage: false });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    state.denyBinary = true;
    await page.getByRole('button', { name: `Ver ${pieceFile.name}`, exact: true }).click();
    await page.getByText('Tu acceso al archivo cambió.', { exact: true }).first().waitFor();
    await page.getByRole('dialog').waitFor({ state: 'hidden' });
    assert.equal(await page.getByRole('dialog').count(), 0);
    state.deny = true;
    await page.getByRole('button', { name: 'Actualizar Drive', exact: true }).click();
    await page.getByText('Ya no tienes acceso a esta entrega.', { exact: true }).waitFor();
    assert.equal(await page.getByRole('button', { name: `Ver ${pieceFile.name}`, exact: true }).count(), 0);
    assert.equal(await page.getByRole('button', { name: 'Abrir tarea', exact: true }).count(), 0);
    assert.deepEqual(state.writes, []);
  } finally { await page.close(); }
});
