import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createServer } from 'vite';
import { chromium } from 'playwright-core';

// Explicit local UI verification: intercepted API responses, no production connections.
const root = process.cwd();
const output = path.join(root, 'verification/calendar-reliability');
let server;
let browser;
before(async () => {
  await mkdir(output, { recursive: true });
  await writeFile(path.join(output, 'index.html'), '<html><body><div id="root"></div><script type="module" src="/verification/calendar-reliability/harness.jsx"></script></body></html>');
  await writeFile(path.join(output, 'harness.jsx'), `
    import React from 'react';
    import { createRoot } from 'react-dom/client';
    import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
    import { AuthProvider } from '/src/context/AuthContext.jsx';
    import OperationalCalendar from '/src/components/modules/Activity/OperationalCalendar.jsx';
    import GoogleCalendarCallback from '/src/components/modules/Activity/GoogleCalendarCallback.jsx';
    import { MemoryRouter, Routes, Route } from 'react-router-dom';
    import { Toaster } from 'react-hot-toast';
    import '/src/index.css';
    import 'react-datepicker/dist/react-datepicker.css';
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const oauth = location.search.includes('oauth');
    createRoot(document.getElementById('root')).render(oauth ? <React.StrictMode><MemoryRouter initialEntries={['/callback?code=test-code&state=test-state']}><Routes><Route path="/callback" element={<GoogleCalendarCallback />} /><Route path="/actividad" element={<p>Conexión finalizada</p>} /></Routes><Toaster /></MemoryRouter></React.StrictMode> : <AuthProvider><QueryClientProvider client={client}><main className="min-h-screen bg-zinc-50 p-5 text-zinc-900 dark:bg-zinc-950 dark:text-white"><OperationalCalendar /></main><Toaster /></QueryClientProvider></AuthProvider>);
  `);
  server = await createServer({ configFile: false, root, envDir: output, resolve: { alias: { '@': path.join(root, 'src') } }, server: { host: '127.0.0.1', port: 3187, strictPort: true, hmr: false, watch: { ignored: ['**/*'] } }, logLevel: 'error' });
  await server.listen();
  browser = await chromium.launch({ executablePath: process.env.CALENDAR_BROWSER || 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
});
after(async () => { await browser?.close(); await server?.close(); });

async function calendarPage({ save, update, remove, generate, retry, status, reconciliation, sync, events = [], timezone = 'Asia/Tokyo', fixedDate = '2026-09-07T20:45:00Z' } = {}) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, timezoneId: timezone });
  await context.addInitScript(() => {
    localStorage.setItem('authToken', `e30.${btoa(JSON.stringify({ exp: 9999999999 }))}.test`);
    localStorage.setItem('currentUser', JSON.stringify({ id: 'audit-admin', role: 'ADMIN', name: 'Auditoría' }));
  });
  const page = await context.newPage();
  await page.clock.setFixedTime(new Date(fixedDate));
  const reads = [];
  await page.route('**/*', async route => {
    const request = route.request();
    const url = new URL(request.url());
    if (!url.pathname.startsWith('/api/')) {
      if (url.hostname !== '127.0.0.1') return route.abort();
      return route.continue();
    }
    const fulfill = data => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(data) });
    if (url.pathname === '/api/auth/me') return fulfill({ id: 'audit-admin', role: 'ADMIN', name: 'Auditoría' });
    if (url.pathname === '/api/team') return fulfill([]);
    if (url.pathname === '/api/activity/google-calendar/status') return status ? status(route) : fulfill({ connected: true, connections: [{ id: 'test-google', email: 'coordinadorbrainstudio@gmail.com', lastSyncedAt: new Date().toISOString(), channelExpiresAt: new Date(Date.now() + 86400000).toISOString(), errorCount: 0 }], reconciliation: { pendingCount: 0 } });
    if (url.pathname === '/api/activity/google-calendar/sync') return fulfill(sync || []);
    if (url.pathname === '/api/activity/google-calendar/reconciliation' && reconciliation) return reconciliation(route);
    if (url.pathname.includes('/google-calendar/errors/') && url.pathname.endsWith('/retry') && retry) return retry(route);
    if (url.pathname === '/api/activity/events' && request.method() === 'GET') { reads.push(url); return fulfill(events); }
    if (url.pathname === '/api/activity/events' && request.method() === 'POST') return save ? save(route) : fulfill({ id: 'created', googleSyncStatus: 'SYNCED' });
    if (url.pathname === '/api/activity/events/generate-meet' && generate) return generate(route);
    if (url.pathname.startsWith('/api/activity/events/') && request.method() === 'PATCH' && update) return update(route);
    if (url.pathname.startsWith('/api/activity/events/') && request.method() === 'DELETE' && remove) return remove(route);
    return route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: `Unexpected test API ${url.pathname}` }) });
  });
  await page.goto('http://127.0.0.1:3187/verification/calendar-reliability/index.html');
  await page.getByRole('button', { name: 'Evento', exact: true }).waitFor();
  return { page, context, reads };
}

