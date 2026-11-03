// Una cuenta con sus detalles (Rodny, 3 de noviembre de 2026: «nueva cuenta es muy básico, faltaría
// añadir detalles»): de quién es, en qué institución y con qué cuatro dígitos se reconoce; y la misma
// ventana para corregirla. Recorrido real sobre la muestra local de Financiero en 3006:
// npx vite --host 127.0.0.1 --port 3006
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import { chooseOption } from './selectHelpers.mjs';

const base = process.env.FINANCIAL_DEMO_URL || 'http://127.0.0.1:3006/tests/fixtures/financial-integrity.html';
const outDir = new URL('../../output/financial-accounts/', import.meta.url);
const shot = (name) => fileURLToPath(new URL(name, outDir));
await mkdir(outDir, { recursive: true });

const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
  page.setDefaultTimeout(10000);
  const errors = []; page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(base, { timeout: 90000, waitUntil: 'domcontentloaded' });
  await page.getByRole('navigation', { name: 'Paginación de movimientos' }).waitFor();

  // La tarjeta dice lo que hace falta para reconocer la cuenta en un extracto.
  const subtitleOf = (id) => page.locator(`[data-account-card="${id}"] [data-account-subtitle]`).innerText();
  assert.equal(await subtitleOf('demo-account'), 'Bancolombia · ••3251');
  assert.equal(await subtitleOf('demo-account-wise'), 'Wise · ••0345 · a nombre de Francisco Villa');
  // Sin detalles, al menos qué clase de cuenta es.
  assert.equal(await subtitleOf('demo-account-caja'), 'Caja');
  await page.locator('[data-account-card="demo-account-wise"]').screenshot({ path: shot('01-tarjetas.png'), animations: 'disabled' });

  // Crear una cuenta con todos sus datos.
  await page.getByRole('button', { name: 'Nueva cuenta' }).click();
  const dialog = page.locator('[data-account-dialog]');
  await dialog.waitFor();
  // «Nombre» exacto: «A nombre de» lo contiene.
  await dialog.getByLabel('Nombre', { exact: true }).fill('Nequi de la agencia');
  await dialog.getByLabel('Institución (opcional)').fill('Nequi');
  await dialog.getByLabel('Últimos cuatro dígitos (opcional)').fill('7788');
  await dialog.getByLabel('A nombre de (opcional)').fill('Brain Studio Agencia Creativa S.A.S.');
  // El desplegable compartido de la plataforma, no un <select> del navegador.
  await chooseOption(dialog.getByLabel('Documento del titular (opcional)'), 'NIT');
  await dialog.getByLabel('Número', { exact: true }).fill('901533409-4');
  await page.screenshot({ path: shot('02-nueva-cuenta.png'), animations: 'disabled' });
  await dialog.getByRole('button', { name: 'Crear cuenta' }).click();
  await dialog.waitFor({ state: 'detached' });

  const created = await page.evaluate(() => window.__accountWrites.at(-1));
  assert.equal(created.method, 'post');
  assert.equal(created.body.institution, 'Nequi');
  assert.equal(created.body.lastFour, '7788');
  assert.equal(created.body.identificationType, 'NIT');
  assert.equal(created.body.isThirdPartyHeld, false);

  // Corregir una que ya existe: la misma ventana, abierta con lo que la cuenta tiene.
  await page.locator('[data-account-edit="demo-account-wise"]').click();
  await dialog.waitFor();
  await page.getByRole('heading', { name: 'Editar cuenta' }).waitFor();
  assert.equal(await dialog.getByLabel('Institución (opcional)').inputValue(), 'Wise');
  assert.equal(await dialog.getByLabel('Últimos cuatro dígitos (opcional)').inputValue(), '0345');
  assert.equal(await dialog.locator('[data-account-third-party]').isChecked(), true);
  await page.screenshot({ path: shot('03-editar-cuenta.png'), animations: 'disabled' });

  await dialog.getByLabel('Nombre', { exact: true }).fill('Wise · dólares');
  await dialog.getByRole('button', { name: 'Guardar cambios' }).click();
  await dialog.waitFor({ state: 'detached' });
  const edited = await page.evaluate(() => window.__accountWrites.at(-1));
  assert.equal(edited.method, 'patch');
  assert.equal(edited.id, 'demo-account-wise');
  assert.equal(edited.body.name, 'Wise · dólares');
  await page.locator('[data-account-card="demo-account-wise"]').getByText('Wise · dólares').waitFor();

  // En oscuro.
  await page.evaluate(() => document.documentElement.classList.add('dark'));
  await page.locator('[data-account-edit="demo-account-wise"]').click();
  await dialog.waitFor();
  await page.screenshot({ path: shot('04-editar-oscuro.png'), animations: 'disabled' });
  await dialog.getByRole('button', { name: 'Cancelar' }).click();
  await dialog.waitFor({ state: 'detached' });
  await page.evaluate(() => document.documentElement.classList.remove('dark'));

  // En el celular la ventana cabe y la página no se desplaza de lado.
  await page.setViewportSize({ width: 390, height: 900 });
  await page.getByRole('button', { name: 'Nueva cuenta' }).click();
  await dialog.waitFor();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  assert.ok(overflow <= 1, `la página no se desplaza de lado (${overflow}px)`);
  await page.screenshot({ path: shot('05-celular.png'), animations: 'disabled' });

  assert.deepEqual(errors, []);
  console.log('OK', fileURLToPath(outDir));
} finally { await browser.close(); }
