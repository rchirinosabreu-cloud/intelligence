import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright-core';
import { createNavigationPreview } from '../../scripts/preview-navigation.js';
import { chooseOption } from './selectHelpers.mjs';

let preview, browser;
const client = { id: 'navigation-client', name: 'Cliente de prueba', slug: 'cliente-de-prueba', socialAccounts: [] };
const piece = (status, month = 11) => ({ id: `${status}-${month}`, objective: `Contenido ${status}`, status, format: 'Post',
  publishDate: `2026-${month}-05T00:00:00Z`, copyText: 'Guion', captionText: 'Texto', finalAssets: [], mediaUrl: [], assetsLinks: [], tasks: [] });
const nativePlan = month => ({ id: `plan-${month}`, clientId: client.id, client, month, year: 2026, status: 'ACTIVO',
  items: ['APROBADO', 'REALIZADO', 'PUBLICADO'].map(status => piece(status, month)), shareToken: 'local', updatedAt: '2026-11-05T15:00:00Z' });
const externalPlan = (month, year = 2026) => ({ client, month, year, label: month === 10 ? 'Octubre' : month === 11 ? 'Noviembre' : 'Diciembre',
  tabName: month === 10 ? 'OCTUBRE' : month === 11 ? 'NOVIEMBRE' : 'DICIEMBRE', readAt: '2026-11-05T15:00:00Z', sheetUrl: 'https://example.com/hoja',
  pieces: [], changes: [], editable: false, statusOptions: [] });

test.before(async () => {
  preview = await createNavigationPreview({ port: 0 });
  browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
  await mkdir('output/content-plan-periods', { recursive: true });
});
test.after(async () => { await browser?.close(); await preview?.close(); });

const settle = async page => { await page.evaluate(() => document.fonts.ready); await page.waitForTimeout(600); };
const shot = async (page, name) => { await settle(page); await page.screenshot({ path: `output/content-plan-periods/${name}.png`, fullPage: true, animations: 'disabled' }); };

async function openPage({ mobile = false, dark = false, listError = false, onlyCurrent = false } = {}) {
  const page = await browser.newPage({ viewport: { width: mobile ? 390 : 1440, height: 1000 }, isMobile: mobile, hasTouch: mobile });
  page.setDefaultTimeout(6000);
  const writes = [];
  await page.route('**/api/**', async route => {
    const request = route.request();
    const url = new URL(request.url());
    if (request.method() !== 'GET') { writes.push(`${request.method()} ${url.pathname}`); return route.fulfill({ status: 405, json: { error: 'Solo lectura' } }); }
    if (url.pathname === '/api/content/plans') {
      if (listError) return route.fulfill({ status: 403, json: { error: 'Sin acceso al listado' } });
      return route.fulfill({ json: onlyCurrent ? [nativePlan(11)] : [nativePlan(11), nativePlan(12)] });
    }
    if (url.pathname.startsWith('/api/content/plans/')) return route.fulfill({ json: nativePlan(url.pathname.includes('12-2026') || url.pathname.endsWith('plan-12') ? 12 : 11) });
    if (url.pathname === '/api/content/external-plans' && listError) return route.fulfill({ status: 403, json: { error: 'Sin acceso al listado' } });
    if (url.pathname === '/api/content/external-plans') return route.fulfill({ json: [{ client, months: [
      { month: 11, year: 2026, label: 'Noviembre', slug: 'noviembre-2026', tabName: 'NOVIEMBRE', readAt: '2026-11-05' },
      { month: 12, year: 2026, label: 'Diciembre', slug: 'diciembre-2026', tabName: 'DICIEMBRE', readAt: '2026-11-05' },
      { month: 1, year: 2027, label: 'Enero', slug: 'enero-2027', tabName: null, readAt: null },
    ] }] });
    if (url.pathname.endsWith('/cliente-de-prueba/periods')) return route.fulfill(listError
      ? { status: 403, json: { error: 'Sin acceso al listado' } }
      : { json: { client, months: [
        { month: 11, year: 2026, tabName: 'NOVIEMBRE', readAt: '2026-11-05' },
        { month: 12, year: 2026, tabName: 'DICIEMBRE', readAt: '2026-11-05' },
        { month: 10, year: 2025, tabName: 'OCTUBRE 2025', readAt: '2025-10-05' },
      ] } });
    if (url.pathname.startsWith('/api/content/external-plans/')) return route.fulfill({ json: externalPlan(
      url.pathname.includes('octubre') ? 10 : url.pathname.includes('diciembre') ? 12 : 11, url.pathname.includes('2025') ? 2025 : 2026) });
    if (url.pathname === '/api/public/parrilla/local') return route.fulfill({ json: nativePlan(11) });
    return route.continue();
  });
  await page.addInitScript(value => { window.__periodDark = value; }, dark);
  return { page, writes, theme: async () => page.evaluate(value => document.documentElement.classList.toggle('dark', value), dark) };
}

