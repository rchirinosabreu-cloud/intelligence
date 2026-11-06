import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright-core';

// Pautas (reunión del 6 de noviembre de 2026), sobre la muestra local: node scripts/preview-ad-budgets.js --port=3848. Las
// rutas y el servicio son los de verdad, sobre una base en memoria; el recorrido escribe en ella, así que corre una vez por
// arranque. Capturas en output/recorrido-pautas.
const BASE = process.env.AD_BUDGETS_URL || 'http://127.0.0.1:3848';
const OUT = 'output/recorrido-pautas';
let browser;
test.before(async () => {
  browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
  await mkdir(OUT, { recursive: true });
});
test.after(async () => { await browser?.close(); });

const open = async (query = '', options = {}) => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, ...options });
  page.setDefaultTimeout(15000);
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(`${BASE}/pautas${query}`, { timeout: 90000, waitUntil: 'domcontentloaded' });
  await page.locator('[data-ad-budget]').first().waitFor({ timeout: 60000 });
  await page.waitForTimeout(500);
  return { page, errors };
};
const shot = (page, name) => page.screenshot({ path: `${OUT}/${name}.png`, fullPage: true });
const row = (page, id) => page.locator(`[data-ad-budget="${id}"]`);
const noHorizontalScroll = (page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);

test('el tablero dice qué hay que revisar, y los filtros lo acotan', async () => {
  const { page, errors } = await open();
  await shot(page, '01-tablero');
  const bonsai = await row(page, 'b-bonsai').innerText();
  assert.match(bonsai, /\$ 768\.000/);
  assert.match(bonsai, /Va atrasada/);
  assert.match(bonsai, /Cierra en 4 días/);
  assert.match(bonsai, /Termina el 18 nov, después del cierre del 10 nov/, 'Bonsai estaba hasta el 18 y cierra el 10');
  assert.match(await row(page, 'b-summit').innerText(), /Debía terminar el 21 oct/);
  assert.match(await row(page, 'b-pueblito').innerText(), /Incluye \$ 240\.000 del ciclo anterior/, 'el saldo de octubre se suma a noviembre');
  assert.match(await row(page, 'b-wonder').innerText(), /USD 7 de USD 114/, 'cada marca lleva su moneda y su saldo');
  await page.locator('[data-ad-filter="cierran"]').click();
  await page.waitForTimeout(200);
  assert.ok(await row(page, 'b-bonsai').count());
  assert.equal(await row(page, 'b-pueblito').count(), 0);
  await page.locator('[data-ad-filter="cierran"]').click();
  assert.deepEqual(errors, []);
  await page.close();
});

test('actualizar el gasto cambia la pauta solo cuando el servidor respondió', async () => {
  const { page, errors } = await open();
  await row(page, 'b-endova').locator('[data-ad-spend-open]').click();
  const dialog = page.locator('[data-ad-spend-dialog]');
  await dialog.waitFor();
  await page.waitForTimeout(250);
  assert.match(await dialog.innerText(), /del 15 oct al 14 nov/, 'dice las fechas del cierre del cliente');
  await shot(page, '02-actualizar-gasto');
  const amount = dialog.getByLabel('Gastado en el ciclo');
  await amount.fill('');
  await amount.pressSequentially('180000');
  assert.equal(await amount.inputValue(), '180.000', 'el campo de dinero pone los puntos');
  await dialog.locator('button[type=submit]').click();
  await dialog.waitFor({ state: 'detached' });
  await page.waitForFunction(() => document.querySelector('[data-ad-budget="b-endova"]').innerText.includes('$ 180.000'));
  assert.match(await row(page, 'b-endova').innerText(), /Actualizado hoy/);
  assert.deepEqual(errors, []);
  await page.close();
});

test('el formulario frena lo que falta y deja la pauta creada', async () => {
  const { page, errors } = await open();
  await page.locator('[data-ad-new]').click();
  const dialog = page.locator('[data-ad-budget-dialog]');
  await dialog.waitFor();
  await page.waitForTimeout(250);
  await shot(page, '03-nueva-pauta');
  await dialog.getByPlaceholder('Ej.: Wine Summit').fill('Prueba');
  await dialog.getByRole('combobox', { name: 'Cliente' }).click();
  await page.getByRole('option', { name: 'Martínez y Nájera' }).click();
  await dialog.getByLabel('Presupuesto', { exact: true }).pressSequentially('200000');
  await dialog.locator('button[type=submit]').click();
  await dialog.waitFor({ state: 'detached' });
  const created = page.locator('[data-ad-client="martinez"]');
  await created.waitFor();
  assert.match(await created.innerText(), /\$ 0 de \$ 200\.000/);
  await created.locator('[data-ad-toggle]').click();
  assert.match(await created.locator('[data-ad-detail]').innerText(), /no tiene contrato cargado/);
  assert.deepEqual(errors, []);
  await page.close();
});

