import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { build } from 'esbuild';
import postcss from 'postcss';
import tailwindcss from 'tailwindcss';
import autoprefixer from 'autoprefixer';
import tailwindConfig from '../../tailwind.config.js';
import { createServer } from 'node:http';
import { chromium } from 'playwright-core';
import { recognitionDemoMember as fixtureMember, recognitionDemoUser as fixtureUser } from '../fixtures/recognitionData.js';

const recognitionDemoUser = { ...fixtureUser, name: 'Camila Vega' };
const recognitionDemoMember = { ...fixtureMember, name: recognitionDemoUser.name };

let preview, browser, app, style;
before(async () => {
  // Bundle the real board directly. Loading the whole App through Vite's fresh optimizer
  // delayed DOMContentLoaded before any task request and hid the actual regression.
  const source = `
    import React from 'react';
    import {createRoot} from 'react-dom/client';
    import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
    import {MemoryRouter} from 'react-router-dom';
    import NativeTasks from '@/components/modules/NativeTasks';
    import BrainToaster from '@/components/ui/BrainToaster';
    import {AuthProvider} from '@/context/AuthContext';
    import {ConfirmDialogProvider} from '@/components/ui/ConfirmDialog';
    import {markTaskTimingTutorialSeen,markTaskTimingTutorialAfternoonSeen} from '@/lib/taskTiming';
    const user=${JSON.stringify({ ...recognitionDemoUser, role: 'ADMIN' })};
    localStorage.setItem('authToken','e30.'+btoa(JSON.stringify({exp:4102444800}))+'.recognition-local');
    localStorage.setItem('currentUser',JSON.stringify(user));
    markTaskTimingTutorialSeen(localStorage,user.id); markTaskTimingTutorialAfternoonSeen(localStorage,user.id);
    const queryClient=new QueryClient({defaultOptions:{queries:{retry:false},mutations:{retry:false}}});
    window.__moveQueryClient=queryClient;
    createRoot(document.getElementById('root')).render(<QueryClientProvider client={queryClient}><AuthProvider><ConfirmDialogProvider><MemoryRouter initialEntries={['/gestion']}><main className="min-h-screen bg-background p-6 text-foreground"><NativeTasks/></main><BrainToaster/></MemoryRouter></ConfirmDialogProvider></AuthProvider></QueryClientProvider>);
  `;
  const bundle = await build({ stdin: { contents: source, resolveDir: process.cwd(), loader: 'jsx' }, write: false, bundle: true, format: 'esm', platform: 'browser', jsx: 'automatic', minify: true,
    alias: { '@': path.resolve('src') }, loader: { '.css': 'empty', '.png': 'dataurl', '.svg': 'dataurl', '.jpg': 'dataurl', '.webp': 'dataurl' }, define: { 'process.env.NODE_ENV': '"production"', 'import.meta.env': '{}' } });
  app = bundle.outputFiles[0].text;
  style = (await postcss([tailwindcss({ ...tailwindConfig, content: ['./src/**/*.{js,jsx}', { raw: source, extension: 'jsx' }] }), autoprefixer()]).process(await readFile('src/index.css', 'utf8'), { from: path.resolve('src/index.css') })).css;
  const html = `<!doctype html><html lang="es"><head><meta charset="utf-8"><link rel="stylesheet" href="/move-test.css"></head><body><div id="root"></div><script type="module" src="/move-test.js"></script></body></html>`;
  const server = createServer((request, response) => {
    const pathname = new URL(request.url, 'http://localhost').pathname;
    const assets = { '/gestion': ['text/html', html], '/move-test.js': ['text/javascript', app], '/move-test.css': ['text/css', style] };
    if (assets[pathname]) { response.writeHead(200, { 'Content-Type': assets[pathname][0] }); response.end(assets[pathname][1]); return; }
    const data = { '/api/auth/me': { ...recognitionDemoUser, role: 'ADMIN' }, '/api/team': [recognitionDemoMember], '/api/db/clients': [], '/api/tasks/returned-alerts': { tasks: [] }, '/api/tasks/work-alerts': { tasks: [] }, '/api/metrics/quality-streak': { currentStreak: 0, maxStreak: 0, currentStreakDays: 0, currentReturnedTasksCount: 0 } };
    response.writeHead(request.method === 'GET' && Object.hasOwn(data, pathname) ? 200 : 404, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
    response.end(JSON.stringify(data[pathname] || { error: 'Only synthetic local data is available.' }));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  preview = { origin: `http://127.0.0.1:${server.address().port}`, close: () => new Promise(resolve => server.close(resolve)) };
  browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
  await mkdir('output/task-move-synchronization', { recursive: true });
});
after(async () => { await browser?.close(); await preview?.close(); });

const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };
const columnOf = status => ({ PENDIENTE: 'pendiente', EN_CURSO: 'en-proceso', REALIZADA: 'realizado' })[status];
const within = async (promise, message, milliseconds = 5000) => {
  let timer;
  try { return await Promise.race([promise, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(message)), milliseconds); })]); }
  finally { clearTimeout(timer); }
};

