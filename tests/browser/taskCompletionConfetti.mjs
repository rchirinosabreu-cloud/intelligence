// Rodny, 30 de septiembre de 2026: «a nadie le sale el confeti cuando se termina una tarea».
// Salía, pero eran 50 partículas diminutas —un tercio blancas sobre un tablero claro— disparadas
// desde el centro de abajo de la ventana. Este recorrido mueve una tarjeta a «Realizado» de verdad
// y **cuenta los píxeles de color** que quedan pintados en el lienzo del confeti: una celebración
// que no se ve es lo mismo que no tenerla.
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { createServer } from 'vite';
import { chromium } from 'playwright-core';

const PAGE = '/tests/fixtures/task-privacy-preview.html?viewer=jefe';

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

  const page = await browser.newPage({ viewport: { width: 1500, height: 1000 } });
  // canvas-confetti dibuja en un hilo aparte (`transferControlToOffscreen`) y entonces el lienzo
  // ya no deja leer sus píxeles desde la página. Se le quita esa vía **solo para poder medir**: el
  // código de dibujo es el mismo, cambia el hilo donde corre.
  await page.addInitScript(() => { delete HTMLCanvasElement.prototype.transferControlToOffscreen; });
  await page.goto(`http://127.0.0.1:${port}${PAGE}`, { waitUntil: 'networkidle' });
  await page.evaluate(() => document.fonts.ready);

  // El tablero abre con el tutorial del cronómetro; hay que cerrarlo para poder arrastrar.
  const entendido = page.getByRole('button', { name: 'Entendido' });
  if (await entendido.count()) { await entendido.first().click(); await page.waitForTimeout(400); }

  assert.equal(
    await page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches),
    false,
    'la sonda corre con movimiento normal: con movimiento reducido el confeti se omite a propósito'
  );
  assert.equal(await page.evaluate(() => document.querySelectorAll('canvas').length), 0, 'aún no hay lienzo');

  // Arrastre por teclado (el que ofrece @hello-pangea/dnd): levantar, cruzar dos columnas, soltar.
  await page.locator('[id^="task-"]').first().focus();
  await page.keyboard.press(' ');
  await page.waitForTimeout(250);
  await page.keyboard.press('ArrowRight');
  await page.waitForTimeout(250);
  await page.keyboard.press('ArrowRight');
  await page.waitForTimeout(250);
  await page.keyboard.press(' ');
  await page.waitForTimeout(700);

  const celebracion = await page.evaluate(() => {
    const canvas = document.querySelector('body > canvas');
    if (!canvas) return null;
    const { data } = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height);
    let pintados = 0;
    let blancos = 0;
    let minX = Infinity; let maxX = -Infinity; let minY = Infinity; let maxY = -Infinity;
    for (let i = 0; i < data.length; i += 4) {
      if (data[i + 3] < 24) continue;
      pintados += 1;
      if (data[i] > 236 && data[i + 1] > 236 && data[i + 2] > 236) blancos += 1;
      const pixel = i / 4;
      const x = pixel % canvas.width;
      const y = Math.floor(pixel / canvas.width);
      if (x < minX) minX = x; if (x > maxX) maxX = x;
      if (y < minY) minY = y; if (y > maxY) maxY = y;
    }
    return { pintados, blancos, ancho: canvas.width, caja: { minX, maxX, minY, maxY } };
  });

  assert.ok(celebracion, 'el confeti crea su lienzo sobre el cuerpo del documento');
  // Con la ráfaga anterior el lienzo quedaba casi vacío; esta deja miles de píxeles de color.
  assert.ok(celebracion.pintados > 3000, `la celebración se ve (${celebracion.pintados} píxeles pintados)`);
  assert.equal(celebracion.blancos, 0, 'ni una partícula blanca: sobre una superficie clara no existe');
  // Sale de la tarjeta, que está en la columna derecha, no del centro de la ventana.
  const centroX = (celebracion.caja.minX + celebracion.caja.maxX) / 2;
  assert.ok(
    centroX > celebracion.ancho * 0.55,
    `el disparo sale de la tarjeta recién terminada, en la columna derecha (centro en ${Math.round(centroX)}px de ${celebracion.ancho})`
  );

  await page.screenshot({ path: 'output/task-confetti.png' });
  console.log(`Confeti verificado: ${celebracion.pintados} píxeles de color, 0 blancos, centrado en ${Math.round(centroX)}px de ${celebracion.ancho}.`);
} finally {
  if (browser) await browser.close();
  await server.close();
}
