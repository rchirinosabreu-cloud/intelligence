import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright-core';
import { createManagerPreview } from '../../scripts/preview-manager.js';

// Manager → Reuniones (13 de noviembre de 2026), sobre la muestra local de Manager con una agencia inventada.
// Capturas en output/recorrido-pendientes-reuniones: claro, oscuro y celular.
const OUT = 'output/recorrido-pendientes-reuniones';
let browser, preview;
test.before(async () => {
  preview = await createManagerPreview({ port: Number(process.env.MANAGER_PREVIEW_PORT || 3121) });
  browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
  await mkdir(OUT, { recursive: true });
});
test.after(async () => { await browser?.close(); await preview?.close(); });
const shot = (page, name) => page.screenshot({ path: `${OUT}/${name}.png`, fullPage: true });

test('los compromisos llegan armados, se corrigen, se descartan con motivo y los marcados entran como pendientes', async () => {
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
  // Dos Lauras: Bria no elige; la fila llega sin responsable y sin marcar.
  const laura = hotel.locator('[data-meeting-task-item="R:mm-1:2"]');
  assert.match(await laura.locator('[data-meeting-task-note]').innerText(), /«Laura» puede ser Laura Prueba o Laura Segunda/);
  assert.equal(await laura.locator('[data-meeting-task-include]').isChecked(), false);
  assert.equal(await hotel.locator('[data-meeting-task-item="R:mm-1:1"] [data-meeting-task-include]').isChecked(), true);
  await page.waitForTimeout(300);
  await shot(page, '01-bandeja');

  // Descartar lo que es del cliente: un toque en el motivo y queda anotado.
  const carlos = hotel.locator('[data-meeting-task-item="R:mm-1:3"]');
  await carlos.getByRole('button', { name: 'Descartar' }).click();
  await shot(page, '02-descartar');
  await carlos.getByRole('button', { name: 'Es del cliente, no nuestro' }).click();
  await page.getByText('Descartado. Queda anotado en la minuta').waitFor();
  await hotel.locator('[data-meeting-task-item="R:mm-1:3"]').waitFor({ state: 'detached' });

  // Corregir y aprobar: el título, la responsable de la fila ambigua y la fecha.
  await hotel.locator('[data-meeting-task-item="R:mm-1:1"] [data-meeting-task-title]').fill('Terminar el reel de la terraza del hotel');
  // El desplegable compartido abre la lista de la plataforma en escritorio; se elige como una persona.
  await laura.locator('button[data-meeting-task-assignee]').click();
  await page.getByRole('option', { name: 'Laura Prueba' }).click();
  await laura.locator('[data-meeting-task-include]').check();
  await hotel.locator('[data-meeting-task-approve]').click();
  await page.getByText('Creé 2 pendientes de la reunión').waitFor();
  await hotel.waitFor({ state: 'detached' });
  await page.getByText(/Armé 1 pendiente de 1 reunión/).waitFor();
  await shot(page, '03-aprobados');
  assert.deepEqual(errors, []);
  await page.close();
});

test('oscuro y celular', async () => {
  const dark = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  await dark.goto(`${preview.origin}/manager?tab=reuniones&dark`, { timeout: 90000, waitUntil: 'domcontentloaded' });
  await dark.locator('[data-manager-meeting-tasks]').waitFor({ timeout: 60000 });
  await dark.waitForTimeout(400);
  await shot(dark, '04-oscuro');
  await dark.close();
  const mobile = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  await mobile.goto(`${preview.origin}/manager?tab=reuniones`, { timeout: 90000, waitUntil: 'domcontentloaded' });
  await mobile.locator('[data-manager-meeting-tasks]').waitFor({ timeout: 60000 });
  await mobile.waitForTimeout(400);
  assert.equal(await mobile.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), true, 'sin desplazamiento horizontal');
  await shot(mobile, '05-celular');
  await mobile.close();
});
