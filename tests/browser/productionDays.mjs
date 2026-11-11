// Jornadas de producción con evidencia (10 de noviembre de 2026), con la API simulada; no carga .env ni contacta producción.
import assert from 'node:assert/strict';
import path from 'node:path';
import { mkdir } from 'node:fs/promises';
import { createServer } from 'vite';
import { chromium } from 'playwright-core';

const root = path.resolve(import.meta.dirname, '../..');
const OUT = path.join(root, 'output/jornadas-produccion');
const server = await createServer({
  configFile: false, root, envDir: path.join(root, 'tests/fixtures'),
  optimizeDeps: { entries: ['tests/fixtures/production-days-preview.html'] },
  esbuild: { jsx: 'automatic' }, resolve: { alias: { '@': path.join(root, 'src') } },
  define: { 'import.meta.env.VITE_API_URL': 'window.location.origin' },
  logLevel: 'error', server: { host: '127.0.0.1', port: 0, proxy: {} },
});
let browser;
try {
  await server.listen();
  await mkdir(OUT, { recursive: true });
  const origin = `http://127.0.0.1:${server.httpServer.address().port}`;
  browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
  for (const [name, viewport] of [['escritorio', { width: 1280, height: 1000 }], ['celular', { width: 390, height: 900 }]]) {
    for (const theme of ['light', 'dark']) {
      const page = await browser.newPage({ viewport });
      page.setDefaultTimeout(8000);
      page.setDefaultNavigationTimeout(90000);
      const errors = [];
      page.on('pageerror', (error) => errors.push(error.message));
      const state = { productionDay: null };
      const view = () => ({
        eventId: 'ev-b', date: '2026-11-06', title: 'Jornada de producción Multik | Casa de Francisco',
        productionDay: state.productionDay, canLink: true, canEvidence: true,
        clients: [{ id: 'c-multik', name: 'Multik', suggested: true }, { id: 'c-nattal', name: 'Nattal', suggested: false }],
      });
      const puts = [];
      await page.route('**/*', async (route) => {
        const url = new URL(route.request().url());
        if (url.origin !== origin) return route.abort();
        if (!url.pathname.startsWith('/api/')) return route.continue();
        const method = route.request().method();
        if (method === 'PUT') puts.push([url.pathname, route.request().postDataJSON()]);
        if (url.pathname.endsWith('/client') && method === 'PUT') {
          state.productionDay = { id: 'pd', eventId: 'ev-b', date: '2026-11-06', title: 'Jornada', client: { id: 'c-multik', name: 'Multik' }, state: 'SIN_EVIDENCIA', evidenceUrl: null };
        }
        if (url.pathname.endsWith('/evidence') && method === 'PUT') {
          const body = route.request().postDataJSON();
          state.productionDay = { ...state.productionDay, state: 'REALIZADA', evidenceUrl: body.url.trim(), evidenceNote: body.note || null, evidenceBy: 'Brayan', evidenceAt: '2026-11-11' };
        }
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(view()) });
      });
      await page.goto(`${origin}/tests/fixtures/production-days-preview.html`);
      await page.evaluate((dark) => document.documentElement.classList.toggle('dark', dark), theme === 'dark');
      const panel = page.locator('[data-production-day-panel]');
      await panel.waitFor();
      assert.match(await panel.innerText(), /primero hay que ligarla/);

      // Ligar al cliente sugerido por el título.
      await panel.getByLabel('Cliente').click();
      const option = page.getByRole('option', { name: /Multik · sugerido/ });
      if (await option.count()) await option.click();
      else await panel.getByLabel('Cliente').selectOption('c-multik');
      await page.getByText('Jornada ligada a Multik').waitFor();
      assert.equal(await page.locator('[data-production-day-state]').getAttribute('data-production-day-state'), 'SIN_EVIDENCIA');

      // Sin enlace dice el motivo y no envía nada.
      const form = page.locator('[data-production-evidence-form]');
      await form.getByRole('button', { name: 'Guardar evidencia' }).click();
      assert.match(await form.getByRole('alert').innerText(), /enlace de la carpeta de Drive/);
      assert.equal(puts.filter(([p]) => p.endsWith('/evidence')).length, 0);
      await page.screenshot({ path: path.join(OUT, `panel-sin-evidencia-${name}-${theme}.png`), fullPage: true });

      await form.getByLabel(/Enlace de la carpeta de Drive/).fill('https://drive.google.com/drive/folders/abc');
      await form.getByLabel('Nota de la evidencia').fill('Fotos y videos del local');
      await form.getByRole('button', { name: 'Guardar evidencia' }).click();
      await page.getByText('Evidencia guardada: jornada realizada').waitFor();
      assert.equal(await page.locator('[data-production-day-state]').getAttribute('data-production-day-state'), 'REALIZADA');
      assert.equal(await page.locator('[data-production-evidence-link]').getAttribute('href'), 'https://drive.google.com/drive/folders/abc');

      const section = page.locator('[data-production-days]');
      assert.match(await section.locator('[data-production-summary]').innerText(), /1 de 2 realizadas/);
      assert.deepEqual(await section.locator('[data-production-day]').evaluateAll((rows) => rows.map((row) => row.dataset.productionDay)), ['REALIZADA', 'SIN_EVIDENCIA', 'AGENDADA']);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, 'sin desbordar a lo ancho');
      await page.waitForTimeout(300);
      await page.screenshot({ path: path.join(OUT, `realizada-${name}-${theme}.png`), fullPage: true });
      assert.deepEqual(errors, []);
      await page.close();
    }
  }
  console.log('Ligar, frenar sin enlace, guardar evidencia y la sección del cliente: correctos en claro y oscuro, escritorio y celular.');
} finally {
  await browser?.close();
  await server.close();
}
