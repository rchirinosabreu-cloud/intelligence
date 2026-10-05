import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { createServer } from 'vite';
import { chromium } from 'playwright-core';

// Recorrido real de los avisos (4 de octubre de 2026): el visor `BrainToaster` con los cinco tipos,
// debajo del header, en una línea, en claro, oscuro y celular. Capturas en `SCREENSHOT_DIR`.
const root = path.resolve(import.meta.dirname, '../..');
const outDir = path.resolve(process.env.SCREENSHOT_DIR || 'output/avisos');
await mkdir(outDir, { recursive: true });

const server = await createServer({
  configFile: false,
  root,
  appType: 'mpa',
  esbuild: { jsx: 'automatic' },
  resolve: { alias: { '@': path.join(root, 'src') } },
  cacheDir: path.join(root, 'node_modules/.vite-use-toast'),
  logLevel: 'warn',
  server: { host: '127.0.0.1', port: 3712, strictPort: true }
});
await server.listen();
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe' });

const showAll = async (page) => {
  for (const id of ['long', 'loading', 'info', 'error', 'ok']) {
    await page.click(`#${id}`);
    await page.waitForTimeout(120);
  }
  await page.getByText('La tarea volvió a Pendiente', { exact: false }).waitFor();
  await page.waitForTimeout(400);
};

try {
  for (const [name, query, viewport] of [['claro', '', { width: 1280, height: 520 }], ['oscuro', '?dark', { width: 1280, height: 520 }], ['celular', '', { width: 390, height: 600 }]]) {
    const page = await browser.newPage({ viewport });
    await page.goto(`http://127.0.0.1:3712/tests/fixtures/use-toast-preview.html${query}`);
    await showAll(page);

    const pills = page.locator('[data-toast-type]');
    assert.equal(await pills.count(), 5);
    // Una sola línea: ninguna píldora pasa de 48 px de alto, ni la del texto largo.
    for (const height of await pills.evaluateAll((nodes) => nodes.map((node) => node.getBoundingClientRect().height))) assert.ok(height <= 48, `alto ${height}`);
    // Debajo del header de 64 px, nunca encima.
    const tops = await pills.evaluateAll((nodes) => nodes.map((node) => node.getBoundingClientRect().top));
    assert.ok(Math.min(...tops) >= 64, `arranca en ${Math.min(...tops)}`);
    // Lo que no cabe se lee entero pasando el ratón.
    assert.match(await page.locator('[title*="desglose"]').getAttribute('title'), /registrado en la cuenta\.$/);
    // Sin título de relleno: «Error» solo aparece en el botón de la muestra.
    assert.equal(await page.getByText('Error', { exact: true }).count(), 1);
    await page.screenshot({ path: path.join(outDir, `avisos-${name}.png`) });

    if (name === 'claro') {
      await page.locator('[title*="desglose"]').click();
      await page.waitForTimeout(150);
      await page.screenshot({ path: path.join(outDir, 'avisos-largo-abierto.png') });
    }
    await page.close();
  }
  console.log(`Avisos: recorrido completo. Capturas en ${outDir}`);
} finally {
  await browser.close();
  await server.close();
}
