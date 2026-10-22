// Recorrido real de «pedir acceso a un módulo» contra la muestra local (15 de octubre de 2026): el administrador ve
// «Camila necesita acceso a Financiero» encima de Bria con «Dar acceso» y «Denegar»; al dar acceso, la tarjeta se va
// cuando el servidor respondió y la línea de resultado sale de él; Camila ve la respuesta, concedida (con un enlace que
// recarga la página en el módulo) o denegada. Capturas en claro y oscuro.
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright-core';
import { createBriaPreview } from '../../scripts/preview-bria.js';

const output = process.env.SCREENSHOT_DIR || 'output/bria-permission-request'; await mkdir(output, { recursive: true });
const preview = await createBriaPreview({ port: 3746 });
const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } }), errors = [], decisions = [];
page.on('pageerror', error => errors.push(error.message));
page.on('request', request => { if (request.url().includes('/permission-requests/')) decisions.push({ url: new URL(request.url()).pathname, body: request.postDataJSON?.() }); });
const corner = { x: 1000, y: 540, width: 440, height: 360 };
const card = page.getByRole('status', { name: 'Aviso de Bria' });
try {
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.goto(`${preview.origin}/?role=admin&permiso=admin&dark`);
  await card.waitFor();
  await page.screenshot({ path: path.join(output, '5-oscuro.png'), clip: corner });
  await page.emulateMedia({ colorScheme: 'light' });

  await page.goto(`${preview.origin}/?role=admin&permiso=admin`);
  await card.waitFor();
  assert.equal(await card.getAttribute('data-bria-nudge'), 'PERMISO_SOLICITADO');
  assert.match(await card.innerText(), /Camila necesita acceso a Financiero/);
  assert.match(await card.innerText(), /Lo pidió para «ver cuánto debe Aristea»/);
  assert.match(await card.innerText(), /solo lectura/);
  const give = card.locator('[data-bria-nudge-decision="APPROVE"]');
  assert.equal(await give.innerText(), 'Dar acceso');
  assert.equal(await card.locator('[data-bria-nudge-decision="DENY"]').innerText(), 'Denegar');
  await page.screenshot({ path: path.join(output, '1-rodny-recibe-el-pedido.png'), clip: corner });
  await give.click();
  await card.waitFor({ state: 'detached' });
  assert.deepEqual(decisions, [{ url: '/api/bria/nudges/permission-requests/5d1e2f30-0000-4000-8000-000000000009/decision', body: { decision: 'APPROVE' } }]);
  await page.getByText('Le diste acceso a Financiero a Camila.').waitFor();
  await page.screenshot({ path: path.join(output, '2-rodny-dio-acceso.png') });

  await page.goto(`${preview.origin}/?permiso=concedido`);
  await card.waitFor();
  assert.equal(await card.getAttribute('data-bria-nudge'), 'PERMISO_CONCEDIDO');
  assert.match(await card.innerText(), /Rodny te dio acceso a Financiero/);
  assert.equal(await card.getByRole('link', { name: 'Abrir Financiero' }).getAttribute('href'), '/financiero');
  await page.screenshot({ path: path.join(output, '3-camila-concedido.png'), clip: corner });

  await page.goto(`${preview.origin}/?permiso=denegado`);
  await card.waitFor();
  assert.equal(await card.getAttribute('data-bria-nudge'), 'PERMISO_DENEGADO');
  assert.match(await card.innerText(), /Rodny denegó tu acceso a Financiero/);
  await page.screenshot({ path: path.join(output, '4-camila-denegado.png'), clip: corner });

  assert.deepEqual(errors, []);
  console.log(`Recorrido de pedidos de módulo completo. Capturas en ${path.resolve(output)}`);
} finally {
  await browser.close();
  await preview.close();
}
