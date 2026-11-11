// Jornadas de producción (10–11 de noviembre de 2026), con la API simulada; no carga .env ni contacta producción.
// 1) En el calendario: título primero, luego tipo y —si es Producción— el cliente, en una sola fila; el pedido lleva el
//    cliente. 2) En el pendiente de Gestión: el enlace de Drive frena sin enlace y lo deja «Realizada». 3) En la página del
//    cliente, cada jornada lleva a su pendiente.
import assert from 'node:assert/strict';
import path from 'node:path';
import { mkdir } from 'node:fs/promises';
import { createServer } from 'vite';
import { chromium } from 'playwright-core';

const root = path.resolve(import.meta.dirname, '../..');
const OUT = path.join(root, 'output/jornadas-produccion');
const server = await createServer({
  configFile: false, root, envDir: path.join(root, 'tests/fixtures'),
  optimizeDeps: { entries: ['tests/fixtures/production-days-preview.html', 'tests/fixtures/activity-journey-preview.html'] },
  esbuild: { jsx: 'automatic' }, resolve: { alias: { '@': path.join(root, 'src') } },
  define: { 'import.meta.env.VITE_API_URL': 'window.location.origin' },
  logLevel: 'error', server: { host: '127.0.0.1', port: 0, proxy: {} },
});
let browser;
const user = { id: 'u-kamila', name: 'Kamila Ortiz', role: 'PROJECT_MANAGER', modulePermissions: { actividad: true, gestion: true } };
const team = [
  { id: 'm-kamila', name: 'Kamila Ortiz', role: 'Project Manager', userId: 'u-kamila', isActive: true },
  { id: 'm-brayan', name: 'Brayan Gómez', role: 'Audiovisual', userId: 'u-brayan', isActive: true },
];
const clients = [{ id: 'c-aristea', name: 'Aristea' }, { id: 'c-mn', name: 'Martínez y Nájera' }, { id: 'c-np', name: 'New Pueblito' }];
try {
  await server.listen();
  await mkdir(OUT, { recursive: true });
  const origin = `http://127.0.0.1:${server.httpServer.address().port}`;
  browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });

  // 1) El formulario del calendario.
  for (const theme of ['light', 'dark']) {
    const page = await browser.newPage({ viewport: { width: 1360, height: 900 } });
    page.setDefaultTimeout(20000);
    page.setDefaultNavigationTimeout(120000);
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.clock.setFixedTime(new Date('2026-11-11T15:00:00Z'));
    await page.addInitScript((u) => { localStorage.setItem('currentUser', JSON.stringify(u)); localStorage.setItem('authToken', `x.${btoa(JSON.stringify({ exp: 4102444800 }))}.x`); }, user);
    const posts = [];
    await page.route('**/*', async (route) => {
      const url = new URL(route.request().url());
      if (url.origin !== origin) return route.abort();
      if (!url.pathname.startsWith('/api/')) return route.continue();
      let body = [];
      if (url.pathname === '/api/auth/me') body = user;
      else if (url.pathname === '/api/team') body = team;
      else if (url.pathname === '/api/production-days/clients') body = clients;
      else if (url.pathname === '/api/activity/google-calendar/status') body = { connected: true, connections: [{ id: 'g1', email: 'calendario@agencia.test', isActive: true }] };
      else if (url.pathname === '/api/activity/events' && route.request().method() === 'POST') {
        const input = route.request().postDataJSON();
        posts.push(input);
        body = { id: 'ev-new', ...input, googleSyncStatus: 'SYNCED' };
      }
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
    });
    await page.goto(`${origin}/tests/fixtures/activity-journey-preview.html?vista=calendario`);
    await page.evaluate((dark) => document.documentElement.classList.toggle('dark', dark), theme === 'dark');
    await page.getByRole('button', { name: /Evento/ }).first().click();
    const dialog = page.getByRole('dialog');
    await dialog.waitFor();
    // El título va primero, antes que el tipo y el cliente.
    const order = await dialog.locator('#operational-event-title, #operational-event-type, #operational-event-client').evaluateAll((nodes) => nodes.map((node) => node.id));
    assert.deepEqual(order, ['operational-event-title', 'operational-event-type', 'operational-event-client']);
    await dialog.locator('#operational-event-title').fill('Jornada de producción Martínez y Nájera');
    const titleBox = await dialog.locator('#operational-event-title').boundingBox();
    const typeBox = await dialog.locator('#operational-event-type').boundingBox();
    const clientBox = await dialog.locator('[data-production-client-field]').boundingBox();
    assert.ok(typeBox.y > titleBox.y, 'el tipo va debajo del título');
    assert.ok(Math.abs(clientBox.y - (typeBox.y - 24)) < 30, 'el cliente va en la misma fila del tipo');
    await dialog.locator('#operational-event-client').click();
    await page.waitForTimeout(250);
    await page.screenshot({ path: path.join(OUT, `1-formulario-cliente-${theme}.png`) });
    const option = page.getByRole('option', { name: /Martínez y Nájera · sugerido/ });
    if (await option.count()) await option.click(); else await dialog.locator('#operational-event-client').selectOption('c-mn');
    await dialog.getByRole('button', { name: /Crear evento|Guardar evento/ }).click();
    await page.waitForTimeout(500);
    assert.equal(posts.at(-1)?.productionClientId, 'c-mn', 'el pedido lleva el cliente');
    assert.equal(posts.at(-1)?.type, 'PRODUCTION');
    assert.deepEqual(errors, []);
    await page.close();
  }

  // 2) y 3) El pendiente de Gestión y la página del cliente.
  for (const [name, viewport] of [['escritorio', { width: 1280, height: 1000 }], ['celular', { width: 390, height: 900 }]]) {
    for (const theme of ['light', 'dark']) {
      const page = await browser.newPage({ viewport });
      page.setDefaultTimeout(10000);
      page.setDefaultNavigationTimeout(120000);
      await page.clock.setFixedTime(new Date('2026-11-11T15:00:00Z'));
      const errors = [];
      page.on('pageerror', (error) => errors.push(error.message));
      const state = { evidenceUrl: null };
      const view = () => ({
        eventId: 'ev-b', date: '2026-11-06', title: 'Jornada de producción Multik | Casa de Francisco', schedule: '9:00 a 13:00', canEvidence: true,
        productionDay: { id: 'pd', taskId: 'task-b', date: '2026-11-06', client: { id: 'c-multik', name: 'Multik' }, state: state.evidenceUrl ? 'REALIZADA' : 'SIN_EVIDENCIA', evidenceUrl: state.evidenceUrl, evidenceBy: state.evidenceUrl ? 'Brayan Gómez' : null, evidenceAt: state.evidenceUrl ? '2026-11-11' : null },
      });
      const puts = [];
      await page.route('**/*', async (route) => {
        const url = new URL(route.request().url());
        if (url.origin !== origin) return route.abort();
        if (!url.pathname.startsWith('/api/')) return route.continue();
        if (route.request().method() === 'PUT') { puts.push(route.request().postDataJSON()); state.evidenceUrl = route.request().postDataJSON().url; }
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(view()) });
      });
      await page.goto(`${origin}/tests/fixtures/production-days-preview.html`);
      await page.evaluate((dark) => document.documentElement.classList.toggle('dark', dark), theme === 'dark');
      const block = page.locator('[data-task-production]');
      await block.waitFor();
      assert.equal(await block.locator('[data-task-production-state]').getAttribute('data-task-production-state'), 'SIN_EVIDENCIA');
      assert.match(await block.innerText(), /«Entregas»/);
      await block.getByRole('button', { name: 'Guardar enlace' }).click();
      assert.match(await block.getByRole('alert').innerText(), /enlace de la carpeta de Drive/);
      assert.equal(puts.length, 0, 'sin enlace no se envía nada');
      await page.screenshot({ path: path.join(OUT, `2-pendiente-sin-evidencia-${name}-${theme}.png`), fullPage: true });
      await block.getByLabel('Enlace de la carpeta de Drive con las evidencias').fill('https://drive.google.com/drive/folders/abc');
      await block.getByRole('button', { name: 'Guardar enlace' }).click();
      await page.getByText('Enlace guardado: jornada realizada').waitFor();
      assert.equal(await block.locator('[data-task-production-state]').getAttribute('data-task-production-state'), 'REALIZADA');
      assert.equal(await block.locator('[data-task-production-link]').getAttribute('href'), 'https://drive.google.com/drive/folders/abc');
      const section = page.locator('[data-production-days]');
      assert.match(await section.locator('[data-production-summary]').innerText(), /1 de 2 realizadas/);
      assert.equal(await section.locator('[data-production-day-task]').count(), 3, 'cada jornada lleva a su pendiente');
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, 'sin desbordar a lo ancho');
      await page.waitForTimeout(300);
      await page.screenshot({ path: path.join(OUT, `3-pendiente-realizada-${name}-${theme}.png`), fullPage: true });
      assert.deepEqual(errors, []);
      await page.close();
    }
  }
  console.log('Formulario en orden, cliente en la fila del tipo, enlace de Drive en el pendiente y sección del cliente: correctos.');
} finally {
  await browser?.close();
  await server.close();
}
