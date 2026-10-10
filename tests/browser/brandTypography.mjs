// Roboto Condensed, la tipografía del negocio (Rodny, 10 de octubre de 2026). Monta pantallas
// reales y **comprueba que la fuente de verdad se descargó y se está usando**: que el navegador
// diga «Roboto Condensed» en `font-family` no demuestra nada si el archivo no llegó, porque
// entonces pinta con el respaldo y se ve igual de bien en una captura.
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { createServer } from 'vite';
import { chromium } from 'playwright-core';

const PANTALLAS = [
  ['tablero', '/tests/fixtures/task-privacy-preview.html?viewer=jefe', 'Gestión de Tareas'],
  ['portal', '/tests/fixtures/client-portal-preview.html', 'Parrilla de'],
  ['editor', '/tests/fixtures/plan-editor-preview.html', 'Piezas']
];

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

  for (const [nombre, ruta, esperado] of PANTALLAS) {
    for (const oscuro of [false, true]) {
      const page = await browser.newPage({ viewport: { width: 1500, height: 1000 }, deviceScaleFactor: 2 });
      await page.goto(`http://127.0.0.1:${port}${ruta}`, { waitUntil: 'networkidle' });
      if (oscuro) await page.evaluate(() => document.documentElement.classList.add('dark'));
      await page.waitForFunction((texto) => document.body.textContent.includes(texto), esperado, { timeout: 15000 });
      // El tablero abre con el tutorial del cronómetro encima; sin cerrarlo la captura no enseña
      // las tarjetas, que es justo donde se nota una condensada.
      const entendido = page.getByRole('button', { name: 'Entendido' });
      if (await entendido.count()) { await entendido.first().click(); await page.waitForTimeout(500); }
      await page.evaluate(() => document.fonts.ready);

      const medida = await page.evaluate(() => {
        // `document.fonts.check` dice si hay una cara **cargada** que sirva para esa petición.
        const cargada = document.fonts.check('700 16px "Roboto Condensed"');
        const cargadas = [...document.fonts].filter(f => f.status === 'loaded').map(f => f.family);
        const body = getComputedStyle(document.body).fontFamily;

        // La prueba real de que se está pintando con ella: Roboto Condensed es **más estrecha**.
        // Se mide el mismo texto con la fuente y con el respaldo genérico; si el archivo no hubiera
        // llegado, los dos anchos serían idénticos.
        const regla = document.createElement('span');
        regla.style.cssText = 'position:absolute;visibility:hidden;white-space:nowrap;font-size:40px';
        regla.textContent = 'Parrilla de contenidos · 1234567890';
        document.body.appendChild(regla);
        regla.style.fontFamily = '"Roboto Condensed"';
        const anchoMarca = regla.getBoundingClientRect().width;
        regla.style.fontFamily = 'sans-serif';
        const anchoRespaldo = regla.getBoundingClientRect().width;
        regla.remove();

        return { cargada, familias: [...new Set(cargadas)], body, anchoMarca, anchoRespaldo };
      });

      assert.equal(medida.cargada, true, `${nombre}${oscuro ? ' oscuro' : ''}: la fuente llegó de verdad`);
      assert.ok(medida.familias.includes('Roboto Condensed'), `${nombre}: hay caras cargadas de Roboto Condensed`);
      assert.match(medida.body, /^"?Roboto Condensed"?/, `${nombre}: el body la usa primero (${medida.body})`);
      assert.doesNotMatch(medida.body, /DM Sans/i, `${nombre}: ya no queda DM Sans`);
      // Condensada: el mismo texto tiene que ocupar menos que la genérica del sistema.
      assert.ok(
        medida.anchoMarca < medida.anchoRespaldo * 0.95,
        `${nombre}: se está pintando condensada (${Math.round(medida.anchoMarca)}px frente a ${Math.round(medida.anchoRespaldo)}px)`
      );

      await page.screenshot({ path: `output/tipografia-${nombre}${oscuro ? '-oscuro' : ''}.png` });
      if (!oscuro) {
        console.log(`${nombre}: cargada, body «${medida.body}», ${Math.round(medida.anchoMarca)}px frente a ${Math.round(medida.anchoRespaldo)}px del respaldo.`);
      }
      await page.close();
    }
  }

  console.log('Tipografía verificada en pantallas reales. Capturas en output/tipografia-*.png');
} finally {
  if (browser) await browser.close();
  await server.close();
}