for (const [from, to, key, dark] of [
  ['PENDIENTE', 'EN_CURSO', 'ArrowRight', false],
  ['EN_CURSO', 'PENDIENTE', 'ArrowLeft', true],
  ['EN_CURSO', 'REALIZADA', 'ArrowRight', false],
]) test(`${from} → ${to}: confirmation moves the card without waiting for the list`, { timeout: 60000 }, async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  page.setDefaultTimeout(8000);
  const pageErrors = [];
  page.on('pageerror', error => pageErrors.push(error.message));
  const now = new Date().toISOString();
  const original = {
    id: 'move-test', title: 'Revisar propuesta de campaña', status: from, sortOrder: 0,
    dueDate: now, createdAt: now, completedAt: null, startedAt: from === 'EN_CURSO' ? now : null,
    accumulatedWorkMs: 0, clientId: 'sample', client: { name: 'Agencia Faro' },
    creator: recognitionDemoUser, creatorId: recognitionDemoUser.id,
    assignee: recognitionDemoMember, assigneeId: recognitionDemoMember.id,
    collaborators: [], taskComments: [], taskAttachments: [],
  };
  const saved = { ...original, status: to, sortOrder: 7, startedAt: to === 'EN_CURSO' ? now : null, completedAt: to === 'REALIZADA' ? now : null };
  const allowSave = deferred(), allowList = deferred(), patchSeen = deferred();
  let reads = 0, writes = 0;
  await page.route('**/api/tasks**', async route => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/api/tasks') {
      if (++reads === 1) return route.fulfill({ json: [original] });
      await allowList.promise;
      return route.fulfill({ json: [saved] }).catch(() => {});
    }
    if (path === '/api/tasks/move-test' && route.request().method() === 'PATCH') {
      writes++;
      assert.equal(route.request().postDataJSON().status, to);
      patchSeen.resolve();
      await allowSave.promise;
      return route.fulfill({ json: saved });
    }
    return route.continue();
  });
  const cardIn = status => page.locator(`[data-rfd-droppable-id="${columnOf(status)}"] [data-rfd-draggable-id="move-test"]`);
  try {
    await page.goto(`${preview.origin}/gestion?admin`, { waitUntil: 'commit' });
    await cardIn(from).waitFor({ timeout: 25000 });
    if (dark) await page.evaluate(() => document.documentElement.classList.add('dark'));
    await cardIn(from).focus();
    await page.keyboard.press('Space');
    await page.waitForTimeout(250);
    await page.keyboard.press(key);
    await page.waitForTimeout(250);
    await page.keyboard.press('Space');
    await within(patchSeen.promise, 'The drag did not send a PATCH');
    assert.equal(await cardIn(from).count(), 1, 'no move is shown before the server confirms');
    await cardIn(from).getByRole('status').filter({ hasText: 'Guardando' }).waitFor();
    assert.equal(await cardIn(from).getAttribute('aria-busy'), 'true');
    assert.equal(await cardIn(from).getAttribute('data-rfd-drag-handle-draggable-id'), null, 'a pending save disables another gesture');
    await page.keyboard.press('Space'); await page.keyboard.press(key); await page.keyboard.press('Space');
    assert.equal(writes, 1, 'a repeated keyboard gesture while saving cannot duplicate the PATCH');
    await page.screenshot({ path: `output/task-move-synchronization/saving-${from}-${to}.png`, animations: 'disabled' });
    const response = page.waitForResponse(r => r.url().endsWith('/api/tasks/move-test') && r.request().method() === 'PATCH');
    allowSave.resolve();
    await response;
    await cardIn(to).waitFor({ timeout: 3000 });
    assert.equal(await cardIn(from).count(), 0);
    assert.notEqual(await cardIn(to).getAttribute('aria-busy'), 'true');
    assert.equal(writes, 1, 'one gesture is one write');
    assert.deepEqual(pageErrors, []);
    await page.screenshot({ path: `output/task-move-synchronization/${from}-${to}.png`, animations: 'disabled' });
  } catch (error) {
    await page.screenshot({ path: `output/task-move-synchronization/failure-${from}-${to}.png` });
    console.error(JSON.stringify({ from, to, reads, writes, pageErrors, text: (await page.locator('body').innerText()).slice(0, 1800) }));
    throw error;
  } finally {
    allowSave.resolve(); allowList.resolve();
    await page.close();
  }
});

