import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright-core';
import { createNavigationPreview } from '../../scripts/preview-navigation.js';

let preview, browser;
test.before(async () => {
  preview = await createNavigationPreview({ port: 0 });
  browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
  await mkdir('output/task-piece-resolution', { recursive: true });
});
test.after(async () => { await browser?.close(); await preview?.close(); });

async function screenshot(page, name) {
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(350);
  await page.screenshot({ path: `output/task-piece-resolution/${name}.png`, fullPage: true, animations: 'disabled' });
}

async function setup({ moved = false, removedPlan = false, denied = false, dark = false } = {}) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  page.setDefaultTimeout(7000);
  const state = { writes: [], locationReads: 0, retired: false };
  const original = await (await fetch(`${preview.origin}/api/content/plans/navigation-plan`)).json();
  const destination = { ...original, id: 'destination-plan', month: 12,
    items: [{ ...original.items[0], planId: 'destination-plan', publishDate: '2026-12-05T12:00:00Z' }] };
  await page.route('**/api/**', route => {
    if (state.retired && new URL(route.request().url()).pathname === '/api/tasks') return route.fulfill({ json: [] });
    if (route.request().method() === 'GET') return route.continue();
    if (route.request().url().endsWith('/trace-open')) return route.fulfill({ json: { ok: true } });
    state.writes.push(route.request().url());
    return route.fulfill({ status: 403, json: { error: 'Solo lectura.' } });
  });
  await page.route('**/api/content/plans/navigation-plan', route => route.fulfill(denied
    ? { status: 403, json: { error: 'Sin acceso.' } }
    : removedPlan ? { status: 404, json: { error: 'Content plan not found' } }
      : { json: { ...original, items: [{ ...original.items[0], id: 'different-piece', format: 'Reel', copyText: 'Texto de otra pieza con el mismo nombre' }] } }));
  await page.route('**/api/content/items/uno/location', route => {
    state.locationReads++;
    if (!moved) state.retired = true;
    return route.fulfill(moved ? { json: { id: 'uno', planId: destination.id, plan: { id: destination.id, year: 2026, month: 12 } } }
      : { status: 404, json: { error: 'La pieza ya no está disponible.' } });
  });
  await page.route('**/api/content/plans/destination-plan', route => route.fulfill({ json: destination }));
  await page.goto(`${preview.origin}/gestion?taskId=navigation-task`, { waitUntil: 'domcontentloaded' });
  if (dark) await page.evaluate(() => document.documentElement.classList.add('dark'));
  await page.getByRole('button', { name: 'Ver pieza', exact: true }).click();
  return { page, peek: page.locator('[data-piece-peek]'), state };
}

test('una pieza eliminada cierra la tarea obsoleta y refresca Gestión sin aviso de vínculo ni homónimos', async () => {
  const { page, peek, state } = await setup();
  try {
    await page.locator('[data-task-panel-content]').waitFor({ state: 'hidden' });
    assert.equal(await peek.count(), 0);
    assert.equal(await peek.getByText('Texto de otra pieza con el mismo nombre').count(), 0);
    assert.equal(await peek.getByRole('button', { name: 'Entregar pieza', exact: true }).count(), 0);
    assert.equal(state.locationReads, 1);
    assert.deepEqual(state.writes, []);
    await page.getByText('Diseñar contenido', { exact: true }).waitFor({ state: 'hidden' });
    await screenshot(page, 'tablero-sin-leyenda');
  } finally { await page.close(); }
});

for (const removedPlan of [false, true]) test(`una pieza trasladada se encuentra por identidad aunque la parrilla anterior ${removedPlan ? 'ya no exista' : 'siga existiendo'}`, async () => {
  const { page, peek, state } = await setup({ moved: true, removedPlan, dark: removedPlan });
  try {
    await peek.getByText('Guion de prueba', { exact: true }).waitFor();
    await peek.getByText('Diciembre 2026', { exact: true }).waitFor();
    assert.equal(state.locationReads, 1);
    assert.deepEqual(state.writes, []);
    await screenshot(page, `pieza-trasladada-${removedPlan ? 'oscuro' : 'claro'}`);
    await peek.getByRole('button', { name: 'Abrir en la parrilla', exact: true }).click();
    await page.waitForURL('**/parrillas/destination-plan?item=uno');
  } finally { await page.close(); }
});

test('un rechazo de permiso no se interpreta como pieza eliminada ni busca otra parrilla', async () => {
  const { page, peek, state } = await setup({ denied: true });
  try {
    await peek.getByRole('alert').getByText('No tienes acceso a esta parrilla.', { exact: true }).waitFor();
    assert.equal(state.locationReads, 0);
    assert.equal(await peek.getByText('Guion de prueba', { exact: true }).count(), 0);
  } finally { await page.close(); }
});
