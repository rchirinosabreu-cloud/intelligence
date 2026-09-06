import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { createServer } from 'vite';
import { chromium } from 'playwright-core';

const base = {
  review: { summary: 'He revisado la parrilla. Esta corrección necesita confirmación antes de cerrarse.', verdict: 'REQUIERE_AJUSTES', score: 80, coverage: 100, dimensions: {},
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