const settleAnimations = page => page.evaluate(() => Promise.all(document.getAnimations()
  .filter(animation => animation.effect?.getTiming().iterations !== Infinity)
  .map(animation => animation.finished.catch(() => {}))));

async function assertAccessibleErrorContrast(locator) {
  const colors = await locator.evaluate(element => {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 1;
    const context = canvas.getContext('2d');
    const rgba = color => {
      context.clearRect(0, 0, 1, 1);
      context.fillStyle = color;
      context.fillRect(0, 0, 1, 1);
      return Array.from(context.getImageData(0, 0, 1, 1).data);
    };
    let ancestor = element;
    while (ancestor && rgba(getComputedStyle(ancestor).backgroundColor)[3] !== 255) ancestor = ancestor.parentElement;
    return { foreground: rgba(getComputedStyle(element).color), background: rgba(getComputedStyle(ancestor).backgroundColor) };
  });
  const luminance = channels => channels.slice(0, 3).map(channel => channel / 255)
    .map(channel => channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4)
    .reduce((total, channel, index) => total + channel * [0.2126, 0.7152, 0.0722][index], 0);
  const values = [luminance(colors.foreground), luminance(colors.background)].sort((a, b) => b - a);
  const ratio = (values[0] + 0.05) / (values[1] + 0.05);
  assert.ok(ratio >= 4.5, `Calendar error text requires AA contrast; measured ${ratio.toFixed(2)}:1 (${JSON.stringify(colors)})`);
  return ratio;
}

test('a retry preserves creation request ID after a lost response', async () => {
  const payloads = [];
  const { page, context } = await calendarPage({ save: async route => {
    payloads.push(route.request().postDataJSON());
    return route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'Respuesta perdida' }) });
  } });
  try {
    await page.getByRole('button', { name: 'Evento', exact: true }).click();
    await page.getByLabel('Título del evento').fill('Tráfico de prueba');
    await page.getByRole('button', { name: 'Guardar evento' }).click();
    await page.getByText('Respuesta perdida', { exact: true }).waitFor();
    await page.getByRole('button', { name: 'Guardar evento' }).click();
    await page.waitForFunction(() => !document.querySelector('button[type="submit"]')?.disabled);
    assert.ok(payloads[0].requestId, 'The browser must send a persistent creation request ID');
    assert.equal(payloads[1].requestId, payloads[0].requestId);
  } finally { await context.close(); }
});

test('saved pending Google write is reported as pending and rendered in light and dark themes', async t => {
  const { page, context } = await calendarPage({
    events: [{ id: 'fixture', title: 'Reunión de coordinación', type: 'MEETING', startAt: '2026-09-07T14:00:00-05:00', endAt: '2026-09-07T15:00:00-05:00', memberIds: [] }],
    save: route => route.fulfill({ status: 202, contentType: 'application/json', body: JSON.stringify({ id: 'saved', googleSyncStatus: 'PENDING' }) })
  });
  try {
    await page.getByRole('button', { name: 'Evento', exact: true }).click();
    await page.getByLabel('Título del evento').fill('Producción pendiente en Google');
    await page.getByRole('button', { name: 'Guardar evento' }).click();
    await page.getByText('Evento guardado. La sincronización con Google Calendar sigue pendiente.', { exact: true }).waitFor({ timeout: 5000 });
    await page.getByText('Evento guardado. La sincronización con Google Calendar sigue pendiente.', { exact: true }).waitFor({ state: 'hidden', timeout: 10000 });
    await settleAnimations(page);
    await page.screenshot({ path: path.join(output, 'calendar-light.png'), fullPage: true });
    await page.evaluate(() => document.documentElement.classList.add('dark'));
    await settleAnimations(page);
    await page.screenshot({ path: path.join(output, 'calendar-dark.png'), fullPage: true });
    await page.getByText('Evento guardado. La sincronización con Google Calendar sigue pendiente.', { exact: true }).waitFor({ state: 'hidden', timeout: 10000 });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByRole('button', { name: 'Evento', exact: true }).click();
    await page.locator('[data-operational-event-form="dialog"]').waitFor();
    await settleAnimations(page);
    const allDayBounds = await page.getByText('Todo el día', { exact: true }).evaluate(title => {
      const label = title.closest('label');
      const bounds = element => {
        const rect = element.getBoundingClientRect();
        return { top: rect.top, bottom: rect.bottom, left: rect.left, right: rect.right, width: rect.width, height: rect.height };
      };
      return { label: bounds(label), text: bounds(title.parentElement), checkbox: bounds(label.querySelector('input')), nextRow: bounds(label.nextElementSibling) };
    });
    assert.ok(allDayBounds.text.top >= allDayBounds.label.top && allDayBounds.text.bottom <= allDayBounds.label.bottom, `All-day text must fit inside its mobile surface: ${JSON.stringify(allDayBounds)}`);
    assert.ok(allDayBounds.checkbox.width >= 16 && allDayBounds.checkbox.height >= 16, 'The all-day checkbox must retain its intended size');
    assert.ok(allDayBounds.checkbox.left - allDayBounds.text.right >= 12, 'The all-day text and checkbox need a visible gap');
    assert.ok(allDayBounds.nextRow.top - allDayBounds.label.bottom >= 16, `The dates must remain below the all-day surface without overlap: ${JSON.stringify(allDayBounds)}`);
    t.diagnostic(`Mobile all-day surface ${allDayBounds.label.height}px contains ${allDayBounds.text.height}px text and ${allDayBounds.checkbox.width}px checkbox`);
    await page.screenshot({ path: path.join(output, 'calendar-mobile-form.png'), fullPage: true });
    await page.setViewportSize({ width: 1440, height: 1000 });
    await settleAnimations(page);
    await page.screenshot({ path: path.join(output, 'calendar-desktop-form-dark.png'), fullPage: true });
    await page.evaluate(() => document.documentElement.classList.remove('dark'));
    await settleAnimations(page);
    await page.screenshot({ path: path.join(output, 'calendar-desktop-form-light.png'), fullPage: true });
  } finally { await context.close(); }
});

