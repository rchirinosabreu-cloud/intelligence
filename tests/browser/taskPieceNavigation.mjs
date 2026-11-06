import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright-core';
import { createNavigationPreview } from '../../scripts/preview-navigation.js';

let preview, browser;
test.before(async () => {
  preview = await createNavigationPreview({ port: 0 });
  browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
  await mkdir('output/task-piece-navigation', { recursive: true });
});
test.after(async () => { await browser?.close(); await preview?.close(); });

const shot = async (page, name) => {
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(500);
  await page.screenshot({ path: `output/task-piece-navigation/${name}.png`, fullPage: true });
};

test('Gestión conserva el origen al consumir el enlace de una tarea', async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  try {
    await page.goto(`${preview.origin}/inicio`);
    await page.getByRole('button', { name: 'Consultar tarea', exact: true }).click();
    await page.getByRole('button', { name: 'Abrir Parrilla', exact: true }).waitFor();
    const state = await page.evaluate(() => window.__navigationLocation.state);
    assert.equal(state?.from?.path, '/inicio', 'abrir la tarea no borra el origen que trajo el enlace');
  } finally { await page.close(); }
});

test('tarea a parrilla y regreso conserva la pieza elegida y vuelve a abrir la tarea', async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  try {
    await page.goto(`${preview.origin}/gestion?taskId=navigation-task&dark`);
    await page.getByRole('button', { name: 'Abrir Parrilla', exact: true }).click();
    await page.locator('nav[aria-label="Piezas de la parrilla"]').waitFor();
    const taskOrigin = new URL((await page.evaluate(() => window.__navigationLocation.state))?.from?.path || '/', preview.origin);
    assert.equal(taskOrigin.pathname, '/gestion');
    assert.equal(taskOrigin.searchParams.get('taskId'), 'navigation-task', 'el regreso recuerda la tarea aunque Gestión haya consumido su parámetro');
    await page.locator('nav[aria-label="Piezas de la parrilla"]').getByRole('button', { name: /Contenido dos/ }).click();
    await page.locator('#item-dos').waitFor();
    const back = page.locator('[data-back-to-origin] button');
    assert.equal(await back.count(), 1, 'elegir otra pieza no quita la ruta de regreso');
    await shot(page, 'parrilla-regreso');
    await back.click();
    await page.getByRole('button', { name: 'Abrir Parrilla', exact: true }).waitFor();
    assert.equal(new URL(page.url()).pathname, '/gestion');
    await shot(page, 'tarea-restaurada');
  } finally { await page.close(); }
});

test('una tarea abierta desde la parrilla conserva el regreso a la pieza', async () => {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  try {
    await page.goto(`${preview.origin}/parrillas/navigation-plan?item=dos`);
    await page.locator('#item-dos').waitFor();
    await page.locator('#item-dos').getByRole('button', { name: 'En producción', exact: true }).click();
    await page.getByRole('button', { name: 'Abrir Parrilla', exact: true }).waitFor();
    assert.equal((await page.evaluate(() => window.__navigationLocation.state))?.from?.path, '/parrillas/navigation-plan?item=dos');
    await page.keyboard.press('Escape');
    await page.locator('[data-back-to-origin] button').click();
    await page.locator('#item-dos').waitFor();
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await shot(page, 'parrilla-celular');
  } finally { await page.close(); }
});

