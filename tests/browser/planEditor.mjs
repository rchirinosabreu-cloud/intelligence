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
        // Rodny, 24 de septiembre de 2026: los puntos que marcaban «sin pieza final» se quitaron.
        // A principio de mes ninguna pieza tiene material, así que se encendían en todas y no decían nada.
        missingDots: nav.querySelectorAll('[title="Sin pieza final"]').length,
        editors: document.querySelectorAll('[id^="item-"]').length
      };
    });
    // Rodny, 25 de septiembre de 2026: «copiar link, deja eso en una sola línea».
    const share = await page.evaluate(() => {
      const button = [...document.querySelectorAll('button')].find(b => b.textContent.trim() === 'Copiar link');
      if (!button) return null;
      const line = parseFloat(getComputedStyle(button).lineHeight) || 16;
      return { height: button.getBoundingClientRect().height, line, rotate: document.body.textContent.includes('Generar un enlace nuevo') };
    });
    assert.ok(share, 'con enlace creado el botón dice «Copiar link»');
    assert.ok(share.height < share.line * 2, `y cabe en una línea (alto ${Math.round(share.height)}px)`);
    assert.equal(share.rotate, false, 'ya no se ofrece romper el enlace del cliente');

    assert.equal(rail.rows, 8, 'las ocho piezas del mes caben en el carril');
    assert.equal(rail.selected, 1, 'solo una pieza abierta a la vez');
    assert.equal(rail.missingDots, 0, 'el carril no lleva puntos de aviso');
    assert.equal(rail.editors, 1, 'se dibuja un solo editor, no uno por pieza');

    await page.screenshot({ path: `output/editor-carril-${name}.png`, fullPage: true });

    // 2. En edición: cada campo dice a quién pertenece, y la vista del cliente está al lado.
    await page.evaluate(() => {
      const edit = [...document.querySelectorAll('button')].find(b => b.textContent.trim() === 'Editar');
      edit.click();
    });
    await page.waitForFunction(() => document.body.textContent.includes('Lo ve el cliente'));
    await page.evaluate(() => document.fonts.ready);

    const editing = await page.evaluate(() => {
      const text = document.body.textContent;
      return {
        internal: text.includes('Solo el equipo'),
        visible: text.includes('Lo ve el cliente'),
        renamed: text.includes('Texto de la publicación') && !text.includes('Caption (Post)'),
        // Rodny pidió quitar la mirilla del cliente: las etiquetas de cada campo ya dicen qué sale.
        glance: text.includes('Vista del cliente')
      };
    });

    assert.equal(editing.internal, true, 'el guion se marca como interno');
    assert.equal(editing.visible, true, 'el texto de publicación se marca como visible para el cliente');
    assert.equal(editing.renamed, true, '«Caption (Post)» pasa a llamarse por lo que es');
    assert.equal(editing.glance, false, 'la vista del cliente ya no está dentro del editor');

    await page.screenshot({ path: `output/editor-edicion-${name}.png`, fullPage: true });

    // 3. Cambiar de pieza en el carril abre esa, no añade otra debajo.
    await page.evaluate(() => {
      const nav = document.querySelector('nav[aria-label="Piezas de la parrilla"]');
      [...nav.querySelectorAll('button')].find(b => b.textContent.includes('Conoce al equipo')).click();
    });
    await page.waitForFunction(() => document.body.textContent.includes('Conoce al equipo de hemodinamia'));
    const afterSwitch = await page.evaluate(() => document.querySelectorAll('[id^="item-"]').length);
    assert.equal(afterSwitch, 1, 'sigue habiendo un solo editor tras cambiar de pieza');

    // Rodny, 25 de septiembre de 2026: «al abrir parrilla desde gestión debería viajar directo hacia
    // el pendiente en cuestión, parece que se desincronizó». Pasaba porque convivían dos fuentes —un
    // estado local y el `?item=` del enlace— y ganaba el estado. Lo que se vigila aquí es que la pieza
    // abierta la mande **la URL**: con una sola fuente, un enlace nuevo no puede perder.
    const urlTrasElegir = await page.evaluate(() => document.querySelector('[data-preview-location]')?.dataset.previewLocation);
    assert.match(urlTrasElegir || '', /item=i3/, `elegir en el carril cambia la URL (${urlTrasElegir})`);

    const abiertaPorLaUrl = await page.evaluate(() => document.querySelector('[id^="item-"]')?.id);
    assert.equal(abiertaPorLaUrl, 'item-i3', 'y la pieza abierta es la que nombra la URL');

    // 4. El calendario: el mismo mes, visto por días.
    await page.evaluate(() => [...document.querySelectorAll('button')].find(b => b.textContent.trim() === 'Calendario').click());
    await page.waitForFunction(() => document.body.textContent.includes('Sin fecha todavía'));
    await page.evaluate(() => document.fonts.ready);

    const calendar = await page.evaluate(() => ({
      // Septiembre de 2026 empieza en martes: la rejilla arranca el lunes 31 de agosto.
      firstCell: document.body.textContent.includes('LUN'),
      editors: document.querySelectorAll('[id^="item-"]').length,
      undated: document.body.textContent.includes('Todas las piezas tienen día'),
      pressed: [...document.querySelectorAll('[aria-pressed="true"]')].map(b => b.textContent.trim())
    }));
    assert.deepEqual(calendar.pressed, ['Calendario'], 'el selector marca la vista que se está mirando');
    assert.equal(calendar.firstCell, true, 'la semana empieza en lunes');
    assert.equal(calendar.editors, 0, 'el calendario sustituye al editor, no se apila debajo');
    assert.equal(calendar.undated, true, 'la muestra tiene todas las piezas con día');

    await page.screenshot({ path: `output/editor-calendario-${name}.png`, fullPage: true });

    // Tocar una pieza del calendario la abre en el editor.
    await page.evaluate(() => {
      const chip = [...document.querySelectorAll('button')].find(b => b.textContent.includes('Agenda tu cita'));
      chip.click();
    });
    await page.waitForFunction(() => document.querySelectorAll('[id^="item-"]').length === 1);

    await page.close();
  }

  // Rodny, 25 de septiembre de 2026: «yo quiero que mi pantalla quede en ese contenido, que lo deje
  // en frente de mí». Abrir la parrilla desde Gestión llevaba a la pieza correcta, pero la página se
  // quedaba arriba y la tarjeta caía muy por debajo, tapada por objetivos, Bria y notas internas.
  for (const [etiqueta, query, debeMoverse] of [
    ['con la pieza en el enlace', '?ruta=plan&item=i5', true],
    ['sin pieza en el enlace', '?ruta=plan', false]
  ]) {
    const page = await browser.newPage({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 2 });
    await page.goto(`http://127.0.0.1:${port}${PAGE}${query}`, { waitUntil: 'networkidle' });
    await page.waitForFunction(() => document.querySelector('[id^="item-"]'));
    await page.waitForTimeout(2200); // el desplazamiento es suave

    const sitio = await page.evaluate(() => {
      const card = document.querySelector('[id^="item-"]');
      const rect = card.getBoundingClientRect();
      return { id: card.id, top: Math.round(rect.top), alto: window.innerHeight, scrollY: Math.round(window.scrollY) };
    });

    if (debeMoverse) {
      assert.equal(sitio.id, 'item-i5', 'abre la pieza que nombra el enlace');
      assert.ok(
        sitio.top >= 0 && sitio.top < sitio.alto,
        `${etiqueta}: la deja delante (top ${sitio.top}px de ${sitio.alto}px)`
      );
      await page.screenshot({ path: 'output/editor-enlace-directo.png' });
    } else {
      // Abrir la parrilla sin pieza concreta no puede dar un tirón a quien solo venía a mirar.
      assert.equal(sitio.scrollY, 0, `${etiqueta}: no se toca el scroll`);
    }

    await page.close();
  }

  console.log('[Editor de parrilla] Carril, edición y enlace directo verificados. Capturas en output/editor-*.png');
} finally {
  await browser?.close();
  await server.close();
}
