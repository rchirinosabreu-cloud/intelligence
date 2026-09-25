// Recorrido real del portal del cliente rediseñado (Rodny, 24 de septiembre de 2026).
// Monta el componente de verdad contra una API en memoria y comprueba lo que el rediseño promete:
// el mes entero se ve de un golpe, la pieza manda sobre el texto, y **el guion no aparece por ningún
// lado**. Sin backend, sin base de datos.
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { createServer } from 'vite';
import { chromium } from 'playwright-core';

const PAGE = '/tests/fixtures/client-portal-preview.html';
// Una frase del guion de ENDOVA: si apareciera en el portal, el rediseño no habría servido de nada.
const SCRIPT_LINE = 'ESCENA 1';

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
    ['desktop', 1440, 1000, false],
    ['desktop-dark', 1440, 1000, true],
    ['mobile', 390, 844, false]
  ]) {
    const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 2 });
    await page.goto(`http://127.0.0.1:${port}${PAGE}`, { waitUntil: 'networkidle' });
    if (dark) await page.evaluate(() => document.documentElement.classList.add('dark'));
    await page.evaluate(() => document.fonts.ready);
    await page.waitForFunction(() => document.body.textContent.includes('Revisión de contenidos'));

    // 1. El índice: el mes entero, con su avance.
    const index = await page.evaluate(() => ({
      cards: document.querySelectorAll('main button[class*="group"]').length,
      approved: document.body.textContent.includes('3 aprobadas'),
      script: document.body.textContent.includes('ESCENA 1')
    }));
    assert.equal(index.cards, 8, 'las ocho piezas del mes caben en el mosaico');
    assert.equal(index.approved, true, 'la cabecera dice cuánto lleva aprobado');
    assert.equal(index.script, false, 'el guion no está en el índice');

    await page.screenshot({ path: `output/portal-indice-${name}.png`, fullPage: true });

    // 2. El detalle: la pieza por encima del texto.
    await page.evaluate(() => {
      const card = [...document.querySelectorAll('main button')].find(b => b.textContent.includes('ENDOVA, un espacio'));
      card.click();
    });
    await page.waitForFunction(() => document.body.textContent.includes('Texto de la publicación'));
    await page.evaluate(() => document.fonts.ready);

    const detail = await page.evaluate(() => {
      const text = document.body.textContent;
      const find = (needle) => [...document.querySelectorAll('*')]
        .filter(node => node.children.length === 0 && node.textContent.trim().startsWith(needle))[0];
      const piece = document.querySelector('main img, main video, main iframe');
      const caption = find('Texto de la publicación');
      return {
        script: text.includes('ESCENA 1'),
        pieceTop: piece ? Math.round(piece.getBoundingClientRect().top + window.scrollY) : -1,
        captionTop: caption ? Math.round(caption.getBoundingClientRect().top + window.scrollY) : -1,
        counter: /Pieza 1 de 8/.test(text),
        hashtagsSplit: text.includes('#ENDOVA'),
        history: text.includes('Lo que pediste antes')
      };
    });

    assert.equal(detail.script, false, `el guion tampoco está en el detalle (${SCRIPT_LINE})`);
    assert.ok(detail.pieceTop >= 0 && detail.captionTop >= 0, 'se dibujan la pieza y el texto');
    if (width >= 1024) {
      assert.ok(
        detail.pieceTop <= detail.captionTop,
        `la pieza va antes que el texto (pieza ${detail.pieceTop}px, texto ${detail.captionTop}px)`
      );
    }
    assert.equal(detail.counter, true, 'el detalle dice en qué pieza va');
    assert.equal(detail.hashtagsSplit, true, 'las etiquetas se conservan');
    assert.equal(detail.history, true, 'el historial de lo que pidió el cliente sigue ahí');

    await page.screenshot({ path: `output/portal-detalle-${name}.png`, fullPage: true });
    await page.close();
  }

  console.log('[Portal del cliente] Índice y detalle verificados. Capturas en output/portal-*.png');
} finally {
  await browser?.close();
  await server.close();
}
