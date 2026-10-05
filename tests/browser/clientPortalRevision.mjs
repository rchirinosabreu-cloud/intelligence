// Rodny, 5 de octubre de 2026: «la aprobó cuando solo eran los copies, no cuando la vio». Este
// recorrido monta el portal real y comprueba las dos salidas que antes no existían: una pieza con
// material nuevo vuelve a ofrecer aprobar y pedir un cambio, y una pieza cerrada deja igualmente
// hablar al cliente en vez de dejarlo mirando «ya pasó a producción».
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { createServer } from 'vite';
import { chromium } from 'playwright-core';

const PAGE = '/tests/fixtures/client-portal-preview.html';

const server = await createServer({ logLevel: 'error', server: { host: '127.0.0.1', port: 0, open: false } });
let browser;

try {
  await server.listen();
  await mkdir('output', { recursive: true });
  const port = server.httpServer.address().port;
  browser = await chromium.launch({
    executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    headless: true
  });

  for (const [name, width, height, dark] of [
    ['desktop', 1500, 1000, false],
    ['desktop-dark', 1500, 1000, true],
    ['mobile', 390, 844, false]
  ]) {
    const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 2 });
    await page.goto(`http://127.0.0.1:${port}${PAGE}`, { waitUntil: 'networkidle' });
    if (dark) await page.evaluate(() => document.documentElement.classList.add('dark'));
    await page.evaluate(() => document.fonts.ready);
    await page.waitForFunction(() => document.body.textContent.includes('Qué llevar'));

    // 1. En el mosaico, la pieza con material nuevo no se cuenta como aprobada.
    const mosaico = await page.evaluate(() => ({
      materialNuevo: (document.body.textContent.match(/Material nuevo/g) || []).length,
      aprobadas: (document.body.textContent.match(/\bAprobada\b/g) || []).length
    }));
    assert.equal(mosaico.materialNuevo, 1, `${name}: la pieza con material nuevo se distingue en el mosaico`);
    assert.equal(mosaico.aprobadas, 1, `${name}: y la que sí está cerrada sigue diciendo «Aprobada»`);

    await page.screenshot({ path: `output/portal-revision-mosaico-${name}.png`, fullPage: false });

    // 2. La pieza con material nuevo: explica por qué y devuelve los dos botones.
    await page.getByText('Qué llevar el día de tu consulta').first().click();
    await page.waitForFunction(() => document.body.textContent.includes('Ya está la pieza terminada'));

    const detalle = await page.evaluate(() => {
      const textos = [...document.querySelectorAll('button')].map(b => b.textContent.trim());
      return {
        aviso: document.body.textContent.includes('Habías aprobado el texto'),
        aprobar: textos.some(t => t === 'Aprobar la pieza'),
        cambio: textos.some(t => t === 'Pedir un cambio'),
        // El callejón sin salida de antes.
        produccion: document.body.textContent.includes('Ya pasó a producción')
      };
    });
    assert.equal(detalle.aviso, true, `${name}: se explica que antes aprobó solo el texto`);
    assert.equal(detalle.aprobar, true, `${name}: puede aprobar la pieza`);
    assert.equal(detalle.cambio, true, `${name}: y puede pedir un cambio`);
    assert.equal(detalle.produccion, false, `${name}: ya no se le dice que está cerrada`);

    await page.screenshot({ path: `output/portal-revision-detalle-${name}.png`, fullPage: false });

    // 3. Una pieza de verdad cerrada tampoco deja al cliente sin salida.
    await page.getByRole('button', { name: 'Todas las piezas' }).click();
    await page.getByText('ENDOVA, un espacio preparado').first().click();
    await page.waitForFunction(() => document.body.textContent.includes('Ya pasó a producción'));

    const cerrada = await page.evaluate(() => {
      const salida = [...document.querySelectorAll('button')]
        .find(b => b.textContent.includes('¿Quieres pedir un cambio?'));
      if (!salida) return null;
      const caja = salida.getBoundingClientRect();
      return { visible: caja.width > 0 && caja.height > 0, alto: Math.round(caja.height) };
    });
    assert.ok(cerrada?.visible, `${name}: una pieza aprobada conserva la salida para pedir un cambio`);

    // Y al pulsarla se abre el formulario, no es un adorno.
    await page.getByRole('button', { name: '¿Quieres pedir un cambio?' }).click();
    await page.waitForSelector('textarea');
    assert.ok(await page.locator('textarea').isVisible(), `${name}: la salida abre el formulario`);

    await page.screenshot({ path: `output/portal-revision-aprobada-${name}.png`, fullPage: false });
    console.log(`${name}: material nuevo con sus dos botones, y una pieza cerrada que aún deja hablar.`);
    await page.close();
  }

  console.log('Portal verificado. Capturas en output/portal-revision-*.png');
} finally {
  if (browser) await browser.close();
  await server.close();
}
