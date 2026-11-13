import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright-core';
import { createManagerPreview } from '../../scripts/preview-manager.js';

// Manager → Reuniones (13 de noviembre de 2026), sobre la muestra local de Manager con una agencia inventada: tarjetas
// pequeñas; abrir una abre el único creador de pendientes con los datos montados y «Despachar a Kanban».
// Capturas en output/recorrido-pendientes-reuniones: claro, oscuro y celular.
const OUT = 'output/recorrido-pendientes-reuniones';
let browser, preview;
test.before(async () => {
  preview = await createManagerPreview({ port: Number(process.env.MANAGER_PREVIEW_PORT || 3121) });
  browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
  await mkdir(OUT, { recursive: true });
  // Primera visita en frío: Vite descubre las dependencias del panel y recarga; el recorrido se mide en caliente.
  const warm = await browser.newPage();
  await warm.goto(`${preview.origin}/manager?tab=reuniones`, { timeout: 90000, waitUntil: 'domcontentloaded' });
  await warm.locator('[data-manager-meeting-tasks]').waitFor({ timeout: 60000 });
  await warm.locator('[data-meeting-task-open]').first().click();
  await warm.getByRole('dialog').waitFor({ timeout: 60000 });
  await warm.waitForTimeout(1500);
  await warm.close();
});
test.after(async () => { await browser?.close(); await preview?.close(); });
const shot = (page, name) => page.screenshot({ path: `${OUT}/${name}.png`, fullPage: true });

test('los compromisos llegan como tarjetas, se descartan con motivo y al abrir uno el panel de siempre lo despacha a Kanban', async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  page.setDefaultTimeout(15000);
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(`${preview.origin}/manager?tab=reuniones`, { timeout: 90000, waitUntil: 'domcontentloaded' });
  const tray = page.locator('[data-manager-meeting-tasks]');
  await tray.waitFor({ timeout: 60000 });
  await page.getByText(/Armé 4 pendientes de 2 reuniones/).waitFor();
  const hotel = page.locator('[data-meeting-minute="mm-1"]');
  assert.match(await hotel.innerText(), /Cliente propuesto: Hotel Mar Azul \(por el título de la reunión\)/);
  assert.match(await hotel.innerText(), /1 ya es pendiente/, 'lo ya creado no vuelve a la bandeja');
  // Dos Lauras: Bria no elige; la tarjeta llega sin responsable y lo dice.
  const laura = hotel.locator('[data-meeting-task-item="R:mm-1:2"]');
  assert.match(await laura.locator('[data-meeting-task-note]').innerText(), /«Laura» puede ser Laura Prueba o Laura Segunda/);
  assert.match(await laura.innerText(), /Sin responsable/);
  await page.waitForTimeout(300);
  await shot(page, '01-bandeja');

  // Descartar lo que es del cliente: un toque en el motivo y queda anotado.
  const carlos = hotel.locator('[data-meeting-task-item="R:mm-1:3"]');
  await carlos.getByRole('button', { name: 'Descartar' }).click();
  await shot(page, '02-descartar');
  await carlos.getByRole('button', { name: 'Es del cliente, no nuestro' }).click();
  await page.getByText('Descartado. Queda anotado en la minuta').waitFor();
  await hotel.locator('[data-meeting-task-item="R:mm-1:3"]').waitFor({ state: 'detached' });

  // Abrir la tarjeta de Ana: el panel de crear pendientes, con todo montado.
  await hotel.locator('[data-meeting-task-item="R:mm-1:1"] [data-meeting-task-open]').click();
  const dialog = page.getByRole('dialog');
  await dialog.waitFor();
  const despachar = dialog.getByRole('button', { name: 'Despachar a Kanban', exact: true });
  await despachar.waitFor();
  assert.equal(await dialog.getByRole('button', { name: 'Crear tarea', exact: true }).count(), 0, 'el botón dice Despachar a Kanban, no Crear tarea');
  const title = dialog.locator('input[value="Terminar el reel de la terraza"], textarea').first();
  assert.ok(await dialog.locator('input, textarea').evaluateAll((nodes) => nodes.some((node) => node.value === 'Terminar el reel de la terraza')), 'el título viene montado');
  void title;
  assert.match(await dialog.innerText(), /De la reunión «Reunión Hotel Mar Azul · noviembre»/, 'el contexto de la reunión ya está como comentario');
  assert.ok(await dialog.locator('select').evaluateAll((nodes) => nodes.some((node) => node.value === 'c2')), 'el cliente propuesto viene elegido');
  assert.ok(await dialog.locator('select').evaluateAll((nodes) => nodes.some((node) => node.value === 'm-ana')), 'la responsable propuesta viene elegida');
  await page.waitForTimeout(400);
  await shot(page, '03-panel-montado');

  const posted = page.waitForResponse((response) => response.url().endsWith('/api/tasks') && response.request().method() === 'POST');
  await despachar.click();
  const response = await posted;
  assert.equal(response.status(), 201);
  const body = await response.json();
  assert.deepEqual(body.meeting, { linked: true });
  assert.equal(JSON.parse(response.request().postData()).source.minuteId, 'mm-1', 'el POST lleva la marca de origen');
  await page.getByText('Despachado a Kanban').waitFor();
  await hotel.locator('[data-meeting-task-item="R:mm-1:1"]').waitFor({ state: 'detached' });
  await page.getByText(/Armé 2 pendientes de 2 reuniones/).waitFor();
  assert.equal(await page.evaluate(() => sessionStorage.getItem('task_focus_draft')), null, 'el borrador de sesión no se toca');
  await shot(page, '04-despachado');
  assert.deepEqual(errors, []);
  await page.close();
});

test('oscuro y celular', async () => {
  const dark = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  await dark.goto(`${preview.origin}/manager?tab=reuniones&dark`, { timeout: 90000, waitUntil: 'domcontentloaded' });
  await dark.locator('[data-manager-meeting-tasks]').waitFor({ timeout: 60000 });
  await dark.waitForTimeout(400);
  await shot(dark, '05-oscuro');
  await dark.close();
  const mobile = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  await mobile.goto(`${preview.origin}/manager?tab=reuniones`, { timeout: 90000, waitUntil: 'domcontentloaded' });
  await mobile.locator('[data-manager-meeting-tasks]').waitFor({ timeout: 60000 });
  await mobile.waitForTimeout(400);
  assert.equal(await mobile.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), true, 'sin desplazamiento horizontal');
  await shot(mobile, '06-celular');
  await mobile.close();
});
