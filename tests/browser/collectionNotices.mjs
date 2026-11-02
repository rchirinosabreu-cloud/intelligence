import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright-core';
import { createCrmPreview } from '../../scripts/preview-crm.js';

// Avisos de cartera en la banda (punto 7 de la solicitud de Elisa, 28 de octubre de 2026), sobre la muestra del CRM con
// el servicio real en memoria. Recorrido completo, en pantallas enteras (Rodny: «muéstrame las pantallas completas del
// recorrido»): la cartera vencida en salmón, «Ya le escribí», el aviso del servicio puntual cinco minutos después y
// «Recordarme». Capturas numeradas en output/recorrido-cartera.
const OUT = 'output/recorrido-cartera';
let browser;
test.before(async () => {
  browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
  await mkdir(OUT, { recursive: true });
});
test.after(async () => { await browser?.close(); });

const open = async (preview, { width = 1440, height = 900, dark = false, mobile = false } = {}) => {
  const page = await browser.newPage({ viewport: { width, height }, isMobile: mobile, hasTouch: mobile });
  page.setDefaultTimeout(10000);
  page.setDefaultNavigationTimeout(60000);
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(`${preview.origin}/crm?tab=oportunidades${dark ? '&dark' : ''}`);
  await page.getByText('Calzado Andino').locator('visible=true').first().waitFor();
  return { page, errors };
};
const band = (page) => page.locator('[data-important-notice]');
const settled = (page) => page.waitForTimeout(500);
const shot = (page, name) => page.screenshot({ path: `${OUT}/${name}.png` });

test('el recorrido de la banda: escribirle al cliente, el siguiente aviso y «Recordarme»', async () => {
  const preview = await createCrmPreview({ port: 0, cartera: true });
  const { page, errors } = await open(preview);
  try {
    await band(page).waitFor();
    assert.equal(await band(page).getAttribute('data-level'), 'IMPORTANTE');
    assert.match(await band(page).innerText(), /Muebles Nuva tiene 2 mensualidades vencidas desde agosto: \$3\.200\.000 pendientes/);
    const labels = (await band(page).locator('[data-notice-action]').allInnerTexts()).map((label) => label.trim());
    assert.deepEqual(labels, ['Ya le escribí', 'Registrar pago', 'Recordarme']);
    await settled(page);
    await shot(page, '01-banda-cartera-vencida');

    await band(page).locator('[data-notice-action="follow-up"]').click();
    assert.match(await band(page).innerText(), /¿Cómo le escribiste\?/);
    assert.deepEqual((await band(page).locator('[data-notice-channel]').allInnerTexts()).map((t) => t.trim()), ['WhatsApp', 'Llamada', 'Correo', 'Reunión', 'El cliente respondió']);
    await shot(page, '02-como-le-escribiste');
    await band(page).locator('[data-notice-channel="WHATSAPP"]').click();
    await page.getByText('Gestión de cobro registrada').waitFor();
    await band(page).waitFor({ state: 'detached' });
    await shot(page, '03-gestion-registrada');

    // El servicio puntual llega cinco minutos después de decidir, en verde.
    await page.request.post(`${preview.origin}/api/__preview/clock?minutes=6`);
    await page.evaluate(() => window.dispatchEvent(new Event('focus')));
    await band(page).waitFor({ timeout: 70000 });
    assert.equal(await band(page).getAttribute('data-level'), 'SEGUIMIENTO');
    assert.match(await band(page).innerText(), /Fundación Grit lleva 22 días vencida la cuenta de cobro No\. 0395/);
    await settled(page);
    await shot(page, '04-banda-servicio-puntual');

    await band(page).locator('[data-notice-action="snooze"]').click();
    assert.deepEqual((await band(page).locator('[data-notice-snooze]').allInnerTexts()).map((t) => t.trim()), ['En 10 minutos', 'En 1 hora', 'Mañana a las 8:00']);
    await shot(page, '05-recordarme');
    await band(page).locator('[data-notice-snooze="tomorrow"]').click();
    await page.getByText('Te lo recuerdo mañana a las 8:00').waitFor();
    await band(page).waitFor({ state: 'detached' });
    await shot(page, '06-recordado-para-manana');
    assert.deepEqual(errors, []);
  } finally {
    await page.close();
    await preview.close();
  }
});

test('en oscuro y en el celular se lee entero', async () => {
  const preview = await createCrmPreview({ port: 0, cartera: true });
  const dark = await open(preview, { dark: true });
  const phone = await open(preview, { width: 390, height: 844, mobile: true });
  try {
    await band(dark.page).waitFor();
    await settled(dark.page);
    await shot(dark.page, '07-banda-oscuro');
    await band(phone.page).waitFor();
    await settled(phone.page);
    assert.equal(await phone.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await shot(phone.page, '08-banda-celular');
  } finally {
    await dark.page.close();
    await phone.page.close();
    await preview.close();
  }
});
