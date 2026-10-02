// Recorrido real de «varias cuentas por cliente» (Rodny, 2 de octubre de 2026): PromoGroup IPS y Endova
// comparten parrilla. Monta los componentes de verdad contra una API en memoria y deja capturas en
// `output/`: la pieza elige a qué cuentas va, se programa en las marcadas, quitarle una cuenta cancela
// lo programado ahí, el mes dice a dónde va cada pieza, y con una sola cuenta nada cambia.
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { createServer } from 'vite';
import { chromium } from 'playwright-core';

const EDITOR = '/tests/fixtures/plan-editor-preview.html';
const CLIENT = '/tests/fixtures/social-publishing-preview.html';

const server = await createServer({ logLevel: 'error', server: { host: '127.0.0.1', port: 0, open: false } });
let browser;

const band = '[data-social-publishing-panel]';
const bandState = (page) => page.evaluate(() => ({
  chips: [...document.querySelectorAll('[data-social-page-choice] label')].map((label) => `${label.innerText.trim()}:${label.querySelector('input').checked}`),
  rows: [...document.querySelectorAll('[data-social-publishing-panel] li[data-social-account]')].map((row) => row.innerText.replace(/\n/g, ' '))
}));

try {
  await server.listen();
  await mkdir('output', { recursive: true });
  const base = `http://127.0.0.1:${server.httpServer.address().port}`;
  browser = await chromium.launch({
    executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    headless: true
  });

  for (const [name, dark] of [['claro', false], ['oscuro', true]]) {
    const page = await browser.newPage({ viewport: { width: 1500, height: 1000 }, deviceScaleFactor: 2 });
    const open = async (url) => {
      await page.goto(`${base}${url}`, { waitUntil: 'networkidle' });
      if (dark) await page.evaluate(() => document.documentElement.classList.add('dark'));
      await page.evaluate(() => document.fonts.ready);
    };
    // La banda con la tarjeta alrededor. Se recorta de la ventana, no del elemento: al llegar por enlace
    // la parrilla recoloca la pieza durante segundo y medio, y capturar el elemento en ese rato sale en blanco.
    const shotBand = async (path) => {
      await page.locator(band).scrollIntoViewIfNeeded();
      await page.waitForTimeout(400);
      const box = await page.locator(band).boundingBox();
      await page.screenshot({ path, clip: { x: Math.max(0, box.x - 16), y: Math.max(0, box.y - 16), width: box.width + 32, height: box.height + 32 } });
    };

    // 1. Una pieza de Endova dentro de la parrilla de PromoGroup: la banda pregunta a qué cuentas va.
    await open(`${EDITOR}?item=i1&futuro=1`);
    await page.waitForSelector(band);
    await page.waitForTimeout(2000);
    let state = await bandState(page);
    assert.deepEqual(state.chips, ['PromoGroup IPS:false', 'Endova:true']);
    assert.deepEqual(state.rows, ['Endova · Sin programar', '@endova.salud · Sin programar'], 'only the accounts of this piece');
    await shotBand(`output/cuentas-1-pieza-de-endova-${name}.png`);

    // 2. El mes dice a dónde va cada pieza.
    const rail = await page.evaluate(() => [...document.querySelectorAll('nav[aria-label="Piezas de la parrilla"] [data-piece-account]')].map((node) => node.textContent));
    assert.deepEqual(rail.slice(0, 4), ['Endova', 'PromoGroup IPS + Endova', 'Endova', 'PromoGroup IPS']);
    await page.locator('nav[aria-label="Piezas de la parrilla"]').screenshot({ path: `output/cuentas-2-carril-${name}.png` });

    // 3. La misma pieza a las dos cuentas: se marca la otra y se programa en las cuatro redes.
    await page.locator('[data-social-page-choice] label', { hasText: 'PromoGroup IPS' }).click();
    await page.waitForFunction(() => document.querySelectorAll('[data-social-publishing-panel] li[data-social-account]').length === 4);
    await shotBand(`output/cuentas-3-va-a-las-dos-${name}.png`);
    await page.locator(`${band} button`, { hasText: 'Programar' }).click();
    await page.waitForFunction(() => [...document.querySelectorAll('[data-social-publishing-panel] li[data-social-account]')].every((row) => /Programada/.test(row.innerText)));
    state = await bandState(page);
    assert.equal(state.rows.length, 4);
    await shotBand(`output/cuentas-4-programada-en-las-dos-${name}.png`);

    // 4. Se le quita Endova: lo programado ahí se cancela y la pieza queda solo en PromoGroup.
    await page.locator('[data-social-page-choice] label', { hasText: 'Endova' }).click();
    await page.waitForFunction(() => document.querySelectorAll('[data-social-publishing-panel] li[data-social-account]').length === 2);
    state = await bandState(page);
    assert.deepEqual(state.chips, ['PromoGroup IPS:true', 'Endova:false']);
    assert.ok(state.rows.every((row) => /PromoGroup IPS|@promogroup\.ips/.test(row) && /Programada/.test(row)), 'what was scheduled on the account that stays is untouched');
    await shotBand(`output/cuentas-5-solo-promogroup-${name}.png`);

    // 4b. Y se le quita también la última: nada queda marcado, nada queda programado, y la banda pide
    // elegir (Rodny, 2 de octubre de 2026: «quiero poder seleccionar y deseleccionar»).
    const lastChip = page.locator('[data-social-page-choice] label', { hasText: 'PromoGroup IPS' });
    assert.equal(await lastChip.locator('input').isDisabled(), false, 'the last account can be unticked too');
    await lastChip.click();
    await page.waitForSelector('[data-social-choose-account]');
    state = await bandState(page);
    assert.deepEqual(state.chips, ['PromoGroup IPS:false', 'Endova:false']);
    assert.deepEqual(state.rows, [], 'what was scheduled is cancelled and the piece goes nowhere');
    assert.equal(await page.locator(`${band} button`, { hasText: 'Programar' }).count(), 0);
    await shotBand(`output/cuentas-5b-ninguna-marcada-${name}.png`);

    // 5. El calendario del mes también lo dice.
    await page.getByRole('button', { name: 'Calendario' }).click();
    await page.waitForFunction(() => document.querySelectorAll('[data-piece-account]').length > 0);
    // El aviso de «programada» ya se fue y el calendario queda a la vista, bajo el header fijo.
    await page.evaluate(() => {
      document.querySelector('[data-piece-account]').closest('.grid').scrollIntoView({ block: 'start' });
      window.scrollBy(0, -140);
    });
    await page.waitForTimeout(4500);
    await page.screenshot({ path: `output/cuentas-6-calendario-${name}.png`, fullPage: false });

    // 5b. Una pieza que todavía no eligió: ninguna casilla marcada, ninguna fila, y se le pide elegir.
    await open(`${EDITOR}?item=i8`);
    await page.waitForSelector(band);
    await page.waitForTimeout(2000);
    state = await bandState(page);
    assert.deepEqual(state.chips, ['PromoGroup IPS:false', 'Endova:false'], 'nothing comes ticked');
    assert.deepEqual(state.rows, []);
    assert.equal(await page.locator('[data-social-choose-account]').count(), 1);
    await shotBand(`output/cuentas-5c-pieza-sin-elegir-${name}.png`);

    // 6. Con una sola cuenta nada cambia: sin pregunta en la banda, sin rótulos en el mes.
    await open(`${EDITOR}?item=i1&futuro=1&unaCuenta=1`);
    await page.waitForSelector(band);
    await page.waitForTimeout(2000);
    assert.equal(await page.locator('[data-social-page-choice]').count(), 0);
    assert.equal(await page.locator('[data-piece-account]').count(), 0);
    state = await bandState(page);
    assert.deepEqual(state.rows, ['PromoGroup IPS · Sin programar', '@promogroup.ips · Sin programar']);
    await shotBand(`output/cuentas-7-una-sola-cuenta-${name}.png`);

    // 7. La ficha del cliente: las cuentas agrupadas por página; ninguna es «la principal».
    await open(CLIENT);
    const widget = page.locator('[data-social-accounts-widget]').first();
    await widget.waitFor();
    const pages = await widget.evaluate((node) => [...node.querySelectorAll('[data-social-page]')].map((group) => group.innerText.replace(/\n/g, ' | ')));
    assert.equal(pages.length, 2);
    assert.match(pages[0], /^PromoGroup IPS/);
    assert.doesNotMatch(await widget.innerText(), /Por defecto/, 'no account is the default one');
    // Con cuentas ya conectadas el botón es solo el «+»: su nombre lo lleva la etiqueta, no el texto.
    const connect = widget.getByRole('button', { name: 'Conectar otra página' });
    assert.equal(await connect.count(), 1);
    assert.equal((await connect.innerText()).trim(), '');
    const titleBox = await widget.locator('h3').boundingBox();
    assert.ok(titleBox.height < 32, 'the title of the card stays on one line');
    await widget.screenshot({ path: `output/cuentas-8-ficha-del-cliente-${name}.png` });

    await page.close();
  }
  console.log('Varias cuentas por cliente: recorrido completo. Capturas en output/cuentas-*.png');
} finally {
  await browser?.close();
  await server.close();
}