test('cambiar noviembre a diciembre conserva calendario y regreso a la carpeta, sin crear parrillas', async () => {
  const { page, writes } = await openPage();
  try {
    // El listado nativo es la entrada: no necesitamos mostrar aquí el espejo de la misma cuenta.
    await page.route('**/api/content/external-plans', route => route.fulfill({ json: [] }));
    await page.goto(`${preview.origin}/parrillas?q=prueba&client=${client.id}`);
    await page.getByText(/^noviembre 2026$/i).click();
    await page.getByRole('button', { name: 'Calendario', exact: true }).click();
    const origin = await page.evaluate(() => window.__navigationLocation.state.from.path);
    await chooseOption(page.getByRole('combobox', { name: 'Período de la parrilla' }), '/parrillas/cliente-de-prueba/diciembre-2026');
    await page.getByRole('heading', { name: 'diciembre 2026', exact: true }).waitFor();
    assert.equal(await page.getByRole('button', { name: 'Calendario', exact: true }).getAttribute('aria-pressed'), 'true');
    assert.equal(await page.evaluate(() => window.__navigationLocation.state.from.path), origin);
    assert.equal(new URL(page.url()).searchParams.get('item'), null);
    await page.reload();
    assert.equal(await page.getByRole('button', { name: 'Calendario', exact: true }).getAttribute('aria-pressed'), 'true');
    await shot(page, 'calendario-claro');
    await page.getByRole('button', { name: /Contenido REALIZADO/ }).click();
    await page.locator('#item-REALIZADO-12').waitFor();
    assert.equal(await page.getByRole('button', { name: 'Editor', exact: true }).getAttribute('aria-pressed'), 'true');
    assert.equal(new URL(page.url()).searchParams.get('item'), 'REALIZADO-12');
    await page.locator('[data-back-to-origin] button').click();
    assert.equal(await page.getByPlaceholder('Buscar por cliente, mes o año...').inputValue(), 'prueba');
    assert.equal(new URL(page.url()).searchParams.get('client'), client.id);
    assert.deepEqual(writes, []);
  } finally { await page.close(); }
});

test('el período móvil conserva el editor y no arrastra la pieza del mes anterior', async () => {
  const { page, writes, theme } = await openPage({ mobile: true, dark: true });
  try {
    await page.goto(`${preview.origin}/parrillas/plan-11?item=PUBLICADO-11&dark`);
    await theme();
    await page.locator('#item-PUBLICADO-11').waitFor();
    await chooseOption(page.getByRole('combobox', { name: 'Período de la parrilla' }), '/parrillas/cliente-de-prueba/diciembre-2026');
    await page.locator('#item-APROBADO-12').waitFor();
    assert.equal(new URL(page.url()).searchParams.get('item'), null);
    assert.equal(await page.getByRole('button', { name: 'Editor', exact: true }).getAttribute('aria-pressed'), 'true');
    await settle(page);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth),
      JSON.stringify(await page.evaluate(() => [...document.querySelectorAll('body *')].filter(node => node.getBoundingClientRect().right > document.documentElement.clientWidth + 1).slice(0, 8).map(node => ({ tag: node.tagName, className: node.className, right: node.getBoundingClientRect().right })))));
    await shot(page, 'editor-movil-oscuro');
    assert.deepEqual(writes, []);
  } finally { await page.close(); }
});

test('sin otros períodos o sin permiso de listado se explica el límite y sigue visible la parrilla', async () => {
  for (const listError of [false, true]) {
    const { page, writes } = await openPage({ listError, onlyCurrent: true });
    try {
      await page.goto(`${preview.origin}/parrillas/plan-11`);
      if (listError) await page.getByRole('status').filter({ hasText: 'No pudimos consultar otros períodos.' }).waitFor();
      else await page.getByText('No hay otros períodos disponibles.', { exact: true }).waitFor();
      await page.locator('#item-APROBADO-11').waitFor();
      assert.equal(await page.getByRole('combobox', { name: 'Período de la parrilla' }).isDisabled(), true);
      assert.deepEqual(writes, []);
    } finally { await page.close(); }
  }
});

