import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright-core';
import { createRecognitionPreview } from '../../scripts/preview-recognitions.js';
import { chooseOption } from './selectHelpers.mjs';

let preview, browser;
before(async () => {
  preview = await createRecognitionPreview({ port: 0 });
  browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
  await mkdir('output/client-edit', { recursive: true });
});
after(async () => { await browser?.close(); await preview?.close(); });

async function setup({ save, mobile = false, screenshot = false } = {}) {
  const page = await browser.newPage({ viewport: mobile ? { width: 390, height: 844 } : { width: 1280, height: 900 }, hasTouch: mobile, isMobile: mobile, reducedMotion: 'reduce' });
  page.setDefaultTimeout(5000);
  let client = { id: 'sample-client', name: 'Marca de ejemplo', slug: 'marca-original', isArchived: false, responsible: { id: 'sample-pm', name: 'PM de ejemplo' }, healthRecords: [{ score: 85 }], agencyContexts: [] };
  const requests = [];
  await page.route('**/api/**', async route => {
    const request = route.request(), url = new URL(request.url());
    if (request.method() === 'PATCH' && url.pathname === '/api/clients/sample-client') {
      requests.push(request.postDataJSON());
      if (save) return save(route, request.postDataJSON());
      client = { ...client, ...request.postDataJSON() };
      // PATCH returns scalar fields, unlike the list's included relations.
      return route.fulfill({ json: { id: client.id, name: client.name, slug: client.slug, isArchived: false } });
    }
    if (url.pathname === '/api/clients') return route.fulfill({ json: url.searchParams.get('isArchived') === 'true' ? [] : [client] });
    if (url.pathname === '/api/team') return route.fulfill({ json: [] });
    return route.fulfill({ status: 404, json: { error: 'Not available in isolated test' } });
  });
  await page.goto(`${preview.origin}/tests/fixtures/client-edit-preview.html`, { timeout: 30000 });
  const row = page.getByRole('row').filter({ hasText: 'Marca de ejemplo' });
  await row.waitFor();
  // El menú de la fila se ve sin pasar el ratón por encima (Rodny, 23 de septiembre de
  // 2026): escondido tras el hover había que adivinarlo, y en táctil no aparecía nunca.
  const menu = row.locator('button[aria-haspopup="menu"]');
  assert.equal(await menu.evaluate(button => getComputedStyle(button).opacity), '1', 'el menú de la fila tiene que verse sin hover');
  if (screenshot) {
    await page.evaluate(async () => {
      await Promise.all(document.getAnimations().filter(animation => animation.effect?.getTiming().iterations !== Infinity).map(animation => animation.finished.catch(() => {})));
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    });
    await page.screenshot({ path: 'output/client-edit/clients-list.png', animations: 'disabled' });
  }
  await menu.click();
  await page.getByRole('menuitem', { name: 'Editar Cliente', exact: true }).click();
  return { page, requests };
}

test('Editar Cliente opens the form, renames only the selected client and preserves its links and list metadata', async () => {
  const { page, requests } = await setup({ screenshot: true });
  try {
    const dialog = page.getByRole('dialog', { name: 'Editar cliente', exact: true });
    await dialog.waitFor();
    const field = dialog.getByRole('textbox', { name: 'Nombre del cliente', exact: true });
    assert.equal(await field.inputValue(), 'Marca de ejemplo');
    await field.fill('  Marca renovada  ');
    await dialog.screenshot({ path: 'output/client-edit/edit-desktop.png', animations: 'disabled' });
    await dialog.getByRole('button', { name: 'Guardar cambios' }).click();
    await dialog.waitFor({ state: 'hidden' });
    const row = page.getByRole('row').filter({ hasText: 'Marca renovada' });
    await row.waitFor();
    assert.deepEqual(requests, [{ name: 'Marca renovada' }]);
    assert.match(await row.innerText(), /PM de ejemplo/);
    assert.match(await row.innerText(), /85/);
    await page.reload();
    await page.getByRole('row').filter({ hasText: 'Marca renovada' }).waitFor();
  } finally { await page.close(); }
});

test('saving waits for API confirmation and blocks duplicate submissions', async () => {
  let finish, received;
  const requested = new Promise(resolve => { received = resolve; });
  const { page, requests } = await setup({ save: async route => {
    received();
    await new Promise(resolve => { finish = resolve; });
    await route.fulfill({ json: { id: 'sample-client', name: 'Nombre confirmado', slug: 'marca-original' } });
  } });
  try {
    const dialog = page.getByRole('dialog');
    await dialog.getByRole('textbox', { name: 'Nombre del cliente' }).fill('Nombre confirmado');
    await dialog.getByRole('button', { name: 'Guardar cambios' }).click();
    await requested;
    assert.equal(await dialog.isVisible(), true);
    assert.equal(await dialog.getByRole('button', { name: /Guardando/ }).isDisabled(), true);
    assert.equal(await page.getByRole('row', { includeHidden: true }).filter({ hasText: 'Marca de ejemplo' }).count(), 1);
    assert.equal(requests.length, 1);
    finish();
    await dialog.waitFor({ state: 'hidden' });
    await page.getByRole('row').filter({ hasText: 'Nombre confirmado' }).waitFor();
  } finally { finish?.(); await page.close(); }
});

