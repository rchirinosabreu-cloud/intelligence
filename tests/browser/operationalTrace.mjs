import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright-core';
import { createRecognitionPreview } from '../../scripts/preview-recognitions.js';
import { getOperationalTrace } from '../../src/services/operationalTraceService.js';

let preview, browser;
before(async () => {
  preview = await createRecognitionPreview({ port: 0 });
  browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
  await mkdir('output/operational-trace', { recursive: true });
});
after(async () => { await browser?.close(); await preview?.close(); });

async function setup({ mobile = false, dark = false, fail = false } = {}) {
  const page = await browser.newPage({ viewport: mobile ? { width: 390, height: 844 } : { width: 1440, height: 900 }, isMobile: mobile, hasTouch: mobile });
  page.setDefaultTimeout(5000);
  const requests = [], errors = [];
  page.on('pageerror', error => errors.push(error.message));
  const users = [{ id: 'rodny', name: 'Rodny Chirinos', role: 'ADMIN', avatarUrl: null }, { id: 'francisco', name: 'Francisco Villa', role: 'EDITOR', avatarUrl: null }];
  const rows = [
    { id: 'check', actor: users[0], metadata: { path: '/api/recognitions/claim', method: 'POST', module: 'recognitions' } },
    { id: 'minutes', actor: users[1], metadata: { path: '/api/fireflies/graphql', method: 'POST', module: 'fireflies' } },
    { id: 'client', actor: users[0], metadata: { path: '/api/clients/:id', method: 'PATCH', module: 'Clientes', action: 'actualizó', resource: 'un registro de cliente' } },
    { id: 'manual', actor: users[0], eventType: 'TASK_LIST_SYNCED', metadata: { source: 'MANUAL', taskCount: 8 } },
    { id: 'automatic', actor: users[0], eventType: 'TASK_LIST_SYNCED', metadata: { source: 'AUTOMATIC', taskCount: 8 } },
  ].map(row => ({ eventType: 'PLATFORM_MUTATION', taskId: null, occurredAt: new Date('2026-09-14T12:17:00Z'), ...row, actorId: row.actor.id, subjectUserId: row.actor.id, subjectUser: row.actor }));
  await page.route('**/api/**', async route => {
    const url = new URL(route.request().url());
    if (url.pathname !== '/api/dashboard/operational-trace') return route.fulfill({ status: 404, json: {} });
    requests.push(Object.fromEntries(url.searchParams));
    if (fail) return route.fulfill({ status: 500, json: { error: 'No fue posible cargar la trazabilidad.' } });
    const data = await getOperationalTrace({ requester: users[0], filters: Object.fromEntries(url.searchParams), now: new Date('2026-09-14T13:00:00Z'), db: {
      user: { findMany: async () => users },
      operationalTraceEvent: { findMany: async () => rows.filter(row => !url.searchParams.get('userId') || row.actorId === url.searchParams.get('userId')) },
      task: { findMany: async () => [] },
    } });
    return route.fulfill({ json: data });
  });
  await page.goto(`${preview.origin}/tests/fixtures/operational-trace-preview.html${dark ? '?dark' : ''}`, { timeout: 30000 });
  return { page, requests, errors };
}

test('trace removes search while preserving member, period and refresh controls', async () => {
  const { page, requests, errors } = await setup();
  try {
    await page.getByText('Rodny Chirinos actualizó un registro de cliente en Clientes.', { exact: true }).waitFor();
    assert.equal(await page.getByRole('textbox').count(), 0);
    assert.equal(await page.getByRole('button', { name: 'Buscar', exact: true }).count(), 0);
    await page.getByText('Comprobación de reconocimientos', { exact: true }).waitFor();
    await page.getByText('Francisco Villa realizó una solicitud en Minutas.', { exact: true }).waitFor();
    await page.getByText('Actualización manual', { exact: true }).waitFor();
    await page.getByText('Actualización automática', { exact: true }).waitFor();
    assert.doesNotMatch(await page.locator('section').innerText(), /fireflies|recognitions|creó o ejecutó/);
    await page.locator('section').screenshot({ path: 'output/operational-trace/desktop-light.png' });
    await page.getByRole('combobox', { name: 'Miembro del equipo' }).click();
    await page.getByRole('option', { name: 'Rodny Chirinos' }).click();
    await page.waitForFunction(() => !document.querySelector('section').textContent.includes('Francisco Villa realizó'));
    await page.getByRole('combobox', { name: 'Período' }).click();
    await Promise.all([
      page.waitForResponse(response => response.url().includes('days=30')),
      page.getByRole('option', { name: 'Últimos 30 días' }).click(),
    ]);
    const count = requests.length;
    await Promise.all([
      page.waitForResponse(response => response.url().includes('operational-trace')),
      page.getByRole('button', { name: 'Actualizar trazabilidad' }).click(),
    ]);
    assert.ok(requests.length > count);
    assert.equal(requests.at(-1).userId, 'rodny');
    assert.equal(requests.at(-1).days, '30');
    assert.equal(requests.some(params => 'taskQuery' in params), false);
    assert.deepEqual(errors, []);
  } finally { await page.close(); }
});

test('trace fits mobile dark mode and retains the native touch selectors', async () => {
  const { page, errors } = await setup({ mobile: true, dark: true });
  try {
    await page.getByText('Solicitud de Minutas', { exact: true }).waitFor();
    const member = page.locator('select#trace-user');
    assert.equal(await member.isVisible(), true);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await member.selectOption('rodny');
    await page.waitForFunction(() => !document.querySelector('section').textContent.includes('Francisco Villa realizó'));
    const description = page.getByText('El sistema comprobó si había avisos de reconocimiento pendientes para Rodny Chirinos.', { exact: true });
    assert.ok((await description.boundingBox()).width >= 240, 'mobile timestamps must not squeeze the description');
    await member.selectOption('');
    await page.getByText('Francisco Villa realizó una solicitud en Minutas.', { exact: true }).waitFor();
    await page.screenshot({ path: 'output/operational-trace/mobile-dark.png' });
    assert.deepEqual(errors, []);
  } finally { await page.close(); }
});

test('a trace API error is not presented as an empty or successful history', async () => {
  const { page } = await setup({ fail: true });
  try {
    await page.getByText('No fue posible cargar la trazabilidad.', { exact: true }).waitFor();
    assert.equal(await page.getByText('No hay eventos para estos filtros', { exact: true }).count(), 0);
  } finally { await page.close(); }
});
