import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { build } from 'esbuild';
import postcss from 'postcss';
import tailwindcss from 'tailwindcss';
import tailwindConfig from '../../tailwind.config.js';
import { chromium } from 'playwright-core';

let server, browser, origin;
const output = path.resolve('output/contextual-navigation');
test.before(async () => {
  const result = await build({ entryPoints: ['tests/fixtures/contextual-navigation.jsx'], bundle: true, write: false, format: 'esm', jsx: 'automatic', minify: true, loader: { '.png': 'dataurl' },
    alias: { '@': path.resolve('src') }, define: { 'process.env.NODE_ENV': '"production"', 'import.meta.env': '{}' },
    plugins: [{ name: 'navigation-fixture-boundaries', setup(build) {
      build.onResolve({ filter: /(?:AuthContext|OnboardingProvider|BriaMemoryPanel|BriaObserverInbox|AssignmentScenario|CompletedTasksHistoryModal|DashboardAnnouncements|DashboardReminders|CatalogManagement)$/ }, args => ({ path: args.path.split('/').at(-1), namespace: 'fixture' }));
      build.onLoad({ filter: /.*/, namespace: 'fixture' }, ({ path }) => ({ loader: 'jsx', resolveDir: process.cwd(), contents: path === 'AuthContext'
        ? "export const useAuth = () => ({currentUser: {id:'user-admin',name:'Director Ejemplo',role:'ADMIN'}});"
        : path === 'OnboardingProvider' ? 'export const QuotationGuideButton = () => null;'
          : `import React from 'react'; export default function Stub(){ return <div data-fixture="${path}"/>; }` }));
    } }],
  });
  const css = await postcss([tailwindcss({ ...tailwindConfig, content: ['./src/components/**/*.jsx', './tests/fixtures/contextual-navigation.jsx'], safelist: ['dark'] })]).process(await readFile('src/index.css', 'utf8'), { from: path.resolve('src/index.css') });
  server = createServer((req, res) => {
    const pathname = new URL(req.url, 'http://localhost').pathname;
    if (pathname === '/test.js') { res.setHeader('Content-Type', 'text/javascript'); res.end(result.outputFiles[0].text); }
    else if (pathname === '/test.css') { res.setHeader('Content-Type', 'text/css'); res.end(css.css); }
    else { res.setHeader('Content-Type', 'text/html'); res.end('<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/test.css"></head><body class="bg-background"><div id="root"></div><script type="module" src="/test.js"></script></body></html>'); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  origin = `http://127.0.0.1:${server.address().port}`;
  browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
  await mkdir(output, { recursive: true });
});
test.after(async () => { await browser?.close(); if (server) await new Promise(resolve => server.close(resolve)); });

async function visit(url, options = {}) {
  const page = await browser.newPage({ viewport: { width: 1366, height: 900 }, ...options });
  page.setDefaultTimeout(4000);
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/*', route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
  await page.goto(`${origin}${url}`);
  return { page, errors };
}
const params = page => page.evaluate(() => Object.fromEntries(new URLSearchParams(location.search)));
const returnTo = page => page.getByRole('button', { name: /^Volver a / }).first().click();

test('Inicio conserva persona, usa navegación interna y mantiene reuniones externas', async () => {
  const { page, errors } = await visit('/?person=user-ana&keep=1');
  try {
    await page.getByRole('button', { name: 'Ver gestión', exact: true }).waitFor();
    assert.equal(await page.locator('select').first().inputValue(), 'user-ana');
    assert.equal(await page.locator('a[title="Entrar a la reunión"]').getAttribute('target'), '_blank');
    await page.evaluate(() => { window.__documentMarker = 'preserved'; });
    for (const selector of ['button:has-text("Ver gestión")', '[aria-label="Abrir gestión"]', 'a[href="/gestion?taskId=task-demo"]', '[aria-label="Abrir actividad"]']) {
      await page.locator(selector).click();
      await page.locator('[data-destination]').waitFor();
      assert.equal(await page.evaluate(() => window.__documentMarker), 'preserved', 'no recarga la aplicación');
      await returnTo(page);
      assert.equal((await params(page)).person, 'user-ana');
      assert.equal(await page.locator('select').first().inputValue(), 'user-ana');
    }
    await page.screenshot({ path: path.join(output, 'inicio-regreso.png'), fullPage: true });
    assert.deepEqual(errors, []);
  } finally { await page.close(); }
});

test('Ritmo conserva horizonte, filtro, persona y mapa al consultar una tarea', async () => {
  const { page, errors } = await visit('/manager?tab=ritmo&keep=1');
  try {
    await page.getByRole('button', { name: 'Próxima semana', exact: true }).click();
    await page.getByRole('button', { name: /Necesitan revisión/ }).click();
    await page.getByRole('button', { name: 'Ver tareas de Ana Ejemplo', exact: true }).click();
    assert.equal((await params(page)).window, 'next_week');
    await page.locator('[data-week-person-detail] a').click();
    await page.locator('[data-destination]').waitFor();
    await returnTo(page);
    assert.equal(await page.getByRole('button', { name: 'Ver tareas de Ana Ejemplo', exact: true }).getAttribute('aria-expanded'), 'true');
    assert.equal(await page.getByRole('button', { name: /Necesitan revisión/ }).getAttribute('aria-pressed'), 'true');
    await page.locator('summary').filter({ hasText: 'Explorar las fechas de entrega' }).click();
    await page.locator('[data-load-cell]').click();
    await page.locator('[data-load-detail] a').click();
    await page.locator('[data-destination]').waitFor();
    await returnTo(page);
    await page.locator('[data-load-detail]').waitFor();
    await page.reload();
    await page.locator('[data-load-detail]').waitFor();
    assert.equal((await params(page)).keep, '1');
    await page.evaluate(() => document.documentElement.classList.add('dark'));
    await page.waitForTimeout(350);
    await page.screenshot({ path: path.join(output, 'ritmo-regreso-oscuro.png'), fullPage: true });
    assert.deepEqual(errors, []);
  } finally { await page.close(); }
});

test('la decisión de la lectura semanal abre su tarea y devuelve a la selección de Ritmo', async () => {
  const { page, errors } = await visit('/manager?tab=ritmo&window=tomorrow&filter=attention');
  try {
    await page.locator('[data-reading-action="REVISAR_TAREA"]').click();
    await page.locator('[data-destination]').waitFor();
    assert.equal(await page.evaluate(() => window.__navigationState.state?.from?.path), '/manager?tab=ritmo&window=tomorrow&filter=attention');
    await returnTo(page);
    assert.equal(await page.getByRole('button', { name: 'Mañana', exact: true }).getAttribute('aria-pressed'), 'true');
    assert.deepEqual(errors, []);
  } finally { await page.close(); }
});

test('Manager responde a enlaces dentro de la misma ruta y conserva origen al cambiar vista y periodo', async () => {
  const { page, errors } = await visit('/manager?tab=observer');
  try {
    await page.locator('[data-bria-tab="observer"]').waitFor();
    await page.evaluate(() => window.__go('/manager?tab=ritmo&rhythmView=history&days=90&keep=1', { from: { path: '/clientes?tab=equipo', label: 'Clientes', scrollY: 0 } }));
    await page.locator('[data-rhythm-coverage]').waitFor();
    assert.match(await page.locator('[data-rhythm-coverage]').innerText(), /90 días/);
    await page.getByRole('button', { name: '7 días', exact: true }).click();
    assert.equal((await params(page)).days, '7');
    assert.equal(await page.evaluate(() => window.__navigationState.state.from.path), '/clientes?tab=equipo');
    await page.reload();
    await page.locator('[data-rhythm-coverage]').waitFor();
    assert.match(await page.locator('[data-rhythm-coverage]').innerText(), /7 días/);
    await returnTo(page);
    assert.match(page.url(), /clientes\?tab=equipo$/);
    assert.deepEqual(errors, []);
  } finally { await page.close(); }
});

test('Cotizaciones conserva búsqueda, estado y pestaña al editar, crear y recargar', async () => {
  const { page, errors } = await visit('/cotizaciones?tab=history&q=Faro&status=ACTIVA&keep=1');
  try {
    const input = page.getByPlaceholder('Buscar por cliente, empresa o consecutivo...');
    await input.waitFor();
    assert.equal(await input.inputValue(), 'Faro');
    assert.equal(await page.getByText('COT-0002', { exact: true }).count(), 0);
    for (const selector of ['[title="Editar cotización"]', 'button:has-text("Nueva Cotización")']) {
      await page.locator(selector).click();
      await page.locator('[data-destination]').waitFor();
      await returnTo(page);
      assert.equal(await input.inputValue(), 'Faro');
      assert.equal((await params(page)).status, 'ACTIVA');
    }
    await page.getByRole('tab', { name: 'Catálogo', exact: true }).click();
    assert.equal((await params(page)).tab, 'catalog');
    await page.reload();
    assert.equal(await page.getByRole('tab', { name: 'Catálogo', exact: true }).getAttribute('aria-selected'), 'true');
    await page.getByRole('tab', { name: 'Historial', exact: true }).click();
    assert.equal(await input.inputValue(), 'Faro');
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({ path: path.join(output, 'cotizaciones-regreso-movil.png'), fullPage: true });
    assert.deepEqual(errors, []);
  } finally { await page.close(); }
});
