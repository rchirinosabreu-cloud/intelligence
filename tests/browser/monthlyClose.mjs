import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright-core';

// Informe y cierre del mes (punto 5 de la solicitud de Elisa, 29 de octubre de 2026), sobre la muestra de Operación de
// clientes (node scripts/preview-client-operations.js --port=3700, «hoy» es el 2 de octubre de 2026). Capturas en
// output/recorrido-cierre-mensual.
const BASE = process.env.CLIENT_OPERATIONS_URL || 'http://127.0.0.1:3700';
const OUT = 'output/recorrido-cierre-mensual';
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
  await page.goto(`${BASE}/clientes/operacion/titanes${query}`, { timeout: 90000, waitUntil: 'domcontentloaded' });
  await page.locator('[data-cycle-close]').waitFor({ timeout: 60000 });
  return { page, errors };
};
const shot = (page, name) => page.screenshot({ path: `${OUT}/${name}.png`, fullPage: true });

test('el informe pasa por sus estados y el cierre del mes se confirma sin borrar lo pendiente', async () => {
  const { page, errors } = await open();
  const cycle = page.locator('[data-cycle-close]');
  assert.match(await cycle.innerText(), /Informe del mes\s+Pendiente/);
  assert.match(await cycle.innerText(), /Se confirma desde el 16 oct/i, 'el mes en curso se cierra desde tres días antes de terminar');
  await page.waitForTimeout(300);
  await shot(page, '01-cliente');

  await cycle.locator('[data-report-open]').click();
  const report = page.locator('[data-report-dialog]');
  await report.waitFor();
  await page.waitForTimeout(200);
  await shot(page, '02-informe-en-elaboracion');
  await report.locator('[data-report-save]').click();
  await page.getByText('Informe de septiembre actualizado.').waitFor();
  await cycle.locator('[data-report-status="EN_ELABORACION"]').waitFor();

  await cycle.locator('[data-report-open]').click();
  await report.waitFor();
  await report.locator('[data-brain-select="true"]').click();
  await page.getByRole('option', { name: 'Enviado' }).click();
  await report.locator('[data-report-link]').fill('drive.google.com/informe');
  await report.locator('[data-report-save]').click();
  assert.match(await report.getByRole('alert').innerText(), /https/);
  await report.locator('[data-report-link]').fill('https://drive.google.com/informe-septiembre');
  await report.locator('[data-report-save]').click();
  await cycle.locator('[data-report-status="ENVIADO"]').waitFor();
  assert.match(await cycle.innerText(), /Enviado\s+el 2 oct/i);
  await cycle.getByRole('link', { name: 'Ver informe' }).waitFor();
  await shot(page, '03-informe-enviado');

  const august = page.locator('[data-history-close="Agosto"]');
  await august.locator('[data-close-open]').click();
  const close = page.locator('[data-close-dialog]');
  await close.waitFor();
  assert.match(await close.locator('[data-close-preview]').innerText(), /^Cerró completo: 6 de 6 publicadas y el informe enviado\.$/);
  await close.locator('[data-close-note]').fill('El cliente aprobó todo a tiempo.');
  await page.waitForTimeout(200);
  await shot(page, '04-confirmar-cierre');
  await close.locator('[data-close-confirm]').click();
  await page.getByText('Cierre de agosto confirmado.').waitFor();
  await august.locator('[data-close-status="confirmed"]').waitFor();
  assert.match(await august.innerText(), /Cerrado el 2 oct/i);
  await shot(page, '05-cierre-confirmado');
  assert.deepEqual(errors, []);
  await page.close();
});

test('en oscuro y en el celular se lee entero', async () => {
  const dark = await open('?dark');
  await dark.page.waitForTimeout(300);
  await shot(dark.page, '06-oscuro');
  await dark.page.close();

  const phone = await open('', { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  assert.equal(await phone.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, 'sin desplazamiento horizontal');
  await shot(phone.page, '07-celular');
  await phone.page.close();
});
