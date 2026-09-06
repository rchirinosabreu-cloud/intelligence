import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { createServer } from 'vite';
import { chromium } from 'playwright-core';
const server = await createServer({ logLevel: 'error', server: { host: '127.0.0.1', port: 0 } });
let browser;
try {
  await mkdir('output', { recursive: true }); await server.listen();
  browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
  for (const [name, width, height, dark] of [['desktop', 1366, 1000, false], ['mobile', 390, 844, false], ['dark', 390, 844, true], ['small', 320, 568, false]]) {
    const page = await browser.newPage({ viewport: { width, height }, reducedMotion: 'reduce' }); page.setDefaultTimeout(6000);
    let created = false, release, failure = true, discovering = false, edited = false;
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    const criterion = { id: 'suggested', text: 'Durante septiembre, usar un tono cercano y tratar a la audiencia de tú.', category: 'MARCA', scope: 'PLAN', status: 'PROPOSED', version: 1, canValidate: true, canDelete: true,
      history: [{ action: 'PROPOSE', actorName: 'Bria', version: 1, reason: 'La nota del equipo propone este tratamiento para septiembre; requiere validación.', at: '2026-09-06T12:00:00Z' }],
      provenance: { origin: 'BRIA', basis: 'EXPLICIT', generatedAt: '2026-09-06T12:00:00Z', conflicts: [], evidence: [
        { id: 'note', kind: 'INTERNAL_NOTE', quote: 'Para septiembre, usar tú y un tono cercano.', attribution: 'Nota del equipo; autor no registrado', period: '2026-09', author: null, eventDate: null, url: '/parrillas/plan' },
        { id: 'comment', kind: 'CLIENT_FEEDBACK', quote: 'Preferimos mensajes cercanos.', attribution: 'Registro de feedback; autor no verificado', period: '2026-09', author: null, eventDate: null, url: '/parrillas/plan?item=piece' }
      ] }
    };
    await page.route('**/api/**', async route => {
      const request = route.request();
      if (request.url().endsWith('/discovery')) return route.fulfill({ json: { state: discovering ? 'RUNNING' : created ? 'COMPLETED' : 'IDLE', result: { created: 1, sourceCount: 2 } } });
      if (request.method() === 'GET') return route.fulfill({ json: { canDiscover: true, canPropose: true, clientName: 'Cliente de ejemplo', criteria: created ? [{ ...criterion, text: edited ? 'Tratamiento de tú durante septiembre.' : criterion.text, version: edited ? 2 : 1 }] : [] } });
      if (request.url().endsWith('/discover')) {
        discovering = true;
        await new Promise(resolve => { release = resolve; });
        discovering = false;
        if (failure) return route.fulfill({ status: 502, json: { error: 'No se completó la búsqueda. Reintenta.' } });
        created = true; return route.fulfill({ json: { state: 'COMPLETED', result: { created: 1, sourceCount: 2 } } });
      }
      assert.ok(request.url().endsWith('/suggested/draft'));
      assert.deepEqual(request.postDataJSON(), { text: 'Tratamiento de tú durante septiembre.', category: 'MARCA', scope: 'PLAN', reason: 'Ajuste editorial de la responsable.', version: 1 });
      edited = true; return route.fulfill({ json: { ...criterion, version: 2 } });
    });
    await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/tests/fixtures/bria-criteria.html`);
    await page.evaluate(dark => document.documentElement.classList.toggle('dark', dark), dark);
    await page.getByRole('button', { name: 'Criterios del cliente', exact: true }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByRole('button', { name: 'Buscar aprendizajes', exact: true }).click();
    await page.waitForFunction(() => document.querySelector('[data-discovering="true"]'));
    assert.equal(await dialog.locator('article').count(), 0);
    release(); await dialog.getByRole('alert').waitFor();
    assert.equal(created, false); failure = false;
    await dialog.getByRole('button', { name: 'Buscar aprendizajes', exact: true }).click();
    await page.waitForFunction(() => document.querySelector('[data-discovering="true"]')); release();
    await dialog.getByText(criterion.text, { exact: true }).waitFor();
    await dialog.getByText('Propuesto por Bria', { exact: true }).waitFor();
    await dialog.getByText('Solo parrilla de origen', { exact: true }).waitFor();
    assert.equal(await dialog.getByRole('button', { name: 'Ver fuentes', exact: true }).count(), 0);
    assert.equal(await dialog.getByRole('button', { name: 'Historial', exact: true }).count(), 0);
    const detail = dialog.getByRole('button', { name: 'Ver detalle', exact: true });
    assert.equal(await detail.getAttribute('aria-expanded'), 'false');
    await detail.click();
    assert.equal(await dialog.getByRole('button', { name: 'Cerrar detalle', exact: true }).getAttribute('aria-expanded'), 'true');
    await dialog.getByText(criterion.provenance.evidence[0].quote, { exact: true }).waitFor();
    await dialog.getByText('Fecha del comentario no registrada', { exact: false }).first().waitFor();
    const history = dialog.locator('summary').filter({ hasText: 'Historial' });
    await history.waitFor();
    assert.equal(await dialog.getByText('Propuesta · Bria · v1', { exact: true }).isVisible(), false);
    assert.ok((await history.boundingBox()).y > (await dialog.getByText(criterion.provenance.evidence[0].quote, { exact: true }).boundingBox()).y);
    await history.click();
    await dialog.getByText('Propuesta · Bria · v1', { exact: true }).waitFor();
    await history.click();
    assert.ok(await dialog.evaluate(e => e.scrollWidth <= e.clientWidth + 1));
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({ path: `output/bria-discovery-${name}.png`, fullPage: true });
    await dialog.getByRole('button', { name: 'Más opciones', exact: true }).click();
    await page.getByRole('menuitem', { name: 'Ajustar', exact: true }).click();
    await dialog.getByRole('textbox', { name: 'Criterio', exact: true }).fill('Tratamiento de tú durante septiembre.');
    await dialog.getByLabel('Motivo del ajuste', { exact: true }).fill('Ajuste editorial de la responsable.');
    await dialog.getByRole('button', { name: 'Guardar ajuste', exact: true }).click();
    await dialog.getByText('Tratamiento de tú durante septiembre.', { exact: true }).waitFor();
    await page.keyboard.press('Escape'); await dialog.waitFor({ state: 'hidden' });
    assert.deepEqual(errors, []); await page.close();
    console.log(`${name}: discovery server-first/retry, provenance, scope, editable draft and keyboard OK`);
  }
} finally { await browser?.close(); await server.close(); }
