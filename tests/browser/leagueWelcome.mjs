// Real application, simulated account permissions and guide progress; no production writes.
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright-core';
import { createDashboardPreview } from '../../scripts/preview-dashboard.js';
import { dashboardDemoUser } from '../fixtures/dashboardPreviewData.js';

const output = 'output/recognition-panel';
await mkdir(output, { recursive: true });
const preview = await createDashboardPreview({ port: 3262 });
const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
page.setDefaultTimeout(15000); page.setDefaultNavigationTimeout(90000);
let allowed = false, progress = {}, rejectSave = true, writes = 0, reads = 0;
await page.route('**/api/user/onboarding', async route => {
  if (route.request().method() === 'POST') {
    const input = route.request().postDataJSON();
    assert.equal(input.guideId, 'liga'); assert.equal(input.version, 2);
    writes++;
    if (rejectSave) { rejectSave = false; return route.fulfill({ status: 500, json: { error: 'No pudimos guardar tu bienvenida.' } }); }
    progress = { liga: input.status };
    return route.fulfill({ json: { ...input, userId: dashboardDemoUser.id } });
  }
  reads++;
  return route.fulfill({ json: { user: { ...dashboardDemoUser, modulePermissions: { ...dashboardDemoUser.modulePermissions, liga: allowed } }, autoOnboarding: false, progress } });
});
const dock = page.locator('[data-league-dock]');
const guide = page.locator('[data-league-welcome]');
const bubble = page.locator('[data-league-invitation]');
try {
  await page.clock.install();
  await page.goto(preview.origin, { waitUntil: 'domcontentloaded' });
  await page.getByRole('heading', { name: 'Anuncios' }).waitFor();
  assert.equal(await dock.count(), 0, 'cached admin permissions do not override the current disabled permission');
  await page.waitForTimeout(200);
  allowed = true;
  await page.clock.fastForward(60001);
  await bubble.getByText('¡Hey, por aquí!', { exact: true }).waitFor();
  assert.equal((await bubble.innerText()).trim(), '¡Hey, por aquí!');
  await page.clock.resume();
  assert.equal(await page.locator('[data-league-panel]').count(), 0, 'invitation does not automatically open a window');
  await page.screenshot({ path: `${output}/bienvenida-invitacion.png` });
  await bubble.getByRole('button', { name: /Hey/ }).click();
  // La primera vez es el recorrido animado: seis pasos, avatares con gesto y el cierre guarda el avance.
  await guide.getByRole('heading', { name: 'El buen trabajo suma' }).waitFor();
  assert.equal(await guide.getAttribute('data-tour-step'), 'inicio');
  assert.match(await guide.innerText(), /última semana de noviembre/);
  assert.equal(await guide.locator('[data-tour-stage] [data-runner-avatar]').count(), 5);
  await guide.screenshot({ path: `${output}/bienvenida-1.png` });
  await guide.getByRole('button', { name: 'Ver lo nuevo' }).click();
  for (const step of ['area', 'cierre', 'camara', 'anticipada']) {
    assert.equal(await guide.getAttribute('data-tour-step'), step);
    assert.equal(await guide.locator('[data-welcome-content]').evaluate(el => el.scrollWidth <= el.clientWidth), true);
    await guide.getByRole('button', { name: 'Siguiente' }).click();
  }
  assert.equal(await guide.getAttribute('data-tour-step'), 'final');
  await guide.getByRole('button', { name: 'Paso anterior' }).click();
  assert.equal(await guide.getAttribute('data-tour-step'), 'anticipada');
  await guide.getByRole('button', { name: 'Siguiente' }).click();
  await guide.getByRole('button', { name: '¡A darla toda!' }).click();
  await guide.getByRole('alert').waitFor();
  assert.equal(writes, 1); assert.deepEqual(progress, {});
  await guide.getByRole('button', { name: '¡A darla toda!' }).click();
  await guide.waitFor({ state: 'hidden' });
  assert.deepEqual(progress, { liga: 'COMPLETED' });
  await page.reload();
  await dock.waitFor();
  assert.equal(await bubble.count(), 0, 'completion survives reload through server progress');
  await dock.click();
  assert.equal(await guide.count(), 0);
  // Después, «Ver bienvenida» enseña el resumen fijo de una sola página.
  await page.getByRole('button', { name: 'Ver bienvenida' }).click();
  await guide.waitFor();
  assert.equal(await guide.getAttribute('data-league-tour'), null);
  assert.equal(await guide.getByRole('button', { name: 'Siguiente' }).count(), 0);
  assert.equal(await guide.locator('[data-welcome-changes] li').count(), 5);
  assert.equal(await guide.locator('[data-welcome-same] li').count(), 5);
  await guide.getByRole('button', { name: 'Entendido' }).click();
  await guide.waitFor({ state: 'hidden' });
  assert.equal(writes, 2, 'replaying the guide does not overwrite completion');

  progress = {};
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto(`${preview.origin}/?dark`, { waitUntil: 'domcontentloaded' });
  await bubble.waitFor();
  assert.equal(await dock.locator('svg').evaluate(el => getComputedStyle(el).animationName), 'none');
  await page.screenshot({ path: `${output}/bienvenida-invitacion-movil.png` });
  await bubble.getByRole('button', { name: /Hey/ }).click();
  await guide.waitFor();
  await guide.screenshot({ path: `${output}/bienvenida-movil-oscuro.png` });
  assert.equal(await guide.evaluate(el => el.scrollWidth <= el.clientWidth), true);
  assert.equal(await guide.getByRole('button', { name: 'Ver lo nuevo' }).evaluate(el => { const box = el.getBoundingClientRect(); return box.top >= 0 && box.bottom <= innerHeight; }), true, 'the next step stays visible');
  allowed = false;
  await page.evaluate(() => window.dispatchEvent(new Event('visibilitychange')));
  await dock.waitFor({ state: 'hidden' });
  await guide.waitFor({ state: 'hidden' });
  console.log(JSON.stringify({ passed: true, simulatedApi: true, output }));
} catch (error) {
  console.error({ reads, allowed, writes, dock: await dock.count(), dialogs: await page.locator('[role="dialog"]').allTextContents(), body: (await page.locator('body').innerText()).slice(-1500) });
  await page.screenshot({ path: output + '/welcome-failure.png' });
  throw error;
} finally { await browser.close(); await preview.close(); }