test('today highlight agrees with the Bogota date shown in the header', async () => {
  const { page, context } = await calendarPage();
  try {
    const bogotaDay = await page.evaluate(() => new Intl.DateTimeFormat('en-US', { timeZone: 'America/Bogota', day: 'numeric' }).format(new Date()));
    assert.equal(await page.locator('[data-operational-calendar] span.bg-indigo-600').innerText(), bogotaDay);
  } finally { await context.close(); }
});

test('date and time share one input and a calendar with an adjacent hour column in both themes and mobile', async () => {
  const { page, context } = await calendarPage();
  try {
    await page.getByRole('button', { name: 'Evento', exact: true }).click();
    assert.equal(await page.locator('input[type="time"]').count(), 0);
    assert.match(await page.getByLabel('Inicio', { exact: true }).inputValue(), /^07\/09\/2026 15:45$/);
    assert.match(await page.getByLabel('Fin', { exact: true }).inputValue(), /^07\/09\/2026 16:45$/);
    assert.equal(await page.locator('[data-operational-event-form]').getByText(/\(Bogotá\)/).count(), 0);
    await page.getByLabel('Inicio', { exact: true }).click();
    const column = page.locator('[data-calendar-time-column]');
    await column.getByText('Hora', { exact: true }).waitFor({ timeout: 5000 });
    await settleAnimations(page);
    await page.screenshot({ path: path.join(output, 'calendar-combined-picker-light.png'), fullPage: true });
    await page.evaluate(() => document.documentElement.classList.add('dark'));
    await settleAnimations(page);
    await page.screenshot({ path: path.join(output, 'calendar-combined-picker-dark.png'), fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    await settleAnimations(page);
    const bounds = await column.evaluate(element => {
      const hours = element.getBoundingClientRect();
      const days = element.parentElement.querySelector('.react-datepicker__month-container').getBoundingClientRect();
      return { hourLeft: hours.left, right: hours.right, dayRight: days.right, top: hours.top, bottom: hours.bottom, viewport: innerWidth, viewportHeight: innerHeight };
    });
    assert.ok(bounds.hourLeft >= bounds.dayRight && bounds.right <= bounds.viewport && bounds.top >= 0 && bounds.bottom <= bounds.viewportHeight, `Calendar and hour column must stay adjacent inside the viewport: ${JSON.stringify(bounds)}`);
    await page.screenshot({ path: path.join(output, 'calendar-combined-picker-mobile.png'), fullPage: true });
    await column.getByRole('button', { name: '16:30', exact: true }).click();
    assert.equal(await page.getByLabel('Inicio', { exact: true }).inputValue(), '07/09/2026 16:30');
    await page.locator('input[type="checkbox"]').first().check();
    assert.equal(await page.getByLabel('Desde', { exact: true }).inputValue(), '07/09/2026');
    await page.getByLabel('Desde', { exact: true }).click();
    assert.equal(await page.locator('[data-calendar-time-column]').count(), 0);
  } finally { await context.close(); }
});

test('choosing an hour cannot silently replace an incomplete date with the previously selected day', async () => {
  const { page, context } = await calendarPage();
  try {
    await page.getByRole('button', { name: 'Evento', exact: true }).click();
    await page.getByLabel('Inicio', { exact: true }).fill('11/09');
    assert.equal(await page.locator('[data-calendar-time-column]').getByRole('button', { name: '08:00', exact: true }).isDisabled(), true);
    assert.equal(await page.getByRole('button', { name: 'Guardar evento' }).isDisabled(), true);
    await page.getByLabel('Inicio', { exact: true }).press('Enter');
    assert.equal(await page.getByLabel('Inicio', { exact: true }).inputValue(), '11/09');
    assert.equal(await page.getByRole('button', { name: 'Guardar evento' }).isDisabled(), true);
    await page.getByLabel('Inicio', { exact: true }).fill('11/09/2026 ');
    await page.locator('[data-calendar-time-column]').getByRole('button', { name: '08:00', exact: true }).click();
    assert.equal(await page.getByLabel('Inicio', { exact: true }).inputValue(), '11/09/2026 08:00');
    assert.equal(await page.getByRole('button', { name: 'Guardar evento' }).isDisabled(), false);
  } finally { await context.close(); }
});

test('the combined selector offers quarter-hour touch controls over an opaque day surface', async () => {
  const { page, context } = await calendarPage();
  try {
    await page.getByRole('button', { name: 'Evento', exact: true }).click();
    await page.getByLabel('Inicio', { exact: true }).click();
    const metrics = await page.locator('[data-calendar-time-column]').evaluate(column => ({
      count: column.querySelectorAll('button').length,
      minHeight: Math.min(...Array.from(column.querySelectorAll('button'), button => button.getBoundingClientRect().height)),
      dayBackground: getComputedStyle(column.previousElementSibling).backgroundColor
    }));
    assert.deepEqual(metrics, { count: 96, minHeight: 44, dayBackground: 'rgb(255, 255, 255)' });
  } finally { await context.close(); }
});

test('the hour column supports keyboard selection and Escape closes only the date picker', async () => {
  const { page, context } = await calendarPage();
  try {
    await page.getByRole('button', { name: 'Evento', exact: true }).click();
    await page.getByLabel('Inicio', { exact: true }).click();
    await page.locator('[data-calendar-time-column]').getByRole('button', { name: '16:30', exact: true }).focus();
    await page.keyboard.press('Enter');
    assert.equal(await page.getByLabel('Inicio', { exact: true }).inputValue(), '07/09/2026 16:30');
    await page.getByLabel('Inicio', { exact: true }).click();
    await page.locator('[data-calendar-time-column]').getByRole('button', { name: '16:30', exact: true }).focus();
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('[data-calendar-time-column]').count(), 0);
    assert.equal(await page.locator('[data-operational-event-form]').count(), 1);
  } finally { await context.close(); }
});

test('moving the start refreshes a previously typed end so the visible range matches the submitted range', async () => {
  const writes = [];
  const { page, context } = await calendarPage({ save: route => {
    writes.push(route.request().postDataJSON());
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ id: 'range', googleSyncStatus: 'SYNCED' }) });
  } });
  try {
    await page.getByRole('button', { name: 'Evento', exact: true }).click();
    await page.getByLabel('Título del evento').fill('Rango visible y guardado');
    await page.getByLabel('Inicio', { exact: true }).fill('11/09/2026 09:00');
    await page.getByLabel('Fin', { exact: true }).fill('11/09/2026 10:30');
    await page.getByLabel('Inicio', { exact: true }).fill('12/09/2026 09:00');
    assert.equal(await page.getByLabel('Fin', { exact: true }).inputValue(), '12/09/2026 10:30');
    await page.getByLabel('Título del evento').click();
    await page.getByRole('button', { name: 'Guardar evento' }).click();
    await page.getByText('Evento creado y sincronizado con Google Calendar', { exact: true }).waitFor();
    assert.equal(writes[0].endAt, '2026-09-12T10:30:00-05:00');
  } finally { await context.close(); }
});

