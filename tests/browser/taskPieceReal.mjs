import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright-core';
import sharp from 'sharp';

// Se ejecuta con scripts/task-piece-api-local.mjs y preview-task-piece-web.mjs ya abiertos.
// Login, interfaz completa, API, archivos y PostgreSQL reales; solo la agencia y el almacenamiento son ficticios.
test('recorrido real: tarea, consulta, entrega, tres períodos y regreso a la misma participación', async () => {
  const access = JSON.parse(await readFile('output/task-piece-local/preview-access.json', 'utf8'));
  assert.equal(access.apiOrigin, 'http://127.0.0.1:8092');
  const origin = 'http://127.0.0.1:3183';
  const health = await fetch(`${origin}/api/health`).then(response => response.json());
  assert.equal(health.isolatedTaskPieceTest, true);
  const output = path.resolve('output/task-piece-local/walkthrough');
  await mkdir(output, { recursive: true });
  const filename = `entrega-local-${Date.now()}.png`;
  const file = path.join(output, filename);
  await sharp(Buffer.from('<svg width="1080" height="1080" xmlns="http://www.w3.org/2000/svg"><rect width="1080" height="1080" fill="#f5f5f4"/><rect x="80" y="80" width="920" height="920" rx="30" fill="#173c47"/><circle cx="820" cy="240" r="90" fill="#fcd200"/><path d="M80 750Q450 500 1000 700V1000H80Z" fill="#31aa8a"/><text x="150" y="410" font-family="Arial" font-size="100" font-weight="bold" fill="white">FARO</text><text x="150" y="495" font-family="Arial" font-size="40" fill="white">Una pieza. Un recorrido.</text><text x="150" y="900" font-family="Arial" font-size="30" fill="white">PRUEBA LOCAL · NOVIEMBRE 2026</text></svg>')).png().toFile(file);
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  page.setDefaultTimeout(20000);
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  const piece = access.pieces.current.approved;
  const shot = async name => { await page.evaluate(() => document.fonts.ready); await page.waitForTimeout(400); await page.screenshot({ path: path.join(output, name), fullPage: true }); };
  try {
    await page.goto(`${origin}/gestion?taskId=${piece.taskId}`);
    await page.locator('input[type="email"]').fill(access.users.ana.email);
    await page.locator('input[type="password"]').fill(access.users.ana.password);
    await page.getByRole('button', { name: 'Acceder', exact: true }).click();
    await page.getByRole('button', { name: 'Entendido', exact: true }).click();
    await page.getByRole('button', { name: 'Ver pieza', exact: true }).waitFor();
    const token = await page.evaluate(() => localStorage.getItem('authToken'));
    const get = route => fetch(`${origin}/api${route}`, { headers: { Authorization: `Bearer ${token}` } }).then(response => { assert.equal(response.status, 200); return response.json(); });
    const before = await get(`/tasks/${piece.taskId}`);
    await shot('01-tarea.png');
    await page.getByRole('button', { name: 'Ver pieza', exact: true }).click();
    const peek = page.locator('[data-piece-peek]');
    await peek.getByText(piece.copyText, { exact: true }).waitFor();
    await shot('02-ver-pieza.png');
    await peek.getByRole('button', { name: 'Entregar pieza', exact: true }).click();
    await page.getByLabel('Archivos de la pieza final').setInputFiles(file);
    await peek.getByText(filename, { exact: true }).waitFor();
    await peek.getByText('El cliente tiene material nuevo por revisar.', { exact: true }).waitFor();
    await shot('03-entrega-guardada.png');
    const after = await get(`/tasks/${piece.taskId}`);
    const plan = await get(`/content/plans/${piece.planId}`);
    const stored = plan.items.find(row => row.id === piece.id);
    assert.equal(stored.finalAssets.filter(asset => asset.name === filename).length, 1);
    assert.ok(stored.revisionRequestedAt);
    assert.equal(stored.status, 'APROBADO');
    assert.equal(after.status, before.status);
    assert.deepEqual(after.participants, before.participants);
    assert.equal((stored.publications || []).length, 0);
    await peek.getByRole('button', { name: 'Cerrar pieza', exact: true }).click();
    await page.getByRole('button', { name: 'Abrir Parrilla', exact: true }).click();
    await page.locator(`#item-${piece.id}`).getByText(filename, { exact: true }).waitFor();
    await shot('04-misma-entrega-en-parrilla.png');
    await page.getByRole('combobox', { name: 'Período de la parrilla', exact: true }).click();
    await page.getByRole('option', { name: 'Octubre 2026', exact: true }).click();
    await page.getByRole('combobox', { name: 'Período de la parrilla', exact: true }).getByText('Octubre 2026', { exact: true }).waitFor();
    await shot('05-octubre-mismo-cliente.png');
    await page.getByRole('combobox', { name: 'Período de la parrilla', exact: true }).click();
    await page.getByRole('option', { name: 'Diciembre 2026', exact: true }).click();
    await page.getByRole('combobox', { name: 'Período de la parrilla', exact: true }).getByText('Diciembre 2026', { exact: true }).waitFor();
    await page.locator('[data-back-to-origin] button').click();
    await page.getByRole('button', { name: 'Ver pieza', exact: true }).waitFor();
    assert.equal(new URL(page.url()).pathname, '/gestion');
    await shot('06-regreso-a-la-tarea.png');
    await writeFile(path.join(output, 'verification.json'), JSON.stringify({ taskId: piece.taskId, pieceId: piece.id, filename,
      taskStatusBefore: before.status, taskStatusAfter: after.status, participantsUnchanged: true, storedExactlyOnce: true, revisionRequested: true, publications: 0, pageErrors: errors }, null, 2));
    assert.deepEqual(errors, []);
  } catch (error) { await shot('error.png'); throw error; }
  finally { await browser.close(); }
});
