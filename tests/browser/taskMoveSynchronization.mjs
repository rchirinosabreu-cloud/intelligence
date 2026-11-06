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
const todayDueDate = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}T00:00:00.000Z`;
};

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
    import {AuthProvider,useAuth} from '@/context/AuthContext';
    import {ConfirmDialogProvider} from '@/components/ui/ConfirmDialog';
    import {markTaskTimingTutorialSeen,markTaskTimingTutorialAfternoonSeen} from '@/lib/taskTiming';
    const user=${JSON.stringify({ ...recognitionDemoUser, role: 'ADMIN' })};
    localStorage.setItem('authToken','e30.'+btoa(JSON.stringify({exp:4102444800}))+'.recognition-local');
    localStorage.setItem('currentUser',JSON.stringify(user));
    markTaskTimingTutorialSeen(localStorage,user.id); markTaskTimingTutorialAfternoonSeen(localStorage,user.id);
    const queryClient=new QueryClient({defaultOptions:{queries:{retry:false},mutations:{retry:false}}});
    window.__moveQueryClient=queryClient;
    const AuthenticatedBoard=()=>{const {currentUser,isLoading}=useAuth(); return currentUser&&!isLoading?<NativeTasks/>:null;};
    createRoot(document.getElementById('root')).render(<QueryClientProvider client={queryClient}><AuthProvider><ConfirmDialogProvider><MemoryRouter initialEntries={['/gestion']}><main className="min-h-screen bg-background p-6 text-foreground"><AuthenticatedBoard/></main><BrainToaster/></MemoryRouter></ConfirmDialogProvider></AuthProvider></QueryClientProvider>);
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
]) test(`${from} → ${to}: drop moves immediately while confirmation saves in the background`, { timeout: 60000 }, async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  page.setDefaultTimeout(8000);
  const pageErrors = [];
  page.on('pageerror', error => pageErrors.push(error.message));
  const now = new Date().toISOString();
  const original = {
    id: 'move-test', title: 'Revisar propuesta de campaña', status: from, sortOrder: 0,
    dueDate: todayDueDate(), createdAt: now, completedAt: null, startedAt: from === 'EN_CURSO' ? now : null,
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
      if (to === 'REALIZADA') assert.equal(Object.hasOwn(route.request().postDataJSON(), 'orderBeforeId'), false, 'completion position comes from the confirmed date, not a manual priority');
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
    const cachedBefore = await page.evaluate(() => window.__moveQueryClient.getQueryData(['nativeTasks']));
    await page.evaluate(() => {
      window.__moveColumns = [];
      const recordColumn = () => {
        const column = document.querySelector('[data-rfd-draggable-id="move-test"]')?.closest('[data-rfd-droppable-id]')?.getAttribute('data-rfd-droppable-id');
        if (column && window.__moveColumns.at(-1) !== column) window.__moveColumns.push(column);
      };
      recordColumn();
      new MutationObserver(recordColumn).observe(document.getElementById('root'), { childList: true, subtree: true });
    });
    await cardIn(from).focus();
    await page.keyboard.press('Space');
    await page.waitForTimeout(250);
    await page.keyboard.press(key);
    await page.waitForTimeout(250);
    await page.keyboard.press('Space');
    await within(patchSeen.promise, 'The drag did not send a PATCH');
    await cardIn(to).waitFor({ timeout: 1000 });
    assert.equal(await cardIn(from).count(), 0, 'the dropped card is already in its destination before the PATCH confirms');
    await cardIn(to).getByRole('status').filter({ hasText: 'Guardando' }).waitFor();
    assert.equal(await cardIn(to).getAttribute('aria-busy'), 'true');
    assert.equal(await cardIn(to).getAttribute('data-rfd-drag-handle-draggable-id'), null, 'a pending save disables another gesture');
    assert.deepEqual(await page.evaluate(() => window.__moveQueryClient.getQueryData(['nativeTasks'])), cachedBefore, 'pending presentation does not invent saved status, timestamps or clock values');
    assert.equal(await page.locator('body > canvas').count(), 0, 'a pending move must not celebrate completion');
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
    assert.deepEqual(await page.evaluate(() => window.__moveColumns), [columnOf(from), columnOf(to)], 'the card never bounces back through its original column during confirmation');
    if (to === 'REALIZADA') await page.locator('body > canvas').waitFor({ timeout: 2000 });
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
  return { id: 'move-test', title: 'Revisar propuesta de campaña', status, sortOrder: 0, dueDate: todayDueDate(), createdAt: now,
    startedAt: status === 'EN_CURSO' ? now : null, completedAt: status === 'REALIZADA' ? now : null,
    accumulatedWorkMs: 0, clientId: 'sample', client: { name: 'Agencia Faro' },
    creator: recognitionDemoUser, creatorId: recognitionDemoUser.id, assignee: recognitionDemoMember, assigneeId: recognitionDemoMember.id,
    collaborators: [], taskComments: [], taskAttachments: [] };
};
async function openBoard({ initial = makeTask(), additionalTasks = [], read, patch, reorder, dark = false }) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  page.setDefaultTimeout(8000);
  const events = { reads: 0, writes: 0, errors: [] };
  const initialRows = [initial, ...additionalTasks];
  page.on('pageerror', error => events.errors.push(error.message));
  await page.route('**/api/tasks**', async route => {
    const pathname = new URL(route.request().url()).pathname;
    if (pathname === '/api/tasks') {
      const number = ++events.reads;
      if (number === 1) return route.fulfill({ json: initialRows });
      return read ? read(route, number, page) : route.fulfill({ json: initialRows });
    }
    if (pathname === '/api/tasks/move-test' && route.request().method() === 'PATCH') return patch(route, ++events.writes, page);
    if (pathname === '/api/tasks/reorder' && route.request().method() === 'POST' && reorder) return reorder(route, ++events.writes, page);
    return route.continue();
  });
  await page.goto(`${preview.origin}/gestion?admin`, { waitUntil: 'commit' });
  const card = status => page.locator(`[data-rfd-droppable-id="${columnOf(status)}"] [data-rfd-draggable-id="move-test"]`);
  try { await card(initial.status).waitFor({ timeout: 25000 }); }
  catch (error) {
    console.error(JSON.stringify({ events, text: (await page.locator('body').innerText()).slice(0, 2500) }));
    await page.close();
    throw error;
  }
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

async function selectFilter(page, label, option) {
  await page.getByRole('combobox', { name: label, exact: true }).click();
  await page.getByRole('option', { name: option, exact: true }).click();
}

test('global search labels suspended filters, finds outside them and restores their saved values', { timeout: 30000 }, async () => {
  const outside = { ...makeTask(), id: 'outside-filter', title: 'Buscable sin fecha', dueDate: null,
    client: { name: 'Otra cuenta' }, assigneeId: 'other-member', assignee: { id: 'other-member', name: 'Otra persona', userId: 'other-user' } };
  const board = await openBoard({ additionalTasks: [outside] });
  const { page } = board;
  const outsideCard = page.locator('[data-rfd-draggable-id="outside-filter"]');
  try {
    await selectFilter(page, 'Cliente', 'Agencia Faro');
    await selectFilter(page, 'Periodo', '⚠️ Solo Vencidos');
    const labels = ['Responsable', 'Cliente', 'Periodo'];
    const saved = await Promise.all(labels.map(label => page.getByRole('combobox', { name: label, exact: true }).innerText()));
    assert.equal(await outsideCard.count(), 0);
    await page.evaluate(() => window.dispatchEvent(new CustomEvent('global-search-changed', { detail: { query: 'Buscable' } })));
    const notice = page.getByRole('status').filter({ hasText: 'Búsqueda global' });
    await notice.waitFor();
    assert.match(await notice.innerText(), /Buscable/);
    assert.match(await notice.innerText(), /Responsable, cliente y periodo no se aplican/);
    for (const label of labels) assert.equal(await page.getByRole('combobox', { name: label, exact: true }).isDisabled(), true, `${label} is visibly suspended`);
    await outsideCard.waitFor();
    assert.equal(board.events.writes, 0);
    await page.screenshot({ path: 'output/task-move-synchronization/global-search-light.png', animations: 'disabled' });
    await page.evaluate(() => document.documentElement.classList.add('dark'));
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({ path: 'output/task-move-synchronization/global-search-mobile-dark.png', animations: 'disabled', fullPage: true });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true, 'the search notice must fit mobile width');
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.evaluate(() => window.dispatchEvent(new CustomEvent('global-search-changed', { detail: { query: '  ' } })));
    await notice.waitFor({ state: 'hidden' });
    for (const label of labels) assert.equal(await page.getByRole('combobox', { name: label, exact: true }).isDisabled(), false);
    assert.deepEqual(await Promise.all(labels.map(label => page.getByRole('combobox', { name: label, exact: true }).innerText())), saved);
    assert.equal(await outsideCard.count(), 0);
    assert.deepEqual(board.events.errors, []);
  } finally { await page.close(); }
});

test('Realizado orders personal completions, refuses manual rank changes and keeps the reopen reason', { timeout: 30000 }, async () => {
  const at = hour => { const date = new Date(); date.setHours(hour, 0, 0, 0); return date.toISOString(); };
  const initial = { ...makeTask('REALIZADA'), completedAt: at(11), sortOrder: 50 };
  const older = { ...makeTask('REALIZADA'), id: 'older-individual', title: 'Entrega anterior', completedAt: at(10), sortOrder: 0 };
  const shared = { ...makeTask(), id: 'shared-completions', title: 'Entrega compartida', sharedProgress: true, rosterVersion: 1, sortOrder: 99,
    participants: [
      { memberId: recognitionDemoMember.id, member: recognitionDemoMember, role: 'ASSIGNEE', status: 'REALIZADA', completedAt: at(12), revision: 2, permissions: { canReopen: true } },
      { memberId: 'other-member', member: { id: 'other-member', name: 'Otra persona' }, role: 'COLLABORATOR', status: 'REALIZADA', completedAt: at(9), revision: 2, permissions: { canReopen: true } },
      { memberId: 'pending-member', member: { id: 'pending-member', name: 'Parte pendiente' }, role: 'COLLABORATOR', status: 'PENDIENTE', completedAt: null, revision: 0, permissions: { canChangeStatus: true } },
    ] };
  const board = await openBoard({ initial, additionalTasks: [older, shared], reorder: route => route.fulfill({ json: { order: [] } }) });
  const { page } = board;
  const doneOrder = () => page.locator('[data-rfd-droppable-id="realizado"] [data-rfd-draggable-id]').evaluateAll(nodes => nodes.map(node => node.getAttribute('data-rfd-draggable-id')));
  const expected = [JSON.stringify([shared.id, recognitionDemoMember.id]), initial.id, older.id, JSON.stringify([shared.id, 'other-member'])];
  try {
    await selectFilter(page, 'Responsable', 'Todos los responsables');
    await selectFilter(page, 'Periodo', 'Todos');
    assert.deepEqual(await doneOrder(), expected);
    await page.reload({ waitUntil: 'commit' });
    await board.card('REALIZADA').waitFor();
    assert.deepEqual(await doneOrder(), expected, 'completion ordering survives a reload');
    const before = await page.evaluate(() => window.__moveQueryClient.getQueryData(['nativeTasks']));
    await board.card('REALIZADA').focus();
    await page.keyboard.press('Space'); await page.waitForTimeout(150);
    await page.keyboard.press('ArrowUp'); await page.waitForTimeout(150);
    await page.keyboard.press('Space');
    await page.getByText('Realizado se ordena por fecha de cierre, con lo más reciente primero.', { exact: true }).waitFor();
    assert.equal(board.events.writes, 0, 'moving within Realizado must not write a priority');
    assert.deepEqual(await doneOrder(), expected);
    assert.deepEqual(await page.evaluate(() => window.__moveQueryClient.getQueryData(['nativeTasks'])), before);
    await page.screenshot({ path: 'output/task-move-synchronization/completion-order.png', animations: 'disabled' });
    await drag(board, 'REALIZADA', 'PENDIENTE');
    const dialog = page.getByRole('dialog');
    await dialog.getByRole('heading', { name: 'Reabrir tarea', exact: true }).waitFor();
    assert.equal(board.events.writes, 0, 'a cross-column reopen still needs its reason before saving');
    assert.deepEqual(board.events.errors, []);
  } finally { await page.close(); }
});

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

for (const [from, to] of [['PENDIENTE', 'EN_CURSO'], ['EN_CURSO', 'REALIZADA']]) test(`${from} → ${to}: a rejected PATCH restores the original column and displays the server error`, { timeout: 30000 }, async () => {
  const allowReject = deferred(), patchSeen = deferred();
  const board = await openBoard({ initial: makeTask(from), dark: true, patch: async route => {
    patchSeen.resolve();
    await allowReject.promise;
    return route.fulfill({ status: 403, json: { error: 'Movimiento rechazado en esta prueba.' } });
  } });
  try {
    await drag(board, from, to);
    await within(patchSeen.promise, 'The drag did not send a PATCH');
    await board.card(to).waitFor({ timeout: 1000 });
    await board.card(to).getByRole('status').filter({ hasText: 'Guardando' }).waitFor();
    assert.equal(await board.card(from).count(), 0, 'the move is visible while the rejected response is still pending');
    assert.equal(await board.page.locator('body > canvas').count(), 0, 'no success is celebrated before the server responds');
    allowReject.resolve();
    const errorNotice = board.page.locator('[data-toast-type="error"]').filter({ hasText: 'Movimiento rechazado en esta prueba.' });
    await errorNotice.waitFor();
    assert.match(await errorNotice.innerText(), /Movimiento rechazado en esta prueba\./);
    assert.equal(await board.card(from).count(), 1);
    assert.equal(await board.card(to).count(), 0);
    assert.equal(board.events.writes, 1);
    assert.notEqual(await board.card(from).getAttribute('aria-busy'), 'true');
    assert.equal(await board.page.locator('body > canvas').count(), 0, 'a rejected completion is never celebrated');
    assert.deepEqual(board.events.errors, []);
    await board.page.screenshot({ path: `output/task-move-synchronization/rejected-${from}-${to}-dark.png`, animations: 'disabled' });
  } finally { allowReject.resolve(); await board.page.close(); }
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

test('a polling result arriving during the PATCH does not undo the pending visual move', { timeout: 30000 }, async () => {
  const initial = makeTask(), staleStarted = deferred(), releaseStale = deferred(), staleFinished = deferred();
  const allowSave = deferred(), patchSeen = deferred();
  const saved = { ...initial, status: 'EN_CURSO', startedAt: new Date().toISOString(), sortOrder: 5 };
  const board = await openBoard({ initial, patch: async route => {
    patchSeen.resolve();
    await allowSave.promise;
    return route.fulfill({ json: saved });
  }, read: async (route, number) => {
    if (number === 2) {
      staleStarted.resolve();
      await releaseStale.promise;
      await route.fulfill({ json: [initial] }).catch(() => {});
      staleFinished.resolve();
      return;
    }
    return route.fulfill({ json: [saved] });
  } });
  try {
    await board.page.evaluate(() => { void window.__moveQueryClient.refetchQueries({ queryKey: ['nativeTasks'], exact: true }); });
    await within(staleStarted.promise, 'The polling request did not start');
    await drag(board, 'PENDIENTE', 'EN_CURSO');
    await within(patchSeen.promise, 'The drag did not send a PATCH');
    await board.card('EN_CURSO').waitFor({ timeout: 1000 });
    releaseStale.resolve();
    await within(staleFinished.promise, 'The polling request did not finish');
    await board.page.waitForTimeout(150);
    assert.equal(await board.card('PENDIENTE').count(), 0);
    assert.equal(await board.card('EN_CURSO').count(), 1);
    assert.equal(await board.card('EN_CURSO').getAttribute('aria-busy'), 'true');
    const response = board.page.waitForResponse(request => request.url().endsWith('/api/tasks/move-test') && request.request().method() === 'PATCH');
    allowSave.resolve();
    await response;
    await board.card('EN_CURSO').getByRole('status').filter({ hasText: 'Guardando' }).waitFor({ state: 'hidden' });
    assert.equal(await board.card('PENDIENTE').count(), 0);
    assert.equal(await board.card('EN_CURSO').count(), 1);
    assert.deepEqual(board.events.errors, []);
  } finally { releaseStale.resolve(); allowSave.resolve(); await board.page.close(); }
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

test('rejecting the visual move preserves an unrelated task updated during the save', { timeout: 30000 }, async () => {
  const initial = makeTask(), other = { ...makeTask(), id: 'other-task', title: 'Preparar materiales', sortOrder: 1 };
  const updatedOther = { ...other, title: 'Materiales actualizados por otra persona' };
  const allowReject = deferred(), patchSeen = deferred();
  const board = await openBoard({ initial, additionalTasks: [other],
    patch: async route => { patchSeen.resolve(); await allowReject.promise; return route.fulfill({ status: 403, json: { error: 'Movimiento rechazado en esta prueba.' } }); },
    read: route => route.fulfill({ json: [initial, updatedOther] }),
  });
  try {
    await drag(board, 'PENDIENTE', 'EN_CURSO');
    await within(patchSeen.promise, 'The drag did not send a PATCH');
    await board.card('EN_CURSO').waitFor({ timeout: 1000 });
    await board.page.evaluate(() => window.__moveQueryClient.refetchQueries({ queryKey: ['nativeTasks'], exact: true }));
    await board.page.getByText(updatedOther.title, { exact: true }).waitFor();
    assert.equal(await board.card('EN_CURSO').getAttribute('aria-busy'), 'true');
    allowReject.resolve();
    await board.page.locator('[data-toast-type="error"]').filter({ hasText: 'Movimiento rechazado en esta prueba.' }).waitFor();
    await board.card('PENDIENTE').waitFor();
    assert.equal(await board.card('EN_CURSO').count(), 0);
    assert.equal(await board.page.getByText(updatedOther.title, { exact: true }).count(), 1, 'rollback must not restore an old snapshot over another person\'s update');
    assert.equal(await board.page.getByText(other.title, { exact: true }).count(), 0);
    assert.deepEqual(board.events.errors, []);
  } finally { allowReject.resolve(); await board.page.close(); }
});

for (const rejected of [false, true]) test(`same-column reorder is immediate and ${rejected ? 'rolls back when rejected' : 'remains after confirmation'}`, { timeout: 30000 }, async () => {
  const initial = makeTask(), other = { ...makeTask(), id: 'other-task', title: 'Revisar materiales', sortOrder: 1 };
  const allowResponse = deferred(), reorderSeen = deferred();
  const savedOrder = [{ id: other.id, sortOrder: 0 }, { id: initial.id, sortOrder: 1 }];
  let confirmed = false;
  const board = await openBoard({ initial, additionalTasks: [other], dark: rejected,
    reorder: async route => {
      const payload = route.request().postDataJSON();
      assert.deepEqual(payload.previousIds, [initial.id, other.id]);
      assert.deepEqual(payload.reorderList, savedOrder);
      reorderSeen.resolve();
      await allowResponse.promise;
      confirmed = !rejected;
      return route.fulfill(rejected ? { status: 403, json: { error: 'No se pudo guardar esta prioridad.' } } : { json: { order: savedOrder } });
    },
    read: route => route.fulfill({ json: confirmed ? [{ ...initial, sortOrder: 1 }, { ...other, sortOrder: 0 }] : [initial, other] }),
  });
  const cards = board.page.locator('[data-rfd-droppable-id="pendiente"] [data-rfd-draggable-id]');
  const order = () => cards.evaluateAll(elements => elements.map(element => element.getAttribute('data-rfd-draggable-id')));
  try {
    const cachedBefore = await board.page.evaluate(() => window.__moveQueryClient.getQueryData(['nativeTasks']));
    await board.card('PENDIENTE').focus();
    await board.page.keyboard.press('Space');
    await board.page.waitForTimeout(150);
    await board.page.keyboard.press('ArrowDown');
    await board.page.waitForTimeout(150);
    await board.page.keyboard.press('Space');
    await within(reorderSeen.promise, 'The drag did not send a reorder');
    await board.card('PENDIENTE').getByRole('status').filter({ hasText: 'Guardando' }).waitFor();
    assert.deepEqual(await order(), [other.id, initial.id], 'the destination priority is visible while saving');
    assert.deepEqual(await board.page.evaluate(() => window.__moveQueryClient.getQueryData(['nativeTasks'])), cachedBefore, 'unconfirmed priority does not mutate saved order');
    allowResponse.resolve();
    await board.card('PENDIENTE').getByRole('status').filter({ hasText: 'Guardando' }).waitFor({ state: 'hidden' });
    assert.deepEqual(await order(), rejected ? [initial.id, other.id] : [other.id, initial.id]);
    if (rejected) await board.page.locator('[data-toast-type="error"]').filter({ hasText: 'No se pudo guardar esta prioridad.' }).waitFor();
    assert.equal(board.events.writes, 1);
    assert.deepEqual(board.events.errors, []);
    await board.page.screenshot({ path: `output/task-move-synchronization/reorder-${rejected ? 'rejected-dark' : 'confirmed-light'}.png`, animations: 'disabled' });
  } finally { allowResponse.resolve(); await board.page.close(); }
});
