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
    // Un dispositivo que sí puede recibir avisos: así el panel ofrece los dos interruptores.
    await page.route('**/api/push/status', (route) => route.fulfill({ json: { enabled: true, publicKey: 'clave-de-prueba' } }));
    await page.route('**/api/notifications?**', (route) => route.fulfill({ json: { items: [], nextCursor: null, unreadCount: 0, preferences: { teamCompletions: false } } }));
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
    // Al abrir, el primer aviso se ve entero: nada de empezar a media tarjeta.
    assert.equal(
      await rail.evaluate((element) => Math.round(element.scrollTop)),
      0,
      `${name}: el panel abre con la lista arriba del todo`
    );

    // El contador lo dice el servidor, no la página visible.
    await page.getByRole('button', { name: 'Sin leer (7)', exact: true }).waitFor({ timeout: 5000 });

    // Cada interruptor es una línea, sin descripción (Rodny, 26 de octubre de 2026).
    const filaEquipo = page.locator('[data-notification-toggle="team-completions"]');
    const filaDispositivo = page.locator('[data-notification-toggle="push"]');
    await filaEquipo.waitFor({ timeout: 5000 });
    assert.equal(await filaDispositivo.count(), 1, `${name}: se ofrece el del dispositivo`);
    for (const [etiqueta, fila] of [['equipo', filaEquipo], ['dispositivo', filaDispositivo]]) {
      const alto = Math.round((await fila.boundingBox()).height);
      // Una línea con su área táctil de 44 px; la versión con descripción pasaba de 70.
      assert.ok(alto <= 50, `${name}: la fila del ${etiqueta} mide una línea (${alto}px)`);
      assert.equal(
        await fila.locator('[data-notification-toggle-note]').count(),
        0,
        `${name}: en la campana la fila del ${etiqueta} no lleva descripción`
      );
    }
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

    // Encenderlo lo retira del panel en el acto: ya está decidido y su sitio es Perfil.
    const interruptor = page.locator('[data-notification-toggle-switch="team-completions"]');
    assert.equal(await interruptor.getAttribute('aria-checked'), 'false', `${name}: nace apagado`);
    await interruptor.click();
    await page.waitForFunction(
      () => !document.querySelector('[data-notification-toggle="team-completions"]'),
      null,
      { timeout: 5000 }
    );
    assert.equal(guardadas.teamCompletions, true, `${name}: se guarda lo que se encendió`);
    assert.equal(guardadas.teamCompletionsDismissed, false, `${name}: encenderlo limpia el descarte`);

    // Y el del dispositivo se puede descartar sin encender nada.
    await page.locator('[data-notification-toggle-dismiss="push"]').click();
    await page.waitForFunction(
      () => !document.querySelector('[data-notification-toggle="push"]'),
      null,
      { timeout: 5000 }
    );
    await page.screenshot({ path: `output/notificaciones-sin-interruptores-${name}.png`, fullPage: true });

    assert.deepEqual(errors, [], `${name}: sin errores de página`);
    assert.ok(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
      `${name}: el panel no desborda a lo ancho`
    );

    // En Perfil los dos están siempre, decididos o no, y ahí sí se explican.
    await page.goto(`http://127.0.0.1:${port}/tests/fixtures/notifications-panel-preview.html?perfil`);
    await page.evaluate((isDark) => document.documentElement.classList.toggle('dark', isDark), dark);
    await page.locator('[data-notification-toggle="team-completions"]').waitFor({ timeout: 5000 });
    await page.locator('[data-notification-toggle="push"]').waitFor({ timeout: 5000 });
    assert.equal(
      await page.locator('[data-notification-toggle="team-completions"] [data-notification-toggle-dismiss]').count(),
      0,
      `${name}: en Perfil no se descarta nada, se enciende o se apaga`
    );
    // Y aquí los dos llevan su línea, siempre: la sección se lee igual de arriba abajo.
    for (const control of ['push', 'team-completions']) {
      const nota = page.locator(`[data-notification-toggle="${control}"] [data-notification-toggle-note]`);
      assert.equal(await nota.count(), 1, `${name}: en Perfil «${control}» lleva su descripción`);
      assert.equal(
        (await nota.evaluate((element) => element.getClientRects().length)),
        1,
        `${name}: la descripción de «${control}» cabe en una línea`
      );
    }
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({ path: `output/notificaciones-perfil-${name}.png`, fullPage: true });

    console.log(`${name}: contador real, filtro, «Ver más», interruptores de una línea y Perfil con los dos`);
    await page.close();
  }
} finally {
  await browser?.close();
  await server.close();
}
