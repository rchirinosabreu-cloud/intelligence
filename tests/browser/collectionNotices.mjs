import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright-core';
import { createCrmPreview } from '../../scripts/preview-crm.js';

// Avisos de cartera en la banda (punto 7 de la solicitud de Elisa, 28 de octubre de 2026), sobre la muestra del CRM con
// el servicio real en memoria: la cartera vencida de un cliente de fee mensual sale en salmón con sus cifras; «Ya le
// escribí» deja la gestión de cobro y el aviso del servicio puntual, en verde, llega cinco minutos después.
const OUT = 'output/avisos-de-cartera';
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

test('la cartera vencida sale con sus cifras y sus botones; «Ya le escribí» la cierra', async () => {
  const preview = await createCrmPreview({ port: 0, cartera: true });
  const { page, errors } = await open(preview);
  try {
    await band(page).waitFor();
    assert.equal(await band(page).getAttribute('data-level'), 'IMPORTANTE');
    assert.match(await band(page).innerText(), /Muebles Nuva tiene 2 mensualidades vencidas desde agosto: \$3\.200\.000 pendientes/);
    const labels = (await band(page).locator('[data-notice-action]').allInnerTexts()).map((label) => label.trim());
    assert.deepEqual(labels, ['Ya le escribí', 'Registrar pago', 'Recordarme']);
    await settled(page);
    await page.screenshot({ path: `${OUT}/1-cartera-claro.png` });

    await band(page).locator('[data-notice-action="follow-up"]').click();
    assert.match(await band(page).innerText(), /¿Cómo le escribiste\?/);
    await page.screenshot({ path: `${OUT}/2-como-le-escribiste.png` });
    await band(page).locator('[data-notice-channel="WHATSAPP"]').click();
    await page.getByText('Gestión de cobro registrada').waitFor();
    await band(page).waitFor({ state: 'detached' });

    // El servicio puntual llega cinco minutos después de decidir, en verde.
    await page.request.post(`${preview.origin}/api/__preview/clock?minutes=6`);
    await page.evaluate(() => window.dispatchEvent(new Event('focus')));
    await band(page).waitFor({ timeout: 70000 });
    assert.equal(await band(page).getAttribute('data-level'), 'SEGUIMIENTO');
    assert.match(await band(page).innerText(), /Fundación Grit lleva 22 días vencida la cuenta de cobro No\. 0395/);
    await settled(page);
    await page.screenshot({ path: `${OUT}/3-servicio-puntual.png` });
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
    await dark.page.screenshot({ path: `${OUT}/4-cartera-oscuro.png` });
    await band(phone.page).waitFor();
    await settled(phone.page);
    assert.equal(await phone.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await phone.page.screenshot({ path: `${OUT}/5-cartera-celular.png` });
  } finally {
    await dark.page.close();
    await phone.page.close();
    await preview.close();
  }
});
