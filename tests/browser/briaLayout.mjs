import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright-core';
import { createClientOperationsPreview } from '../../scripts/preview-client-operations.js';
import { dashboardDemoUser } from '../fixtures/dashboardPreviewData.js';

// Real AppLayout and Sidebar; all APIs are simulated, with no production session or model calls.
const preview = await createClientOperationsPreview({ port: 3734 });
const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const user = { ...dashboardDemoUser, modulePermissions: { ...dashboardDemoUser.modulePermissions, bria: true } };
const errors = []; page.on('pageerror', error => errors.push(error.message));
const out = path.resolve(process.env.SCREENSHOT_DIR || 'output/bria-asistente');
try {
  await mkdir(out, { recursive: true });
  await page.route('**/api/auth/me', route => route.fulfill({ json: user }));
  await page.route('**/api/user/profile', route => route.fulfill({ json: user }));
  await page.route('**/api/bria/conversations', route => route.fulfill({ json: [] }));
  await page.goto(`${preview.origin}/clientes`);
  const sidebar = page.locator('aside').filter({ has: page.getByRole('link', { name: 'Gestión', exact: true }) });
  await page.getByRole('button', { name: 'Preguntarle a Bria' }).waitFor({ timeout: 120000 });
  assert.equal(Math.round((await sidebar.boundingBox()).width), 256);
  await page.getByRole('button', { name: 'Preguntarle a Bria' }).click();
  await page.waitForFunction(() => document.querySelector('[data-sidebar-collapsed="true"]')?.getBoundingClientRect().width === 80);
  assert.equal(Math.round((await sidebar.boundingBox()).width), 80);
  const panel = page.getByRole('region', { name: 'Conversación con Bria' });
  await panel.waitFor();
  const input = page.getByLabel('Mensaje para Bria'); await input.fill('Un borrador entre módulos');
  await page.getByRole('link', { name: 'Gestión', exact: true }).click();
  assert.equal(await panel.isVisible(), true);
  assert.equal(await input.inputValue(), 'Un borrador entre módulos');
  await page.waitForFunction(() => { let el = document.querySelector('main h1'); if (!el) return false; for (; el; el = el.parentElement) if (Number(getComputedStyle(el).opacity) < 0.99) return false; return true; });
  await page.screenshot({ path: path.join(out, 'bria-menu-contraido.png') });
  await page.getByRole('button', { name: 'Preguntarle a Bria' }).click();
  assert.equal(await panel.isVisible(), false);
  await page.getByRole('button', { name: 'Preguntarle a Bria' }).click();
  assert.equal(await input.inputValue(), 'Un borrador entre módulos');
  await page.evaluate(() => document.documentElement.classList.add('dark'));
  await page.screenshot({ path: path.join(out, 'bria-menu-contraido-oscuro.png') });
  assert.deepEqual(errors, []);
  console.log('Real sidebar collapses to 80px; module navigation and toggling preserve the draft.');
} finally { await browser.close(); await preview.close(); }
