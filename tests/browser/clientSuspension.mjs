// Recorrido real de la suspensión por cartera (30 de octubre de 2026, respuesta de Elisa al punto 7).
//
// Comprueba en la pantalla de verdad lo que una prueba de nodo no ve: que el aviso se lee, que el diálogo exige quién
// lo autorizó y por qué, y que después la página dice desde qué mes está congelada la cuenta. En claro, en oscuro y en
// celular, porque Elisa trabaja mucho desde el teléfono.
//
//   node scripts/preview-client-operations.js
//   node tests/browser/clientSuspension.mjs
import { mkdir } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';

const BASE = process.env.PREVIEW_URL || 'http://127.0.0.1:3700';
const OUT = process.env.SHOT_DIR || 'output/suspension-cartera';
await mkdir(OUT, { recursive: true });

const browser = await chromium.launch({ channel: 'chrome' });
const problems = [];
// Lo que la muestra local no sirve (chat del equipo, semáforo, la fuente de Google contra su CSP) no es un fallo de
// esta pantalla; cualquier otro error de consola sí.
const noise = /Failed to load resource|favicon|no disponible en esta muestra local|fonts\.googleapis\.com|ServiceHealthIcon|TeamChat/i;

const openClient = async (page, { dark = false, mobile = false } = {}) => {
    // `domcontentloaded`, no `networkidle`: el servidor de desarrollo deja abierto el socket de recarga en caliente.
    await page.goto(`${BASE}/clientes/operacion/casa-verde${dark ? '?dark' : ''}`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('[data-client-suspension]', { timeout: 20000 });
    if (mobile) await page.waitForTimeout(200);
};

try {
    for (const tema of ['light', 'dark']) {
        const context = await browser.newContext({ viewport: { width: 1280, height: 1000 }, colorScheme: tema });
        const page = await context.newPage();
        page.on('console', (msg) => { if (msg.type() === 'error' && !noise.test(msg.text())) problems.push(`${tema}: ${msg.text()}`); });
        page.on('pageerror', (error) => { if (!noise.test(error.message)) problems.push(`${tema}: ${error.message}`); });
        await openClient(page, { dark: tema === 'dark' });

        // 1. Todavía no está suspendido: se ofrece, con los días vencidos y sin cifras en el aviso de la ficha.
        const aviso = page.locator('[data-client-suspension="candidate"]');
        assert.equal(await aviso.count(), 1, 'se ofrece suspender a quien puede decidirlo');
        const texto = await aviso.innerText();
        assert.match(texto, /Cumple la condición/);
        assert.match(texto, /109 días/);
        await page.screenshot({ path: `${OUT}/1-propuesta-${tema}.png`, fullPage: false });

        // 2. El diálogo no deja suspender sin decir quién lo autorizó.
        await page.locator('[data-client-suspension-open]').click();
        await page.waitForSelector('[data-suspension-dialog="suspend"]');
        assert.match(await page.locator('[data-suspension-candidate]').innerText(), /\$9\.450\.000/, 'las cifras sí van en el diálogo de quien decide');
        await page.locator('[data-suspension-save]').click();
        assert.match(await page.locator('[data-suspension-dialog] [role="alert"]').innerText(), /quién autorizó/);

        await page.locator('[data-suspension-authorized-by]').fill('Francisco Villa');
        await page.locator('[data-suspension-save]').click();
        assert.match(await page.locator('[data-suspension-dialog] [role="alert"]').innerText(), /por qué/);
        await page.screenshot({ path: `${OUT}/2-dialogo-${tema}.png` });

        // 3. Suspendida: la página dice desde cuándo, quién la autorizó y desde qué mes.
        await page.locator('[data-suspension-reason]').fill('No paga desde julio y no responde a la gestión de cobro.');
        await page.locator('[data-suspension-save]').click();
        await page.waitForSelector('[data-client-suspension="active"]');
        const activa = await page.locator('[data-client-suspension="active"]').innerText();
        assert.match(activa, /Suspendido por cartera/);
        assert.match(activa, /Francisco Villa/);
        assert.match(activa, /noviembre de 2026/);
        assert.match(activa, /Se levanta sola/);
        assert.match(activa, /Levantar la suspensión/);
        await page.screenshot({ path: `${OUT}/3-suspendido-${tema}.png` });

        console.log(`${tema}: propuesta, diálogo y suspensión activa`);
        await context.close();
    }

    // 4. En celular: el aviso y el botón caben y se leen.
    const mobile = await browser.newContext({ viewport: { width: 390, height: 844 }, colorScheme: 'light', isMobile: true, hasTouch: true });
    const page = await mobile.newPage();
    page.on('pageerror', (error) => { if (!noise.test(error.message)) problems.push(`celular: ${error.message}`); });
    await openClient(page, { mobile: true });
    const caja = await page.locator('[data-client-suspension]').boundingBox();
    assert.ok(caja.width <= 390, 'el aviso no se sale de la pantalla');
    assert.ok((await page.locator('[data-client-suspension-open]').boundingBox()).height >= 36, 'el botón conserva área táctil');
    await page.screenshot({ path: `${OUT}/4-celular.png` });
    await mobile.close();

    assert.deepEqual(problems, [], 'la consola no puede traer errores');
    console.log(`Suspensión por cartera verificada. Capturas en ${OUT}`);
} finally {
    await browser.close();
}
