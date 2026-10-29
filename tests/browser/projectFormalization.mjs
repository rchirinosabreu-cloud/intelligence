import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright-core';

// Formalización de proyectos (punto 3 de la solicitud de Elisa, 29 de octubre de 2026), sobre las muestras locales:
// Cotizaciones (npx vite --config tests/fixtures/quotation-vite.config.mjs, puerto 3007) y Financiero
// (npx vite --host 127.0.0.1 --port 3006). Pantallas enteras, numeradas, en output/recorrido-formalizacion.
const QUOTATIONS = process.env.QUOTATION_DEMO_URL || 'http://127.0.0.1:3007/tests/fixtures/quotation-proposal.html';
const FINANCIAL = process.env.FINANCIAL_DEMO_URL || 'http://127.0.0.1:3006/tests/fixtures/financial-integrity.html';
const OUT = 'output/recorrido-formalizacion';
let browser;
test.before(async () => {
  browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
  await mkdir(OUT, { recursive: true });
});
test.after(async () => { await browser?.close(); });

const shot = (page, name) => page.screenshot({ path: `${OUT}/${name}.png`, fullPage: true });
const newPage = async (options = {}) => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, ...options });
  page.setDefaultTimeout(15000);
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  return { page, errors };
};

test('Comercial registra la aprobación; con escenarios pide cuál', async () => {
  const { page, errors } = await newPage();
  await page.goto(`${QUOTATIONS}?view=list`, { timeout: 90000, waitUntil: 'domcontentloaded' });
  await page.getByText('Café Altura').waitFor();
  await shot(page, '01-cotizaciones');

  assert.equal(await page.locator('[data-register-approval-open="q-35"]').count(), 0, 'una aprobada no se vuelve a aprobar');
  await page.locator('[data-register-approval-open="q-42"]').click();
  const dialog = page.locator('[data-register-approval]');
  await dialog.waitFor();
  assert.match(await dialog.innerText(), /Café Altura aprobó la COT-0042 por fuera del enlace/);
  await page.waitForTimeout(250);
  await shot(page, '02-registrar-aprobacion');
  await dialog.locator('[data-register-approval-confirm]').click();
  await page.getByText('Aprobación registrada. Administración ya tiene la solicitud.').waitFor();
  await page.locator('[data-register-approval-open="q-42"]').waitFor({ state: 'detached' });

  await page.locator('[data-register-approval-open="q-43"]').click();
  await dialog.waitFor();
  await dialog.locator('[data-register-approval-confirm]').click();
  assert.match(await dialog.getByRole('alert').innerText(), /Elige el escenario/);
  await dialog.locator('[data-brain-select="true"]').click();
  await page.getByRole('option', { name: 'Landing con blog' }).click();
  await shot(page, '03-escenario-aprobado');
  await dialog.locator('[data-register-approval-confirm]').click();
  await page.locator('[data-register-approval-open="q-43"]').waitFor({ state: 'detached' });
  assert.deepEqual(await page.evaluate(() => window.__acceptCalls.map((call) => [call.id, call.scenarioId ?? null])), [['q-42', null], ['q-43', 's-b']]);
  await shot(page, '04-aprobadas');
  assert.deepEqual(errors, []);
  await page.close();
});

const openFormalizations = async (query = '', options = {}) => {
  const { page, errors } = await newPage(options);
  await page.goto(`${FINANCIAL}${query}`, { timeout: 90000, waitUntil: 'domcontentloaded' });
  await page.getByRole('tab', { name: 'Cuentas por cobrar' }).click();
  return { page, errors };
};