test('partial manual synchronization never claims a successful sync', async () => {
  const { page, context } = await calendarPage({ sync: [{ connected: true, imported: 1, updated: 2, failed: 1 }] });
  try {
    await page.getByRole('button', { name: 'Sincronizar', exact: true }).click();
    await page.getByText(/Sincronización incompleta/).waitFor({ timeout: 5000 });
    assert.equal(await page.getByText(/Sincronización lista/).count(), 0);
  } finally { await context.close(); }
});

test('month request boundaries are expressed in Bogota even on a Tokyo device', async () => {
  const { context, reads } = await calendarPage();
  try {
    assert.match(reads[0].searchParams.get('start'), /T00:00:00-05:00$/);
    assert.match(reads[0].searchParams.get('end'), /T23:59:59-05:00$/);
  } finally { await context.close(); }
});

test('pending deletion never tells the user that Google has deleted the event', async () => {
  const { page, context } = await calendarPage({
    events: [{ id: 'existing', title: 'Evento por eliminar', type: 'MEETING', startAt: '2026-09-07T14:00:00-05:00', endAt: '2026-09-07T15:00:00-05:00', memberIds: [], googleSyncStatus: 'SYNCED' }],
    remove: route => route.fulfill({ status: 202, contentType: 'application/json', body: JSON.stringify({ id: 'existing', googleSyncStatus: 'PENDING_DELETE' }) })
  });
  try {
    await page.getByRole('button', { name: 'Evento por eliminar' }).first().click();
    await page.getByRole('button', { name: 'Eliminar', exact: true }).click();
    await page.locator('[data-operational-delete-dialog]').getByRole('button', { name: /Eliminar/ }).click();
    await page.getByText('Eliminación pendiente de confirmar en Google Calendar.', { exact: true }).waitFor({ timeout: 5000 });
    assert.equal(await page.getByText('Evento eliminado', { exact: true }).count(), 0);
  } finally { await context.close(); }
});

