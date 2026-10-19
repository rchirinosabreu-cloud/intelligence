import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { createServer } from 'vite';
import { chromium } from 'playwright-core';

const out = 'output/publicadas-sin-revision';
await mkdir(out, { recursive: true });
const server = await createServer({ logLevel: 'error', server: { host: '127.0.0.1', port: 0, open: false } });
await server.listen();
const browser = await chromium.launch({ channel: 'chrome' });
try {
  for (const [name, width, dark] of [['desktop', 1600, false], ['dark', 1600, true], ['mobile', 390, false]]) {
    const page = await browser.newPage({ viewport: { width, height: 1100 } });
    // Las vistas previas de archivos y la sesión no necesitan un backend para este recorrido.
    await page.route('**/api/**', route => route.fulfill({ status: 404, body: '' }));
    const base = `http://127.0.0.1:${server.httpServer.address().port}`;
    await page.goto(`${base}/tests/fixtures/plan-editor-preview.html?publicada=1`, { waitUntil: 'networkidle' });
    await page.evaluate(mode => document.documentElement.classList.toggle('dark', mode), dark);
    await page.evaluate(() => document.fonts.ready);
    const card = page.locator('#item-i1');
    await card.waitFor();
    for (const editing of [false, true]) {
      if (editing) await card.getByRole('button', { name: 'Editar', exact: true }).click();
      assert.equal(await card.getByRole('button', { name: 'Pedir nueva revisión', exact: true }).count(), 0, 'Una publicada no ofrece otra revisión');
      assert.equal(await card.getByText('El cliente la tiene por revisar', { exact: true }).count(), 0, 'Una marca antigua no la vuelve pendiente');
    }
    await card.scrollIntoViewIfNeeded();
    await page.locator('header.fixed').evaluate(node => { node.style.visibility = 'hidden'; });
    await card.screenshot({ path: `${out}/editor-${name}.png` });
    await page.goto(`${base}/tests/fixtures/client-portal-preview.html?publicada=1`, { waitUntil: 'networkidle' });
    await page.evaluate(mode => document.documentElement.classList.toggle('dark', mode), dark);
    await page.getByText('ENDOVA, un espacio preparado para recibirte', { exact: true }).first().click();
    await page.getByText('Pieza publicada', { exact: true }).waitFor();
    assert.equal(await page.getByRole('button', { name: /Aprobar|pedir un cambio/i }).count(), 0, 'El portal no devuelve una publicada al circuito de aprobación');
    assert.equal(await page.locator('textarea').count(), 0);
    assert.equal(await page.getByText('Ya pasó a producción.', { exact: true }).count(), 0);
    await page.screenshot({ path: `${out}/portal-${name}.png`, fullPage: true });
    console.log(`${name}: pieza publicada cerrada en el editor y en el portal.`);
    await page.close();
  }
} finally {
  await browser.close();
  await server.close();
}
