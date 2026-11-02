import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright-core';

// Trabajo sin propuesta aprobada (29 de octubre de 2026), sobre la muestra de Operación de clientes
// (node scripts/preview-client-operations.js --port=3700; «hoy» es el 2 de octubre de 2026). Capturas en
// output/recorrido-trabajo-sin-propuesta.
const BASE = process.env.CLIENT_OPERATIONS_URL || 'http://127.0.0.1:3700';
const OUT = 'output/recorrido-trabajo-sin-propuesta';
let browser;
test.before(async () => {
  browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
  await mkdir(OUT, { recursive: true });
});
test.after(async () => { await browser?.close(); });
const shot = (page, name) => page.screenshot({ path: `${OUT}/${name}.png`, fullPage: true });

test('el tablero lo marca en atención y Dirección autoriza seguir hasta una fecha', async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  page.setDefaultTimeout(15000);
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(`${BASE}/clientes`, { timeout: 90000, waitUntil: 'domcontentloaded' });
  const row = page.getByText('Promo Group · Endova').first();
  await row.waitFor({ timeout: 60000 });
  await page.getByText(/Se está trabajando sin contrato cargado: 9 tareas abiertas y parrilla de octubre/).first().waitFor();
  await page.waitForTimeout(300);
  await shot(page, '01-tablero');

  await page.goto(`${BASE}/clientes/operacion/promo-group`, { waitUntil: 'domcontentloaded' });
  const block = page.locator('[data-unbacked-work="open"]');
  await block.waitFor({ timeout: 60000 });
  assert.match(await block.innerText(), /Trabajo sin propuesta aprobada/);
  await shot(page, '02-ficha');

  await block.locator('[data-work-authorization-open]').click();
  const dialog = page.locator('[data-work-authorization-dialog]');
  await dialog.waitFor();
  await dialog.locator('[data-work-authorization-save]').click();
  assert.match(await dialog.getByRole('alert').innerText(), /por qué/);
  await dialog.locator('[data-work-authorization-reason]').fill('La renovación está firmada y falta cargar el contrato.');
  await dialog.getByLabel('Hasta qué fecha se autoriza').fill('15/10/2026');
  await dialog.getByLabel('Hasta qué fecha se autoriza').press('Enter');
  await page.waitForTimeout(250);
  await shot(page, '03-autorizar');
  await dialog.locator('[data-work-authorization-save]').click();
  await page.getByText('Autorización guardada.').waitFor();
  const authorized = page.locator('[data-unbacked-work="authorized"]');
  await authorized.waitFor();
  assert.match(await authorized.innerText(), /autorizó seguir trabajando sin propuesta aprobada hasta el 15 oct: La renovación está firmada y falta cargar el contrato\./);
  await shot(page, '04-autorizado');
  assert.deepEqual(errors, []);
  await page.close();

  const dark = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  await dark.goto(`${BASE}/clientes/operacion/promo-group?dark`, { waitUntil: 'domcontentloaded' });
  await dark.locator('[data-unbacked-work="open"]').waitFor({ timeout: 60000 });
  await dark.waitForTimeout(300);
  await shot(dark, '05-oscuro');
  await dark.close();
});