test('a save failure with a persisted event retries synchronization for that ID without editing it', async () => {
  const writes = [];
  const { page, context } = await calendarPage({
    save: route => { writes.push(route.request().method()); return route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ eventId: 'persisted', preserveLocal: true, googleSyncStatus: 'PENDING', error: 'Guardado; esperando Google.' }) }); },
    retry: route => { writes.push(`${route.request().method()} ${new URL(route.request().url()).pathname}`); return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ id: 'persisted', googleSyncStatus: 'SYNCED' }) }); }
  });
  try {
    await page.getByRole('button', { name: 'Evento', exact: true }).click();
    await page.getByLabel('Título del evento').fill('Evento recuperable');
    await page.locator('form').evaluate(form => { form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); });
    await page.locator('[data-google-calendar-errors="dialog"]').waitFor({ timeout: 5000 });
    await settleAnimations(page);
    await page.screenshot({ path: path.join(output, 'calendar-pending-recovery.png'), fullPage: true });
    assert.equal(writes.length, 1, 'Two immediate submits must send one request');
    assert.equal(await page.getByRole('button', { name: 'Descartar', exact: true }).count(), 0, 'Durable pending work must not be dismissed');
    await page.getByRole('button', { name: 'Reintentar', exact: true }).click();
    await page.getByText('Evento sincronizado con Google Calendar', { exact: true }).waitFor();
    assert.deepEqual(writes, ['POST', 'POST /api/activity/google-calendar/errors/persisted/retry']);
  } finally { await context.close(); }
});

test('a delayed Meet response preserves edits made while it was generating', async () => {
  let completeMeet;
  const { page, context } = await calendarPage({ generate: route => new Promise(resolve => {
    completeMeet = async () => { await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ meetingLink: 'https://meet.google.com/test-link' }) }); resolve(); };
  }) });
  try {
    await page.getByRole('button', { name: 'Evento', exact: true }).click();
    await page.getByLabel('Título del evento').fill('Reunión original');
    await page.getByLabel('Tipo', { exact: true }).selectOption('MEETING');
    await page.getByRole('button', { name: 'Generar', exact: true }).click();
    await page.getByLabel('Título del evento').fill('Reunión editada');
    await completeMeet();
    await page.getByText('Google Meet generado', { exact: true }).waitFor();
    assert.equal(await page.getByLabel('Título del evento').inputValue(), 'Reunión editada');
  } finally { await context.close(); }
});

test('OAuth callback exchanges a one-use code only once under React StrictMode', async () => {
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await context.newPage();
  let exchanges = 0;
  await page.route('**/*', route => {
    const url = new URL(route.request().url());
    if (url.pathname === '/api/activity/google-calendar/oauth-callback') {
      exchanges += 1;
      return route.fulfill({ status: exchanges === 1 ? 200 : 400, contentType: 'application/json', body: JSON.stringify(exchanges === 1 ? { connected: true } : { error: 'Código ya utilizado' }) });
    }
    return url.hostname === '127.0.0.1' ? route.continue() : route.abort();
  });
  try {
    await page.goto('http://127.0.0.1:3187/verification/calendar-reliability/index.html?oauth');
    await page.getByText('Google Calendar conectado correctamente.', { exact: true }).waitFor({ timeout: 5000 });
    assert.equal(exchanges, 1);
    await page.screenshot({ path: path.join(output, 'calendar-oauth-success.png'), fullPage: true });
  } finally { await context.close(); }
});