test('una campaña se añade en su pauta y apagarla quita el aviso', async () => {
  const { page, errors } = await open('?pauta=b-summit');
  const summit = row(page, 'b-summit');
  await summit.locator('[data-ad-detail]').waitFor();
  await page.waitForTimeout(300);
  await shot(page, '04-detalle');
  await summit.locator('[data-ad-campaign="k3"] button[aria-label^="Editar"]').click();
  const dialog = page.locator('[data-ad-campaign-dialog]');
  await dialog.waitFor();
  await dialog.getByRole('combobox', { name: 'Estado de la campaña' }).click();
  await page.getByRole('option', { name: 'Finalizada' }).click();
  await dialog.locator('button[type=submit]').click();
  await dialog.waitFor({ state: 'detached' });
  await page.waitForFunction(() => !document.querySelector('[data-ad-budget="b-summit"]').innerText.includes('Debía terminar'));
  await summit.locator('[data-ad-campaign-add]').click();
  await dialog.waitFor();
  await dialog.getByPlaceholder('Ej.: Convocatorias de noviembre').fill('Seguidores de noviembre');
  await dialog.locator('button[type=submit]').click();
  await dialog.waitFor({ state: 'detached' });
  await summit.getByText('Seguidores de noviembre').waitFor();
  assert.deepEqual(errors, []);
  await page.close();
});

test('el gasto final de un ciclo anterior se pide y deja firme el saldo', async () => {
  const { page, errors } = await open();
  const hoff = row(page, 'b-hoff');
  assert.match(await hoff.innerText(), /Falta el gasto final de octubre/);
  await hoff.locator('[data-ad-close-open]').click();
  const dialog = page.locator('[data-ad-spend-dialog]');
  await dialog.waitFor();
  assert.match(await dialog.innerText(), /Gasto final de octubre/);
  await dialog.locator('button[type=submit]').click();
  await dialog.waitFor({ state: 'detached' });
  await page.waitForFunction(() => !document.querySelector('[data-ad-budget="b-hoff"]').innerText.includes('Falta el gasto final'));
  assert.deepEqual(errors, []);
  await page.close();
});

