import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright-core';
import { createRecognitionPreview } from '../../scripts/preview-recognitions.js';

let preview, browser;
test.before(async () => {
  preview = await createRecognitionPreview({ port: 0 });
  browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
  await mkdir('output/first-access', { recursive: true });
});
test.after(async () => { await browser?.close(); await preview?.close(); });

test('first access uses the real login and mandatory-change screens without contacting production', async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  page.setDefaultTimeout(6000);
  page.setDefaultNavigationTimeout(30000);
  const remoteRequests = [];
  page.on('request', request => { if (!request.url().startsWith(preview.origin) && /^https?:/.test(request.url())) remoteRequests.push(request.url()); });
  await page.goto(`${preview.origin}/tests/fixtures/first-access.html`);
  await page.getByRole('heading', { name: 'Bienvenido de nuevo' }).waitFor();
  await page.locator('input[type=email]').fill('francis@example.test');
  await page.locator('input[type=password]').fill('MuestraBrain2026!');
  await page.locator('button[type=submit]').click();
  await page.getByRole('heading', { name: 'Actualiza tu contrasena' }).waitFor();
  await page.screenshot({ path: 'output/first-access/change-password-desktop.png', fullPage: true });
  await page.getByLabel('Contrasena actual', { exact: true }).fill('incorrecta');
  await page.getByLabel('Tu nueva contrasena', { exact: true }).fill('MiClavePersonal2026!');
  await page.getByLabel('Confirmar nueva contrasena', { exact: true }).fill('MiClavePersonal2026!');
  await page.getByRole('button', { name: 'Guardar nueva contrasena' }).click();
  await page.getByText('Contraseña actual incorrecta', { exact: true }).waitFor();
  assert.equal(await page.getByRole('heading', { name: 'Actualiza tu contrasena' }).count(), 1);
  await page.getByLabel('Contrasena actual', { exact: true }).fill('MuestraBrain2026!');
  await page.getByRole('button', { name: 'Guardar nueva contrasena' }).click();
  await page.getByText('Contrasena actualizada. Ingresa nuevamente con tu nueva clave.').waitFor();
  await page.locator('input[type=email]').fill('francis@example.test');
  await page.locator('input[type=password]').fill('MiClavePersonal2026!');
  await page.locator('button[type=submit]').click();
  await page.getByRole('heading', { name: 'Acceso de prueba completado' }).waitFor();
  assert.deepEqual(remoteRequests, []);
  await page.close();
});

test('mandatory password screen stays usable on mobile dark mode', async () => {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  page.setDefaultTimeout(6000);
  page.setDefaultNavigationTimeout(30000);
  await page.goto(`${preview.origin}/tests/fixtures/first-access.html?dark&step=change&person=david`);
  await page.getByRole('heading', { name: 'Actualiza tu contrasena' }).waitFor();
  assert.equal(await page.getByText('Hola, David Rodríguez.').count(), 1);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  await page.screenshot({ path: 'output/first-access/change-password-mobile-dark.png', fullPage: true });
  await page.close();
});