test('failed health reads show that Google synchronization could not be verified', async () => {
  const { page, context } = await calendarPage({ status: route => route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'Health unavailable' }) }) });
  try {
    await page.getByText('No pudimos verificar la sincronización con Google Calendar.', { exact: true }).waitFor({ timeout: 5000 });
    assert.equal(await page.getByRole('button', { name: 'Conectar coordinador', exact: true }).count(), 0, 'Unknown connection status must not be presented as disconnected');
    await page.screenshot({ path: path.join(output, 'calendar-health-unavailable.png'), fullPage: true });
  } finally { await context.close(); }
});

test('reconciliation with pending writes does not announce synchronization success', async () => {
  const reply = (route, data) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(data) });
  const { page, context } = await calendarPage({
    status: route => reply(route, { connected: true, connections: [{ id: 'test-google', email: 'coordinadorbrainstudio@gmail.com' }], reconciliation: { pendingCount: 1 } }),
    reconciliation: route => reply(route, route.request().method() === 'POST'
      ? { synced: 0, failed: 0, pending: 1, results: [{ id: 'historic', status: 'PENDING' }] }
      : { total: 1, events: [{ id: 'historic', title: 'Evento histórico', startAt: '2026-09-07T15:00:00-05:00' }] })
  });
  try {
    await page.getByRole('button', { name: /pendientes de reconciliar/ }).click();
    await page.getByRole('checkbox').check();
    await page.getByRole('button', { name: 'Confirmar y sincronizar' }).click();
    await page.getByText('La conciliación sigue pendiente de confirmar en Google Calendar.', { exact: true }).waitFor({ timeout: 5000 });
    assert.equal(await page.getByText('0 evento(s) sincronizados', { exact: true }).count(), 0);
  } finally { await context.close(); }
});

test('calendar and mobile agenda preserve the requested Monday to Friday scope', async () => {
  const { page, context } = await calendarPage({ events: [
    { id: 'saturday', title: 'Producción del sábado', type: 'PRODUCTION', startAt: '2026-09-12T10:00:00-05:00', endAt: '2026-09-12T11:00:00-05:00', memberIds: [] },
    { id: 'sunday', title: 'Reunión del domingo', type: 'MEETING', startAt: '2026-09-13T14:00:00-05:00', endAt: '2026-09-13T15:00:00-05:00', memberIds: [] }
  ] });
  try {
    const month = page.locator('[data-operational-calendar]');
    assert.equal(await month.getByRole('button', { name: /Producción del sábado|Reunión del domingo/ }).count(), 0);
    assert.equal(await month.locator(':scope > div').first().evaluate(header => getComputedStyle(header).gridTemplateColumns.split(' ').length), 5);
    await page.setViewportSize({ width: 390, height: 844 });
    assert.equal(await page.getByLabel('Agenda mensual').getByRole('button', { name: /Producción del sábado|Reunión del domingo/ }).count(), 0);
  } finally { await context.close(); }
});

for (const scenario of [
  { name: 'spring gap', start: '2026-03-08T02:30:00-05:00', end: '2026-03-09T03:30:00-05:00', now: '2026-03-08T05:00:00Z', day: '008', time: '02:30' },
  { name: 'autumn overlap', start: '2026-11-01T01:30:00-05:00', end: '2026-11-02T03:30:00-05:00', now: '2026-11-01T05:00:00Z', day: '001', time: '01:30' }
]) {
  test(`Bogota create and edit survive New York ${scenario.name}`, async () => {
    const writes = [];
    const save = route => { writes.push(route.request().postDataJSON()); return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ id: 'dst', googleSyncStatus: 'SYNCED' }) }); };
    const { page, context } = await calendarPage({ timezone: 'America/New_York', fixedDate: scenario.now,
      events: [{ id: 'dst', title: 'Reunión en horario Bogotá', type: 'MEETING', startAt: scenario.start, endAt: scenario.end, memberIds: [] }], save, update: save
    });
    try {
      await page.locator('[data-operational-calendar]').getByRole('button', { name: /Reunión en horario Bogotá/ }).first().click();
      await page.getByLabel('Inicio', { exact: true }).waitFor({ timeout: 5000 });
      const dateText = scenario.start.slice(0, 10).split('-').reverse().join('/');
      assert.equal(await page.getByLabel('Inicio', { exact: true }).inputValue(), `${dateText} ${scenario.time}`);
      await page.getByLabel('Título del evento').fill('Título ajustado sin mover horario');
      await page.getByRole('button', { name: 'Actualizar evento' }).click();
      await page.getByText('Evento actualizado y sincronizado con Google Calendar', { exact: true }).waitFor();
      assert.equal(writes[0].startAt, scenario.start);
      assert.equal(writes[0].endAt, scenario.end);
      await page.getByRole('button', { name: 'Evento', exact: true }).click();
      await page.getByLabel('Título del evento').fill('Nueva reunión con hora Bogotá');
      await page.locator('#operational-event-start').click();
      await page.locator(`.react-datepicker__day--${scenario.day}:not(.react-datepicker__day--outside-month)`).click();
      await page.locator('[data-calendar-time-column]').getByRole('button', { name: scenario.time, exact: true }).click();
      assert.equal(await page.getByLabel('Inicio', { exact: true }).inputValue(), `${dateText} ${scenario.time}`);
      await page.getByLabel('Inicio', { exact: true }).fill(`${dateText} ${scenario.time}`);
      await page.getByLabel('Título del evento').click();
      await page.getByRole('button', { name: 'Guardar evento' }).click();
      await page.getByText('Evento creado y sincronizado con Google Calendar', { exact: true }).waitFor();
      assert.equal(writes[1].startAt, scenario.start);
      assert.equal(new Date(writes[1].endAt).getTime() - new Date(writes[1].startAt).getTime(), 60 * 60 * 1000);
    } finally { await context.close(); }
  });
}

