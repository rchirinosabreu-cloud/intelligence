// Los iconitos y los gráficos de Rentabilidad (Rodny, 12 de noviembre de 2026: «no comprendo
// qué significa la relación ahí, horas, por hora, qué es eso? no puede tener cada uno un
// iconito que cuando uno pose el cursor, te diga qué es o a qué se refiere?»).
// Muestra local de Financiero en 3006: npx vite --host 127.0.0.1 --port 3006
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const base = process.env.FINANCIAL_DEMO_URL || 'http://127.0.0.1:3006/tests/fixtures/financial-integrity.html';
const outDir = new URL('../../output/profitability-hints/', import.meta.url);
const shot = (name) => fileURLToPath(new URL(name, outDir));
await mkdir(outDir, { recursive: true });

const openTab = async (page) => {
  await page.goto(base, { timeout: 90000, waitUntil: 'domcontentloaded' });
  await page.getByRole('navigation', { name: 'Paginación de movimientos' }).waitFor();
  await page.getByRole('tab', { name: 'Análisis' }).click();
  await page.getByRole('button', { name: 'Rentabilidad', exact: true }).click();
  await page.locator('[data-profitability-client]').first().waitFor();
};

const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1200 } });
  page.setDefaultTimeout(10000);
  const errors = []; page.on('pageerror', (error) => errors.push(error.message));
  await openTab(page);

  // 1. Cada cifra y cada columna tiene su iconito, con nombre para el lector de pantalla.
  const hints = await page.locator('[data-info-hint]').evaluateAll(
    (nodes) => nodes.map((node) => ({ label: node.getAttribute('data-info-hint'), aria: node.getAttribute('aria-label') }))
  );
  const labels = hints.map((hint) => hint.label);
  for (const expected of ['Ingreso de clientes', 'Costo de operación', 'Costo hora de la agencia', 'Horas medidas',
    'Ingreso', 'Horas', 'Costo', 'Margen', 'Por hora']) {
    assert.ok(labels.includes(expected), `falta el iconito de «${expected}»: ${labels.join(', ')}`);
  }
  for (const hint of hints) assert.equal(hint.aria, `Qué es ${hint.label}`, 'el lector de pantalla tiene que poder nombrarlo');

  // 2. Pasar el cursor lo abre, y dice qué es y con qué se compara.
  const perHour = page.locator('[data-info-hint="Por hora"]').first();
  await perHour.hover();
  const note = page.getByRole('note');
  await note.waitFor();
  const text = (await note.innerText()).replace(/\s+/g, ' ');
  assert.match(text, /Cuánto ingresó por cada hora trabajada en esta cuenta/);
  assert.match(text, /costo hora de la agencia/);
  await page.screenshot({ path: shot('01-globo-por-hora.png'), animations: 'disabled' });

  // Salir con el cursor lo cierra: no se queda tapando la tabla.
  await page.locator('h2').first().hover();
  await note.waitFor({ state: 'hidden' });

  // 3. Con el teclado también: es un botón de verdad, no un `title`.
  await page.locator('[data-info-hint="Costo hora de la agencia"]').first().focus();
  await page.getByRole('note').waitFor();
  assert.match((await page.getByRole('note').innerText()).replace(/\s+/g, ' '), /nunca el sueldo de una persona/);
  await page.keyboard.press('Escape');

  // 4. Los dos gráficos: el margen de cada cuenta y lo que deja cada hora contra el costo hora.
  await page.locator('[data-profitability-charts]').waitFor();
  const barras = page.locator('[data-chart-margin] .recharts-bar-rectangle path');
  const clientes = await page.locator('[data-profitability-client]').count();
  assert.equal(await barras.count(), clientes, 'ninguna cuenta se esconde del gráfico');
  // La que pierde va en coral y la que deja, en verde — y el color se pinta de verdad.
  const colores = await barras.evaluateAll((nodes) => nodes.map((node) => getComputedStyle(node).fill));
  assert.ok(colores.includes('rgb(49, 170, 138)'), `sin verde de marca: ${colores.join(', ')}`);
  assert.ok(colores.includes('rgb(255, 106, 104)'), `sin coral de marca: ${colores.join(', ')}`);
  // La línea del costo hora está dibujada.
  assert.equal(await page.locator('[data-chart-hour] .recharts-reference-line line').count(), 1);

  await page.screenshot({ path: shot('02-claro.png'), fullPage: true, animations: 'disabled' });

  // 5. Oscuro y celular.
  await page.evaluate(() => document.documentElement.classList.add('dark'));
  await page.waitForTimeout(250);
  await page.screenshot({ path: shot('03-oscuro.png'), fullPage: true, animations: 'disabled' });
  await page.evaluate(() => document.documentElement.classList.remove('dark'));

  await page.setViewportSize({ width: 390, height: 1200 });
  await page.waitForTimeout(400);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  assert.ok(overflow <= 1, `se sale a lo ancho ${overflow}px`);
  await page.screenshot({ path: shot('04-celular.png'), fullPage: true, animations: 'disabled' });

  assert.deepEqual(errors, [], `errores de la pantalla: ${errors.join(' | ')}`);
  console.log('Rentabilidad legible: recorrido completo. Capturas en output/profitability-hints/');
} finally {
  await browser.close();
}
