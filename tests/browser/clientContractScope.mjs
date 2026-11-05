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
const output = path.join(root, 'output/client-contract-scope');
await mkdir(output, { recursive: true });
// Compila solo esta entrada: ninguna muestra histórica ni configuración/.env de la aplicación.
const bundle = await build({ entryPoints: ['tests/fixtures/client-contract-scope.jsx'], bundle: true, write: false,
  format: 'esm', platform: 'browser', jsx: 'automatic', minify: true, alias: { '@': path.join(root, 'src') },
  loader: { '.css': 'empty' }, define: { 'process.env.NODE_ENV': '"production"', 'import.meta.env': '{}' } });
const css = await postcss([tailwindcss({ ...tailwindConfig, content: ['./src/**/*.{js,jsx}', './tests/fixtures/client-contract-scope.jsx'] }), autoprefixer()])
  .process(await readFile('src/index.css', 'utf8'), { from: path.join(root, 'src/index.css') });
const html = (await readFile('tests/fixtures/client-contract-scope.html', 'utf8'))
  .replace('</head>', '<link rel="stylesheet" href="/scope.css"></head>')
  .replace('/tests/fixtures/client-contract-scope.jsx', '/scope.js');
const assets = new Map([
  ['/tests/fixtures/client-contract-scope.html', ['text/html; charset=utf-8', html]],
  ['/scope.js', ['text/javascript; charset=utf-8', bundle.outputFiles[0].text]],
  ['/scope.css', ['text/css; charset=utf-8', css.css + await readFile('node_modules/react-datepicker/dist/react-datepicker.css', 'utf8')]],
]);
const server = createServer((request, response) => {
  const asset = assets.get(new URL(request.url, 'http://localhost').pathname);
  if (!asset) { response.writeHead(404); response.end(); return; }
  response.writeHead(200, { 'Content-Type': asset[0], 'Cache-Control': 'no-store' }); response.end(asset[1]);
});
await new Promise((resolve, reject) => { server.once('error', reject); server.listen(3830, '127.0.0.1', resolve); });
let browser;
const errors = [], apiRequests = [], captures = [];
try {
  browser = await chromium.launch({ channel: 'chrome', headless: true });
  for (const theme of ['light', 'dark']) {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1 });
    const page = await context.newPage();
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/api/**', route => { apiRequests.push(route.request().url()); return route.abort(); });
    await page.goto(`http://127.0.0.1:3830/tests/fixtures/client-contract-scope.html?theme=${theme}`, { waitUntil: 'networkidle' });
    const profile = page.locator('[aria-label="Ficha operativa"]');
    await profile.waitFor();
    await page.evaluate(() => document.fonts.ready);
    assert.match(await profile.innerText(), /8 historias por mes/);
    assert.match(await profile.innerText(), /2 jornadas por contrato/);
    assert.match(await profile.innerText(), /Hasta 4 horas por jornada/);
    await page.screenshot({ path: path.join(output, `ficha-completa-${theme}.png`), fullPage: true });
    await profile.evaluate(node => window.scrollTo(0, node.getBoundingClientRect().top + window.scrollY - 24));
    await page.screenshot({ path: path.join(output, `ficha-${theme}.png`) });
    captures.push(`ficha-${theme}.png`, `ficha-completa-${theme}.png`);
    await page.getByRole('button', { name: 'Editar', exact: true }).click();
    const dialog = page.getByRole('dialog');
    await dialog.waitFor();
    assert.equal(await dialog.getByRole('combobox', { name: 'Project manager', exact: true }).textContent(), 'Ángela Muestra');
    await dialog.getByLabel('Cantidad de historias', { exact: true }).fill('9');
    await dialog.getByLabel('Cantidad del límite 1', { exact: true }).fill('7');
    await dialog.locator('[data-scope-limits]').evaluate(node => node.scrollIntoView({ block: 'start' }));
    await page.screenshot({ path: path.join(output, `editor-${theme}.png`) });
    captures.push(`editor-${theme}.png`);
    await dialog.getByRole('button', { name: 'Guardar ficha', exact: true }).click();
    await dialog.waitFor({ state: 'detached' });
    assert.match(await profile.innerText(), /9 historias por mes/);
    assert.match(await profile.innerText(), /Hasta 7 Reel/);
    assert.match(await profile.innerText(), /4 en total/);
    const saved = await page.evaluate(() => window.__scopeSaved);
    assert.equal(saved.contract.storiesPerWeek, 3);
    assert.equal(saved.contract.productionDays, 1);
    assert.deepEqual(saved.contract.deliverables, [{ format: 'Reel', quantity: 4 }]);
    assert.equal(saved.projectManagerId, 'fiction-pm');
    assert.equal(saved.communityManagerId, 'fiction-cm');
    await page.getByRole('button', { name: 'Editar', exact: true }).click();
    assert.equal(await page.getByLabel('Cantidad de historias', { exact: true }).inputValue(), '9');
    assert.equal(await page.getByLabel('Cantidad del límite 1', { exact: true }).inputValue(), '7');
    assert.equal(await page.getByLabel('Horas por jornada', { exact: true }).inputValue(), '4');
    await page.getByRole('button', { name: 'Cancelar', exact: true }).click();
    await context.close();
  }
  assert.deepEqual(errors, []);
  assert.deepEqual(apiRequests, []);
  await writeFile(path.join(output, 'qa.json'), JSON.stringify({ passed: true, viewport: '1440x1000', themes: ['light', 'dark'], captures, errors, apiRequests, savesRetainLegacy: true, reopenRetainsValues: true }, null, 2));
  console.log(JSON.stringify({ passed: true, output, captures, errors: 0, apiRequests: 0 }));
} finally {
  await browser?.close();
  await new Promise(resolve => server.close(resolve));
}