test('a server rejection keeps the draft and displays the actual error', async () => {
  const { page } = await setup({ save: route => route.fulfill({ status: 403, json: { error: 'No tienes permiso para editar clientes.' } }) });
  try {
    const dialog = page.getByRole('dialog');
    const field = dialog.getByRole('textbox', { name: 'Nombre del cliente' });
    await field.fill('Borrador que no debe perderse');
    await dialog.getByRole('button', { name: 'Guardar cambios' }).click();
    await dialog.getByRole('alert').waitFor();
    assert.equal(await dialog.getByRole('alert').innerText(), 'No tienes permiso para editar clientes.');
    assert.equal(await field.inputValue(), 'Borrador que no debe perderse');
    assert.equal(await page.getByRole('row', { includeHidden: true }).filter({ hasText: 'Marca de ejemplo' }).count(), 1);
  } finally { await page.close(); }
});

test('blank names and cancellation do not write; the mobile dark dialog stays in the viewport', async () => {
  const { page, requests } = await setup({ mobile: true });
  try {
    const dialog = page.getByRole('dialog');
    await dialog.waitFor();
    await page.evaluate(() => document.documentElement.classList.add('dark'));
    const bounds = await dialog.boundingBox();
    assert.ok(bounds.x >= 0 && bounds.x + bounds.width <= 391);
    assert.ok(bounds.y >= 0 && bounds.y + bounds.height <= 845);
    await dialog.screenshot({ path: 'output/client-edit/edit-mobile-dark.png', animations: 'disabled' });
    await dialog.getByRole('textbox', { name: 'Nombre del cliente' }).fill('   ');
    assert.equal(await dialog.getByRole('button', { name: 'Guardar cambios' }).isDisabled(), true);
    await dialog.getByRole('button', { name: 'Cancelar' }).click();
    await dialog.waitFor({ state: 'hidden' });
    assert.equal(requests.length, 0);
  } finally { await page.close(); }
});

test('keyboard submission and Escape cancellation preserve the same edit flow', async () => {
  const { page, requests } = await setup();
  try {
    const dialog = page.getByRole('dialog');
    const field = dialog.getByRole('textbox', { name: 'Nombre del cliente' });
    await field.fill('Nombre desde teclado');
    await field.press('Enter');
    await dialog.waitFor({ state: 'hidden' });
    const options = page.getByRole('button', { name: 'Opciones de Nombre desde teclado' });
    await options.focus();
    await options.press('Enter');
    await page.getByRole('menuitem', { name: 'Editar Cliente', exact: true }).focus();
    await page.keyboard.press('Enter');
    await dialog.waitFor();
    assert.equal(await field.inputValue(), 'Nombre desde teclado');
    await field.press('Escape');
    await dialog.waitFor({ state: 'hidden' });
    assert.deepEqual(requests, [{ name: 'Nombre desde teclado' }]);
  } finally { await page.close(); }
});

