import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright-core';
import { createCommercialRequestPreview } from '../../scripts/preview-commercial-request.js';

// Real form over the real answers→lead mapping; the submit endpoint is a local double. Screenshots in output/solicitud.
let preview, browser;
test.before(async () => {
  preview = await createCommercialRequestPreview({ port: 0 });
  browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
  await mkdir('output/solicitud', { recursive: true });
});
test.after(async () => { await browser?.close(); await preview?.close(); });

const shot = (page, name) => page.screenshot({ path: `output/solicitud/${name}.png`, fullPage: true });
const next = async page => { await page.getByRole('button', { name: /Continuar|Enviar solicitud/ }).click(); };
const pick = async (page, name) => { await page.getByRole('checkbox', { name, exact: true }).or(page.getByRole('radio', { name, exact: true })).first().click(); };

test('desktop: a marketing + audiovisual + web request walks every step, validates, and reaches the CRM mapping', async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  page.setDefaultTimeout(8000);
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  try {
    await page.goto(`${preview.origin}/solicitud`);
    await page.getByRole('button', { name: 'Comenzar' }).waitFor();
    await shot(page, '00-bienvenida');
    await page.getByRole('button', { name: 'Comenzar' }).click();

    // Step 1 · contact: validation first, then real data.
    await page.getByText('Paso 1 de 8').waitFor();
    await next(page);
    assert.equal(await page.getByRole('alert').count() >= 5, true, 'the contact step asks for the essentials');
    await shot(page, '01-datos-validacion');
    await page.getByLabel('Nombre y apellido').fill('Catalina Rojas');
    await page.getByLabel(/Empresa/).fill('HDI Seguros');
    await page.getByLabel(/Cargo/).fill('Gerente de mercadeo');
    await page.getByLabel('Correo electrónico').fill('catalina@hdi.test');
    await page.getByLabel(/WhatsApp/).fill('+57 310 000 0001');
    await page.getByLabel('Ciudad y país').fill('Bogotá, Colombia');
    await page.getByLabel(/Página web/).fill('hdi.test');
    await shot(page, '01-datos');
    await next(page);

    // Step 2 · need
    await page.getByText('Paso 2 de 8').waitFor();
    await page.getByLabel(/Qué proyecto/).fill('Campaña de marca y contenido para el segundo semestre, con producción de reels y un rediseño de la landing.');
    await pick(page, 'Sí');
    await page.getByLabel('¿Cuál es la fecha?').fill('15/11/2026');
    await page.keyboard.press('Escape');
    await page.getByLabel(/Qué sucede ese día/).fill('Lanzamiento de la campaña');
    await pick(page, 'Lo antes posible');
    await shot(page, '02-necesidad');
    await next(page);

    // Step 3 · services (three of them → three dynamic blocks)
    await page.getByText('Paso 3 de 8').waitFor();
    await pick(page, 'Marketing');
    await pick(page, 'Producción audiovisual');
    await pick(page, 'Web');
    await page.getByText('Paso 3 de 11').waitFor();
    await shot(page, '03-servicios');
    await next(page);

    // Dynamic blocks
    await page.getByRole('heading', { name: 'Marketing' }).waitFor();
    await pick(page, 'Manejo de redes sociales');
    await pick(page, 'Instagram');
    await pick(page, 'LinkedIn');
    await pick(page, 'Mensual');
    await shot(page, '04-marketing');
    await next(page);
    await page.getByRole('heading', { name: 'Producción audiovisual' }).waitFor();
    await pick(page, 'Reels / contenido vertical');
    await pick(page, 'Fotografía');
    await page.getByLabel(/Cuántas piezas/).fill('4 reels y 20 fotos al mes');
    await page.getByLabel(/Dónde se realizaría/).fill('Bogotá, oficinas de HDI');
    await pick(page, 'Drone');
    await shot(page, '05-audiovisual');
    await next(page);
    await page.getByRole('heading', { name: 'Web' }).waitFor();
    await pick(page, 'Landing page');
    await page.getByRole('radio', { name: 'Sí', exact: true }).click();
    await page.getByLabel('Compártenos el enlace').fill('https://hdi.test');
    await pick(page, 'WhatsApp');
    await shot(page, '06-web');
    await next(page);

    // Event, AMC, budget, timing, source
    await page.getByRole('heading', { name: /evento o activación/ }).waitFor();
    await pick(page, 'No');
    await next(page);
    await page.getByRole('heading', { name: /solución más integral/ }).waitFor();
    const amcLink = page.getByRole('link', { name: /estrategia AMC/ });
    assert.equal(await amcLink.getAttribute('target'), '_blank', 'the AMC landing opens in a new tab so the form stays open');
    await pick(page, 'Quiero conocer primero las opciones');
    await pick(page, 'Grow');
    await page.getByLabel(/Qué fue lo que más te interesó/).fill('La integración de contenido y pauta.');
    await shot(page, '07-amc');
    await next(page);
    await page.getByRole('heading', { name: 'Presupuesto' }).waitFor();
    await page.getByRole('radio', { name: 'Sí', exact: true }).click();
    await page.getByLabel(/Cuál es el presupuesto/).fill('8.000.000');
    await pick(page, 'COP');
    await pick(page, 'Presupuesto mensual');
    await page.locator('[data-question="budget.adsIncluded"]').getByRole('radio', { name: 'No', exact: true }).click();
    await page.getByLabel(/presupuesto adicional/).fill('2000000');
    await shot(page, '08-presupuesto');
    await next(page);
    await page.getByRole('heading', { name: 'Momento de contratación' }).waitFor();
    await pick(page, 'El proyecto ya está aprobado internamente');
    await page.getByRole('radio', { name: 'Sí', exact: true }).click();
    await page.getByLabel(/Quiénes participan/).fill('Gerencia general');
    await pick(page, 'En los próximos 3 días hábiles');
    await next(page);
    await page.getByRole('heading', { name: /Cómo llegaste/ }).waitFor();
    await pick(page, 'LinkedIn');
    await page.getByRole('radio', { name: 'No', exact: true }).click();
    await page.getByLabel(/algo más/).fill('Nos gustó el trabajo con Bonsai.');
    await shot(page, '09-origen');
    await next(page);

    await page.locator('[data-request-thanks]').waitFor();
    await page.getByText('Referencia de tu solicitud').waitFor();
    await shot(page, '10-gracias');

    // The double received the real CRM mapping.
    const received = await page.evaluate(async () => (await fetch('/api/public/commercial-request/received')).json());
    assert.equal(received.length, 1);
    const { lead, request } = received[0];
    assert.equal(lead.company, 'HDI Seguros');
    assert.equal(lead.origin, 'LINKEDIN');
    assert.equal(lead.priority, 'ALTA');
    assert.equal(lead.quotedValue, 8000000);
    assert.equal(lead.serviceInterest, 'Marketing + Producción audiovisual + Web');
    assert.deepEqual(request.suggestedItems.map(item => item.name), [
      'Marketing Básico – 8 contenidos', 'Edición de reel', 'Sesión fotográfica de 2 horas', 'Drone', 'Landing page', 'Integración de WhatsApp en sitio web'
    ]);
    assert.equal(request.answers['amc.plan'], 'GROW');
    assert.deepEqual(errors, []);
  } finally { await page.close(); }
});

