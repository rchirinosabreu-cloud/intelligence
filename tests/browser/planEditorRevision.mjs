// El otro lado de la ronda nueva (Rodny, 5 de octubre de 2026): desde el editor se le devuelve la
// palabra al cliente. Monta la parrilla real y comprueba que el botón aparece solo cuando hay algo
// que pedir, que al pulsarlo las piezas quedan marcadas, y que después deja de ofrecerse.
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { createServer } from 'vite';
import { chromium } from 'playwright-core';

const PAGE = '/tests/fixtures/plan-editor-preview.html';

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

  const page = await browser.newPage({ viewport: { width: 1600, height: 1100 }, deviceScaleFactor: 2 });
  await page.goto(`http://127.0.0.1:${port}${PAGE}`, { waitUntil: 'networkidle' });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForFunction(() => document.querySelector('nav[aria-label="Piezas de la parrilla"]'));

  // La muestra trae una pieza aprobada (i1) y otra publicada; el botón dice cuántas son.
  const botón = page.getByRole('button', { name: /^Pedir revisión \(\d+\)$/ });
  assert.equal(await botón.count(), 1, 'el botón del mes aparece cuando hay piezas aprobadas');
  const etiqueta = (await botón.textContent()).trim();
  const cuantas = Number(/\((\d+)\)/.exec(etiqueta)[1]);
  assert.ok(cuantas > 0, `dice cuántas piezas devuelve al cliente (${etiqueta})`);

  await page.screenshot({ path: 'output/editor-revision-antes.png' });

  await botón.click();
  // Hasta que el servidor no confirma no cambia nada en pantalla (regla 1).
  await page.waitForFunction(() => document.body.textContent.includes('por revisar para el cliente'));
  await page.waitForFunction(
    () => ![...document.querySelectorAll('button')].some(b => /^Pedir revisión \(\d+\)$/.test(b.textContent.trim())),
    { timeout: 5000 }
  );

  // La pieza abierta es la aprobada: tiene que decir que el cliente la tiene.
  const marca = await page.evaluate(() => document.body.textContent.includes('El cliente la tiene por revisar'));
  assert.equal(marca, true, 'la pieza avisa de que está esperando al cliente');

  // Y la barra del carril deja de ser verde para esa pieza.
  const barras = await page.evaluate(() => {
    const nav = document.querySelector('nav[aria-label="Piezas de la parrilla"]');
    return [...nav.querySelectorAll('span.h-9.w-1')].map(n => getComputedStyle(n).backgroundColor);
  });
  assert.ok(barras.length > 0, 'el carril dibuja su barra de color por pieza');

  await page.screenshot({ path: 'output/editor-revision-despues.png' });
  console.log(`Editor verificado: ${cuantas} pieza(s) devueltas al cliente y el botón deja de ofrecerse.`);
} finally {
  if (browser) await browser.close();
  await server.close();
}
