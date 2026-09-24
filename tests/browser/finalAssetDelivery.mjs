// Recorrido real de las dos formas de entregar una pieza final pesada (Rodny, 24 de septiembre de 2026):
// el enlace de Drive y la subida directa al almacenamiento. Monta el componente de verdad contra una API
// en memoria y **ejecuta la subida directa completa** con un archivo de 105 MB creado en el navegador:
// firma, entrega con progreso y confirmación. Sin backend, sin base de datos, sin almacenamiento.
//
// El reproductor de Drive se sustituye por un marcador: lo que se comprueba aquí es nuestra diagramación,
// no la página de Google, y así el recorrido no depende de internet ni de un archivo compartido de verdad.
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { createServer } from 'vite';
import { chromium } from 'playwright-core';

const PAGE = '/tests/fixtures/final-asset-delivery-preview.html';

const server = await createServer({ logLevel: 'error', server: { host: '127.0.0.1', port: 0, open: false } });
let browser;

const openEditorOnSecondItem = async (page) => {
  await page.waitForFunction(() => document.querySelectorAll('button').length > 5);
  await page.evaluate(() => {
    const editButtons = [...document.querySelectorAll('button')].filter(button => button.textContent.trim() === 'Editar');
    editButtons.at(-1).click();
  });
  await page.waitForFunction(() => [...document.querySelectorAll('button')].some(b => b.textContent.trim() === 'Enlace de Drive'));
};

try {
  await server.listen();
  await mkdir('output', { recursive: true });
  const port = server.httpServer.address().port;
  browser = await chromium.launch({
    executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    headless: true
  });

  for (const [name, width, height, dark] of [
    ['desktop', 1440, 1100, false],
    ['desktop-dark', 1440, 1100, true],
    ['mobile', 390, 844, false]
  ]) {
    const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 2 });

    // El marco de Drive no sale a internet: se responde un marcador con la misma forma.
    await page.route('https://drive.google.com/**', route => route.fulfill({
      status: 200,
      contentType: 'text/html',
      body: '<html><body style="margin:0;height:100%;display:flex;align-items:center;justify-content:center;background:#111;color:#eee;font:600 13px system-ui">Reproductor de Google Drive</body></html>'
    }));

    await page.goto(`http://127.0.0.1:${port}${PAGE}`, { waitUntil: 'networkidle' });
    if (dark) await page.evaluate(() => document.documentElement.classList.add('dark'));
    await page.evaluate(() => document.fonts.ready);
    await openEditorOnSecondItem(page);

    // La pieza #01 llega entregada por enlace: se ve el reproductor, no un archivo nuestro.
    const driveTile = await page.evaluate(() => {
      const frame = document.querySelector('iframe');
      return { src: frame?.getAttribute('src') || null, frames: document.querySelectorAll('iframe').length };
    });
    assert.match(driveTile.src, /^https:\/\/drive\.google\.com\/file\/d\/[\w-]+\/preview$/, 'el marco se arma desde el identificador');
    assert.equal(driveTile.frames, 1);

    await page.screenshot({ path: `output/final-asset-${name}.png`, fullPage: true });

    // 1. El diálogo del enlace, con su aviso de permisos.
    await page.evaluate(() => [...document.querySelectorAll('button')].find(b => b.textContent.trim() === 'Enlace de Drive').click());
    await page.waitForSelector('[role="dialog"]');
    await page.fill('input[type="url"]', 'https://drive.google.com/drive/folders/1AbC_defGHIjklMNOpqrSTUvwx234567');
    await page.waitForFunction(() => document.body.textContent.includes('Ese es el enlace de una carpeta'));
    const blocked = await page.evaluate(() => [...document.querySelectorAll('[role="dialog"] button')].find(b => b.textContent.includes('Añadir enlace'))?.disabled);
    assert.equal(blocked, true, 'con un enlace que no sirve no se puede enviar');
    await page.screenshot({ path: `output/final-asset-drive-dialog-${name}.png` });

    await page.keyboard.press('Escape');
    await page.waitForFunction(() => !document.querySelector('[role="dialog"]'));

    // 2. La subida directa, de principio a fin, con un archivo que no cabe por el servidor.
    await page.evaluate(() => {
      const card = [...document.querySelectorAll('button')].find(b => b.textContent.trim() === 'Enlace de Drive').closest('div.space-y-1\\.5');
      const input = card.querySelector('input[type="file"]');
      const file = new File([new ArrayBuffer(105 * 1024 * 1024)], 'master-reel.mp4', { type: 'video/mp4' });
      const transfer = new DataTransfer();
      transfer.items.add(file);
      input.files = transfer.files;
      input.dispatchEvent(new Event('change', { bubbles: true }));
    });

    await page.waitForFunction(() => /Subiendo al almacenamiento… [1-9]/.test(document.body.textContent), { timeout: 15000 });
    await page.screenshot({ path: `output/final-asset-uploading-${name}.png`, fullPage: true });

    await page.waitForFunction(() => document.body.textContent.includes('master-reel.mp4'), { timeout: 20000 });
    const finished = await page.evaluate(() => ({
      progressGone: !document.body.textContent.includes('Subiendo al almacenamiento'),
      tiles: [...document.querySelectorAll('video, iframe')].length
    }));
    assert.equal(finished.progressGone, true, 'la barra desaparece cuando el servidor confirma');
    assert.equal(finished.tiles, 2, 'quedan el enlace de Drive y el video recién subido');

    await page.screenshot({ path: `output/final-asset-uploaded-${name}.png`, fullPage: true });
    await page.close();
  }

  console.log('[Pieza final] Enlace de Drive y subida directa verificados. Capturas en output/final-asset-*.png');
} finally {
  await browser?.close();
  await server.close();
}
