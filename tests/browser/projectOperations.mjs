import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright-core';
import { createProjectOperationsPreview } from '../../scripts/preview-project-operations.js';

let preview, browser;
test.before(async () => {
  preview = await createProjectOperationsPreview();
  browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
  await mkdir('output/proyectos-operativos', { recursive: true });
});
test.after(async () => { await browser?.close(); await preview?.close(); });

async function openPreview(variant = {}) {
  const page = await browser.newPage({ viewport: { width: variant.width || 1440, height: 1000 } });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/*', route => route.request().url().startsWith(preview.origin) ? route.continue() : route.abort());
  const query = new URLSearchParams();
  if (variant.dark) query.set('dark', '1');
  if (variant.ambiguous) query.set('ambiguous', '1');
  await page.goto(`${preview.origin}/clientes/operacion/aurora?${query}`, { timeout: 120000, waitUntil: 'domcontentloaded' });
  await page.locator('[data-preview-ready]').waitFor({ timeout: 60000 });
  assert.equal(await page.getByRole('heading', { name: 'Proyectos y servicios', exact: true }).count(), 1, 'la operación debe mostrar los proyectos del cliente');
  return { page, errors };
}

const card = (page, title) => page.locator('[data-project-id]').filter({ has: page.getByRole('heading', { name: title, exact: true }) });
async function editCatalog(page) {
  await card(page, 'Catálogo Aurora').getByRole('button', { name: 'Revisar ficha', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Ficha del proyecto', exact: true });
  await dialog.waitFor();
  return dialog;
}
const state = page => page.evaluate(() => window.__projectPreview.state());
const screenshot = async (page, name) => {
  await page.evaluate(async () => {
    await document.fonts.ready;
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  });
  await page.screenshot({ path: `output/proyectos-operativos/${name}.png`, fullPage: true, animations: 'disabled' });
};

test('monthly and one-off projects coexist; pending formalization cannot be reviewed', async () => {
  const { page, errors } = await openPreview();
  try {
    assert.equal(await page.getByRole('heading', { name: 'Contenidos mensuales Aurora', exact: true }).count(), 1);
    assert.equal(await page.getByRole('heading', { name: 'Catálogo Aurora', exact: true }).count(), 1);
    assert.equal(await page.getByText('COT-0101', { exact: true }).count(), 1);
    assert.equal(await page.getByText('COT-0102', { exact: true }).count(), 1);
    const pendingButton = card(page, 'Página Aurora').getByRole('button', { name: 'Revisar ficha', exact: true });
    assert.ok(await pendingButton.count() === 0 || await pendingButton.isDisabled(), 'la habilitación pendiente no ofrece una revisión ejecutable');
    assert.deepEqual((await state(page)).calls, []);
    assert.deepEqual(errors, []);
  } finally { await page.close(); }
});

test('approval and review timestamps display their Bogotá calendar day', async () => {
  const { page, errors } = await openPreview();
  try {
    assert.match(await card(page, 'Contenidos mensuales Aurora').innerText(), /Ficha revisada por Lucía Torres el 4 nov/, '02:00 UTC del día 5 sigue siendo el día 4 en Bogotá');
    const dialog = await editCatalog(page);
    await dialog.locator('summary').click();
    assert.match(await dialog.locator('details').innerText(), /Alcance aprobado · 2 nov/, 'la fecha de aprobación ISO también se presenta como día de Bogotá');
    assert.deepEqual(errors, []);
  } finally { await page.close(); }
});

test('an ambiguous approved scenario explains the restriction and allows saving only a draft', async () => {
  const { page, errors } = await openPreview({ ambiguous: true });
  try {
    const dialog = await editCatalog(page);
    assert.equal(await dialog.getByRole('button', { name: 'Guardar revisión', exact: true }).isDisabled(), true, 'no se puede revisar una alternativa comercial sin resolver');
    const reason = dialog.getByText('La propuesta no identifica un único escenario aprobado. Comercial debe aclararlo antes de revisar la ficha.', { exact: true });
    assert.equal(await reason.isVisible(), true, 'el motivo se muestra sin abrir el detalle de la propuesta');
    assert.equal(await dialog.getByRole('button', { name: 'Guardar borrador', exact: true }).isEnabled(), true);
    assert.equal(await dialog.getByRole('button', { name: 'Cargar versión actual', exact: true }).count(), 0, 'el origen ambiguo no se presenta como un conflicto de versiones');
    await dialog.getByLabel('Notas operativas', { exact: true }).fill('Información operativa pendiente de aclaración comercial.');
    await dialog.getByRole('button', { name: 'Guardar borrador', exact: true }).click();
    await dialog.waitFor({ state: 'hidden' });
    const after = await state(page);
    assert.equal(after.calls.length, 1);
    assert.equal(after.calls[0].input.review, false);
    assert.equal(after.projects.find(row => row.id === 'catalog').reviewStatus, 'PENDIENTE');
    assert.equal(after.projects.find(row => row.id === 'catalog').notes, 'Información operativa pendiente de aclaración comercial.');
    assert.deepEqual(errors, []);
  } finally { await page.close(); }
});

test('review sends the displayed revision and keeps the monthly service intact', async () => {
  const { page, errors } = await openPreview();
  try {
    const before = await state(page);
    const dialog = await editCatalog(page);
    await dialog.getByLabel('Nombre del proyecto', { exact: true }).fill('Catálogo de temporada Aurora');
    await dialog.getByLabel('Cantidad 1', { exact: true }).fill('3');
    await dialog.getByLabel('Unidad 1', { exact: true }).fill('diseños');
    await dialog.getByLabel('Jornadas de producción', { exact: true }).fill('1');
    await dialog.getByLabel('Horas de producción', { exact: true }).fill('4.5');
    await dialog.getByRole('combobox', { name: 'Informe incluido', exact: true }).click();
    await page.getByRole('option', { name: 'Sí', exact: true }).click();
    await dialog.getByLabel('Notas operativas', { exact: true }).fill('Entregar catálogo revisado al responsable del cliente.');
    await dialog.getByRole('button', { name: 'Guardar revisión', exact: true }).click();
    await dialog.waitFor({ state: 'hidden' });
    const after = await state(page);
    assert.equal(after.calls.length, 1);
    assert.equal(after.calls[0].id, 'catalog');
    assert.equal(after.calls[0].input.expectedRevision, 1);
    assert.equal(after.calls[0].input.review, true);
    assert.equal(after.calls[0].input.title, 'Catálogo de temporada Aurora');
    assert.equal(after.calls[0].input.deliverables[0].quantity, 3);
    assert.equal(after.calls[0].input.deliverables[0].unit, 'diseños');
    assert.equal(after.calls[0].input.productionDays, 1);
    assert.equal(after.calls[0].input.productionHours, 4.5);
    assert.equal(after.calls[0].input.reportRequired, true);
    assert.deepEqual(after.projects.find(row => row.id === 'monthly'), before.projects.find(row => row.id === 'monthly'));
    assert.deepEqual(after.legacyContract, before.legacyContract);
    assert.match(await page.getByRole('region', { name: 'Contrato mensual existente' }).innerText(), /Contrato mensual existente\s+4 reels por mes · Corte el día 5/);
    assert.deepEqual(errors, []);
  } finally { await page.close(); }
});

test('a failed save preserves the draft and permits an explicit retry', async () => {
  const { page, errors } = await openPreview();
  try {
    const dialog = await editCatalog(page);
    await dialog.getByLabel('Notas operativas', { exact: true }).fill('Nota que debe sobrevivir al error.');
    await page.evaluate(() => window.__projectPreview.failNext('error'));
    await dialog.getByRole('button', { name: 'Guardar borrador', exact: true }).click();
    await dialog.getByText('No se pudo guardar la ficha de prueba.', { exact: true }).waitFor();
    assert.equal(await dialog.getByLabel('Notas operativas', { exact: true }).inputValue(), 'Nota que debe sobrevivir al error.');
    assert.equal((await state(page)).projects.find(row => row.id === 'catalog').notes, '');
    await dialog.getByRole('button', { name: 'Cerrar', exact: true }).first().click();
    await editCatalog(page);
    assert.equal(await dialog.getByLabel('Notas operativas', { exact: true }).inputValue(), 'Nota que debe sobrevivir al error.', 'cerrar y abrir conserva el borrador que no llegó al servidor');
    await dialog.getByRole('button', { name: 'Guardar borrador', exact: true }).click();
    await dialog.waitFor({ state: 'hidden' });
    const after = await state(page);
    assert.equal(after.calls.length, 2);
    assert.equal(after.calls[1].input.expectedRevision, 1);
    assert.equal(after.calls[1].input.review, false);
    assert.equal(after.projects.find(row => row.id === 'catalog').notes, 'Nota que debe sobrevivir al error.');
    assert.deepEqual(errors, []);
  } finally { await page.close(); }
});

test('conflict retains local text and blocks resubmission until explicit reload', async () => {
  const { page, errors } = await openPreview();
  try {
    const dialog = await editCatalog(page);
    await dialog.getByLabel('Notas operativas', { exact: true }).fill('Corrección local por revisar');
    await page.evaluate(() => window.__projectPreview.failNext('conflict'));
    await dialog.getByRole('button', { name: 'Guardar revisión', exact: true }).click();
    await dialog.getByRole('button', { name: 'Cargar versión actual', exact: true }).waitFor();
    assert.equal(await dialog.getByLabel('Notas operativas', { exact: true }).inputValue(), 'Corrección local por revisar');
    assert.equal(await dialog.getByRole('button', { name: 'Guardar revisión', exact: true }).isDisabled(), true);
    assert.equal(await dialog.getByRole('button', { name: 'Guardar borrador', exact: true }).isDisabled(), true);
    assert.equal((await state(page)).calls.length, 1, 'ningún reenvío automático tras el conflicto');
    await dialog.getByRole('button', { name: 'Cargar versión actual', exact: true }).click();
    await page.waitForFunction(() => document.querySelector('textarea')?.value === 'Nota guardada por otra persona');
    assert.equal(await dialog.getByLabel('Notas operativas', { exact: true }).inputValue(), 'Nota guardada por otra persona');
    assert.equal((await state(page)).reloads, 1);
    assert.equal((await state(page)).calls.length, 1, 'recargar no guarda');
    await dialog.getByLabel('Notas operativas', { exact: true }).fill('Corrección comprobada sobre la nueva versión');
    await dialog.getByRole('button', { name: 'Guardar revisión', exact: true }).click();
    await dialog.waitFor({ state: 'hidden' });
    assert.equal((await state(page)).calls[1].input.expectedRevision, 2);
    assert.deepEqual(errors, []);
  } finally { await page.close(); }
});

for (const variant of [{ name: 'claro', width: 1440 }, { name: 'oscuro', width: 1440, dark: true }, { name: 'movil', width: 390 }]) {
  test(`${variant.name}: project cards and review remain usable without horizontal overflow`, async () => {
    const { page, errors } = await openPreview(variant);
    try {
      await screenshot(page, variant.name);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
      const dialog = await editCatalog(page);
      await dialog.getByLabel('Nombre del proyecto', { exact: true }).fill('Catálogo Aurora revisado');
      assert.equal(await dialog.getByLabel('Nombre del proyecto', { exact: true }).inputValue(), 'Catálogo Aurora revisado');
      await screenshot(page, `${variant.name}-revision`);
      const box = await dialog.boundingBox();
      assert.ok(box.x >= 0 && box.x + box.width <= variant.width + 1, 'el diálogo cabe en la pantalla');
      assert.deepEqual(errors, []);
    } finally { await page.close(); }
  });
}
