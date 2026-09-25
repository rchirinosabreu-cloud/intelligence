// Recorrido real del editor de parrilla con el mes en un carril (Rodny, 24 de septiembre de 2026).
// Monta el componente de verdad contra una API en memoria: el mes entero se ve sin bajar, se edita
// una pieza a la vez, y cada campo dice si lo ve el cliente o solo el equipo.
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

  for (const [name, width, height, dark] of [
    ['desktop', 1600, 1100, false],
    ['desktop-dark', 1600, 1100, true],
    ['mobile', 390, 844, false]
  ]) {
    const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 2 });
    await page.goto(`http://127.0.0.1:${port}${PAGE}`, { waitUntil: 'networkidle' });
    if (dark) await page.evaluate(() => document.documentElement.classList.add('dark'));
    await page.evaluate(() => document.fonts.ready);
    await page.waitForFunction(() => document.querySelector('nav[aria-label="Piezas de la parrilla"]'));

    // 1. El mes entero en el carril, y una sola pieza abierta.
    const rail = await page.evaluate(() => {
      const nav = document.querySelector('nav[aria-label="Piezas de la parrilla"]');
      const rows = [...nav.querySelectorAll('button[aria-current], button:not([aria-current])')]
        .filter(b => !b.textContent.includes('Nueva pieza'));
      return {
        rows: rows.length,
        selected: nav.querySelectorAll('[aria-current="true"]').length,
        missingDots: nav.querySelectorAll('[title="Sin pieza final"]').length,
        editors: document.querySelectorAll('[id^="item-"]').length
      };
    });
    assert.equal(rail.rows, 8, 'las ocho piezas del mes caben en el carril');
    assert.equal(rail.selected, 1, 'solo una pieza abierta a la vez');
    // Cinco de las ocho de la muestra no tienen pieza final todavía.
    assert.equal(rail.missingDots, 5, 'las piezas sin pieza final se marcan');
    assert.equal(rail.editors, 1, 'se dibuja un solo editor, no uno por pieza');

    await page.screenshot({ path: `output/editor-carril-${name}.png`, fullPage: true });

    // 2. En edición: cada campo dice a quién pertenece, y la vista del cliente está al lado.
    await page.evaluate(() => {
      const edit = [...document.querySelectorAll('button')].find(b => b.textContent.trim() === 'Editar');
      edit.click();
    });
    await page.waitForFunction(() => document.body.textContent.includes('Esto es lo que ve el cliente'));
    await page.evaluate(() => document.fonts.ready);

    const editing = await page.evaluate(() => {
      const text = document.body.textContent;
      return {
        internal: text.includes('Solo el equipo'),
        visible: text.includes('Esto es lo que ve el cliente'),
        renamed: text.includes('Texto de la publicación') && !text.includes('Caption (Post)'),
        glance: text.includes('Vista del cliente'),
        // La vista del cliente muestra el texto de publicación, nunca el guion.
        glanceHasScript: [...document.querySelectorAll('*')]
          .some(n => n.children.length === 0 && n.textContent.includes('ESCENA 1') && n.closest('.line-clamp-4'))
      };
    });

    assert.equal(editing.internal, true, 'el guion se marca como interno');
    assert.equal(editing.visible, true, 'el texto de publicación se marca como visible para el cliente');
    assert.equal(editing.renamed, true, '«Caption (Post)» pasa a llamarse por lo que es');
    assert.equal(editing.glance, true, 'la vista del cliente se mira sin salir del editor');
    assert.equal(editing.glanceHasScript, false, 'la vista del cliente nunca muestra el guion');

    await page.screenshot({ path: `output/editor-edicion-${name}.png`, fullPage: true });

    // 3. Cambiar de pieza en el carril abre esa, no añade otra debajo.
    await page.evaluate(() => {
      const nav = document.querySelector('nav[aria-label="Piezas de la parrilla"]');
      [...nav.querySelectorAll('button')].find(b => b.textContent.includes('Conoce al equipo')).click();
    });
    await page.waitForFunction(() => document.body.textContent.includes('Conoce al equipo de hemodinamia'));
    const afterSwitch = await page.evaluate(() => document.querySelectorAll('[id^="item-"]').length);
    assert.equal(afterSwitch, 1, 'sigue habiendo un solo editor tras cambiar de pieza');

    await page.close();
  }

  console.log('[Editor de parrilla] Carril y edición verificados. Capturas en output/editor-*.png');
} finally {
  await browser?.close();
  await server.close();
}