test('MIO recupera meses históricos leídos y regresa a la carpeta sin crear ni refrescar hojas', async () => {
  const { page, writes } = await openPage();
  try {
    await page.goto(`${preview.origin}/parrillas?q=prueba&client=${client.id}`);
    await page.getByText(/^Noviembre 2026$/i).click();
    const origin = await page.evaluate(() => window.__navigationLocation.state.from.path);
    await chooseOption(page.getByRole('combobox', { name: 'Período de la parrilla' }), '/parrillas/hoja/cliente-de-prueba/diciembre-2026');
    await page.getByRole('heading', { name: /Cliente de prueba · Diciembre 2026/ }).waitFor();
    await page.getByRole('combobox', { name: 'Período de la parrilla' }).click();
    assert.equal(await page.getByRole('option', { name: /Enero 2027/ }).count(), 0);
    await page.keyboard.press('Escape');
    await chooseOption(page.getByRole('combobox', { name: 'Período de la parrilla' }), '/parrillas/hoja/cliente-de-prueba/octubre-2025');
    await page.getByRole('heading', { name: /Cliente de prueba · Octubre 2025/ }).waitFor();
    assert.equal(await page.evaluate(() => window.__navigationLocation.state.from.path), origin);
    await shot(page, 'mio-claro');
    await page.locator('[data-back-to-origin] button').click();
    assert.equal(await page.getByPlaceholder('Buscar por cliente, mes o año...').inputValue(), 'prueba');
    assert.equal(new URL(page.url()).searchParams.get('client'), client.id);
    assert.deepEqual(writes, []);
  } finally { await page.close(); }
});

test('editor y portal distinguen aprobación, realización y publicación mediante etiqueta, icono y tono', async () => {
  const { page } = await openPage();
  try {
    for (const [route, dark, mobile] of [['/parrillas/plan-11', false, false], ['/parrillas/plan-11', true, false], ['/shared/local', false, false], ['/shared/local', true, false], ['/shared/local', true, true]]) {
      await page.setViewportSize({ width: mobile ? 390 : 1440, height: 1000 });
      await page.goto(`${preview.origin}${route}`);
      await page.evaluate(value => document.documentElement.classList.toggle('dark', value), dark);
      const scope = route.startsWith('/shared') ? page : page.locator('nav[aria-label="Piezas de la parrilla"]');
      const presentations = [];
      for (const [status, label] of [['APROBADO', 'Aprobada'], ['REALIZADO', 'Realizada'], ['PUBLICADO', 'Publicada']]) {
        const chip = scope.locator(`[data-piece-status="${status}"]`).first();
        await chip.waitFor();
        assert.match(await chip.textContent(), new RegExp(label));
        assert.equal(await chip.locator('svg').count(), 1);
        const contrast = await chip.evaluate(node => {
          const rgba = value => value.match(/[\d.]+/g).map(Number);
          const chain = []; for (let parent = node; parent; parent = parent.parentElement) chain.unshift(parent);
          let background = [255, 255, 255];
          for (const parent of chain) {
            const [r, g, b, a = 1] = rgba(getComputedStyle(parent).backgroundColor);
            background = [r, g, b].map((value, index) => value * a + background[index] * (1 - a));
          }
          const luminance = rgb => rgb.map(value => value / 255).map(value => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4)
            .reduce((sum, value, index) => sum + value * [0.2126, 0.7152, 0.0722][index], 0);
          const foreground = rgba(getComputedStyle(node).color).slice(0, 3);
          const values = [luminance(foreground), luminance(background)].sort((a, b) => b - a);
          return { ratio: (values[0] + 0.05) / (values[1] + 0.05), foreground, background };
        });
        assert.ok(contrast.ratio >= 4.5, `${label} necesita contraste AA: ${JSON.stringify(contrast)}`);
        presentations.push(await chip.getAttribute('class'));
      }
      assert.equal(new Set(presentations).size, 3);
      await shot(page, `${route.startsWith('/shared') ? 'portal' : 'estados-editor'}-${dark ? 'oscuro' : 'claro'}${mobile ? '-movil' : ''}`);
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth));
    }
  } finally { await page.close(); }
});

test('un listado MIO denegado no habilita otros períodos ni afecta la consulta ya autorizada', async () => {
  const { page, writes } = await openPage({ listError: true });
  try {
    await page.goto(`${preview.origin}/parrillas/hoja/cliente-de-prueba/noviembre-2026`);
    await page.getByRole('heading', { name: /Cliente de prueba · Noviembre 2026/ }).waitFor();
    await page.getByRole('status').filter({ hasText: 'No pudimos consultar otros períodos.' }).waitFor();
    assert.equal(await page.getByRole('combobox', { name: 'Período de la parrilla' }).isDisabled(), true);
    assert.deepEqual(writes, []);
  } finally { await page.close(); }
});

