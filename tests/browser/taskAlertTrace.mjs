import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
import { createRecognitionPreview } from '../../scripts/preview-recognitions.js';
import { recordTaskAlertInteraction } from '../../src/services/taskAlertInteractionService.js';

let browser, preview;
const taskId = '11111111-1111-4111-8111-111111111111';
before(async () => {
  preview = await createRecognitionPreview({ port: 0 });
  browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
});
after(async () => { await browser?.close(); await preview?.close(); });
async function setup({ returned = false, demo = false, failShown = false, failFirst = false, hidden = false, multiple = false } = {}) {
  const page = await browser.newPage(); page.setDefaultTimeout(5000);
  if (hidden) await page.addInitScript(() => { window.testHidden = true; Object.defineProperty(document, 'hidden', { get: () => window.testHidden }); });
  const rows = new Map(), requests = [], errors = [];
  page.on('pageerror', error => errors.push(error.message));
  const task = { id: taskId, title: 'Diseñar parrilla', status: returned ? 'DEVUELTA' : 'EN_CURSO', clientName: 'Aristea',
    creatorId: 'helen', assignee: { userId: 'helen', isActive: true }, startedAt: new Date(Date.now() - 16 * 3600000),
    accumulatedWorkMs: 0, elapsedMs: 16 * 3600000, returnedAt: new Date(Date.now() - 7200000) };
  let tasks = multiple ? [task, { ...task, id: '22222222-2222-4222-8222-222222222222', title: 'Segunda tarea' }] : [task];
  const originalTasks = [...tasks];
  const db = { user: { findUnique: async () => ({ isActive: true, role: 'EDITOR', modulePermissions: { gestion: true } }) },
    task: { findUnique: async ({ where }) => originalTasks.find(task => task.id === where.id) }, operationalTraceEvent: {
      findUnique: async ({ where }) => rows.get(where.id),
      upsert: async ({ where, create }) => { if (!rows.has(where.id)) rows.set(where.id, create); return rows.get(where.id); },
    }, $transaction: async fn => fn(db), $executeRaw: async () => 1 };
  await page.route('**/api/**', async route => {
    const path = new URL(route.request().url()).pathname;
    if (route.request().method() === 'GET') return route.fulfill({ json: { tasks } });
    const body = route.request().postDataJSON(); requests.push({ path, body });
    if (path.endsWith('/alert-interaction')) {
      if (failShown || (failFirst && requests.length === 1)) return route.fulfill({ status: 500, json: { error: 'Error simulado' } });
      // Exercise actual validation/persistence logic, with only the database replaced.
      const result = await recordTaskAlertInteraction({ db, userId: 'helen', taskId: path.split('/')[3], ...body });
      return route.fulfill({ json: result });
    }
    if (path.endsWith('/snooze')) tasks = tasks.filter(task => task.id !== path.split('/')[3]);
    return route.fulfill({ json: { success: true } });
  });
  await page.goto(`${preview.origin}/tests/fixtures/task-alert-trace.html?${returned ? 'returned&' : ''}${demo ? 'preview' : ''}`, { timeout: 30000 });
  await page.getByRole('button', { name: 'Revisar tarea' }).first().waitFor();
  return { page, requests, rows, errors };
}

for (const returned of [false, true]) test(`visible ${returned ? 'returned' : '15-hour'} notice records the real review click once and closes before navigation`, async () => {
  const { page, rows, requests, errors } = await setup({ returned });
  try {
    const deadline = Date.now() + 5000;
    while (!rows.size && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 25));
    assert.equal([...rows.values()].filter(row => row.eventType === 'TASK_ALERT_SHOWN').length, 1);
    await Promise.all([page.waitForResponse(response => response.url().endsWith('/alert-interaction') && response.request().postDataJSON().action === 'REVIEW'),
      page.getByRole('button', { name: 'Revisar tarea' }).click()]);
    await page.waitForFunction(() => location.search.includes('taskId='));
    await page.getByRole('dialog').waitFor({ state: 'hidden' });
    assert.equal([...rows.values()].filter(row => row.eventType === 'TASK_ALERT_REVIEWED').length, 1);
    assert.deepEqual(requests.filter(req => req.body?.action).map(req => req.body.action), ['SHOWN', 'REVIEW']);
    assert.deepEqual(errors, []);
  } finally { await page.close(); }
});

test('closing remaining returned reminders does not record closing a task already snoozed', async () => {
  const { page, rows } = await setup({ returned: true, multiple: true });
  try {
    const deadline = Date.now() + 5000;
    while (rows.size < 2 && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 25));
    assert.equal(rows.size, 2);
    await page.getByRole('button', { name: 'Recordarme más tarde' }).first().click();
    await page.getByText('Diseñar parrilla', { exact: true }).waitFor({ state: 'hidden' });
    await Promise.all([page.waitForResponse(response => response.url().endsWith('/alert-interaction') && response.request().postDataJSON().action === 'DISMISS'),
      page.getByRole('button', { name: 'Cerrar', exact: true }).click()]);
    await page.getByRole('dialog').waitFor({ state: 'hidden' });
    assert.deepEqual([...rows.values()].filter(row => row.eventType === 'TASK_ALERT_DISMISSED').map(row => row.taskId), ['22222222-2222-4222-8222-222222222222']);
  } finally { await page.close(); }
});

test('a hidden document does not report a shown notice; becoming visible reports once', async () => {
  const { page, requests, rows } = await setup({ hidden: true });
  try {
    await page.clock.install(); await page.clock.fastForward(2000);
    assert.equal(requests.length, 0);
    await Promise.all([page.waitForResponse(response => response.url().endsWith('/alert-interaction')),
      page.evaluate(() => { window.testHidden = false; document.dispatchEvent(new Event('visibilitychange')); })]);
    assert.equal(rows.size, 1);
    await page.clock.fastForward(3000);
    assert.equal(requests.length, 1);
  } finally { await page.close(); }
});

test('a transient failure retries the same notice identity and closing records its action', async () => {
  const { page, requests, rows } = await setup({ failFirst: true });
  try {
    const deadline = Date.now() + 5000;
    while (!rows.size && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 25));
    assert.equal(rows.size, 1);
    assert.equal(requests.length, 2);
    assert.equal(requests[0].body.noticeId, requests[1].body.noticeId);
    await Promise.all([page.waitForResponse(response => response.url().endsWith('/alert-interaction') && response.request().postDataJSON().action === 'DISMISS'),
      page.getByRole('button', { name: 'Cerrar', exact: true }).click()]);
    assert.equal([...rows.values()].filter(row => row.eventType === 'TASK_ALERT_DISMISSED').length, 1);
  } finally { await page.close(); }
});

test('local returned preview never records production actions', async () => {
  const { page, requests } = await setup({ returned: true, demo: true });
  try { await page.getByRole('button', { name: 'Revisar tarea' }).click(); assert.equal(requests.length, 0); }
  finally { await page.close(); }
});

test('a trace failure does not trap the person in the popup or claim review succeeded', async () => {
  const { page, rows } = await setup({ failShown: true });
  try {
    await page.getByRole('button', { name: 'Revisar tarea' }).click();
    await page.waitForFunction(() => location.search.includes('taskId='));
    await page.getByRole('dialog').waitFor({ state: 'hidden' });
    assert.equal(rows.size, 0);
  } finally { await page.close(); }
});