test('mobile dark: the form fits the screen and "no estoy seguro" collapses the service questions', async () => {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  page.setDefaultTimeout(8000);
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  try {
    await page.goto(`${preview.origin}/solicitud?dark`);
    await page.getByRole('button', { name: 'Comenzar' }).click();
    await page.getByLabel('Nombre y apellido').fill('Ana Ruiz');
    await page.getByLabel(/Empresa/).fill('Ana Ruiz Estética');
    await page.getByLabel('Correo electrónico').fill('ana@ruiz.test');
    await page.getByLabel(/WhatsApp/).fill('3001234567');
    await page.getByLabel('Ciudad y país').fill('Cartagena, Colombia');
    await next(page);
    await page.getByLabel(/Qué proyecto/).fill('Quiero vender más por Instagram pero no sé por dónde empezar.');
    await pick(page, 'Aún no está definida');
    await pick(page, 'Aún no lo tengo definido');
    await next(page);
    await pick(page, 'No estoy seguro / necesito asesoría');
    await page.getByText('Paso 3 de 9').waitFor();
    await shot(page, 'mobile-dark-servicios');
    await next(page);
    await page.getByRole('heading', { name: 'Necesito asesoría' }).waitFor();
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, 'no horizontal scroll on a phone');
    await shot(page, 'mobile-dark-asesoria');
    assert.deepEqual(errors, []);
  } finally { await page.close(); }
});
