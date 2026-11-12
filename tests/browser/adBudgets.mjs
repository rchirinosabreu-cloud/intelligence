import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright-core';

// Pautas (reunión del 6 de noviembre de 2026), sobre la muestra local: node scripts/preview-ad-budgets.js --port=3848. Las
// rutas y el servicio son los de verdad, sobre una base en memoria; el recorrido escribe en ella, así que corre una vez por
// arranque. Capturas en output/recorrido-pautas.
const BASE = process.env.AD_BUDGETS_URL || 'http://127.0.0.1:3848';
// La muestra se arranca con --hoy=2026-11-06 y el navegador vive en ese mismo día: el recorrido no depende de la fecha real.
const TODAY = process.env.AD_BUDGETS_TODAY || '2026-11-06';
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
  await page.clock.setFixedTime(new Date(`${TODAY}T15:00:00Z`));
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
  const sample = await row(page, 'b-muestra').innerText();
  assert.match(sample, /\$ 768\.000/);
  assert.match(sample, /Va atrasada/);
  assert.match(sample, /Cierra en 4 días/);
  assert.match(sample, /Termina el 18 nov, después del cierre del 10 nov/, 'una campaña que pasa el cierre se señala');
  assert.match(await row(page, 'b-summit').innerText(), /Debía terminar el 21 oct/);
  assert.match(await row(page, 'b-pueblito').innerText(), /Incluye \$ 240\.000 del ciclo anterior/, 'el saldo de octubre se suma a noviembre');
  assert.match(await row(page, 'b-wonder').innerText(), /USD 7 de USD 114/, 'cada marca lleva su moneda y su saldo');
  await page.locator('[data-ad-filter="cierran"]').click();
  await page.waitForTimeout(200);
  assert.ok(await row(page, 'b-muestra').count());
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
  await dialog.getByRole('combobox', { name: 'Día de corte' }).click();
  await page.getByRole('option', { name: 'Del 19 al 18 del mes siguiente' }).click();
  await dialog.locator('button[type=submit]').click();
  await dialog.waitFor({ state: 'detached' });
  const created = page.locator('[data-ad-client="martinez"]');
  await created.waitFor();
  assert.match(await created.innerText(), /\$ 0 de \$ 200\.000/);
  assert.match(await created.innerText(), /Ciclo del 19 oct al 18 nov/, 'el corte propio manda');
  await page.locator('[data-ad-client="martinez"] [data-ad-edit]').waitFor({ state: 'detached' });
  await page.goto(`${BASE}/pautas`);
  await page.locator('[data-ad-client="martinez"]').waitFor();
  await created.locator('[data-ad-toggle]').click();
  await created.locator('[data-ad-detail]').waitFor();
  assert.doesNotMatch(await created.locator('[data-ad-detail]').innerText(), /no tiene contrato cargado/, 'con corte propio no hace falta el aviso');
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
  const { page, errors } = await open('?pauta=b-muestra');
  const sample = row(page, 'b-muestra');
  const detail = sample.locator('[data-ad-detail]');
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
  await page.waitForFunction(() => document.querySelector('[data-ad-budget="b-muestra"]').innerText.includes('$ 700.000 de'));
  await detail.locator('[data-ad-changes]').waitFor();
  assert.match(await detail.locator('[data-ad-changes]').innerText(), /de \$ 768\.000 a \$ 700\.000/);

  // Eliminarla deshace: vuelve la lectura anterior.
  await detail.locator('[data-ad-reading="r2"] [data-ad-reading-delete]').click();
  await page.getByRole('button', { name: 'Eliminar', exact: true }).click();
  await page.waitForFunction(() => document.querySelector('[data-ad-budget="b-muestra"]').innerText.includes('$ 512.000 de'));

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
  // Cambiar lo aprobado pide quién lo aprobó y por qué: sin eso no se guarda.
  await cycle.locator('[data-ad-approval]').waitFor();
  await cycle.locator('button[type=submit]').click();
  assert.equal(await cycle.getByLabel('Quién lo aprobó').evaluate((input) => input.validity.valueMissing), true, 'el formulario no se envía sin decir quién aprobó');
  assert.equal(await cycle.isVisible(), true);
  await page.waitForTimeout(150);
  await page.screenshot({ path: `${OUT}/16-aprobacion.png` });
  await cycle.getByLabel('Quién lo aprobó').fill('Gema, por WhatsApp');
  await cycle.getByLabel('Motivo').fill('Septiembre se amplió');
  await cycle.locator('button[type=submit]').click();
  await cycle.waitFor({ state: 'detached' });
  await detail.locator('[data-ad-changes]').getByText(/Aprobó: Gema, por WhatsApp\. Motivo: Septiembre se amplió/).waitFor();
  await page.waitForFunction(() => document.querySelector('[data-ad-history="2026-09"]').innerText.includes('$ 1.200.000'));

  // Un saldo ajustado vuelve a la cuenta automática.
  await detail.locator('[data-ad-carry-open]').click();
  const carry = page.locator('[data-ad-carry-dialog]');
  await carry.waitFor();
  assert.equal(await carry.locator('[data-ad-carry-clear]').count(), 0, 'sin ajuste no hay nada que deshacer');
  await carry.locator('[data-ad-carry-auto]').waitFor();
  await carry.getByPlaceholder('Ej.: el cliente pidió no acumular lo de octubre').fill('Prueba');
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
  await sample.waitFor({ state: 'detached' });
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

