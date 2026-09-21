// Renders the Observer inbox against intercepted API responses: no backend, no
// model, no database. Proves that an alert without a confirmed quote is kept
// out of the active list, counted apart and explained when someone looks at it.
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { createServer } from 'vite';
import { chromium } from 'playwright-core';

const summary = { active: 2, open: 2, reviewed: 0, snoozed: 0, dismissed: 0, resolved: 4, historical: 284, unverified: 3, lastScannedAt: '2026-09-21T15:00:00Z' };
const active = [
  { id: 'signal-1', status: 'OPEN', severity: 'critical', category: 'RISK', grounding: 'QUOTED',
    title: 'La fecha de publicación no fue aprobada', evidence: 'La fecha de publicación no fue aprobada por el cliente.',
    suggestedAction: 'Confirmar la aprobación antes del jueves.', sourceUrl: '/minutas?minute=minute-1', lastDetectedAt: '2026-09-21T14:55:00Z' },
  { id: 'signal-2', status: 'OPEN', severity: 'warning', category: 'OPERATIONS', grounding: 'DETERMINISTIC',
    title: 'Sesiones simultáneas', evidence: 'Dos sesiones de trabajo activas a la vez.',
    suggestedAction: 'Revisar la evidencia operativa y corregir la causa si continúa activa.', sourceUrl: '/manager', lastDetectedAt: '2026-09-21T14:50:00Z' }
];
const unverified = [
  { id: 'signal-3', status: 'OPEN', severity: 'warning', category: 'RISK', grounding: 'UNVERIFIED',
    title: 'El cliente pidió adelantar la campaña', evidence: 'El cliente pidió adelantar toda la campaña a la próxima semana.',
    suggestedAction: 'Confirmar con el cliente.', sourceUrl: '/minutas?minute=minute-2', lastDetectedAt: '2026-09-21T14:40:00Z' }
];

const server = await createServer({ logLevel: 'error', server: { host: '127.0.0.1', port: 0, open: false } });
let browser;
try {
  await mkdir('output', { recursive: true });
  await server.listen();
  const port = server.httpServer.address().port;
  browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
  for (const [name, width, height, dark] of [
    ['desktop', 1366, 1000, false], ['mobile', 390, 844, false], ['desktop-dark', 1366, 1000, true], ['mobile-dark', 390, 844, true]
  ]) {
    const page = await browser.newPage({ viewport: { width, height }, reducedMotion: 'reduce' });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/api/**', route => {
      const url = new URL(route.request().url());
      const status = url.searchParams.get('status') || 'ACTIVE';
      return route.fulfill({ json: { summary, signals: status === 'UNVERIFIED' ? unverified : active } });
    });
    await page.goto(`http://127.0.0.1:${port}/tests/fixtures/bria-observer.html`);
    await page.evaluate(dark => document.documentElement.classList.toggle('dark', dark), dark);

    await page.getByText('La fecha de publicación no fue aprobada').first().waitFor();
    await page.getByText('3 señales quedaron fuera por llegar sin una cita confirmada en la transcripción.', { exact: true }).waitFor();
    assert.equal(await page.locator('[data-observer-unverified]').count(), 0, `${name}: the active list must not contain unverified alerts`);

    await page.getByRole('button', { name: 'Sin confirmar', exact: true }).click();
    await page.getByText('El cliente pidió adelantar la campaña').first().waitFor();
    const warning = page.locator('[data-observer-unverified]');
    await warning.waitFor();
    assert.match(await warning.textContent(), /no se encontró en la transcripción/);
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({ path: `output/bria-observer-${name}.png`, fullPage: true });

    const layout = await page.evaluate(() => ({ width: innerWidth, body: document.documentElement.scrollWidth,
      targets: [...document.querySelectorAll('article button')].map(button => button.getBoundingClientRect().height) }));
    assert.ok(layout.body <= layout.width, `${name}: horizontal document overflow`);
    assert.ok(layout.targets.every(height => height >= 44), `${name}: touch targets below 44px`);
    assert.deepEqual(errors, []);
    console.log(`${name}: unverified alerts hidden from the active list, counted and explained under their own filter`);
    await page.close();
  }
} finally {
  await browser?.close();
  await server.close();
}