test('todo se corrige y se deshace: lectura, cierre, presupuesto, saldo, campaña y pauta', async () => {
  const { page, errors } = await open('?pauta=b-bonsai');
  const bonsai = row(page, 'b-bonsai');
  const detail = bonsai.locator('[data-ad-detail]');
  await detail.locator('[data-ad-reading="r2"]').waitFor();
  await page.waitForTimeout(300);
  await shot(page, '08-corregir');

  // Corregir una lectura mal escrita.
  await detail.locator('[data-ad-reading="r2"] [data-ad-reading-edit]').click();
  const spend = page.locator('[data-ad-spend-dialog]');
  await spend.waitFor();
  assert.match(await spend.innerText(), /Corregir lectura/);
  const amount = spend.getByLabel('Gastado en el ciclo');
  await amount.fill('');
  await amount.pressSequentially('700000');
  await spend.locator('button[type=submit]').click();
  await spend.waitFor({ state: 'detached' });
  await page.waitForFunction(() => document.querySelector('[data-ad-budget="b-bonsai"]').innerText.includes('$ 700.000 de'));
  await detail.locator('[data-ad-changes]').waitFor();
  assert.match(await detail.locator('[data-ad-changes]').innerText(), /de \$ 768\.000 a \$ 700\.000/);

  // Eliminarla deshace: vuelve la lectura anterior.
  await detail.locator('[data-ad-reading="r2"] [data-ad-reading-delete]').click();
  await page.getByRole('button', { name: 'Eliminar', exact: true }).click();
  await page.waitForFunction(() => document.querySelector('[data-ad-budget="b-bonsai"]').innerText.includes('$ 512.000 de'));

  // Reabrir un ciclo cerrado y corregir su presupuesto.
  const september = detail.locator('[data-ad-history="2026-09"]');
  await september.locator('[data-ad-cycle-reopen]').click();
  await page.getByRole('button', { name: 'Reabrir', exact: true }).click();
  await september.locator('[data-ad-cycle-reopen]').waitFor({ state: 'detached' });
  await september.locator('[data-ad-cycle-edit]').click();
  const cycle = page.locator('[data-ad-cycle-dialog]');
  await cycle.waitFor();
  const budget = cycle.getByLabel('Presupuesto del ciclo');
  await budget.fill('');
  await budget.pressSequentially('1200000');
  await cycle.locator('button[type=submit]').click();
  await cycle.waitFor({ state: 'detached' });
  await page.waitForFunction(() => document.querySelector('[data-ad-history="2026-09"]').innerText.includes('$ 1.200.000'));

  // Un saldo ajustado vuelve a la cuenta automática.
  await detail.locator('[data-ad-carry-open]').click();
  const carry = page.locator('[data-ad-carry-dialog]');
  await carry.waitFor();
  assert.equal(await carry.locator('[data-ad-carry-clear]').count(), 0, 'sin ajuste no hay nada que deshacer');
  await carry.getByPlaceholder('Ej.: saldo de octubre según Meta').fill('Prueba');
  await carry.locator('button[type=submit]').click();
  await carry.waitFor({ state: 'detached' });
  await page.waitForTimeout(300);
  await detail.locator('[data-ad-carry-open]').click();
  await carry.waitFor();
  await carry.locator('[data-ad-carry-clear]').click();
  await carry.waitFor({ state: 'detached' });

  // La campaña y la pauta creadas por error se eliminan.
  await detail.locator('[data-ad-campaign="k1"] button[aria-label^="Editar"]').click();
  const campaign = page.locator('[data-ad-campaign-dialog]');
  await campaign.waitFor();
  await campaign.locator('[data-ad-campaign-delete]').click();
  await page.getByRole('button', { name: 'Eliminar', exact: true }).click();
  await campaign.waitFor({ state: 'detached' });
  await detail.locator('[data-ad-campaign="k1"]').waitFor({ state: 'detached' });
  await detail.locator('[data-ad-edit]').click();
  const edit = page.locator('[data-ad-budget-dialog]');
  await edit.waitFor();
  await page.waitForTimeout(250);
  await shot(page, '09-editar-pauta');
  await edit.locator('[data-ad-delete]').click();
  await page.getByRole('button', { name: 'Eliminar', exact: true }).click();
  await edit.waitFor({ state: 'detached' });
  await bonsai.waitFor({ state: 'detached' });
  assert.deepEqual(errors, []);
  await page.close();
});

test('la banda lleva a la pauta y un error del servidor se dice sin cerrar el formulario', async () => {
  const { page, errors } = await open();
  await page.route('**/api/ad-budgets/b-multik/spend', (route) => route.fulfill({ status: 422, contentType: 'application/json', body: JSON.stringify({ error: 'La fecha de la lectura no puede ser futura.' }) }));
  await row(page, 'b-multik').locator('[data-ad-spend-open]').click();
  const dialog = page.locator('[data-ad-spend-dialog]');
  await dialog.waitFor();
  await dialog.locator('button[type=submit]').click();
  await dialog.getByRole('alert').waitFor();
  assert.match(await dialog.getByRole('alert').innerText(), /futura/);
  await page.keyboard.press('Escape');
  const band = page.locator('[data-important-notice]');
  await band.waitFor();
  assert.match(await band.innerText(), /Pauta/);
  await shot(page, '05-banda');
  assert.deepEqual(errors, []);
  await page.close();
});

test('la pauta se ve en la página del cliente', async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  await page.goto(`${BASE}/cliente`, { timeout: 90000, waitUntil: 'domcontentloaded' });
  const block = page.locator('[data-client-ad-budgets]');
  await block.waitFor({ timeout: 60000 });
  assert.match(await block.innerText(), /Wine & Wonder/);
  assert.match(await block.innerText(), /cierra el 30 nov/);
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${OUT}/10-cliente.png` });
  await page.close();
});

test('se ve bien en oscuro y en celular', async () => {
  const dark = await open('?dark');
  await dark.page.waitForTimeout(300);
  await shot(dark.page, '06-oscuro');
  assert.deepEqual(dark.errors, []);
  await dark.page.close();

  const phone = await open('', { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  await shot(phone.page, '07-celular');
  assert.equal(await noHorizontalScroll(phone.page), true, 'sin scroll horizontal en 390 px');
  assert.deepEqual(phone.errors, []);
  await phone.page.close();
});