const makeTask = (status = 'PENDIENTE') => {
  const now = new Date().toISOString();
  return { id: 'move-test', title: 'Revisar propuesta de campaña', status, sortOrder: 0, dueDate: now, createdAt: now,
    startedAt: status === 'EN_CURSO' ? now : null, completedAt: status === 'REALIZADA' ? now : null,
    accumulatedWorkMs: 0, clientId: 'sample', client: { name: 'Agencia Faro' },
    creator: recognitionDemoUser, creatorId: recognitionDemoUser.id, assignee: recognitionDemoMember, assigneeId: recognitionDemoMember.id,
    collaborators: [], taskComments: [], taskAttachments: [] };
};
async function openBoard({ initial = makeTask(), read, patch, dark = false }) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  page.setDefaultTimeout(8000);
  const events = { reads: 0, writes: 0, errors: [] };
  page.on('pageerror', error => events.errors.push(error.message));
  await page.route('**/api/tasks**', async route => {
    const pathname = new URL(route.request().url()).pathname;
    if (pathname === '/api/tasks') {
      const number = ++events.reads;
      if (number === 1) return route.fulfill({ json: [initial] });
      return read ? read(route, number, page) : route.fulfill({ json: [initial] });
    }
    if (pathname === '/api/tasks/move-test' && route.request().method() === 'PATCH') return patch(route, ++events.writes, page);
    return route.continue();
  });
  await page.goto(`${preview.origin}/gestion?admin`, { waitUntil: 'commit' });
  const card = status => page.locator(`[data-rfd-droppable-id="${columnOf(status)}"] [data-rfd-draggable-id="move-test"]`);
  await card(initial.status).waitFor({ timeout: 25000 });
  if (dark) await page.evaluate(() => document.documentElement.classList.add('dark'));
  return { page, card, events };
}
async function drag(board, from, to) {
  await board.card(from).focus();
  await board.page.keyboard.press('Space');
  await board.page.waitForTimeout(150);
  const keys = { PENDIENTE: 0, EN_CURSO: 1, REALIZADA: 2 };
  for (let count = 0; count < Math.abs(keys[to] - keys[from]); count++) {
    await board.page.keyboard.press(keys[to] > keys[from] ? 'ArrowRight' : 'ArrowLeft');
    await board.page.waitForTimeout(150);
  }
  await board.page.keyboard.press('Space');
}

test('a successful PATCH remains visible when the following GET fails', { timeout: 30000 }, async () => {
  const initial = makeTask();
  const saved = { ...initial, status: 'EN_CURSO', startedAt: new Date().toISOString(), sortOrder: 8 };
  const failedRead = deferred();
  const board = await openBoard({ initial,
    patch: route => route.fulfill({ json: saved }),
    read: async route => { await route.fulfill({ status: 503, json: { error: 'Temporary synthetic list failure.' } }); failedRead.resolve(); },
  });
  try {
    await drag(board, 'PENDIENTE', 'EN_CURSO');
    await within(failedRead.promise, 'The reconciliation GET was not requested');
    await board.card('EN_CURSO').waitFor();
    assert.equal(await board.card('PENDIENTE').count(), 0);
    assert.deepEqual(board.events.errors, []);
    await board.page.screenshot({ path: 'output/task-move-synchronization/list-failure-light.png', animations: 'disabled' });
  } finally { await board.page.close(); }
});

