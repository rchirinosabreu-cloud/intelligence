// Reproduce lo que le pasó a la clienta de Wine & Wonder el 13 de octubre de 2026: escribe un
// comentario que no cabe y pulsa Enviar. Antes salía «Error al enviar el comentario» cuatro veces
// y el texto se quedaba ahí sin explicación. Ahora tiene que decirle el motivo **antes** de gastar
// el envío, junto al campo, y conservar lo escrito.
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { createServer } from 'vite';
import { chromium } from 'playwright-core';
import { CLIENT_COMMENT_MAX_CHARS } from '../../src/lib/clientComment.js';

const PAGE = '/tests/fixtures/client-portal-preview.html';

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

  for (const [nombre, width, height] of [['movil', 390, 844], ['escritorio', 1500, 1000]]) {
    const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 2 });
    // La muestra local responde desde el adaptador de axios, así que **no hay peticiones de red
    // que contar**: lo que se mide es lo que el cliente ve y lo que el `catch` deja en la consola.
    // Si el envío llegara a salir y lo rechazara el servidor, aparecería «Comment error:».
    const falloDeEnvio = [];
    page.on('console', (message) => { if (message.text().includes('Comment error:')) falloDeEnvio.push(message.text()); });

    await page.goto(`http://127.0.0.1:${port}${PAGE}`, { waitUntil: 'networkidle' });
    await page.evaluate(() => document.fonts.ready);
    await page.waitForFunction(() => document.body.textContent.includes('Revisión de contenidos'));

    // Abrir una pieza y su formulario de comentario.
    await page.getByText('Tres preguntas antes de tu procedimiento').first().click();
    await page.getByRole('button', { name: 'Pedir un cambio' }).click();
    await page.waitForSelector('textarea');

    // El texto largo de verdad: más de lo que cabe.
    const largo = 'Pensáis que debemos añadir un pequeño párrafo sobre mi personalidad. '.repeat(90);
    assert.ok(largo.length > CLIENT_COMMENT_MAX_CHARS, 'la muestra supera el tope');
    await page.locator('textarea').fill(largo);

    // 1. El contador avisa antes de pulsar nada.
    const contador = (await page.locator('[data-comment-counter]').first().textContent()).trim();
    assert.match(
      contador,
      new RegExp(`^[\\d.]+ / ${CLIENT_COMMENT_MAX_CHARS.toLocaleString('es-CO').replace('.', '\\.')}$`),
      `${nombre}: el contador dice cuánto lleva y cuánto cabe («${contador}»)`
    );

    // 2. El motivo sale **sin** llegar a enviar nada.
    await page.getByRole('button', { name: 'Enviar' }).click();
    await page.waitForSelector('[role="alert"]');
    const aviso = (await page.locator('[role="alert"]').first().textContent()).trim();

    assert.match(aviso, /caracteres/, `${nombre}: dice cuántos caracteres hay`);
    assert.match(aviso, /dos partes/, `${nombre}: dice qué hacer`);
    assert.doesNotMatch(aviso, /Error al enviar el comentario/, `${nombre}: ya no es la frase que no explicaba nada`);
    assert.equal(falloDeEnvio.length, 0, `${nombre}: el envío ni se intentó, se frenó antes`);
    assert.equal(
      await page.evaluate(() => document.body.textContent.includes('Comentario enviado')),
      false,
      `${nombre}: y no se le dijo que se había enviado`
    );

    // 3. Lo que escribió sigue ahí.
    const conservado = await page.locator('textarea').inputValue();
    assert.equal(conservado.length, largo.length, `${nombre}: no se perdió lo escrito`);

    await page.screenshot({ path: `output/comentario-largo-${nombre}.png` });

    // 4. Y al recortarlo, el aviso se va y el envío sí sale.
    await page.locator('textarea').fill('Cambiemos la foto de la primera lámina, por favor.');
    await page.waitForFunction(() => !document.querySelector('[role="alert"]'));
    await page.getByRole('button', { name: 'Enviar' }).click();
    await page.waitForFunction(() => document.body.textContent.includes('Comentario enviado'), { timeout: 8000 });
    assert.equal(falloDeEnvio.length, 0, `${nombre}: y el que cabe sale sin errores`);

    console.log(`${nombre}: contador «${contador}», aviso «${aviso.slice(0, 70)}…», el envío se frenó antes.`);
    await page.close();
  }

  console.log('Comentario del cliente verificado. Capturas en output/comentario-largo-*.png');
} finally {
  if (browser) await browser.close();
  await server.close();
}