test('slug can change independently, with a visible warning before saving', async () => {
  const { page, requests } = await setup();
  try {
    const dialog = page.getByRole('dialog');
    const slug = dialog.getByRole('textbox', { name: 'URL (slug)', exact: true });
    assert.equal(await slug.inputValue(), 'marca-original');
    const warning = dialog.getByText('Esto podría afectar otros enlaces.', { exact: true });
    assert.equal(await warning.count(), 0, 'opening the dialog must not show a warning');
    const name = dialog.getByRole('textbox', { name: 'Nombre del cliente' });
    await name.fill('Nombre temporal');
    assert.equal(await warning.count(), 0, 'editing only the name must not show a slug warning');
    await name.fill('Marca de ejemplo');
    await slug.focus();
    assert.equal(await warning.count(), 0, 'focus without a change must not show a warning');
    await slug.fill('marca-nueva');
    assert.equal(await warning.isVisible(), true);
    await slug.fill('marca-original');
    assert.equal(await warning.count(), 0, 'restoring the original slug clears the warning');
    assert.equal(await slug.evaluate(element => element.getAttribute('aria-describedby').split(/\s+/).every(id => !!document.getElementById(id))), true);
    await slug.fill('marca-nueva');
    assert.equal(await warning.isVisible(), true);
    const colors = await warning.evaluate(element => {
      const reference = document.createElement('span');
      reference.style.color = 'hsl(var(--destructive))';
      document.body.append(reference);
      const result = { actual: getComputedStyle(element).color, expected: getComputedStyle(reference).color };
      reference.remove();
      return result;
    });
    assert.equal(colors.actual, colors.expected, 'the warning must use the global destructive color in light mode');
    assert.equal(await dialog.getByRole('textbox', { name: 'Nombre del cliente' }).inputValue(), 'Marca de ejemplo');
    await dialog.screenshot({ path: 'output/client-edit/edit-slug.png', animations: 'disabled' });
    await dialog.getByRole('button', { name: 'Guardar cambios' }).click();
    await dialog.waitFor({ state: 'hidden' });
    assert.deepEqual(requests, [{ slug: 'marca-nueva' }]);
    await page.reload();
    await page.getByRole('row').filter({ hasText: 'Marca de ejemplo' }).locator('button[aria-haspopup="menu"]').click();
    await page.getByRole('menuitem', { name: 'Editar Cliente', exact: true }).click();
    assert.equal(await slug.inputValue(), 'marca-nueva');
  } finally { await page.close(); }
});

test('changing both fields is explicit and a duplicate slug keeps both drafts', async () => {
  const { page, requests } = await setup({ save: route => route.fulfill({ status: 409, json: { error: 'Ese slug ya está en uso. Elige otro.' } }) });
  try {
    const dialog = page.getByRole('dialog');
    const name = dialog.getByRole('textbox', { name: 'Nombre del cliente' });
    const slug = dialog.getByRole('textbox', { name: 'URL (slug)' });
    await name.fill('Nombre nuevo');
    assert.equal(await slug.inputValue(), 'marca-original', 'changing the name must never auto-generate a new slug');
    await slug.fill('ya-usado');
    await dialog.getByRole('button', { name: 'Guardar cambios' }).click();
    await dialog.getByRole('alert').waitFor();
    assert.deepEqual(requests, [{ name: 'Nombre nuevo', slug: 'ya-usado' }]);
    assert.equal(await name.inputValue(), 'Nombre nuevo');
    assert.equal(await slug.inputValue(), 'ya-usado');
    assert.equal(await dialog.getByRole('alert').innerText(), 'Ese slug ya está en uso. Elige otro.');
  } finally { await page.close(); }
});

test('blank or malformed slugs cannot be submitted', async () => {
  const { page, requests } = await setup();
  try {
    const dialog = page.getByRole('dialog');
    const slug = dialog.getByRole('textbox', { name: 'URL (slug)' });
    for (const value of ['', '   ', 'marca/nueva', 'con espacios', 'https://ejemplo.com', 'MAYUSCULA']) {
      await slug.fill(value);
      assert.equal(await dialog.getByRole('button', { name: 'Guardar cambios' }).isDisabled(), true, value);
    }
    assert.equal(requests.length, 0);
  } finally { await page.close(); }
});

// La ficha guarda el nombre legal y el documento del tercero para no repetirlos en
// cada cuenta de cobro (Rodny, 22 de septiembre de 2026).
test('the client record holds the legal name and document a cuenta de cobro prints', async () => {
  const { page, requests } = await setup();
  try {
    const dialog = page.getByRole('dialog', { name: 'Editar cliente', exact: true });
    await dialog.waitFor();
    const legalName = dialog.getByRole('textbox', { name: 'Nombre completo o razón social' });
    const number = dialog.getByRole('textbox', { name: 'Número', exact: true });
    const save = dialog.getByRole('button', { name: 'Guardar cambios' });

    // Los tres van juntos: con uno o dos no se puede guardar, y se explica.
    await legalName.fill('CORPORACIÓN DEPORTIVA LOS TITANES');
    assert.equal(await save.isDisabled(), true, 'media identidad no se guarda');
    await dialog.getByRole('alert').filter({ hasText: /Los tres datos van juntos/ }).waitFor();

    await chooseOption(dialog.getByRole('combobox', { name: 'Tipo de documento' }), 'NIT');
    await number.fill('901378858');
    assert.equal(await save.isDisabled(), false);
    await dialog.screenshot({ path: 'output/client-edit/identidad-tercero.png', animations: 'disabled' });
    await save.click();
    await dialog.waitFor({ state: 'hidden' });

    assert.deepEqual(requests, [{
      legalName: 'CORPORACIÓN DEPORTIVA LOS TITANES', documentType: 'NIT', documentNumber: '901378858'
    }], 'solo viajan los campos que se tocaron');
  } finally { await page.close(); }
});
