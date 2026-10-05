import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { createServer } from 'vite';
import { chromium } from 'playwright-core';

// Recorrido real de los avisos de `useToast()` (4 de octubre de 2026): antes no aparecía ninguno.
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

try {
  for (const dark of [false, true]) {
    const page = await browser.newPage({ viewport: { width: 1280, height: 420 } });
    await page.goto(`http://127.0.0.1:3712/tests/fixtures/use-toast-preview.html${dark ? '?dark' : ''}`);
    await page.click('#error');
    await page.getByText('No se pudo reintegrar la tarea.').waitFor();
    await page.click('#ok');
    await page.getByText('La tarea volvió a Pendiente para continuar la corrección.').waitFor();
    await page.waitForTimeout(400);
    await page.screenshot({ path: path.join(outDir, dark ? 'avisos-oscuro.png' : 'avisos-claro.png') });
    assert.equal(await page.getByRole('status').count(), 2);
    await page.close();
  }
  console.log(`Avisos: recorrido completo. Capturas en ${outDir}`);
} finally {
  await browser.close();
  await server.close();
}