test('Administración carga el contrato, autoriza empezar sin anticipo y liga el anticipo que faltaba', async () => {
  const { page, errors } = await openFormalizations();
  await page.locator('[data-financial-view="formalizations"]').click();
  await page.locator('[data-formalizations]').waitFor();
  const cafe = page.locator('[data-formalization="f-cafe"]');
  await cafe.waitFor();
  assert.match(await cafe.innerText(), /Falta el contrato firmado y el anticipo para habilitarlo/);
  assert.match(await page.locator('[data-formalization="f-bahia"]').innerText(), /Habilitado el .*Se le avisó a Kamila del Toro/);
  await page.waitForTimeout(300);
  await shot(page, '05-formalizacion');

  const pdf = (name) => ({ name, mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4\n%%EOF\n') });
  const upload = page.locator('[data-formalization-upload]');
  await cafe.locator('[data-formalization-upload-open]').click();
  await upload.waitFor();
  assert.equal((await upload.locator('[data-brain-select="true"]').innerText()).trim(), 'Contrato', 'sin contrato, lo primero es el contrato');
  await upload.locator('[data-formalization-upload-save]').click();
  assert.match(await upload.getByRole('alert').innerText(), /Elige el archivo/);
  await upload.locator('[data-formalization-file]').setInputFiles(pdf('Contrato Café Altura firmado.pdf'));
  await page.waitForTimeout(250);
  await shot(page, '06-subir-contrato');
  await upload.locator('[data-formalization-upload-save]').click();
  await page.getByText('Contrato guardado').waitFor();
  await cafe.locator('[data-formalization-document="CONTRATO"]').waitFor();
  assert.equal(await cafe.getAttribute('data-formalization-status'), 'PENDIENTE', 'el contrato solo no basta');
  assert.match(await cafe.innerText(), /Falta el anticipo para habilitarlo/);

  // Con el contrato ya cargado, lo que sigue son otrosí y anexos; uno subido por error se anula con motivo.
  assert.match(await cafe.locator('[data-formalization-upload-open]').innerText(), /Subir otrosí o anexo/);
  await cafe.locator('[data-formalization-upload-open]').click();
  await upload.waitFor();
  assert.equal((await upload.locator('[data-brain-select="true"]').innerText()).trim(), 'Otrosí');
  await upload.locator('[data-formalization-note]').fill('Otrosí 1: se suman 4 reels al mes');
  await upload.locator('[data-formalization-file]').setInputFiles(pdf('Otrosí 1 Café Altura.pdf'));
  await upload.locator('[data-formalization-upload-save]').click();
  await page.getByText('Otrosí guardado').waitFor();
  await cafe.getByText('Otrosí 1: se suman 4 reels al mes').waitFor();
  await shot(page, '07-contrato-y-otrosi');

  await cafe.locator('[data-formalization-document="OTROSI"] [data-formalization-void-open]').click();
  const voidDialog = page.locator('[data-formalization-void]');
  await voidDialog.waitFor();
  await voidDialog.locator('[data-formalization-void-save]').click();
  assert.match(await voidDialog.getByRole('alert').innerText(), /Escribe por qué/);
  await voidDialog.locator('[data-formalization-void-reason]').fill('Se subió la versión sin firmar.');
  await page.waitForTimeout(250);
  await shot(page, '08-anular-documento');
  await voidDialog.locator('[data-formalization-void-save]').click();
  await page.getByText('Documento anulado').waitFor();
  await cafe.locator('[data-formalization-document="OTROSI"]').waitFor({ state: 'detached' });
  await cafe.locator('[data-formalization-voided-toggle]').click();
  assert.match(await cafe.locator('[data-formalization-voided]').innerText(), /Otrosí · Otrosí 1 Café Altura\.pdf · anulado el .*: Se subió la versión sin firmar\./);
  await shot(page, '09-documento-anulado');

  await cafe.locator('[data-formalization-exception-open]').click();
  const dialog = page.locator('[data-formalization-exception]');
  await dialog.waitFor();
  await dialog.locator('[data-exception-save]').click();
  assert.match(await dialog.getByRole('alert').innerText(), /Escribe el motivo/);
  await dialog.locator('[data-exception-field="reason"]').fill('Cliente referido por Hotel Bahía; arranca la campaña de diciembre.');
  await dialog.locator('[data-exception-field="conditions"]').fill('Paga el anticipo con la primera entrega.');
  await dialog.getByLabel('Fecha de pago acordada').fill('15/11/2026');
  await dialog.getByLabel('Fecha de pago acordada').press('Enter');
  await page.waitForTimeout(250);
  await shot(page, '10-empezar-sin-anticipo');
  await dialog.locator('[data-exception-save]').click();
  await page.getByText('Autorización guardada').waitFor();
  const enabled = page.locator('[data-formalization-section="done"] [data-formalization="f-cafe"]');
  await enabled.waitFor();
  assert.match(await enabled.innerText(), /Elisa Mestra autorizó empezar sin el anticipo el 29 de oct de 2026: Cliente referido por Hotel Bahía; arranca la campaña de diciembre\. Paga el anticipo con la primera entrega\. Pago acordado para el 15 de nov de 2026\./);
  assert.match(await enabled.innerText(), /Se le avisó a Kamila del Toro/);
  await shot(page, '11-proyecto-habilitado');

  const norte = page.locator('[data-formalization="f-norte"]');
  await norte.locator('[data-brain-select="true"]').click();
  await page.getByRole('option', { name: /Anticipo landing page/ }).click();
  await norte.getByRole('button', { name: 'Ligar' }).click();
  await page.getByText('Cuenta del anticipo ligada').waitFor();
  await norte.locator('[data-formalization-advance="PENDIENTE"]').waitFor();
  await shot(page, '12-anticipo-ligado');
  assert.deepEqual(errors, []);
  await page.close();
});

test('en oscuro y en el celular se lee entero; quien no es de Dirección ni Administración no la ve', async () => {
  const dark = await openFormalizations();
  await dark.page.evaluate(() => document.documentElement.classList.add('dark'));
  await dark.page.locator('[data-financial-view="formalizations"]').click();
  await dark.page.locator('[data-formalization="f-cafe"]').waitFor();
  await dark.page.waitForTimeout(300);
  await shot(dark.page, '13-formalizacion-oscuro');
  await dark.page.close();

  const phone = await openFormalizations('', { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  await phone.page.locator('[data-financial-view="formalizations"]').click();
  await phone.page.locator('[data-formalization="f-cafe"]').waitFor();
  assert.equal(await phone.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, 'sin desplazamiento horizontal');
  await shot(phone.page, '14-formalizacion-celular');
  await phone.page.close();

  const reader = await openFormalizations('?viewer=reader');
  await reader.page.getByText('Lo que les deben a Brain Studio').waitFor();
  await reader.page.waitForTimeout(500);
  assert.equal(await reader.page.locator('[data-financial-view="formalizations"]').count(), 0);
  await reader.page.close();
});
