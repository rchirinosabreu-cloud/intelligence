import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright-core';
import { createRecognitionPreview } from '../../scripts/preview-recognitions.js';

let preview, browser;
before(async () => {
  preview = await createRecognitionPreview({ port: 0 });
  browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
  await mkdir('output/selects', { recursive: true });
});
after(async () => { await browser?.close(); await preview?.close(); });

test('Gestion filters stay open through background refresh, keep selection and use the shared desktop picker', async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  let requests = 0;
  await page.route('**/api/tasks?syncSource=*', async route => {
    requests++;
    const response = await route.fetch();
    const rows = await response.json();
    if (requests > 1) rows.push({ ...rows[0], id: 'extra-task', assignee: { ...rows[0].assignee, name: 'Andrea · prueba' } });
    await route.fulfill({ response, json: rows });
  });
  await page.clock.install();
  await page.goto(`${preview.origin}/gestion`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.getByRole('heading', { name: 'Gestión de Tareas' }).waitFor({ timeout: 45000 });
  const responsible = page.locator('.task-filter-grid [role="combobox"], .task-filter-grid select:not([aria-hidden="true"])').first();
  await responsible.click();
  assert.equal(await responsible.evaluate(el => el.tagName), 'BUTTON', 'desktop must use the shared picker');
  await page.getByRole('listbox').waitFor();
  await page.clock.runFor(31000);
  await page.waitForFunction(() => !!document.querySelector('[role="option"]')?.textContent);
  assert.ok(requests >= 2, 'the real polling interval ran');
  assert.equal(await responsible.getAttribute('aria-expanded'), 'true');
  await page.getByRole('option', { name: 'Todos los responsables', exact: true }).click();
  assert.equal(await responsible.innerText(), 'Todos los responsables');
  await responsible.click();
  await page.keyboard.press('Escape');
  assert.equal(await responsible.getAttribute('aria-expanded'), 'false');
  assert.equal(await responsible.evaluate(el => el === document.activeElement), true);
  await responsible.click();
  await page.clock.runFor(250);
  await page.screenshot({ path: 'output/selects/gestion-desktop.png', animations: 'disabled' });
  await page.close();
});

test('touch mobile keeps operating-system select controls and values', async () => {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, colorScheme: 'dark' });
  await page.goto(`${preview.origin}/gestion`);
  await page.getByRole('heading', { name: 'Gestión de Tareas' }).waitFor({ timeout: 45000 });
  const native = page.locator('.task-filter-grid select').first();
  await native.selectOption('Todos');
  assert.equal(await native.inputValue(), 'Todos');
  assert.equal(await page.locator('.task-filter-grid button[role="combobox"]').count(), 0);
  await page.screenshot({ path: 'output/selects/gestion-mobile.png' });
  await page.close();
});

test('desktop picker inside a dialog preserves required validation, event payloads, form data, reset and keyboard', async () => {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto(`${preview.origin}/tests/fixtures/selects.html`);
  await page.getByRole('button', { name: 'Abrir formulario' }).click();
  const account = page.getByRole('combobox', { name: 'Cuenta de Google', includeHidden: true });
  await page.getByRole('button', { name: 'Comprobar formulario' }).click();
  assert.equal(await page.locator('output').innerText(), '');
  assert.equal(await account.getAttribute('aria-invalid'), 'true');
  await account.click();
  await page.getByRole('option', { name: 'Social Brain', exact: true }).click();
  assert.equal(await account.innerText(), 'Social Brain');
  assert.equal(await page.getByRole('dialog').count(), 1);
  const template = page.getByRole('combobox', { name: 'Plantilla' });
  await template.focus(); await page.keyboard.press('ArrowDown');
  await page.getByRole('listbox').waitFor();
  await page.waitForFunction(() => document.activeElement?.getAttribute('role') === 'option');
  await page.keyboard.press('m');
  await page.waitForFunction(() => document.activeElement?.textContent.includes('Mensual'));
  await page.keyboard.press('Enter');
  await page.getByRole('button', { name: 'Comprobar formulario' }).click();
  assert.deepEqual(JSON.parse(await page.locator('output').innerText()), { account: 'social', template: 'monthly' });
  await page.getByRole('button', { name: 'Restablecer' }).click();
  assert.equal(await account.innerText(), 'Selecciona una cuenta');
  assert.equal(await template.innerText(), 'Ninguna');
  await account.click();
  await page.waitForTimeout(200);
  await page.screenshot({ path: 'output/selects/dialog-desktop.png' });
  await page.keyboard.press('Escape');
  assert.equal(await page.getByRole('dialog').count(), 1, 'Escape only closes the options');
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Opciones', exact: true }).click();
  await page.getByRole('menuitemcheckbox', { name: 'Notificaciones' }).click();
  assert.deepEqual(errors, []);
  await page.close();
});

