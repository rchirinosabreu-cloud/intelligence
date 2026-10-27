import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright-core';
import { createCrmPreview } from '../../scripts/preview-crm.js';

// Avisos importantes (Rodny, 26 de octubre de 2026), sobre la muestra del CRM con el servicio real en memoria: la
// revisión en salmón sale primero; «Ya hice seguimiento» registra la gestión en el CRM; el siguiente aviso, en verde,
// espera cinco minutos. Capturas en output/avisos-importantes.
const OUT = 'output/avisos-importantes';
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
// La banda entra con una animación corta: la captura se toma ya asentada.
const settled = (page) => page.waitForTimeout(500);

test('la revisión sale primero, se decide sin salir de la pantalla y el seguimiento llega cinco minutos después', async () => {
  const preview = await createCrmPreview({ port: 0 });
  const { page, errors } = await open(preview);
  try {
    await band(page).waitFor();
    assert.equal(await band(page).getAttribute('data-level'), 'IMPORTANTE');
    assert.match(await band(page).innerText(), /Centro Andino lleva 30 días sin responder: ¿sigue o se cierra\?/);
    const labels = await band(page).locator('[data-notice-action]').allInnerTexts();
    assert.deepEqual(labels.map((label) => label.trim()), ['Sigue: ya hice seguimiento', 'Cerrar como perdida', 'Abrir', 'Recordarme']);
    // Encima del menú lateral y de borde a borde; debajo de los diálogos.
    const box = await band(page).evaluate((node) => ({ z: getComputedStyle(node).zIndex, left: node.getBoundingClientRect().left, width: node.getBoundingClientRect().width }));
    assert.deepEqual(box, { z: '65', left: 0, width: 1440 });
    await settled(page);
    await page.screenshot({ path: `${OUT}/1-revision-claro.png` });

    await band(page).locator('[data-notice-action="snooze"]').click();
    assert.deepEqual((await band(page).locator('[data-notice-snooze]').allInnerTexts()).map((t) => t.trim()), ['En 10 minutos', 'En 1 hora', 'Mañana a las 8:00']);
    await page.screenshot({ path: `${OUT}/2-recordarme.png` });
    await page.keyboard.press('Escape');
    await band(page).locator('[data-notice-action="follow-up"]').waitFor();

    await band(page).locator('[data-notice-action="follow-up"]').click();
    await page.screenshot({ path: `${OUT}/3-como-hiciste-el-seguimiento.png` });
    // Tocar fuera devuelve a los botones sin cerrar el aviso.
    await page.mouse.click(700, 200);
    await band(page).locator('[data-notice-action="follow-up"]').waitFor();
    await band(page).locator('[data-notice-action="follow-up"]').click();
    await band(page).locator('[data-notice-channel="LLAMADA"]').click();
    await page.getByText('Seguimiento registrado en el CRM').waitFor();
    await band(page).waitFor({ state: 'detached' });

    // La gestión quedó en el CRM a nombre de quien la hizo.
    const lead = await page.evaluate(async () => (await fetch('/api/crm/leads/lead-centro')).json());
    assert.equal(lead.activities[0].type, 'LLAMADA');
    assert.equal(lead.activities[0].note, 'Registrado desde el aviso de seguimiento.');

    // Cinco minutos después, el verde.
    await page.evaluate(() => fetch('/api/__preview/clock?minutes=5', { method: 'POST' }));
    await page.reload();
    await band(page).waitFor();
    assert.equal(await band(page).getAttribute('data-level'), 'SEGUIMIENTO');
    assert.deepEqual((await band(page).locator('[data-notice-action]').allInnerTexts()).map((t) => t.trim()), ['Ya hice seguimiento', 'Abrir', 'Recordarme']);
    await page.getByText('Calzado Andino').locator('visible=true').first().waitFor();
    await settled(page);
    await page.screenshot({ path: `${OUT}/4-seguimiento-claro.png` });

    await band(page).locator('[data-notice-action="open"]').click();
    await page.waitForURL(/\/crm\/oportunidades\/lead-calzado/);
    await band(page).waitFor();
    await band(page).locator('[data-notice-action="snooze"]').click();
    await band(page).locator('[data-notice-snooze="1h"]').click();
    await page.getByText('Te lo recuerdo en 1 hora').waitFor();
    await band(page).waitFor({ state: 'detached' });
    assert.deepEqual(errors, []);
  } finally {
    await page.close();
    await preview.close();
  }
});

for (const variant of [{ name: 'oscuro', dark: true }, { name: 'celular', width: 390, height: 844, mobile: true }]) {
  test(`${variant.name}: la banda se lee y no se sale de la pantalla`, async () => {
    const preview = await createCrmPreview({ port: 0 });
    const { page, errors } = await open(preview, variant);
    try {
      await band(page).waitFor();
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      assert.ok(overflow <= 0, `sin desbordar a lo ancho (${overflow}px)`);
      await settled(page);
      await page.screenshot({ path: `${OUT}/5-revision-${variant.name}.png` });
      await band(page).locator('[data-notice-action="snooze"]').click();
      await band(page).locator('[data-notice-snooze="10m"]').click();
      await band(page).waitFor({ state: 'detached' });
      await page.evaluate(() => fetch('/api/__preview/clock?minutes=5', { method: 'POST' }));
      await page.reload();
      await band(page).waitFor();
      await page.getByText('Calzado Andino').locator('visible=true').first().waitFor();
      await settled(page);
      await page.screenshot({ path: `${OUT}/6-seguimiento-${variant.name}.png` });
      assert.deepEqual(errors, []);
    } finally {
      await page.close();
      await preview.close();
    }
  });
}