test('typed calendar dates require the full year and never silently create a 2001 event', async () => {
  const writes = [];
  const { page, context } = await calendarPage({ save: route => {
    writes.push(route.request().postDataJSON());
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ id: 'date', googleSyncStatus: 'SYNCED' }) });
  } });
  try {
    await page.getByRole('button', { name: 'Evento', exact: true }).click();
    await page.getByLabel('Título del evento').fill('Reunión con fecha completa');
    await page.locator('#operational-event-start').fill('11/09');
    await page.getByLabel('Título del evento').click();
    await page.getByText('Escribe la fecha y hora completas en formato DD/MM/AAAA HH:mm.', { exact: true }).waitFor({ timeout: 5000 });
    await assertAccessibleErrorContrast(page.getByRole('alert'));
    await page.evaluate(() => document.documentElement.classList.add('dark'));
    await settleAnimations(page);
    await assertAccessibleErrorContrast(page.getByRole('alert'));
    await page.locator('form').evaluate(form => form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })));
    assert.equal(writes.length, 0);
    assert.equal(await page.getByRole('button', { name: 'Guardar evento' }).isDisabled(), true);
    await page.locator('#operational-event-start').fill('11/09/2026 08:00');
    await page.getByLabel('Título del evento').click();
    await page.getByRole('button', { name: 'Guardar evento' }).click();
    await page.getByText('Evento creado y sincronizado con Google Calendar', { exact: true }).waitFor();
    assert.equal(writes[0].startAt.slice(0, 10), '2026-09-11');
  } finally { await context.close(); }
});

test('past starts block creation and Meet generation while unchanged historical edits remain valid', async t => {
  const writes = [];
  const save = route => { writes.push(route.request().postDataJSON()); return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ id: 'past', googleSyncStatus: 'SYNCED' }) }); };
  const { page, context } = await calendarPage({ save, update: save, events: [
    { id: 'past', title: 'Reunión histórica', type: 'MEETING', startAt: '2026-09-01T14:00:00-05:00', endAt: '2026-09-01T15:00:00-05:00', memberIds: [] }
  ] });
  try {
    await page.getByRole('button', { name: 'Evento', exact: true }).click();
    await page.getByLabel('Título del evento').fill('Evento fuera de tiempo');
    await page.getByLabel('Tipo', { exact: true }).selectOption('MEETING');
    await page.getByLabel('Inicio', { exact: true }).fill('07/09/2026 14:00');
    await page.getByLabel('Título del evento').click();
    await page.getByText('No puedes elegir una fecha y hora que ya pasó', { exact: true }).waitFor({ timeout: 5000 });
    assert.equal(await page.getByRole('button', { name: 'Guardar evento' }).isDisabled(), true);
    assert.equal(await page.getByRole('button', { name: 'Generar', exact: true }).isDisabled(), true);
    t.diagnostic(`Light error contrast ${(await assertAccessibleErrorContrast(page.getByRole('alert'))).toFixed(2)}:1`);
    await settleAnimations(page);
    await page.screenshot({ path: path.join(output, 'calendar-past-date-blocked.png'), fullPage: true });
    await page.evaluate(() => document.documentElement.classList.add('dark'));
    await settleAnimations(page);
    t.diagnostic(`Dark error contrast ${(await assertAccessibleErrorContrast(page.getByRole('alert'))).toFixed(2)}:1`);
    await page.screenshot({ path: path.join(output, 'calendar-past-date-blocked-dark.png'), fullPage: true });
    await page.locator('form').evaluate(form => form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })));
    assert.equal(writes.length, 0);
    assert.equal(await page.getByText('No puedes elegir una fecha y hora que ya pasó', { exact: true }).count(), 1, 'Local validation belongs only beside the field, without a duplicate toast');
    await page.keyboard.press('Escape');
    await page.locator('[data-operational-calendar]').getByRole('button', { name: /Reunión histórica/ }).first().click();
    await page.getByLabel('Título del evento').fill('Título histórico corregido');
    assert.equal(await page.getByRole('button', { name: 'Actualizar evento' }).isDisabled(), false);
    await page.getByLabel('Inicio', { exact: true }).fill('01/09/2026 14:30');
    assert.equal(await page.getByRole('button', { name: 'Actualizar evento' }).isDisabled(), true);
    await page.getByLabel('Inicio', { exact: true }).fill('01/09/2026 14:00');
    await page.getByLabel('Título del evento').click();
    await page.getByRole('button', { name: 'Actualizar evento' }).click();
    await page.getByText('Evento actualizado y sincronizado con Google Calendar', { exact: true }).waitFor();
    assert.equal(writes[0].startAt, '2026-09-01T14:00:00-05:00');
  } finally { await context.close(); }
});

