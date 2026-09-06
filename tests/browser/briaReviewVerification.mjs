import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { createServer } from 'vite';
import { chromium } from 'playwright-core';

const base = {
  review: { summary: 'He revisado la parrilla. Esta corrección necesita confirmación antes de cerrarse.', verdict: 'REQUIERE_AJUSTES', score: 80, coverage: 100,
    scope: { complete: true, reviewedItems: 61, totalItems: 61, batchCount: 6, crossBatchTextComparison: false },
    dimensions: Object.fromEntries(['ESTRATEGIA', 'MARCA', 'GRAMATICA', 'CONSISTENCIA'].map(key => [key, { assessable: true }])),
    findings: [{ id: 'finding', status: 'VERIFYING', category: 'CONSISTENCIA', severity: 'INFO', title: 'Confirmar el estado de publicación', detail: 'La pieza tiene ajustes pendientes y figura como publicada.', recommendation: 'Revisar el estado y confirmar que la versión publicada incluye los ajustes.', itemId: 'piece', evidenceIds: [] }] },
  evidence: [], meta: { planId: 'verification-fixture', state: 'FAILED', cached: true, memorySourcesUsed: 0, reviewedAt: '2026-09-05T15:00:00Z' }
};
const server = await createServer({ logLevel: 'error', server: { host: '127.0.0.1', port: 0, open: false } });
let browser;
try {
  await mkdir('output', { recursive: true });
  await server.listen();
  const port = server.httpServer.address().port;
  browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
  for (const [name, width, height, dark] of [
    ['desktop', 1366, 1000, false], ['mobile', 390, 844, false], ['tablet', 768, 1024, false],
    ['desktop-dark', 1366, 1000, true], ['mobile-dark', 390, 844, true]
  ]) {
    const page = await browser.newPage({ viewport: { width, height }, reducedMotion: 'reduce' });
    const errors = [];
    let result = structuredClone(base);
    let rejectAction = false;
    let actionCount = 0;
    page.on('pageerror', error => errors.push(error.message));
    // Every network mutation is intercepted: never hit the real backend or model.
    await page.route('**/api/**', route => {
      const request = route.request();
      if (request.method() === 'GET') return route.fulfill({ json: result });
      assert.equal(request.method(), 'PATCH');
      actionCount++;
      if (rejectAction) return route.fulfill({ status: 500, json: { error: 'Fallo de prueba: no se guardó la acción.' } });
      const { action } = request.postDataJSON();
      assert.ok(['MARK_CORRECTED', 'UNDO_CORRECTION'].includes(action));
      result.review.findings[0].status = action === 'MARK_CORRECTED' ? 'VERIFYING' : 'OPEN';
      result.meta.state = action === 'MARK_CORRECTED' ? 'PENDING' : 'CURRENT';
      return route.fulfill({ json: { finding: result.review.findings[0] } });
    });
    await page.goto(`http://127.0.0.1:${port}/tests/fixtures/bria-review.html`);
    await page.evaluate(dark => document.documentElement.classList.toggle('dark', dark), dark);
    const retry = page.getByRole('button', { name: 'Reintentar verificación', exact: true });
    await retry.waitFor();
    await page.getByText('61/61 piezas revisadas', { exact: true }).waitFor({ timeout: 5000 });
    await page.getByText('4/4 dimensiones evaluadas', { exact: true }).waitFor();
    await page.evaluate(() => document.fonts.ready);
    // Initial loading replaces the full-width action; wait for its CSS transition before measuring.
    await page.waitForFunction(() => {
      const button = document.querySelector('button[aria-label="Revisar nuevamente"]');
      return button?.getBoundingClientRect().width === 44 && button?.querySelector('svg')?.getBoundingClientRect().width >= 16;
    }, null, { timeout: 5000 });
    const refreshBounds = await page.getByRole('button', { name: 'Revisar nuevamente', exact: true }).evaluate(button => ({
      width: button.getBoundingClientRect().width, height: button.getBoundingClientRect().height,
      icon: button.querySelector('svg').getBoundingClientRect().width, classes: button.className
    }));
    assert.equal(refreshBounds.width, 44, JSON.stringify(refreshBounds));
    assert.ok(refreshBounds.icon >= 16, JSON.stringify(refreshBounds));
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({ path: `output/bria-verification-${name}.png`, fullPage: true });
    const layout = await page.evaluate(() => ({ width: innerWidth, body: document.documentElement.scrollWidth,
      targets: [...document.querySelectorAll('[data-bria-finding-card] button')].map(button => ({ height: button.getBoundingClientRect().height, width: button.getBoundingClientRect().width })) }));
    assert.ok(layout.body <= layout.width, `${name}: horizontal document overflow`);
    assert.ok(layout.targets.every(target => target.height >= 44 && target.width >= 44));
    assert.equal(await retry.isEnabled(), true);
    rejectAction = true;
    await retry.click();
    await page.getByText('Fallo de prueba: no se guardó la acción.').waitFor();
    assert.equal(await page.getByText('No se pudo verificar', { exact: true }).count(), 1);
    rejectAction = false;
    await retry.click();
    await page.getByRole('button', { name: 'En espera', exact: true }).waitFor();
    assert.equal(await page.getByRole('button', { name: 'En espera', exact: true }).isDisabled(), true);
    const undo = page.getByRole('button', { name: 'Deshacer «corregido»', exact: true });
    rejectAction = true;
    await undo.click();
    await page.getByText('Fallo de prueba: no se guardó la acción.').waitFor();
    assert.equal(await undo.isVisible(), true);
    rejectAction = false;
    await undo.click();
    await page.getByRole('button', { name: 'Corregido', exact: true }).waitFor();
    assert.equal(await undo.count(), 0);
    assert.equal(actionCount, 4);
    result.meta.state = 'RUNNING';
    result.meta.progress = { completedBatches: 1, totalBatches: 2, reviewedItems: 12, totalItems: 13 };
    await page.reload();
    await page.evaluate(dark => document.documentElement.classList.toggle('dark', dark), dark);
    await page.getByText('Avance guardado: 12/13 piezas · 1/2 lotes.', { exact: true }).waitFor();
    await page.getByText('Puntaje de la última revisión completa.', { exact: true }).waitFor();
    await page.waitForFunction(() => document.querySelector('button[aria-label="Revisar nuevamente"]')?.getBoundingClientRect().width === 44, null, { timeout: 5000 });
    await page.screenshot({ path: `output/bria-coverage-${name}.png`, fullPage: true });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    result.review.scope = null;
    result.meta.state = 'CURRENT';
    await page.reload();
    await page.getByText('Cobertura de piezas no registrada', { exact: true }).waitFor();
    await page.getByRole('button', { name: 'Ver pieza', exact: true }).click();
    assert.ok(page.url().endsWith('?item=piece'));
    await page.getByText('Pieza de ejemplo', { exact: true }).waitFor();
    assert.deepEqual(errors, []);
    console.log(`${name}: no overflow, accessible targets, retry/undo server-first, in-page navigation OK`);
    await page.close();
  }
} finally {
  await browser?.close();
  await server.close();
}
