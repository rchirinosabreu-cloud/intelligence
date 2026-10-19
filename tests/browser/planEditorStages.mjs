// Distribución elegida por Rodny: escritura → recursos → nota → entrega → publicación.
// Se comprueba la posición real del editor, también al editar y en móvil/oscuro.
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { createServer } from 'vite';
import { chromium } from 'playwright-core';

const out = 'output/parrilla-por-etapas';
await mkdir(out, { recursive: true });
const server = await createServer({ logLevel: 'error', server: { host: '127.0.0.1', port: 0, open: false } });
await server.listen();
const browser = await chromium.launch({ channel: 'chrome' });
try {
  for (const [name, width, dark] of [['desktop', 1600, false], ['dark', 1600, true], ['tablet', 1024, false], ['mobile', 390, false], ['mobile-dark', 390, true], ['mobile-small', 320, false]]) {
    const page = await browser.newPage({ viewport: { width, height: 1100 }, colorScheme: dark ? 'dark' : 'light' });
    await page.route('**/api/content/items/*/cover?*', route => route.fulfill({
      contentType: 'image/png',
      body: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=', 'base64')
    }));
    await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/tests/fixtures/plan-editor-preview.html`, { waitUntil: 'networkidle' });
    await page.evaluate(mode => document.documentElement.classList.toggle('dark', mode), dark);
    await page.evaluate(() => document.fonts.ready);
    const card = page.locator('#item-i1');
    const refs = card.getByText('Referencias', { exact: true }).locator('..');
    const inputs = card.getByText('Insumos', { exact: true }).locator('..');
    const piece = card.getByText('Pieza final', { exact: true }).locator('..');
    const cover = card.locator('[data-piece-cover]');
    for (const editing of [false, true]) {
      if (editing) await card.getByRole('button', { name: 'Editar', exact: true }).click();
      const box = async locator => locator.evaluate(node => {
        const r = node.getBoundingClientRect();
        return { x: r.x, y: r.y, right: r.right, bottom: r.bottom, width: r.width };
      });
      const scriptBox = await box(card.locator('#guion-i1'));
      const captionBox = await box(card.locator('#texto-i1'));
      const refBox = await box(refs);
      const inputBox = await box(inputs);
      const noteBox = await box(card.locator('label[for="nota-i1"]').locator('..'));
      const pieceBox = await box(piece);
      const coverBox = await box(cover);
      console.log(JSON.stringify({ name, editing, scriptBox, captionBox, refBox, inputBox, noteBox, pieceBox, coverBox }));
      assert.ok(refBox.y >= Math.max(scriptBox.bottom, captionBox.bottom), 'Referencias va después de ambos textos');
      assert.ok(inputBox.y >= Math.max(scriptBox.bottom, captionBox.bottom), 'Insumos va después de ambos textos');
      assert.ok(noteBox.y >= Math.max(refBox.bottom, inputBox.bottom), 'La nota va después de los recursos');
      assert.ok(pieceBox.y >= noteBox.bottom, 'La pieza final va después de la nota');
      if (width > 1000) {
        assert.ok(Math.abs(refBox.y - inputBox.y) < 2, 'Los recursos comparten fila');
        assert.ok(coverBox.x >= pieceBox.right, 'La portada va junto a la pieza final');
        assert.ok(Math.abs(coverBox.y - pieceBox.y) < 2, 'Pieza y portada se alinean por arriba');
      } else {
        assert.ok(coverBox.y >= pieceBox.bottom, 'En móvil la portada baja después de la pieza');
      }
      assert.ok((await cover.textContent()).includes('Opcional'), 'La portada se identifica como opcional');
      assert.equal(await card.getByText('Video final', { exact: true }).count(), 0);
      const overflow = await card.evaluate(node => ({ width: node.clientWidth, scroll: node.scrollWidth }));
      assert.ok(overflow.scroll <= overflow.width + 1, 'La ficha no tiene desplazamiento horizontal');
      // El header fijo de la muestra no debe tapar la parte superior de la captura del elemento.
      await page.locator('header.fixed').evaluate(node => { node.style.visibility = 'hidden'; });
      await card.screenshot({ path: `${out}/${name}-${editing ? 'edicion' : 'lectura'}.png` });
      await page.locator('header.fixed').evaluate(node => { node.style.visibility = ''; });
    }
    // Los enlaces siguen editándose en su nueva ubicación, sin alterar el guardado.
    await refs.getByRole('button', { name: 'Añadir enlace', exact: true }).click();
    await refs.locator('input').last().fill('https://example.com/referencia');
    await inputs.getByRole('button', { name: 'Añadir enlace', exact: true }).click();
    await inputs.locator('input').last().fill('https://example.com/insumo');
    const editingOverflow = await card.evaluate(node => ({ width: node.clientWidth, scroll: node.scrollWidth }));
    assert.ok(editingOverflow.scroll <= editingOverflow.width + 1, 'Los enlaces editables no ensanchan la ficha');
    await card.getByRole('button', { name: 'Guardar', exact: true }).click();
    await refs.locator('a[href="https://example.com/referencia"]').waitFor();
    await inputs.locator('a[href="https://example.com/insumo"]').waitFor();
    await page.close();
  }
} finally {
  await browser.close();
  await server.close();
}
console.log('Distribución por etapas y edición de recursos verificadas en escritorio, móvil y ambos temas.');
