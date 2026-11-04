// Real dashboard, service-generated fixture, no production requests or writes.
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright-core';
import { createDashboardPreview } from '../../scripts/preview-dashboard.js';
import { buildPersonalDashboard } from '../../src/services/personalDashboardService.js';
import { dashboardDemoMember, dashboardDemoUser } from '../fixtures/dashboardPreviewData.js';

const now = new Date();
const day = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota' }).format(now);
const tomorrow = new Date(Date.parse(`${day}T12:00:00Z`) + 86400000).toISOString().slice(0, 10);
const tasks = [0, 1, 2, 3].map(i => ({ id: `deadline-${i}`, title: i ? `Pendiente de mañana ${i}` : 'Pendiente de hoy',
  status: 'PENDIENTE', dueDate: new Date(i ? `${tomorrow}T00:00:00Z` : `${day}T12:00:00Z`), assigneeId: dashboardDemoMember.id }));
const data = buildPersonalDashboard({ member: { ...dashboardDemoMember, user: dashboardDemoUser, nativeTasks: tasks }, now });
assert.equal(data.stats.dueToday, 1);
assert.equal(data.stats.overdue, 0);
await mkdir('output/task-deadlines', { recursive: true });
const preview = await createDashboardPreview({ port: 3268 });
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1050 } });
  page.setDefaultTimeout(15000);
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.route('**/api/dashboard/personal/*', route => route.fulfill({ json: data }));
  await page.goto(`${preview.origin}/?future`, { waitUntil: 'domcontentloaded', timeout: 90000 });
  const upcoming = page.getByRole('region', { name: 'Próximos pendientes' });
  await upcoming.getByText('Pendiente de mañana 1').waitFor();
  assert.equal(await upcoming.getByText('Mañana', { exact: true }).count(), 1, 'UTC midnight delivery stays tomorrow in the widget');
  assert.match(await page.locator('[data-stat="dueToday"]').innerText(), /1/);
  assert.match(await page.locator('[data-stat="overdue"]').innerText(), /0/);
  assert.equal(await page.getByText(/Tienes .*tareas? vencidas?/).count(), 0, 'no false overdue reminder');
  await page.waitForFunction(() => {
    let node = document.querySelector('[data-stat="dueToday"]');
    while (node) { if (Number(getComputedStyle(node).opacity) < 0.99) return false; node = node.parentElement; }
    return true;
  });
  await page.screenshot({ path: 'output/task-deadlines/dashboard-claro.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => document.documentElement.classList.add('dark'));
  // Let the sidebar close and the theme transition finish after resizing.
  await page.waitForTimeout(800);
  await page.screenshot({ path: 'output/task-deadlines/dashboard-movil-oscuro.png', fullPage: true });
  assert.deepEqual(errors, []);
  console.log('Dashboard: 1 today, 0 overdue, 3 tomorrow; no false overdue reminder. Desktop/light and mobile/dark captured.');
} finally { await browser.close(); await preview.close(); }
