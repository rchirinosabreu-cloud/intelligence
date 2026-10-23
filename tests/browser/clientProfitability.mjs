// Rentabilidad por cliente (Rodny, 22 de octubre de 2026): la pestaña de Financiero, solo para administradores,
// con la cuenta real (`buildClientProfitability`) sobre un mes inventado. Muestra local de Financiero en 3006:
// npx vite --host 127.0.0.1 --port 3006
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
const base = process.env.FINANCIAL_DEMO_URL || 'http://127.0.0.1:3006/tests/fixtures/financial-integrity.html';
const outDir = new URL('../../output/client-profitability/', import.meta.url);
const shot = name => fileURLToPath(new URL(name, outDir));
await mkdir(outDir, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
try {
  for (const [scheme, viewport] of [['light', { width: 1440, height: 1100 }], ['dark', { width: 1440, height: 1100 }], ['light', { width: 390, height: 900 }]]) {
    const page = await browser.newPage({ viewport, colorScheme: scheme });
    page.setDefaultTimeout(10000);
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    await page.goto(base, { timeout: 90000, waitUntil: 'domcontentloaded' });
    await page.getByRole('navigation', { name: 'Paginación de movimientos' }).waitFor();
    if (scheme === 'dark') await page.evaluate(() => document.documentElement.classList.add('dark'));
    await page.getByRole('button', { name: 'Rentabilidad', exact: true }).click();
    await page.locator('[data-profitability-client]').first().waitFor();
    // Primero la cuenta que más pierde; la que tuvo horas sin factura lo dice; lo interno va aparte.
    assert.equal(await page.locator('[data-profitability-client]').first().getAttribute('data-profitability-client'), 'Endova');
    assert.match(await page.locator('[data-profitability-client="Nuva"]').innerText(), /no tiene nada facturado ni ingresos/);
    // Sin cuenta por cobrar del mes, lo que entró en Movimientos (23 de octubre de 2026).
    const pablo = page.locator('[data-profitability-client="Pablo Hoff"]');
    assert.match(await pablo.innerText(), /se usó lo que entró en Movimientos/);
    assert.equal(await pablo.locator('[data-profitability-source]').getAttribute('data-profitability-source'), 'INGRESOS');
    assert.match(await page.locator('[data-profitability-notes]').innerText(), /no están ligados a ningún cliente/);
    assert.match(await page.locator('[data-profitability-client="Endova"]').innerText(), /tareas cerradas tienen tiempo medido/);
    assert.match(await page.locator('[data-profitability-internal]').innerText(), /Trabajo interno/);
    assert.match(await page.locator('[data-profitability-notes]').innerText(), /El costo hora es/);
    const endova = await page.locator('[data-profitability-client="Endova"]').innerText();
    assert.match(endova, /-\$\d/, 'el negativo se escribe -$');
    assert.doesNotMatch(endova, /\$-/, 'nunca $-');
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    assert.ok(overflow <= 1, `sin desplazamiento horizontal (${overflow}px)`);
    await page.locator('[data-profitability]').screenshot({ path: shot(`rentabilidad-${scheme}-${viewport.width}.png`), animations: 'disabled' });
    assert.deepEqual(errors, []);
    await page.close();
  }
  // Un miembro sin rol de administrador no ve la pestaña.
  const viewer = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await viewer.goto(`${base}?viewer=reader`, { timeout: 90000, waitUntil: 'domcontentloaded' });
  await viewer.getByRole('button', { name: 'Cartera', exact: true }).waitFor();
  assert.equal(await viewer.getByRole('button', { name: 'Rentabilidad', exact: true }).count(), 0);
  console.log('Rentabilidad por cliente: OK');
} finally {
  await browser.close();
}
