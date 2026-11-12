// Estado de resultados mensual — punto 7 del frente 8 del plan «el negocio primero»
// (Rodny, 12 de noviembre de 2026: «necesito tomar decisiones y necesito que la plataforma
// y Bria me ayuden a ello»). Recorrido real sobre la muestra local, en claro, oscuro y
// celular: npx vite --host 127.0.0.1 --port 3006
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const base = process.env.STATEMENT_DEMO_URL || 'http://127.0.0.1:3006/tests/fixtures/income-statement.html';
const outDir = new URL('../../output/income-statement/', import.meta.url);
const shot = (name) => fileURLToPath(new URL(name, outDir));
await mkdir(outDir, { recursive: true });

const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1400 } });
  page.setDefaultTimeout(10000);
  const errors = []; page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(base, { timeout: 90000, waitUntil: 'domcontentloaded' });
  const bars = page.locator('[data-statement-chart] .recharts-bar-rectangle path');
  await bars.first().waitFor();

  // 1. La lectura dice el hecho y su causa. El mes en curso se avisa y el préstamo se nombra.
  const readings = page.locator('[data-statement-readings] [data-reading]');
  const texts = await readings.allInnerTexts();
  assert.ok(texts.length >= 3 && texts.length <= 4, `lecturas: ${texts.length}`);
  const joined = texts.join(' | ');
  assert.match(joined, /Noviembre va por el día \d+ de 30/);
  assert.match(joined, /Septiembre figura en rojo por \$25\.323\.150 en préstamos/);
  assert.match(joined, /Operando cerró en \+\$9\.875\.245/);
  assert.match(joined, /piso de 28,6 % del plan/);
  await page.locator('[data-statement-readings]').screenshot({ path: shot('01-lectura.png'), animations: 'disabled' });

  // 2. Las cifras del periodo cuentan solo los diez meses cerrados: noviembre no se suma.
  const cardText = async (attr) => (await page.locator(`[${attr}]`).innerText()).replace(/\s+/g, ' ');
  assert.match(await cardText('data-statement-income'), /10 meses cerrados/);
  // 25.323.150 de septiembre + 218.146 de octubre + 1.000.000 de junio, aparte del gasto.
  assert.match(await cardText('data-statement-expense'), /Aparte: \$ ?26\.541\.296 prestados/);
  assert.match(await cardText('data-statement-rate'), /Piso del plan: 28,6 %/);

  // 3. El gráfico: una barra por mes, con el color del veredicto y el porcentaje rotulado.
  const barClasses = await bars.evaluateAll(
    (nodes) => nodes.map((node) => node.getAttribute('class') || '')
  );
  assert.equal(barClasses.length, 11, `barras: ${barClasses.length}`);
  // Septiembre (la novena) no alcanzó el piso; octubre (la décima) sí; noviembre va en curso.
  assert.match(barClasses[8], /brand-coral/);
  assert.match(barClasses[9], /brand-green/);
  assert.match(barClasses[10], /fill-zinc-300/);
  // El color tiene que resolverse de verdad, no quedar en la clase.
  const painted = await bars.nth(9)
    .evaluate((node) => getComputedStyle(node).fill);
  assert.equal(painted, 'rgb(49, 170, 138)', `el verde de marca no se pintó: ${painted}`);
  // En SVG hay que leer textContent: innerText no existe.
  const labels = await page.locator('[data-statement-chart] .recharts-label-list text')
    .evaluateAll((nodes) => nodes.map((node) => node.textContent));
  assert.ok(labels.includes('22,0 %'), `rótulos: ${labels.join(', ')}`);
  assert.ok(labels.includes('31,1 %'), `rótulos: ${labels.join(', ')}`);

  // 4. A dónde se va la plata: cada fila con su nombre y su cifra, nómina a la cabeza.
  const rows = await page.locator('[data-outgoings] [data-outgoing]').allInnerTexts();
  // Nómina a la cabeza, con su nombre y su peso: era un arco anónimo en la rueda.
  assert.match(rows[0].replace(/\s+/g, ' '), /Nómina \$ ?237\.140\.000 · 75,1 %/);
  assert.ok(!rows.some((row) => /Préstamo/i.test(row)), 'el préstamo no es una fila de gasto');
  const loans = (await page.locator('[data-outgoings-loans]').innerText()).replace(/\s+/g, ' ');
  assert.match(loans, /Prestado, no gastado/);
  assert.match(loans, /No entra en el total de arriba/);

  await page.screenshot({ path: shot('02-claro.png'), fullPage: true, animations: 'disabled' });

  // 5. Modo oscuro: el gris del mes en curso y los tokens de marca cambian con el tema.
  await page.getByRole('button', { name: 'Cambiar tema' }).click();
  await page.waitForTimeout(250);
  const darkInProgress = await bars.nth(10)
    .evaluate((node) => getComputedStyle(node).fill);
  assert.equal(darkInProgress, 'rgb(63, 63, 70)', `el gris oscuro no se aplicó: ${darkInProgress}`);
  await page.screenshot({ path: shot('03-oscuro.png'), fullPage: true, animations: 'disabled' });
  await page.getByRole('button', { name: 'Cambiar tema' }).click();

  // 6. Mientras carga no se afirma nada: ni cifras ni gráfico ni lectura.
  await page.getByRole('button', { name: 'Ver mientras carga' }).click();
  await page.waitForTimeout(200);
  assert.equal(await page.locator('[data-statement-readings]').count(), 0, 'sin datos no hay lectura');
  // La cifra es un guion, no un cero. El rótulo va en versalitas por CSS, así que se lee sin caso.
  assert.match(await cardText('data-statement-income'), /^Entró por operar — 0 meses cerrados$/i);
  assert.equal(await page.locator('[data-statement-chart]').count(), 0, 'sin datos no hay gráfico');
  assert.equal(await page.locator('[data-outgoings-loans]').count(), 0, 'sin datos no hay préstamos');
  await page.getByRole('button', { name: 'Mostrar datos' }).click();
  await bars.first().waitFor();

  // 7. Celular: nada se sale del ancho y las cifras siguen legibles.
  await page.setViewportSize({ width: 390, height: 1400 });
  await page.waitForTimeout(300);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  assert.ok(overflow <= 1, `se sale a lo ancho ${overflow}px`);
  // Once rótulos no caben en un celular y se montaban unos sobre otros: ahí no se dibujan.
  const hiddenLabels = await page.locator('[data-statement-chart] .recharts-label-list text')
    .evaluateAll((nodes) => nodes.every((node) => getComputedStyle(node).display === 'none'));
  assert.equal(hiddenLabels, true, 'los porcentajes se esconden en celular');
  await page.screenshot({ path: shot('04-celular.png'), fullPage: true, animations: 'disabled' });

  assert.deepEqual(errors, [], `errores de la pantalla: ${errors.join(' | ')}`);
  console.log('Estado de resultados: recorrido completo. Capturas en output/income-statement/');
} finally {
  await browser.close();
}

