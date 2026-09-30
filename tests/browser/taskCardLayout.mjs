// Recorrido real de la tarjeta del Kanban (Rodny, 30 de septiembre de 2026): «me gustaría que
// respire más… el cliente colócalo arriba del título». Monta el tablero de verdad contra una API
// en memoria y **mide** la tarjeta: que el cliente esté por encima del título, que su nombre no se
// recorte como antes, y que el cuerpo tenga el relleno y la separación nuevos.
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { createServer } from 'vite';
import { chromium } from 'playwright-core';

const PAGE = '/tests/fixtures/task-privacy-preview.html?viewer=jefe';

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
    await page.waitForFunction(() => document.querySelector('[data-task-client]'));

    const medida = await page.evaluate(() => {
      const card = document.querySelector('[id^="task-"]');
      const cliente = card.querySelector('[data-task-client]');
      // El nombre es el hijo directo; dentro del avatar hay más spans.
      const nombre = cliente.querySelector(':scope > span');
      const titulo = card.querySelector('h4');
      const cuerpo = card.querySelector('.rounded-2xl > div');
      const pie = card.querySelector('.border-t');
      return {
        clienteTop: cliente.getBoundingClientRect().top,
        tituloTop: titulo.getBoundingClientRect().top,
        // El nombre se recortaba a «Promo Gro…» cuando compartía el pie con categoría y complejidad.
        nombreRecortado: nombre.scrollWidth > nombre.clientWidth + 1,
        nombreAncho: Math.round(nombre.getBoundingClientRect().width),
        relleno: getComputedStyle(cuerpo).paddingTop,
        separacion: getComputedStyle(cuerpo).rowGap,
        pieArriba: getComputedStyle(pie).paddingTop,
        // El cliente aparece una sola vez: el del pie se quitó, no se duplicó.
        clientes: card.querySelectorAll('[data-task-client]').length,
        // Sin distintivos de estado no debe quedar una fila vacía sobre el cliente.
        cuerpoTop: cuerpo.getBoundingClientRect().top
      };
    });

    assert.ok(medida.clienteTop < medida.tituloTop, `${name}: el cliente va encima del título`);
    assert.equal(medida.clientes, 1, `${name}: el cliente aparece una sola vez`);
    assert.equal(medida.nombreRecortado, false, `${name}: el nombre del cliente se lee entero (${medida.nombreAncho}px)`);
    assert.equal(medida.relleno, '20px', `${name}: el cuerpo respira (p-5)`);
    assert.equal(medida.separacion, '16px', `${name}: separación entre bloques (gap-4)`);
    assert.equal(medida.pieArriba, '16px', `${name}: el pie también respira (pt-4)`);
    // Sin fila de distintivos, el cliente arranca justo bajo el relleno del cuerpo.
    assert.ok(
      medida.clienteTop - medida.cuerpoTop < 24,
      `${name}: sin distintivos no queda un hueco encima del cliente (${Math.round(medida.clienteTop - medida.cuerpoTop)}px)`
    );

    const card = await page.locator('[id^="task-"]').first();
    await card.screenshot({ path: `output/task-card-${name}.png` });
    await page.screenshot({ path: `output/task-board-${name}.png`, fullPage: false });
    console.log(`${name}: cliente encima del título, nombre entero en ${medida.nombreAncho}px, relleno ${medida.relleno}, separación ${medida.separacion}`);
    await page.close();
  }

  console.log('Tarjeta del Kanban verificada. Capturas en output/task-card-*.png');
} finally {
  if (browser) await browser.close();
  await server.close();
}
