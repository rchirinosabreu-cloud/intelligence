// Recorrido real de «pedir un acceso de la bóveda» contra la muestra local (15 de octubre de 2026): el administrador ve
// «Camila necesita la contraseña de CapCut» encima de Bria con «Compartir» y «Denegar»; al compartir, la tarjeta se va
// cuando el servidor respondió y la línea de resultado sale de él; Camila ve la respuesta, compartida o denegada.
// Capturas en claro y oscuro.
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright-core';
import { createBriaPreview } from '../../scripts/preview-bria.js';

const output = process.env.SCREENSHOT_DIR || 'output/bria-access-request'; await mkdir(output, { recursive: true });
const preview = await createBriaPreview({ port: 3745 });
const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } }), errors = [], decisions = [];
page.on('pageerror', error => errors.push(error.message));
page.on('request', request => { if (request.url().includes('/api/vault/requests/')) decisions.push({ url: new URL(request.url()).pathname, body: request.postDataJSON?.() }); });
const corner = { x: 1000, y: 560, width: 440, height: 340 };
const card = page.getByRole('status', { name: 'Aviso de Bria' });
try {
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.goto(`${preview.origin}/?role=admin&acceso=admin&dark`);
  await card.waitFor();
  await page.screenshot({ path: path.join(output, '5-oscuro.png'), clip: corner });
  await page.emulateMedia({ colorScheme: 'light' });

  await page.goto(`${preview.origin}/?role=admin&acceso=admin`);
  await card.waitFor();
  assert.equal(await card.getAttribute('data-bria-nudge'), 'ACCESO_SOLICITADO');
  assert.match(await card.innerText(), /Camila necesita la contraseña de CapCut/);
  assert.match(await card.innerText(), /Acceso de Brain Studio\./);
  const share = card.locator('[data-bria-nudge-decision="APPROVE"]'), deny = card.locator('[data-bria-nudge-decision="DENY"]');
  assert.equal(await share.innerText(), 'Compartir');
  assert.equal(await deny.innerText(), 'Denegar');
  await page.screenshot({ path: path.join(output, '1-rodny-recibe-el-pedido.png'), clip: corner });
  await share.click();
  await card.waitFor({ state: 'detached' });
  assert.deepEqual(decisions, [{ url: '/api/vault/requests/a1c2e3f4-0000-4000-8000-000000000004/decision', body: { decision: 'APPROVE' } }]);
  await page.getByText('Compartiste la contraseña de CapCut con Camila.').waitFor();
  await page.screenshot({ path: path.join(output, '2-rodny-compartio.png') });

  await page.goto(`${preview.origin}/?acceso=compartido`);
  await card.waitFor();
  assert.equal(await card.getAttribute('data-bria-nudge'), 'ACCESO_COMPARTIDO');
  assert.match(await card.innerText(), /Rodny compartió contigo la contraseña de CapCut/);
  assert.match(await card.innerText(), /Ver la contraseña/);
  await page.screenshot({ path: path.join(output, '3-camila-compartido.png'), clip: corner });

  await page.goto(`${preview.origin}/?acceso=denegado`);
  await card.waitFor();
  assert.equal(await card.getAttribute('data-bria-nudge'), 'ACCESO_DENEGADO');
  assert.match(await card.innerText(), /Rodny denegó tu acceso a la contraseña de CapCut/);
  await page.screenshot({ path: path.join(output, '4-camila-denegado.png'), clip: corner });

  assert.deepEqual(errors, []);
  console.log(`Recorrido de pedidos de acceso completo. Capturas en ${path.resolve(output)}`);
} finally {
  await browser.close();
  await preview.close();
}
