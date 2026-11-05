// Componentes de producto con datos inventados; guardado solo en memoria, sin servidor de negocio.
import assert from 'node:assert/strict';
import path from 'node:path';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { build } from 'esbuild';
import postcss from 'postcss';
import tailwindcss from 'tailwindcss';
import autoprefixer from 'autoprefixer';
import { chromium } from 'playwright-core';
import tailwindConfig from '../../tailwind.config.js';

const root = process.cwd();
const output = path.join(root, 'output/client-operation-alerts');
await mkdir(output, { recursive: true });
// Compila solo esta entrada: ninguna muestra histórica ni configuración/.env de la aplicación.
const bundle = await build({ entryPoints: ['tests/fixtures/client-operation-alerts.jsx'], bundle: true, write: false,
  format: 'esm', platform: 'browser', jsx: 'automatic', minify: true, alias: { '@': path.join(root, 'src') },
  loader: { '.css': 'empty' }, define: { 'process.env.NODE_ENV': '"production"', 'import.meta.env': '{}' } });
const css = await postcss([tailwindcss({ ...tailwindConfig, content: ['./src/**/*.{js,jsx}', './tests/fixtures/client-operation-alerts.jsx'] }), autoprefixer()])
  .process(await readFile('src/index.css', 'utf8'), { from: path.join(root, 'src/index.css') });
const html = (await readFile('tests/fixtures/client-operation-alerts.html', 'utf8'))
  .replace('</head>', '<link rel="stylesheet" href="/scope.css"></head>')
  .replace('/tests/fixtures/client-operation-alerts.jsx', '/scope.js');
const assets = new Map([
  ['/tests/fixtures/client-operation-alerts.html', ['text/html; charset=utf-8', html]],
  ['/scope.js', ['text/javascript; charset=utf-8', bundle.outputFiles[0].text]],
  ['/scope.css', ['text/css; charset=utf-8', css.css + await readFile('node_modules/react-datepicker/dist/react-datepicker.css', 'utf8')]],
]);
const server = createServer((request, response) => {
  const asset = assets.get(new URL(request.url, 'http://localhost').pathname);
  if (!asset) { response.writeHead(404); response.end(); return; }
  response.writeHead(200, { 'Content-Type': asset[0], 'Cache-Control': 'no-store' }); response.end(asset[1]);
});
await new Promise((resolve, reject) => { server.once('error', reject); server.listen(3844, '127.0.0.1', resolve); });
let browser;
const errors = [], apiRequests = [], captures = [];
try {
  browser = await chromium.launch({ channel: 'chrome', headless: true });
  for (const theme of ['light', 'dark']) {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1 });
    const page = await context.newPage();
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/api/**', route => { apiRequests.push(route.request().url()); return route.abort(); });
    await page.goto(`http://127.0.0.1:3844/tests/fixtures/client-operation-alerts.html?theme=${theme}`, { waitUntil: 'networkidle' });
    const attention = page.getByRole('region', { name: 'Qué pide atención' });
    await attention.waitFor();
    assert.equal(await attention.locator('li').count(), 4, 'Solo cuatro avisos iniciales');
    assert.match(await attention.locator('li').first().innerText(), /fecha pasada/);
    await attention.getByRole('button', { name: /Ver .* más/ }).click();
    assert.ok(await attention.locator('li').count() > 4);
    await attention.getByRole('button', { name: 'Ver menos', exact: true }).click();
    await attention.getByRole('button', { name: 'Revisar octubre', exact: true }).click();
    assert.deepEqual(await page.evaluate(() => window.__openedCycles), [{ year: 2026, month: 10 }]);
    const observations = page.getByRole('region', { name: 'Observaciones', exact: true });
    const bottoms = await page.evaluate(() => ({ notes: document.querySelector('[aria-label="Observaciones"]').getBoundingClientRect().top, other: Math.max(...['Ficha operativa', 'Tareas abiertas', 'Meses anteriores'].map(label => document.querySelector('[aria-label="' + label + '"]').getBoundingClientRect().bottom)) }));
    assert.ok(bottoms.notes > bottoms.other, 'Observaciones después de toda la operación');
    await page.evaluate(() => scrollTo(0, 0));
    await page.screenshot({ path: path.join(output, 'alertas-' + theme + '.png') });
    assert.match(await page.getByRole('region', { name: 'Meses anteriores' }).innerText(), /Informe/);
    await observations.scrollIntoViewIfNeeded();
    assert.equal(await observations.locator('li').count(), 4);
    await observations.getByRole('button', { name: /Ver 2 anteriores/ }).click();
    assert.equal(await observations.locator('li').count(), 6);
    assert.match(await observations.innerText(), /Incorporada el/);
    await observations.getByRole('button', { name: 'Añadir observación' }).click();
    await observations.getByLabel('Nueva observación').fill('Texto conservado ante fallo');
    await observations.getByRole('button', { name: 'Guardar observación' }).click();
    await observations.getByRole('alert').waitFor();
    assert.equal(await observations.getByLabel('Nueva observación').inputValue(), 'Texto conservado ante fallo');
    await observations.getByRole('button', { name: 'Ocultar formulario' }).click();
    await page.screenshot({ path: path.join(output, 'observaciones-' + theme + '.png') });
    captures.push('alertas-' + theme + '.png', 'observaciones-' + theme + '.png', 'alertas-movil-' + theme + '.png');
    await page.setViewportSize({ width: 390, height: 844 });
    await page.evaluate(() => scrollTo(0, 0));
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, 'Sin desborde móvil');
    await page.screenshot({ path: path.join(output, 'alertas-movil-' + theme + '.png') });
    await context.close();
  }
  assert.deepEqual(errors, []);
  assert.deepEqual(apiRequests, []);
  await writeFile(path.join(output, 'qa.json'), JSON.stringify({ passed: true, viewport: '1440x1000', themes: ['light', 'dark'], captures, errors, apiRequests, alertsLimited: true, historicalNavigation: true, observationsLast: true }, null, 2));
  console.log(JSON.stringify({ passed: true, output, captures, errors: 0, apiRequests: 0 }));
} finally {
  await browser?.close();
  await new Promise(resolve => server.close(resolve));
}