test('volver a Parrillas conserva la búsqueda y la carpeta del cliente', async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  page.setDefaultTimeout(10000);
  try {
    await page.goto(`${preview.origin}/parrillas`);
    await page.getByPlaceholder('Buscar por cliente, mes o año...').fill('prueba');
    await page.getByRole('heading', { name: 'Cliente de prueba', exact: true }).click();
    await page.getByText(/^noviembre 2026$/i).click();
    await page.locator('nav[aria-label="Piezas de la parrilla"]').waitFor();
    const origin = (await page.evaluate(() => window.__navigationLocation.state))?.from;
    assert.ok(origin?.path, 'abrir una parrilla conserva la ruta de la lista');
    await page.locator('[data-back-to-origin] button').click();
    assert.equal(await page.getByPlaceholder('Buscar por cliente, mes o año...').inputValue(), 'prueba');
    assert.equal(await page.getByText(/^noviembre 2026$/i).isVisible(), true);
    await page.getByRole('heading', { name: 'Parrillas de Contenido', exact: true }).click();
    assert.equal(await page.getByPlaceholder('Buscar por cliente, mes o año...').inputValue(), 'prueba', 'cerrar la carpeta conserva la búsqueda');
    await page.getByText(/^noviembre 2026$/i).waitFor({ state: 'hidden' });
    const key = await page.evaluate(() => window.__navigationLocation.key);
    await page.getByRole('heading', { name: 'Parrillas de Contenido', exact: true }).click();
    assert.equal(await page.evaluate(() => window.__navigationLocation.key), key, 'no reemplaza otra vez la dirección si la carpeta ya estaba cerrada');
    await shot(page, 'lista-claro');
  } finally { await page.close(); }
});

test('Directorio conserva origen, filtros y pestaña al consultar el espacio del cliente', async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  page.setDefaultTimeout(10000);
  try {
    await page.goto(`${preview.origin}/inicio`);
    await page.getByRole('button', { name: 'Consultar clientes', exact: true }).click();
    await page.getByRole('tab', { name: 'Equipo', exact: true }).click();
    assert.equal((await page.evaluate(() => window.__navigationLocation.state))?.from?.path, '/inicio', 'cambiar pestaña conserva el regreso');
    await page.getByRole('tab', { name: 'Directorio', exact: true }).click();
    await page.getByRole('textbox', { name: 'Buscar cliente', exact: true }).fill('prueba');
    await page.getByRole('combobox', { name: 'Community manager', exact: true }).click();
    await page.getByRole('option', { name: 'Lucía Faro', exact: true }).click();
    await page.getByRole('button', { name: /Clientes inactivos/ }).click();
    await page.getByRole('button', { name: 'Abrir el espacio de Cliente de prueba', exact: true }).click();
    await page.getByText('/cliente-de-prueba • Espacio Activo de Trabajo', { exact: true }).waitFor();
    assert.equal(new URL((await page.evaluate(() => window.__navigationLocation.state))?.from?.path || '/', preview.origin).pathname, '/clientes');
    await page.locator('[data-back-to-origin] button').click();
    assert.equal(await page.getByRole('tab', { name: 'Directorio', exact: true }).getAttribute('aria-selected'), 'true');
    assert.equal(await page.getByRole('textbox', { name: 'Buscar cliente', exact: true }).inputValue(), 'prueba');
    assert.equal(await page.getByRole('combobox', { name: 'Community manager', exact: true }).innerText(), 'Lucía Faro');
    assert.equal(await page.getByRole('button', { name: /Clientes inactivos/ }).getAttribute('aria-expanded'), 'true');
    await page.reload();
    assert.equal(await page.getByRole('textbox', { name: 'Buscar cliente', exact: true }).inputValue(), 'prueba');
    assert.equal(await page.getByRole('combobox', { name: 'Community manager', exact: true }).innerText(), 'Lucía Faro');
    await shot(page, 'directorio-claro');
  } finally { await page.close(); }
});

test('salir de Parrillas con una carpeta abierta no queda cancelado por el cierre exterior', async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  page.setDefaultTimeout(10000);
  try {
    await page.goto(`${preview.origin}/inicio`);
    await page.getByRole('button', { name: 'Explorar parrillas', exact: true }).click();
    await page.getByRole('heading', { name: 'Cliente de prueba', exact: true }).click();
    await page.getByText(/^noviembre 2026$/i).waitFor();
    await page.locator('[data-back-to-origin] button').click();
    assert.equal(new URL(page.url()).pathname, '/inicio', 'cerrar la carpeta no reemplaza el destino elegido');
    await page.getByRole('heading', { name: 'Muestra local de navegación', exact: true }).waitFor();
  } finally { await page.close(); }
});