test('desde la ficha se edita la misma pauta del módulo', async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  await page.clock.setFixedTime(new Date(`${TODAY}T15:00:00Z`));
  await page.goto(`${BASE}/cliente`, { timeout: 90000, waitUntil: 'domcontentloaded' });
  const block = page.locator('[data-client-ad-budgets]');
  await block.waitFor({ timeout: 60000 });
  await block.locator('[data-client-ad-budget="b-foobe"]').waitFor();
  assert.match(await block.innerText(), /cierra el 30 nov/);
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${OUT}/10-cliente.png` });

  await block.locator('[data-client-ad-budget="b-foobe"] [data-client-ad-edit]').click();
  const dialog = page.locator('[data-ad-budget-dialog]');
  await dialog.waitFor();
  const amount = dialog.getByLabel('Presupuesto', { exact: true });
  await amount.fill('');
  await amount.pressSequentially('150');
  await dialog.getByLabel('Quién lo aprobó').fill('Lina, por correo');
  await dialog.getByLabel('Motivo').fill('Aprobó USD 150 para noviembre');
  await dialog.locator('button[type=submit]').click();
  await dialog.waitFor({ state: 'detached' });
  await page.waitForFunction(() => document.querySelector('[data-client-ad-budget="b-foobe"]').innerText.includes('USD 246,47'));

  await page.goto(`${BASE}/pautas`, { waitUntil: 'domcontentloaded' });
  await row(page, 'b-foobe').waitFor({ timeout: 60000 });
  assert.match(await row(page, 'b-foobe').innerText(), /USD 246,47/, 'el módulo dice lo mismo que la ficha');
  await page.close();
});

test('la pauta va en la ficha operativa, junto al alcance del contrato', async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1400 } });
  await page.clock.setFixedTime(new Date(`${TODAY}T15:00:00Z`));
  await page.goto(`${BASE}/operacion`, { timeout: 90000, waitUntil: 'domcontentloaded' });
  const block = page.locator('#client-operation-profile [data-client-ad-budgets]');
  await block.waitFor({ timeout: 60000 });
  await block.locator('[data-client-ad-budget="b-foobe"]').waitFor();
  const overflow = await block.evaluate((node) => node.scrollWidth - node.clientWidth);
  assert.ok(overflow <= 0, 'cabe en la columna de la ficha');
  await block.scrollIntoViewIfNeeded();
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${OUT}/12-alcance.png` });
  await page.close();
});

