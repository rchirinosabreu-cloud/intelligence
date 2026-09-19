import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright-core';
import { createCrmPreview } from '../../scripts/preview-crm.js';

// Real screens over the real router/service with an in-memory store. Screenshots land in output/crm.
let preview, browser;
test.before(async () => {
  preview = await createCrmPreview({ port: 0 });
  browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
  await mkdir('output/crm', { recursive: true });
});
test.after(async () => { await browser?.close(); await preview?.close(); });

const open = async (variant, path) => {
  const page = await browser.newPage({ viewport: { width: variant.width, height: variant.height }, isMobile: !!variant.mobile, hasTouch: !!variant.mobile });
  page.setDefaultTimeout(8000);
  page.setDefaultNavigationTimeout(60000);
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(`${preview.origin}${path}${variant.dark ? (path.includes('?') ? '&dark' : '?dark') : ''}`);
  return { page, errors };
};

for (const variant of [
  { name: 'desktop-light', width: 1440, height: 1000 },
  { name: 'desktop-dark', width: 1440, height: 1000, dark: true },
  { name: 'mobile-light', width: 390, height: 844, mobile: true }
]) {
  test(`${variant.name}: dashboard, list and follow-ups render the demo pipeline without overflow`, async () => {
    const { page, errors } = await open(variant, '/crm');
    try {
      await page.getByText('Total de leads').waitFor();
      await page.getByText('Prioridades inmediatas').waitFor();
      assert.match(await page.locator('main').innerText(), /16/);
      await page.screenshot({ path: `output/crm/${variant.name}-dashboard.png`, fullPage: true });

      await page.goto(`${preview.origin}/crm?tab=oportunidades${variant.dark ? '&dark' : ''}`);
      await page.getByText('Calzado Andino').locator('visible=true').first().waitFor();
      assert.match(await page.locator('main').innerText(), /16 oportunidades/);
      await page.screenshot({ path: `output/crm/${variant.name}-oportunidades.png`, fullPage: true });

      await page.goto(`${preview.origin}/crm?tab=seguimientos${variant.dark ? '&dark' : ''}`);
      await page.getByRole('heading', { name: /Vencidos/ }).first().waitFor();
      await page.screenshot({ path: `output/crm/${variant.name}-seguimientos.png`, fullPage: true });

      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, 'no horizontal page scroll');
      assert.deepEqual(errors, []);
    } finally { await page.close(); }
  });
}

test('desktop: logging a client answer updates the timeline, the next step and the traffic light', async () => {
  const { page, errors } = await open({ width: 1440, height: 1100 }, '/crm/oportunidades/lead-jaraba');
  try {
    await page.getByRole('heading', { name: 'Jaraba Ingeniería' }).waitFor();
    assert.match(await page.locator('main').innerText(), /Rojo/);
    // The one calendar of the platform: react-datepicker with the brain skin and the hour column.
    await page.getByLabel('Fecha y hora').click();
    await page.locator('.brain-datepicker [data-brain-time-column]').waitFor();
    assert.equal(await page.locator('.brain-datepicker .react-datepicker__current-month').innerText(), 'septiembre 2026');
    await page.screenshot({ path: 'output/crm/desktop-light-calendario.png' });
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('input[type="date"], input[type="datetime-local"]').count(), 0, 'no native date fields anywhere on the sheet');
    await page.getByRole('combobox', { name: 'Tipo de gestión' }).click();
    await page.getByRole('option', { name: 'Respuesta del cliente' }).click();
    await page.getByPlaceholder('Ej. Llamé a Catalina, revisamos el alcance del RFP.').fill('Víctor devolvió la llamada.');
    await page.getByPlaceholder('Ej. Enviará el RFP esta semana.').fill('Aprueba el alcance y pide dos cuotas.');
    await page.getByPlaceholder('Qué toca hacer después').fill('Enviar propuesta ajustada.');
    await page.getByLabel('Próximo seguimiento').fill('22/09/2026');
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'Registrar gestión' }).click();
    await page.getByText('Gestión registrada').waitFor();
    await page.locator('[data-crm-timeline]').getByText('Víctor devolvió la llamada.').waitFor();
    const text = await page.locator('main').innerText();
    assert.match(text, /Enviar propuesta ajustada\./);
    assert.match(text, /Bitácora · 3 registros/);
    assert.match(text, /Verde/);
    await page.screenshot({ path: 'output/crm/desktop-light-ficha.png', fullPage: true });
    assert.deepEqual(errors, []);
  } finally { await page.close(); }
});

test('desktop: the form link is one click away and a form-born lead shows the client request', async () => {
  const { page, errors } = await open({ width: 1440, height: 1100 }, '/crm?tab=oportunidades');
  try {
    const copy = page.getByRole('button', { name: 'Copiar enlace del formulario' });
    await copy.waitFor();
    assert.equal(await copy.getAttribute('title'), `${preview.origin}/solicitud`);
    await page.getByText('Formulario', { exact: true }).first().waitFor();
    await page.goto(`${preview.origin}/crm/oportunidades/lead-solicitud`);
    await page.locator('[data-crm-request]').waitFor();
    const text = await page.locator('[data-crm-request]').innerText();
    assert.match(text, /Solicitud del cliente/);
    assert.match(text, /Abrir la segunda sede/);
    assert.match(text, /Landing page/);
    assert.match(text, /Integración de WhatsApp en sitio web/);
    await page.getByRole('button', { name: /Ver todas las respuestas/ }).click();
    assert.match(await page.locator('[data-crm-request]').innerText(), /AMC Start/);
    await page.screenshot({ path: 'output/crm/desktop-light-solicitud.png', fullPage: true });
    assert.deepEqual(errors, []);
  } finally { await page.close(); }
});

test('desktop: losing a lead asks for the reason and records the stage change', async () => {
  const { page, errors } = await open({ width: 1440, height: 1100 }, '/crm/oportunidades/lead-visit');
  try {
    await page.getByRole('heading', { name: 'Visit Milwaukee' }).waitFor();
    await page.getByRole('combobox', { name: 'Etapa comercial' }).click();
    await page.getByRole('option', { name: 'Perdido' }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByText('Cerrar como perdida').first().waitFor();
    await dialog.getByPlaceholder('Ej. Eligieron otra agencia por precio.').fill('No respondieron a la convocatoria.');
    await dialog.getByRole('button', { name: 'Cerrar como perdida' }).click();
    await page.getByText('Oportunidad cerrada como perdida').waitFor();
    await page.locator('[data-crm-timeline]').getByText('No respondieron a la convocatoria.').waitFor();
    assert.match(await page.locator('main').innerText(), /Motivo de pérdida/);
    assert.deepEqual(errors, []);
  } finally { await page.close(); }
});
