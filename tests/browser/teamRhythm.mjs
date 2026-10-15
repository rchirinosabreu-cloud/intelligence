import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright-core';
import { createServer } from 'vite';

const output = path.resolve('output/team-rhythm');
await mkdir(output, { recursive: true });
const server = await createServer({ configFile: false, root: process.cwd(), envDir: path.resolve('tests/fixtures'),
  resolve: { alias: { '@': path.resolve('src') } }, esbuild: { jsx: 'automatic' },
  define: { __BUILD_SHA__: JSON.stringify('rhythm-preview') }, server: { host: '127.0.0.1', port: 3745, strictPort: true }, logLevel: 'error' });
await server.listen();
const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
page.setDefaultTimeout(10000);
const errors = [], requests = [];
page.on('pageerror', error => errors.push(error.message));
await page.exposeFunction('trackRhythmRequest', url => requests.push(url));
await page.addInitScript(() => {
  const real = window.fetch;
  // The fixture installs its own in-memory API after this observer.
  Object.defineProperty(window, 'fetch', { configurable: true, get() { return this.__rhythmFetch || real; }, set(fn) {
    this.__rhythmFetch = (...args) => { window.trackRhythmRequest(String(args[0])); return fn(...args); };
  } });
});
const url = 'http://127.0.0.1:3745/tests/fixtures/team-rhythm-preview.html?tab=ritmo';
try {
  await page.goto(url);
  await page.getByRole('button', { name: 'Esta semana', exact: true }).waitFor();
  await page.locator('[data-week-team-person]').first().waitFor();
  assert.equal(await page.locator('[data-rhythm-types]:visible').count(), 0, 'historical tables stay out of the initial view');
  assert.equal(await page.getByText('Esfuerzo registrado', { exact: true }).isVisible(), false);
  assert.equal(requests.some(url => url.includes('task-analytics')), false, 'historical statistics are fetched only on demand');
  assert.equal(await page.locator('[data-weekly-reading-decisions] > li:visible').count(), 3);
  assert.equal(await page.locator('[data-load-grid]:visible').count(), 0, 'the ten-day grid is optional');
  await page.screenshot({ path: path.join(output, 'semana-claro.png'), fullPage: true });

  await page.getByRole('button', { name: /Pueden recibir trabajo/ }).click();
  assert.equal(await page.locator('[data-week-team-person]').count(), 1);
  assert.match(await page.locator('[data-week-team-person]').innerText(), /Beatriz/);
  await page.getByRole('button', { name: /Necesitan revisión/ }).click();
  assert.equal(await page.locator('[data-week-team-person]').count(), 2);
  await page.getByRole('button', { name: 'Ver todo el equipo', exact: true }).click();

  await page.getByRole('button', { name: /Ver tareas de Andrés/ }).focus();
  await page.keyboard.press('Enter');
  await page.locator('[data-week-person-detail]').waitFor();
  assert.match(await page.locator('[data-week-person-detail]').innerText(), /Nutresa/);
  assert.ok(await page.locator('[data-week-person-detail] a[href^="/gestion?taskId="]').count() > 0);
  const loads = requests.filter(url => url.includes('/rhythm/load')).length;
  await page.getByRole('button', { name: 'Actualizar', exact: true }).click();
  await page.waitForFunction(() => document.querySelector('[data-week-person-detail]') !== null);
  assert.equal(await page.locator('[data-week-person-detail]').isVisible(), true, 'refresh preserves the open person');
  assert.ok(requests.filter(url => url.includes('/rhythm/load')).length > loads);
  await page.screenshot({ path: path.join(output, 'persona-claro.png'), fullPage: true });
  await page.getByRole('button', { name: /Ver tareas de Andrés/ }).click();
  await page.getByRole('button', { name: 'Ver todas las decisiones' }).click();
  assert.equal(await page.locator('[data-weekly-reading-decisions] > li:visible').count(), 4);
  await page.getByRole('button', { name: 'Pedírselo a Bria', exact: true }).first().click();
  assert.equal(requests.some(url => /\/bria\/.*messages/.test(url)), false, 'the suggested message is not sent');

  await page.getByRole('button', { name: 'Historial', exact: true }).click();
  await page.getByText('Esfuerzo registrado', { exact: true }).waitFor();
  assert.ok(requests.some(url => url.includes('task-analytics')));
  await page.getByRole('button', { name: '90 días', exact: true }).click();
  await page.waitForFunction(() => document.querySelector('[data-rhythm-coverage]')?.textContent.includes('90 días'));
  await page.getByText('Observaciones del cronómetro por persona', { exact: true }).click();
  await page.getByRole('button', { name: 'Ver todo' }).first().click();
  assert.ok(await page.locator('[data-rhythm-types]:visible').count() > 0);
  await page.screenshot({ path: path.join(output, 'historial-claro.png'), fullPage: true });

  for (const [name, width, dark] of [['semana-oscuro', 1440, true], ['semana-movil', 390, false], ['semana-movil-oscuro', 390, true]]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(`${url}${dark ? '&dark' : ''}`);
    await page.locator('[data-week-team-person]').first().waitFor();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
    assert.equal(overflow, false, `${name}: no page overflow`);
    await page.screenshot({ path: path.join(output, `${name}.png`), fullPage: true });
    await page.getByRole('button', { name: /Ver tareas de Andrés/ }).click();
    assert.equal(await page.locator('[data-week-person-detail]').isVisible(), true);
  }
  await page.goto(`${url}&sinlectura`);
  await page.getByText('Bria todavía no escribió', { exact: false }).waitFor();
  await page.getByRole('button', { name: 'Pedir la lectura', exact: true }).click();
  await page.locator('[data-weekly-reading-decisions]').waitFor();
  assert.deepEqual(errors, []);
  console.log('Ritmo: semana, detalles, decisiones, historial, móvil y ambos temas verificados.');
} finally { await browser.close(); await server.close(); }