test('an unchanged retry keeps its request identity even if the scheduled start passes', async () => {
  const writes = [];
  const { page, context } = await calendarPage({ save: route => {
    writes.push(route.request().postDataJSON());
    return route.fulfill({ status: writes.length === 1 ? 503 : 200, contentType: 'application/json', body: JSON.stringify(writes.length === 1 ? { error: 'Respuesta perdida' } : { id: 'retained', googleSyncStatus: 'SYNCED' }) });
  } });
  try {
    await page.getByRole('button', { name: 'Evento', exact: true }).click();
    await page.getByLabel('Título del evento').fill('Solicitud recuperable');
    await page.getByRole('button', { name: 'Guardar evento' }).click();
    await page.getByText('Respuesta perdida', { exact: true }).waitFor();
    await page.clock.setFixedTime(new Date('2026-09-07T22:00:00Z'));
    await page.getByRole('button', { name: 'Guardar evento' }).click();
    await page.getByText('Evento creado y sincronizado con Google Calendar', { exact: true }).waitFor();
    assert.equal(writes[0].requestId, writes[1].requestId);
  } finally { await context.close(); }
});

test('submit rechecks elapsed time and an all-day event can still be created for today', async () => {
  const writes = [];
  const { page, context } = await calendarPage({ save: route => {
    writes.push(route.request().postDataJSON());
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ id: 'today', googleSyncStatus: 'SYNCED' }) });
  } });
  try {
    await page.getByRole('button', { name: 'Evento', exact: true }).click();
    await page.getByLabel('Título del evento').fill('Actividad para hoy');
    await page.clock.setFixedTime(new Date('2026-09-07T22:00:00Z'));
    await page.getByRole('button', { name: 'Guardar evento' }).click();
    await page.getByRole('alert').getByText('No puedes elegir una fecha y hora que ya pasó', { exact: true }).waitFor();
    assert.equal(await page.getByText('No puedes elegir una fecha y hora que ya pasó', { exact: true }).count(), 1);
    assert.equal(writes.length, 0);
    await page.locator('input[type="checkbox"]').first().check();
    await page.getByRole('button', { name: 'Guardar evento' }).click();
    await page.getByText('Evento creado y sincronizado con Google Calendar', { exact: true }).waitFor();
    assert.equal(writes[0].isAllDay, true);
    assert.equal(writes[0].startAt, '2026-09-07T00:00:00-05:00');
  } finally { await context.close(); }
});

test('Meet generation rechecks elapsed time and reports a single inline past-date error', async () => {
  let requests = 0;
  const { page, context } = await calendarPage({ generate: route => {
    requests++;
    return route.fulfill({ status: 500, contentType: 'application/json', body: '{}' });
  } });
  try {
    await page.getByRole('button', { name: 'Evento', exact: true }).click();
    await page.getByLabel('Título del evento').fill('Reunión cuyo inicio ya pasó');
    await page.getByLabel('Tipo', { exact: true }).selectOption('MEETING');
    await page.clock.setFixedTime(new Date('2026-09-07T22:00:00Z'));
    await page.getByRole('button', { name: 'Generar', exact: true }).click();
    await page.getByRole('alert').getByText('No puedes elegir una fecha y hora que ya pasó', { exact: true }).waitFor();
    assert.equal(await page.getByText('No puedes elegir una fecha y hora que ya pasó', { exact: true }).count(), 1);
    assert.equal(requests, 0);
  } finally { await context.close(); }
});