test('dentro de la ficha operativa se añade una pauta sin enviar la ficha', async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  await page.clock.setFixedTime(new Date(`${TODAY}T15:00:00Z`));
  await page.goto(`${BASE}/ficha`, { timeout: 90000, waitUntil: 'domcontentloaded' });
  const block = page.locator('[data-client-ad-budgets]');
  await block.waitFor({ timeout: 60000 });
  await block.scrollIntoViewIfNeeded();
  assert.equal(await block.getByRole('link', { name: 'Abrir Pautas' }).count(), 0, 'dentro de la ficha no se navega fuera');
  await block.locator('[data-client-ad-new]').click();
  const dialog = page.locator('[data-ad-budget-dialog]');
  await dialog.waitFor();
  await page.waitForTimeout(250);
  await page.screenshot({ path: `${OUT}/11-pauta-en-ficha.png` });
  assert.match(await dialog.getByRole('combobox', { name: 'Cliente' }).innerText(), /Martínez/, 'el cliente ya viene elegido');
  await dialog.getByPlaceholder('Ej.: Wine Summit').fill('Desde la ficha');
  await dialog.getByLabel('Presupuesto', { exact: true }).pressSequentially('250000');
  await dialog.locator('button[type=submit]').click();
  await dialog.waitFor({ state: 'detached' });
  await block.getByText('Desde la ficha').waitFor();
  assert.equal(await page.evaluate(() => window.__fichaGuardada || 0), 0, 'guardar la pauta no guarda la ficha');
  await page.close();
});

test('Meta: la lectura encuentra las campañas y ligarlas pone el gasto de Meta en la pauta', async () => {
  const { page, errors } = await open();
  const status = page.locator('[data-ad-meta-status]');
  assert.match(await status.innerText(), /todavía no se ha leído/);
  await status.locator('[data-ad-meta-sync]').click();
  await status.getByText(/leído hoy/).waitFor();
  assert.match(await status.locator('[data-ad-meta-unassigned]').innerText(), /11 campañas gastan sin pauta/);

  await row(page, 'b-hoff').locator('[data-ad-toggle]').click();
  await row(page, 'b-hoff').locator('[data-ad-meta-link]').click();
  const dialog = page.locator('[data-ad-meta-dialog]');
  await dialog.locator('[data-ad-meta-option="120100"]').waitFor();
  await dialog.locator('[data-ad-meta-proposed]').waitFor();
  assert.equal(await dialog.locator('[data-ad-meta-option="120100"] input').isChecked(), true, 'propone las que llevan el nombre del cliente');
  assert.equal(await dialog.locator('[data-ad-meta-option="120101"] input').isChecked(), true);
  assert.equal(await dialog.locator('[data-ad-meta-option="120102"] input').isChecked(), false, 'no la de otro cliente de la misma cuenta');
  assert.equal(await dialog.locator('[data-ad-meta-option="120500"] input').isDisabled(), true, 'una campaña en dólares no entra en una pauta en pesos');
  await page.waitForTimeout(200);
  await page.screenshot({ path: `${OUT}/08-ligar-meta.png` });
  await dialog.locator('button[type=submit]').click();
  await dialog.waitFor({ state: 'detached' });

  const hoff = row(page, 'b-hoff');
  await hoff.getByText(/Según Meta, actualizado hoy/).waitFor();
  assert.match(await hoff.innerText(), /\$ 52\.800/, 'seis días de las dos campañas');
  assert.match(await hoff.locator('[data-ad-meta-section]').innerText(), /PABLO HOFF-\s+NUEVA SEDE\s+Francisco Villa\s+\$ 12\.000/);
  await hoff.locator('[data-ad-history]').first().getByText(/· Meta/).waitFor();
  assert.match(await status.locator('[data-ad-meta-unassigned]').innerText(), /9 campañas/);
  // Lo configurado en Meta (6.800 y 2.000 diarios hasta el 28) haría pasarse los 200.000 aprobados: la fila lo dice.
  assert.match(await hoff.locator('[data-ad-meta-excess]').innerText(), /Con lo configurado en Meta gastaría unos \$ 255\.200 de \$ 200\.000 hasta el 28 nov/);
  await hoff.scrollIntoViewIfNeeded();
  await page.waitForTimeout(200);
  await shot(page, '09-gasto-de-meta');
  assert.deepEqual(errors, []);
  await page.close();
});