test('editar una pieza mantiene el período hasta cerrar la edición', async () => {
  const { page, writes } = await openPage();
  try {
    await page.goto(`${preview.origin}/parrillas/plan-11`);
    await page.locator('#item-APROBADO-11').getByRole('button', { name: 'Editar', exact: true }).click();
    await page.getByText('Termina la edición o entrega antes de cambiar de período.', { exact: true }).waitFor();
    assert.equal(await page.getByRole('combobox', { name: 'Período de la parrilla' }).isDisabled(), true);
    assert.deepEqual(writes, []);
  } finally { await page.close(); }
});

test('MIO conserva las respuestas abiertas hasta cancelar o confirmar su envío antes de cambiar período', async () => {
  const { page } = await openPage();
  const replies = [];
  const comment = id => ({ id, author: 'Cliente', content: 'Revisemos este detalle.', createdAt: '2026-11-05T15:00:00Z', replies: [] });
  let plan = { ...externalPlan(11), editable: true, commentsRead: true,
    pieces: [{ row: 3, number: 1, format: 'Post', status: 'APROBADO', comments: [comment('piece-comment')] }],
    looseComments: [comment('loose-comment')] };
  await page.route('**/api/content/external-plans/cliente-de-prueba/noviembre-2026', route => route.fulfill({ json: plan }));
  await page.route('**/api/content/external-plans/cliente-de-prueba/noviembre-2026/comments/*/replies', async route => {
    replies.push(route.request().postDataJSON());
    if (replies.length === 1) return route.fulfill({ status: 502, json: { error: 'No pudimos publicar la respuesta.' } });
    plan = { ...plan, looseComments: [{ ...plan.looseComments[0], replies: [{ id: 'saved-reply', author: 'Equipo', content: replies[1].content }] }] };
    return route.fulfill({ json: plan });
  });
  try {
    await page.goto(`${preview.origin}/parrillas/hoja/cliente-de-prueba/noviembre-2026`);
    const selector = page.getByRole('combobox', { name: 'Período de la parrilla' });
    const pieceThread = page.locator('[data-google-comment="piece-comment"]');
    const looseThread = page.locator('[data-google-comment="loose-comment"]');
    await pieceThread.locator('[data-reply-open]').click();
    await pieceThread.locator('[data-reply-text]').waitFor();
    assert.equal(await selector.isDisabled(), true, 'abrir la respuesta ya protege el período');
    await pieceThread.locator('[data-reply-text]').fill('Borrador de la pieza.');
    assert.equal(await selector.isDisabled(), true, 'el selector protege también la respuesta que todavía no se ha enviado');
    await looseThread.locator('[data-reply-open]').click();
    await looseThread.locator('[data-reply-text]').fill('Respuesta pendiente sin pieza.');
    await pieceThread.getByRole('button', { name: 'Cancelar', exact: true }).click();
    assert.equal(await selector.isDisabled(), true, 'cancelar una respuesta no descarta la otra');
    const rejected = page.waitForResponse(response => response.url().includes('/comments/loose-comment/replies') && response.status() === 502);
    await looseThread.locator('[data-reply-send]').click();
    await rejected;
    await page.waitForFunction(() => document.querySelector('[data-google-comment="loose-comment"] [data-reply-send]')?.disabled === false);
    assert.equal(await looseThread.locator('[data-reply-text]').inputValue(), 'Respuesta pendiente sin pieza.');
    assert.equal(await selector.isDisabled(), true, 'un rechazo de la hoja conserva el borrador y el período');
    await looseThread.locator('[data-reply-send]').click();
    await looseThread.locator('[data-reply-open]').waitFor();
    assert.equal(await selector.isDisabled(), false, 'el recibo confirmado permite cambiar de período');
    assert.deepEqual(replies, [
      { content: 'Respuesta pendiente sin pieza.', resolve: false },
      { content: 'Respuesta pendiente sin pieza.', resolve: false },
    ]);
    await chooseOption(selector, '/parrillas/hoja/cliente-de-prueba/diciembre-2026');
    await page.getByRole('heading', { name: /Cliente de prueba · Diciembre 2026/ }).waitFor();
  } finally { await page.close(); }
});
