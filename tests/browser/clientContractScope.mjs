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
  for (const theme of ['light', 'dark']) for (const width of [1440, 390]) {
    const suffix = `${theme}-${width}`;
    const context = await browser.newContext({ viewport: { width, height: 1000 }, deviceScaleFactor: 1 });
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
    assert.match(await profile.innerText(), /Hasta 6 contenidos entre Reel y Video/);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, 'La ficha no desborda horizontalmente.');
    await page.screenshot({ path: path.join(output, `ficha-completa-${suffix}.png`), fullPage: true });
    await profile.evaluate(node => window.scrollTo(0, node.getBoundingClientRect().top + window.scrollY - 24));
    await page.screenshot({ path: path.join(output, `ficha-${suffix}.png`) });
    captures.push(`ficha-${suffix}.png`, `ficha-completa-${suffix}.png`);
    await page.getByRole('button', { name: 'Editar', exact: true }).click();
    const dialog = page.getByRole('dialog');
    await dialog.waitFor();
    assert.equal(await dialog.getByRole('combobox', { name: 'Project manager', exact: true }).textContent(), 'Ángela Muestra');
    await dialog.getByLabel('Cantidad de historias', { exact: true }).fill('9');
    await dialog.getByLabel('Cantidad del límite 1', { exact: true }).fill('7');
    await dialog.getByLabel('Cantidad del grupo 1', { exact: true }).fill('8');
    await dialog.getByLabel('Carrusel en grupo 1', { exact: true }).check();
    assert.equal(await dialog.getByLabel('Carrusel en grupo 1', { exact: true }).evaluate(node => node === document.activeElement), true, 'Elegir un formato conserva el foco.');
    await dialog.locator('[data-scope-groups]').evaluate(node => node.scrollIntoView({ block: 'start' }));
    assert.equal(await dialog.evaluate(node => node.scrollWidth > node.clientWidth), false, 'El editor no desborda horizontalmente.');
    await page.screenshot({ path: path.join(output, `editor-${suffix}.png`) });
    captures.push(`editor-${suffix}.png`);
    await dialog.getByRole('button', { name: 'Guardar ficha', exact: true }).click();
    await dialog.waitFor({ state: 'detached' });
    assert.match(await profile.innerText(), /9 historias por mes/);
    assert.match(await profile.innerText(), /Hasta 7 Reel/);
    assert.match(await profile.innerText(), /Hasta 8 contenidos entre Reel, Video y Carrusel/);
    assert.match(await profile.innerText(), /4 en total/);
    const saved = await page.evaluate(() => window.__scopeSaved);
    assert.equal(saved.contract.storiesPerWeek, 3);
    assert.equal(saved.contract.productionDays, 1);
    assert.deepEqual(saved.contract.deliverables, [{ format: 'Reel', quantity: 4 }]);
    assert.equal(saved.projectManagerId, 'fiction-pm');
    assert.equal(saved.communityManagerId, 'fiction-cm');
    assert.deepEqual(saved.contract.scopeDetails.contentGroups, [{ formats: ['Reel', 'Video', 'Carrusel'], quantity: 8, rule: 'MAXIMO' }]);
    await page.getByRole('button', { name: 'Editar', exact: true }).click();
    assert.equal(await page.getByLabel('Cantidad de historias', { exact: true }).inputValue(), '9');
    assert.equal(await page.getByLabel('Cantidad del límite 1', { exact: true }).inputValue(), '7');
    assert.equal(await page.getByLabel('Horas por jornada', { exact: true }).inputValue(), '4');
    assert.equal(await page.getByLabel('Cantidad del grupo 1', { exact: true }).inputValue(), '8');
    assert.equal(await page.getByLabel('Carrusel en grupo 1', { exact: true }).isChecked(), true);
    await page.getByRole('button', { name: 'Cancelar', exact: true }).click();
    for (const scenario of ['shared', 'flexible', 'partial']) {
      await page.goto(`http://127.0.0.1:3830/tests/fixtures/client-contract-scope.html?theme=${theme}&scenario=${scenario}`, { waitUntil: 'networkidle' });
      const text = await profile.innerText();
      if (scenario === 'shared') {
        assert.match(text, /6 contenidos entre Post, Carrusel y Reel/);
        assert.doesNotMatch(text, /Sin clasificar/);
      } else if (scenario === 'flexible') {
        assert.match(text, /20 contenidos entre Reel, Video, Carrusel y Post/);
        assert.match(text, /Hasta 6 contenidos entre Reel y Video/);
        assert.match(text, /Hasta 4 Carrusel/);
        assert.match(text, /Hasta 10 Post/);
        assert.match(text, /20 en total/);
        assert.doesNotMatch(text, /Sin clasificar/);
      } else {
        assert.match(text, /2 Sin clasificar/);
        assert.match(text, /12 en total/);
      }
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
      await profile.evaluate(node => window.scrollTo(0, node.getBoundingClientRect().top + window.scrollY - 24));
      await page.screenshot({ path: path.join(output, `${scenario}-${suffix}.png`) });
      captures.push(`${scenario}-${suffix}.png`);
    }
    await context.close();
  }
  assert.deepEqual(errors, []);
  assert.deepEqual(apiRequests, []);
  await writeFile(path.join(output, 'qa.json'), JSON.stringify({ passed: true, viewports: ['1440x1000', '390x1000'], themes: ['light', 'dark'], captures, errors, apiRequests, savesRetainLegacy: true, reopenRetainsValues: true, groupedFormats: true }, null, 2));
  console.log(JSON.stringify({ passed: true, output, captures, errors: 0, apiRequests: 0 }));
} finally {
  await browser?.close();
  await new Promise(resolve => server.close(resolve));
}