test('Meta: con la pauta ligada manda Meta; lo escrito a mano antes queda en el historial y ya no se escribe otra cifra', async () => {
  const { page, errors } = await open();
  const bonsai = row(page, 'b-bonsai');
  await bonsai.locator('[data-ad-spend-open]').click();
  const spend = page.locator('[data-ad-spend-dialog]');
  await spend.getByLabel('Gastado en el ciclo', { exact: true }).fill('700000');
  await spend.locator('button[type=submit]').click();
  await spend.waitFor({ state: 'detached' });

  await bonsai.locator('[data-ad-toggle]').click();
  await bonsai.locator('[data-ad-meta-link]').click();
  const dialog = page.locator('[data-ad-meta-dialog]');
  await dialog.locator('[data-ad-meta-option="120200"]').waitFor();
  assert.equal(await dialog.locator('[data-ad-meta-option="120200"] input').isChecked(), true, 'la cuenta se llama como el cliente');
  await dialog.locator('button[type=submit]').click();
  await dialog.waitFor({ state: 'detached' });

  await bonsai.getByText(/\$ 509\.200/).first().waitFor();
  assert.equal(await bonsai.locator('[data-ad-spend-open]').count(), 0, 'el gasto ya no se escribe a mano');
  assert.equal(await bonsai.locator('[data-ad-meta-difference]').count(), 0);
  await bonsai.locator('[data-ad-history]').first().getByText(/\$ 700\.000/).waitFor();
  assert.equal(await bonsai.locator('[data-ad-campaign-add]').count(), 0, 'las campañas vienen de Meta');
  await bonsai.scrollIntoViewIfNeeded();
  await page.waitForTimeout(200);
  await shot(page, '10-manda-meta');
  assert.deepEqual(errors, []);
  await page.close();
});
test('Meta: lo que gasta sin pauta se liga a la suya o se marca como que no es de ninguna', async () => {
  const { page, errors } = await open();
  await page.locator('[data-ad-meta-unassigned]').click();
  const dialog = page.locator('[data-ad-meta-unassigned-dialog]');
  await dialog.locator('[data-ad-meta-unassigned-row="120104"]').waitFor();
  await page.waitForTimeout(200);
  await page.screenshot({ path: `${OUT}/11-sin-pauta.png` });
  await dialog.locator('[data-ad-meta-unassigned-row="120104"] [data-ad-meta-ignore]').click();
  await dialog.locator('[data-ad-meta-unassigned-row="120104"]').waitFor({ state: 'detached' });
  const pueblito = dialog.locator('[data-ad-meta-unassigned-row="120102"]');
  assert.match(await pueblito.getByRole('combobox').innerText(), /New Pueblito/, 'la única pauta con ese nombre viene elegida');
  assert.match(await dialog.locator('[data-ad-meta-unassigned-row="120103"]').getByRole('combobox').innerText(), /Elegir la pauta/, 'sin una pauta clara, nada viene elegido');
  await pueblito.locator('[data-ad-meta-assign]').click();
  await pueblito.waitFor({ state: 'detached' });
  await dialog.locator('button[type=submit]').click();
  await dialog.waitFor({ state: 'detached' });
  await row(page, 'b-pueblito').getByText(/Según Meta, actualizado hoy/).waitFor();
  assert.match(await page.locator('[data-ad-meta-unassigned]').innerText(), /6 campañas/);
  assert.deepEqual(errors, []);
  await page.close();
});

