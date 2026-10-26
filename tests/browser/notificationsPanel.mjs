import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { createServer } from 'vite';
import { chromium } from 'playwright-core';

// El panel de notificaciones (Rodny, 26 de octubre de 2026): «el scroll tiene un límite
// que no me deja ver las que aún no he leído». No era el scroll, era `take: 20`.
//
// Aquí se comprueba lo que ve una persona: el contador real, el filtro de sin leer, que
// «Ver más» trae las que faltan y que el interruptor del equipo solo se enciende cuando el
// servidor lo confirma.

const server = await createServer({
  logLevel: 'error',
  optimizeDeps: { entries: ['tests/fixtures/notifications-panel-preview.html'] },
  server: { host: '127.0.0.1', port: 0, open: false }
});

let browser;
try {
  await mkdir('output', { recursive: true });
  await server.listen();
  const port = server.httpServer.address().port;
  browser = await chromium.launch({
    executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    headless: true
  });

  for (const [name, width, height, dark] of [
    ['desktop', 1366, 900, false],
    ['desktop-dark', 1366, 900, true],
    ['mobile', 390, 844, false]
  ]) {
    const page = await browser.newPage({ viewport: { width, height } });
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));

    let guardadas = null;
    await page.route('**/api/push/status', (route) => route.fulfill({ json: { enabled: false } }));
    await page.route('**/api/notifications/preferences', async (route) => {
      guardadas = route.request().postDataJSON();
      return route.fulfill({ json: { preferences: { teamCompletions: guardadas.teamCompletions === true } } });
    });

    await page.goto(`http://127.0.0.1:${port}/tests/fixtures/notifications-panel-preview.html`);
    await page.evaluate((isDark) => document.documentElement.classList.toggle('dark', isDark), dark);
    await page.evaluate(() => document.fonts.ready);

    // La lista no se queda en cuatro avisos ni desborda la ventana.
    const rail = page.locator('.overflow-y-auto').first();
    const alto = await rail.evaluate((element) => ({
      visible: Math.round(element.clientHeight),
      contenido: Math.round(element.scrollHeight),
      ventana: window.innerHeight
    }));
    assert.ok(alto.visible > 0 && alto.visible <= alto.ventana, `${name}: la lista no cabe en la ventana (${JSON.stringify(alto)})`);
    assert.ok(alto.contenido > alto.visible, `${name}: la lista tiene que poder desplazarse`);

    // El contador lo dice el servidor, no la página visible.
    await page.getByRole('button', { name: 'Sin leer (7)', exact: true }).waitFor({ timeout: 5000 });
    await page.screenshot({ path: `output/notificaciones-panel-${name}.png`, fullPage: true });

    // «Ver más» trae las que faltan.
    const antes = await page.locator('[class*="border-b"] p.truncate').count();
    const verMas = page.locator('[data-notifications-load-more]');
    await verMas.waitFor({ timeout: 5000 });
    assert.equal(antes, 20, `${name}: la primera página trae 20, no ${antes}`);
    await verMas.click();
    await page.waitForFunction(() => document.querySelectorAll('[class*="border-b"] p.truncate').length > 20, null, { timeout: 5000 });
    const despues = await page.locator('[class*="border-b"] p.truncate').count();
    assert.equal(despues, 24, `${name}: después de «Ver más» tienen que estar las 24`);
    assert.equal(await verMas.count(), 0, `${name}: sin más que traer, el botón se retira`);
    // El panel vive dentro de un menú de Radix: un botón que no es un ítem no puede cerrarlo.
    assert.equal(await rail.count(), 1, `${name}: «Ver más» no puede cerrar el panel`);
    await page.screenshot({ path: `output/notificaciones-ver-mas-${name}.png`, fullPage: true });

    // El filtro de sin leer deja solo lo que falta por leer.
    await page.getByRole('button', { name: 'Sin leer (7)', exact: true }).click();
    await page.waitForFunction(() => document.querySelectorAll('[class*="border-b"] p.truncate').length === 7, null, { timeout: 5000 });
    assert.equal(await verMas.count(), 0, `${name}: con siete no hace falta «Ver más»`);
    await page.getByRole('button', { name: 'Todas', exact: true }).click();
    await page.waitForFunction(() => document.querySelectorAll('[class*="border-b"] p.truncate').length === 20, null, { timeout: 5000 });

    // El interruptor del equipo: se pinta lo que confirmó el servidor.
    const interruptor = page.locator('[data-team-completions-switch]');
    assert.equal(await interruptor.getAttribute('aria-checked'), 'false', `${name}: nace apagado`);
    const caja = await interruptor.boundingBox();
    assert.ok(caja.width >= 44 && caja.height >= 44, `${name}: el interruptor es alcanzable con el dedo (${JSON.stringify(caja)})`);
    await interruptor.click();
    await page.waitForFunction(
      () => document.querySelector('[data-team-completions-switch]')?.getAttribute('aria-checked') === 'true',
      null,
      { timeout: 5000 }
    );
    assert.deepEqual(guardadas, { teamCompletions: true }, `${name}: se guarda lo que se encendió`);
    await page.getByText('Recibes un aviso aquí cada vez que alguien termina uno.', { exact: true }).waitFor({ timeout: 5000 });
    await page.screenshot({ path: `output/notificaciones-equipo-${name}.png`, fullPage: true });

    await interruptor.click();
    await page.waitForFunction(
      () => document.querySelector('[data-team-completions-switch]')?.getAttribute('aria-checked') === 'false',
      null,
      { timeout: 5000 }
    );
    assert.deepEqual(guardadas, { teamCompletions: false }, `${name}: también se apaga`);

    assert.deepEqual(errors, [], `${name}: sin errores de página`);
    assert.ok(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
      `${name}: el panel no desborda a lo ancho`
    );
    console.log(`${name}: contador real, filtro de sin leer, «Ver más» y el interruptor confirmado por el servidor`);
    await page.close();
  }
} finally {
  await browser?.close();
  await server.close();
}