test('a rejected PATCH keeps the saved column and displays the server error', { timeout: 30000 }, async () => {
  const board = await openBoard({ dark: true, patch: route => route.fulfill({ status: 403, json: { error: 'Movimiento rechazado en esta prueba.' } }) });
  try {
    await drag(board, 'PENDIENTE', 'EN_CURSO');
    const errorNotice = board.page.locator('[data-toast-type="error"]').filter({ hasText: 'Movimiento rechazado en esta prueba.' });
    await errorNotice.waitFor();
    assert.match(await errorNotice.innerText(), /Movimiento rechazado en esta prueba\./);
    assert.equal(await board.card('PENDIENTE').count(), 1);
    assert.equal(await board.card('EN_CURSO').count(), 0);
    assert.equal(board.events.writes, 1);
    assert.notEqual(await board.card('PENDIENTE').getAttribute('aria-busy'), 'true');
    assert.deepEqual(board.events.errors, []);
    await board.page.screenshot({ path: 'output/task-move-synchronization/rejected-dark.png', animations: 'disabled' });
  } finally { await board.page.close(); }
});

test('an old polling response is cancelled before the saved move updates the board', { timeout: 30000 }, async () => {
  const initial = makeTask(), staleStarted = deferred(), releaseStale = deferred(), staleAborted = deferred();
  const saved = { ...initial, status: 'EN_CURSO', startedAt: new Date().toISOString(), sortOrder: 5 };
  let staleRequest;
  const board = await openBoard({ initial, patch: route => route.fulfill({ json: saved }), read: async (route, number) => {
    if (number === 2) {
      staleRequest = route.request(); staleStarted.resolve();
      await releaseStale.promise;
      return route.fulfill({ json: [initial] }).catch(() => {});
    }
    return route.fulfill({ json: [saved] });
  } });
  board.page.on('requestfailed', request => { if (request === staleRequest) staleAborted.resolve(); });
  try {
    await board.page.evaluate(() => { void window.__moveQueryClient.refetchQueries({ queryKey: ['nativeTasks'], exact: true }); });
    await within(staleStarted.promise, 'The old polling request did not start');
    await drag(board, 'PENDIENTE', 'EN_CURSO');
    await within(staleAborted.promise, 'The old polling request was not cancelled');
    await board.card('EN_CURSO').waitFor();
    releaseStale.resolve();
    await board.page.waitForTimeout(300);
    assert.equal(await board.card('PENDIENTE').count(), 0);
    assert.equal(await board.card('EN_CURSO').count(), 1);
    assert.deepEqual(board.events.errors, []);
  } finally { releaseStale.resolve(); await board.page.close(); }
});

test('a second confirmed move is accepted while the first reconciliation GET is still pending', { timeout: 30000 }, async () => {
  const releaseReads = deferred(), firstRead = deferred(), secondPatch = deferred();
  let current = makeTask();
  const board = await openBoard({ initial: current, patch: async (route, number) => {
    const status = route.request().postDataJSON().status;
    current = { ...current, status, sortOrder: number + 2, startedAt: status === 'EN_CURSO' ? new Date().toISOString() : null };
    await route.fulfill({ json: current });
    if (number === 2) secondPatch.resolve();
  }, read: async route => { firstRead.resolve(); await releaseReads.promise; return route.fulfill({ json: [current] }).catch(() => {}); } });
  try {
    await drag(board, 'PENDIENTE', 'EN_CURSO');
    await board.card('EN_CURSO').waitFor();
    await within(firstRead.promise, 'The first reconciliation GET did not start');
    await drag(board, 'EN_CURSO', 'PENDIENTE');
    await within(secondPatch.promise, 'The pending GET incorrectly blocked the next move');
    await board.card('PENDIENTE').waitFor();
    assert.equal(board.events.writes, 2);
    assert.equal(await board.card('EN_CURSO').count(), 0);
    assert.deepEqual(board.events.errors, []);
  } finally { releaseReads.resolve(); await board.page.close(); }
});
