// Recorrido real de «Buzones que lee Bria» (11 de octubre de 2026) contra la muestra local: la lista, el formulario
// de conexión (contraseña en campo oculto, probada antes de guardar), el rechazo de Gmail dicho en palabras, la
// vista de un project manager sin botones, y el modo oscuro. Capturas en output/mailbox-connections.
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright-core';
import { createBriaPreview } from '../../scripts/preview-bria.js';

const output = process.env.SCREENSHOT_DIR || 'output/mailbox-connections'; await mkdir(output, { recursive: true });
const preview = await createBriaPreview({ port: 3745 });
const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
const page = await browser.newPage({ viewport: { width: 1280, height: 860 } }), errors = [], posted = [];
page.on('pageerror', error => errors.push(error.message));
page.on('request', request => { if (request.method() === 'POST' && request.url().includes('/api/bria/mail/accounts')) posted.push(JSON.parse(request.postData() || '{}')); });
try {
  await page.goto(`${preview.origin}/buzones`);
  const card = page.locator('[data-mailbox-connections]');
  await card.waitFor();
  await card.locator('[data-mailbox-account="social.brainstudio@gmail.com"]').waitFor();
  await page.screenshot({ path: path.join(output, 'buzones-lista.png') });
  // Conectar: la contraseña va en un campo de contraseña y Gmail puede rechazarla.
  await card.getByRole('button', { name: 'Conectar buzón' }).click();
  const form = card.locator('[data-mailbox-form]');
  await form.waitFor();
  const password = form.getByLabel('Contraseña de aplicación');
  assert.equal(await password.getAttribute('type'), 'password');
  await form.getByLabel('Correo del buzón').fill('contacto@brainstudioagencia.com');
  await form.getByLabel('Etiqueta (opcional)').fill('Contacto');
  await password.fill('mala mala mala mala');
  await page.screenshot({ path: path.join(output, 'buzones-formulario.png') });
  await form.getByRole('button', { name: 'Probar y conectar' }).click();
  await form.getByRole('alert').waitFor();
  assert.match(await form.getByRole('alert').innerText(), /Gmail rechazó la contraseña de aplicación/);
  await page.screenshot({ path: path.join(output, 'buzones-rechazo.png') });
  await password.fill('abcd efgh ijkl mnop');
  await form.getByRole('button', { name: 'Probar y conectar' }).click();
  await card.locator('[data-mailbox-account="contacto@brainstudioagencia.com"]').waitFor();
  assert.equal(await form.isHidden(), true, 'the form closes after the server confirmed');
  assert.deepEqual(posted.at(-1), { email: 'contacto@brainstudioagencia.com', label: 'Contacto', appPassword: 'abcd efgh ijkl mnop' }, 'the password travels once, in the body');
  await page.getByText('Buzón conectado: Bria ya lo lee').waitFor();
  await page.screenshot({ path: path.join(output, 'buzones-conectado.png') });
  // Probar desde la lista.
  await card.locator('[data-mailbox-account="contacto@brainstudioagencia.com"]').getByRole('button', { name: 'Probar' }).click();
  await page.getByText('Entró a contacto@brainstudioagencia.com sin problema').waitFor();
  // Un project manager ve la lista sin botones.
  await page.goto(`${preview.origin}/buzones?pm`);
  await card.locator('[data-mailbox-account="social.brainstudio@gmail.com"]').waitFor();
  assert.equal(await card.getByRole('button', { name: 'Conectar buzón' }).count(), 0);
  assert.equal(await card.getByRole('button', { name: 'Probar' }).count(), 0);
  await page.screenshot({ path: path.join(output, 'buzones-pm.png') });
  await page.goto(`${preview.origin}/buzones?dark`);
  await card.locator('[data-mailbox-account]').first().waitFor();
  await page.screenshot({ path: path.join(output, 'buzones-oscuro.png') });
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ passed: true, simulatedApi: true, realComponent: true, screenshots: 6, passwordFieldHidden: true, refusalInWords: true }));
} finally { await browser.close(); await preview.close(); }