test('uncontrolled selection survives a change between styled and native representations', async () => {
  const page = await browser.newPage();
  await page.goto(`${preview.origin}/tests/fixtures/selects.html`);
  await page.getByRole('button', { name: 'Abrir formulario' }).click();
  await page.getByRole('combobox', { name: 'Plantilla' }).click();
  await page.getByRole('option', { name: 'Mensual' }).click();
  await page.getByRole('button', { name: 'Cambiar representación' }).click();
  assert.equal(await page.locator('select[name="template"]').inputValue(), 'monthly');
  await page.getByRole('button', { name: 'Cambiar representación' }).click();
  assert.equal(await page.getByRole('combobox', { name: 'Plantilla' }).innerText(), 'Mensual');
  await page.close();
});

test('an option removed during refresh cannot emit an obsolete value', async () => {
  const page = await browser.newPage();
  await page.goto(`${preview.origin}/tests/fixtures/selects.html`);
  await page.getByRole('button', { name: 'Abrir formulario' }).click();
  const account = page.getByRole('combobox', { name: 'Cuenta de Google', includeHidden: true });
  await account.click(); await page.getByRole('option', { name: 'Social Brain', exact: true }).click();
  await page.getByRole('button', { name: 'Simular actualización' }).click();
  await account.click();
  await page.waitForFunction(() => !document.querySelector('select[name="account"] option[value="coordinador"]'));
  assert.equal(await account.getAttribute('aria-expanded'), 'true');
  await page.getByRole('option', { name: 'Coordinador', exact: true }).click();
  assert.equal(await account.innerText(), 'Social Brain');
  assert.equal(await page.locator('select[name="account"]').inputValue(), 'social');
  await page.close();
});

test('long lists fit a narrow dark desktop and link menus support keyboard dismissal', async () => {
  const page = await browser.newPage({ viewport: { width: 640, height: 740 }, reducedMotion: 'reduce' });
  await page.goto(`${preview.origin}/tests/fixtures/selects.html`);
  await page.evaluate(() => document.documentElement.classList.add('dark'));
  await page.getByRole('combobox', { name: 'Lista extensa' }).click();
  const list = page.getByRole('listbox');
  const bounds = await list.boundingBox();
  assert.ok(bounds.x >= 0 && bounds.y >= 0 && bounds.x + bounds.width <= 640 && bounds.y + bounds.height <= 740);
  assert.ok(bounds.height <= 321);
  await page.waitForFunction(() => document.activeElement?.getAttribute('role') === 'option');
  await page.keyboard.press('End');
  await page.waitForFunction(() => document.activeElement?.textContent.includes('099'));
  await page.keyboard.press('Enter');
  assert.match(await page.getByRole('combobox', { name: 'Lista extensa' }).innerText(), /099/);
  await page.getByRole('combobox', { name: 'Lista extensa' }).click();
  await page.screenshot({ path: 'output/selects/desktop-dark.png' });
  await page.keyboard.press('Escape');
  const links = page.getByRole('button', { name: /Referencias/ });
  await links.click(); await page.getByRole('menuitem', { name: 'Enlace #2' }).waitFor();
  await page.keyboard.press('Escape');
  assert.equal(await links.evaluate(el => el === document.activeElement), true);
  await page.close();
});

test('shared action menu supports checkbox and radio options without runtime errors', async () => {
  const page = await browser.newPage();
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto(`${preview.origin}/tests/fixtures/selects.html`);
  await page.getByRole('button', { name: 'Opciones', exact: true }).click();
  await page.waitForTimeout(250);
  assert.deepEqual(errors, []);
  await page.getByRole('menuitemcheckbox', { name: 'Notificaciones' }).click();
  await page.getByRole('button', { name: 'Opciones', exact: true }).click();
  assert.equal(await page.getByRole('menuitemcheckbox', { name: 'Notificaciones' }).getAttribute('aria-checked'), 'true');
  await page.getByRole('menuitemradio', { name: 'Dos' }).click();
  await page.close();
});
