import test from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
import { mkdir } from 'node:fs/promises';
import { createWelcomePreview } from '../../scripts/preview-welcome.js';
let preview, browser;
test.before(async () => { preview = await createWelcomePreview({ port: 0 }); browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true }); await mkdir('output/welcome', { recursive: true }); });
test.after(async () => { await browser?.close(); await preview?.close(); });
async function create(page) {
  await page.getByRole('button', { name: 'Añadir miembro', exact: true }).click();
  await page.getByLabel('Nombre completo', { exact: true }).fill('Persona de prueba');
  await page.getByLabel('Rol', { exact: true }).fill('Diseñador');
  await page.getByLabel('Correo electrónico (opcional)').fill('persona@example.test');
  await page.getByRole('button', { name: 'Guardar', exact: true }).click();
}
test('admin gets initial access only after successful creation, can copy it and close without storing the secret', async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } }); page.setDefaultTimeout(10000);
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.goto(`${preview.origin}/tests/fixtures/team-access.html`);
  await create(page);
  const dialog = page.getByRole('dialog', { name: 'Acceso inicial listo' });
  assert.equal(await dialog.count(), 0);
  await dialog.waitFor();
  assert.equal(await dialog.getByLabel('Contraseña temporal').inputValue(), 'SoloMuestra-NoEsUnaClaveReal!');
  await dialog.getByRole('button', { name: 'Copiar acceso' }).click();
  await dialog.getByText('Acceso copiado', { exact: true }).waitFor();
  assert.match(await page.evaluate(() => navigator.clipboard.readText()), /persona@example.test/);
  assert.equal(await page.evaluate(() => JSON.stringify(localStorage).includes('SoloMuestra-NoEsUnaClaveReal!')), false);
  await dialog.screenshot({ path: 'output/welcome/initial-access-desktop.png' });
  await dialog.getByRole('button', { name: 'Listo', exact: true }).click();
  await dialog.waitFor({ state: 'hidden' });
  assert.equal(await page.getByText('SoloMuestra-NoEsUnaClaveReal!').count(), 0);
  await page.close();
});
test('failed creation keeps form and explanation, without success or credentials', async () => {
  const page = await browser.newPage(); page.setDefaultTimeout(10000);
  await page.goto(`${preview.origin}/tests/fixtures/team-access.html?error`);
  await create(page);
  await page.getByRole('alert').filter({ hasText: 'Error de guardado simulado' }).waitFor();
  assert.equal(await page.getByRole('dialog', { name: 'Acceso inicial listo' }).count(), 0);
  assert.equal(await page.getByLabel('Nombre completo').inputValue(), 'Persona de prueba');
  await page.close();
});
test('pending access regeneration requires confirmation and is not available to viewers', async () => {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, reducedMotion: 'reduce' }); page.setDefaultTimeout(10000);
  await page.goto(`${preview.origin}/tests/fixtures/team-access.html?pending&dark`);
  await page.getByRole('button', { name: 'Preparar acceso inicial' }).click();
  await page.getByRole('dialog', { name: 'Preparar acceso inicial' }).waitFor();
  await page.getByRole('button', { name: 'Generar clave temporal' }).click();
  const dialog = page.getByRole('dialog', { name: 'Acceso inicial listo' }); await dialog.waitFor();
  assert.equal(await dialog.getByRole('heading').evaluate(element => getComputedStyle(element).color), 'rgb(244, 244, 245)');
  assert.equal(await dialog.getByLabel('Contraseña temporal').evaluate(element => getComputedStyle(element).color), 'rgb(244, 244, 245)');
  await dialog.screenshot({ path: 'output/welcome/initial-access-mobile.png' });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  await page.goto(`${preview.origin}/tests/fixtures/team-access.html?pending&viewer`);
  assert.equal(await page.getByRole('button', { name: 'Preparar acceso inicial' }).count(), 0);
  await page.close();
});