test('Meta: el presupuesto se ve; subirlo por encima de lo aprobado se frena y bajarlo cambia Meta', async () => {
  // Así llega el aviso de la banda: la ventana del presupuesto se abre sola.
  const { page, errors } = await open('?pauta=b-hoff&meta=presupuesto');
  const hoff = row(page, 'b-hoff');
  const dialog = page.locator('[data-ad-meta-budget-dialog]');
  await dialog.locator('[data-ad-meta-budget-row="120100"]').waitFor();
  assert.match(await dialog.locator('[data-ad-meta-budget-summary]').innerText(), /Quedan \$ 147\.200 del ciclo.*\$ 202\.400.*se pasaría/s);
  assert.match(await dialog.locator('[data-ad-meta-budget-row="120101-a"]').innerText(), /Conjunto «Sede Manga · públicos similares»[\s\S]*\$ 2\.000\s+diarios/);

  const campaign = dialog.locator('[data-ad-meta-budget-row="120100"]');
  await campaign.locator('[data-ad-meta-budget-edit]').click();
  const input = campaign.getByRole('textbox');
  await input.fill('9000');
  await campaign.locator('[data-ad-meta-budget-over]').waitFor();
  assert.match(await campaign.locator('[data-ad-meta-budget-over]').innerText(), /como máximo \$ 4\.617 diarios.*sube primero el presupuesto de la pauta/s);
  await page.waitForTimeout(200);
  await page.screenshot({ path: `${OUT}/13-presupuesto-meta-tope.png` });
  await dialog.locator('button[type=submit]').click();
  await dialog.getByRole('alert').waitFor();
  assert.match(await campaign.innerText(), /\$ 6\.800\s+diarios/, 'pasarse no llegó a Meta');

  await input.fill('4500');
  await campaign.locator('[data-ad-meta-budget-check]').waitFor();
  await dialog.locator('button[type=submit]').click();
  await page.getByText('Presupuesto cambiado en Meta').waitFor();
  await campaign.getByText(/\$ 4\.500\s+diarios/).waitFor();
  assert.match(await dialog.locator('[data-ad-meta-budget-summary]').innerText(), /\$ 149\.500/);
  await page.waitForTimeout(200);
  await page.screenshot({ path: `${OUT}/14-presupuesto-meta-cambiado.png` });
  await page.keyboard.press('Escape');
  await hoff.locator('[data-ad-changes]').getByText(/Presupuesto diario en Meta de «PABLO HOFF- MENSAJES INSCRIPCIONES»: de \$ 6\.800 a \$ 4\.500 · Keila/).waitFor();
  assert.equal(await hoff.locator('[data-ad-meta-excess]').count(), 0, 'bajarlo quita el aviso de «se pasaría»');
  assert.equal(new URL(page.url()).searchParams.get('meta'), null, 'el enlace no vuelve a abrir la ventana');
  assert.deepEqual(errors, []);
  await page.close();
});

test('ver no es editar: sin «Editar pautas» no hay botones para cambiar nada, y se dice cómo pedirlo', async () => {
  const toggle = (edit) => fetch(`${BASE}/api/__preview/permisos?editar=${edit ? 1 : 0}`, { method: 'POST' });
  await toggle(false);
  try {
    const { page, errors } = await open('?pauta=b-hoff');
    await page.locator('[data-ad-view-only]').waitFor();
    assert.equal(await page.locator('[data-ad-new], [data-ad-spend-open], [data-ad-edit], [data-ad-meta-link], [data-ad-reading-edit], [data-ad-campaign-add]').count(), 0);
    await row(page, 'b-hoff').locator('[data-ad-meta-budget-open]').click();
    const dialog = page.locator('[data-ad-meta-budget-dialog]');
    await dialog.locator('[data-ad-meta-budget-row="120100"]').waitFor();
    assert.equal(await dialog.locator('[data-ad-meta-budget-edit]').count(), 0, 've el presupuesto, no lo cambia');
    await page.waitForTimeout(200);
    await page.screenshot({ path: `${OUT}/15-solo-ver.png` });
    const refused = await page.evaluate(() => fetch('/api/ad-budgets/b-hoff/spend', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"spent":1}' }).then((r) => r.status));
    assert.equal(refused, 403, 'el servidor tampoco deja');
    assert.deepEqual(errors, []);
    await page.close();
  } finally {
    await toggle(true);
  }
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
