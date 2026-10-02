// Recorrido real de «cifras de Meta» en Reportes (Rodny, 2 de octubre de 2026). Monta el módulo de
// verdad contra las rutas y el servicio de verdad; lo único de mentira es Meta (respuestas con la forma
// real, de un cliente de muestra) y la base de datos (en memoria). No llama a Meta ni a ningún modelo.
// Deja capturas en `output/`.
//
//   node tests/browser/reportMetaSources.mjs
import assert from 'node:assert/strict';
import path from 'node:path';
import { mkdir, writeFile } from 'node:fs/promises';
import express from 'express';
import multer from 'multer';
import { createServer } from 'vite';
import tailwindcss from 'tailwindcss';
import autoprefixer from 'autoprefixer';
import { chromium } from 'playwright-core';
import tailwindConfig from '../../tailwind.config.js';
import { createEvidenceExtractionHandler } from '../../src/routes/api/reportEvidenceRoutes.js';
import { createReportMetaRouter } from '../../src/routes/api/reportMetaRoutes.js';
import { createMetaReportService } from '../../src/services/metaReportService.js';

const root = process.cwd();
const work = path.join(root, 'tmp/reports-implementation/meta-sources');
await mkdir(work, { recursive: true });
await mkdir(path.join(root, 'output'), { recursive: true });

// --- La base, en memoria -------------------------------------------------------------------------
const clients = [
  { id: 'c-muestra', name: 'Cliente de muestra' },
  { id: 'c-dos', name: 'Grupo de muestra (dos cuentas)' },
  { id: 'c-nada', name: 'Cliente sin redes conectadas' }
];
const social = [
  { id: 's-1', clientId: 'c-muestra', platform: 'FACEBOOK', externalId: 'p1', displayName: 'Cliente de muestra', pageId: 'p1', encryptedToken: 'enc', isActive: true },
  { id: 's-2', clientId: 'c-muestra', platform: 'INSTAGRAM', externalId: 'ig1', displayName: '@clientedemuestra', pageId: 'p1', encryptedToken: 'enc', isActive: true },
  { id: 's-3', clientId: 'c-dos', platform: 'INSTAGRAM', externalId: 'ig2', displayName: '@grupo.muestra', pageId: 'p2', encryptedToken: 'enc', isActive: true },
  { id: 's-4', clientId: 'c-dos', platform: 'INSTAGRAM', externalId: 'ig3', displayName: '@unidad.muestra', pageId: 'p3', encryptedToken: 'enc', isActive: true }
];
const ads = [];
const matches = (row, where = {}) => Object.entries(where).every(([key, value]) => row[key] === value);
const db = {
  client: { findUnique: async ({ where }) => clients.find((row) => row.id === where.id) || null },
  clientSocialAccount: { findMany: async ({ where }) => social.filter((row) => matches(row, where)), findUnique: async ({ where }) => social.find((row) => row.id === where.id) || null },
  clientAdAccount: {
    findMany: async ({ where }) => ads.filter((row) => matches(row, where)),
    findUnique: async ({ where }) => ads.find((row) => row.id === where.id) || null,
    findFirst: async ({ where }) => ads.find((row) => matches(row, where)) || null,
    create: async ({ data }) => { const row = { id: `ad-${ads.length + 1}`, isActive: true, ...data }; ads.push(row); return row; },
    update: async ({ where, data }) => Object.assign(ads.find((row) => row.id === where.id), data)
  }
};

// --- Meta, con la forma de sus respuestas reales ------------------------------------------------
const media = [
  ['m1', 'Tres señales de que tu marca necesita un plan de contenidos', 'VIDEO', 'REELS', '2026-09-29T15:00:00+0000', { views: 2292, reach: 1147, total_interactions: 96, saved: 21, shares: 14 }],
  ['m2', 'Así se ve un mes bien planeado', 'CAROUSEL_ALBUM', 'FEED', '2026-09-22T15:00:00+0000', { views: 1380, reach: 905, total_interactions: 74, saved: 33, shares: 9 }],
  ['m3', 'Detrás de cámaras del rodaje', 'VIDEO', 'REELS', '2026-09-15T15:00:00+0000', { views: 1811, reach: 990, total_interactions: 58, saved: 6, shares: 11 }],
  ['m4', 'Nuevo horario de atención', 'IMAGE', 'FEED', '2026-09-08T15:00:00+0000', { views: 512, reach: 401, total_interactions: 19, saved: 2, shares: 1 }]
].map(([id, caption, media_type, media_product_type, timestamp, insights]) => ({ id, caption, media_type, media_product_type, timestamp, permalink: `https://www.instagram.com/p/${id}/`, insights }));
const metaCalls = [];
const insights = {
  listAdAccounts: async () => [
    { id: '1001', name: 'Agencia de muestra', currency: 'COP', isActive: true },
    { id: '1002', name: 'Cliente de muestra · cuenta propia', currency: 'USD', isActive: true },
    { id: '1003', name: 'Cuenta antigua', currency: 'COP', isActive: false }
  ],
  fetchInstagramReport: async ({ igUserId, username, period }) => {
    metaCalls.push(['instagram', igUserId, period]);
    const long = period.start.slice(0, 7) !== period.end.slice(0, 7) || Number(period.end.slice(8)) - Number(period.start.slice(8)) >= 30;
    return {
      account: { id: igUserId, username }, period, fetchedAt: '2026-10-02T15:00:00.000Z', reachIsExact: !long,
      totals: { views: 18489, total_interactions: 612, likes: 431, comments: 38, shares: 57, saves: 86, profile_views: 240, website_clicks: 31, ...(long ? {} : { reach: 6886, accounts_engaged: 402 }) },
      previousTotals: { views: 15010, total_interactions: 540, ...(long ? {} : { reach: 7420 }) }, previousPeriod: { start: '2026-08-02', end: '2026-08-31' },
      follows: { FOLLOWER: 64, NON_FOLLOWER: 12 }, followerTotal: 5231,
      formats: { views: { REEL: 11240, POST: 5210, STORY: 2039, AD: 1 }, total_interactions: { REEL: 380, POST: 232 }, ...(long ? {} : { reach: { REEL: 4980, POST: 2710, STORY: 640 } }) },
      media
    };
  },
  getPageToken: async () => 'fresh-page-token',
  fetchFacebookPageReport: async ({ pageId, pageName, period }) => {
    metaCalls.push(['facebook', pageId, period]);
    return {
      account: { id: pageId, name: pageName }, period, fetchedAt: '2026-10-02T15:00:00.000Z',
      totals: { page_media_view: 9120, page_post_engagements: 296, page_video_views: 1410, page_views_total: 233, page_total_actions: 17, page_daily_follows_unique: 29, page_daily_unfollows_unique: 4 },
      previousTotals: { page_media_view: 8000, page_post_engagements: 310 }, previousPeriod: { start: '2026-08-02', end: '2026-08-31' },
      followerTotal: 3363, followerDay: '2026-09-30',
      posts: [
        { id: 'p_2', message: 'Detrás de cámaras del rodaje', created_time: '2026-09-29T22:42:48+0000', permalink_url: 'https://www.facebook.com/p/2', status_type: 'added_video', reactions: { summary: { total_count: 31 } }, comments: { summary: { total_count: 4 } }, shares: { count: 6 }, insights: { post_media_view: 2240, post_total_media_view_unique: 1180, post_clicks: 52 } },
        { id: 'p_1', message: 'Así se ve un mes bien planeado', created_time: '2026-09-09T17:51:33+0000', permalink_url: 'https://www.facebook.com/p/1', status_type: 'added_photos', reactions: { summary: { total_count: 12 } }, comments: { summary: { total_count: 1 } }, insights: { post_media_view: 910, post_total_media_view_unique: 640, post_clicks: 18 } }
      ]
    };
  },
  fetchAdsReport: async ({ adAccountId, period, campaignFilter }) => {
    metaCalls.push(['ads', adAccountId, period, campaignFilter]);
    return {
      account: { id: adAccountId, name: 'Agencia de muestra', currency: 'COP' }, campaignFilter: campaignFilter || null, period, fetchedAt: '2026-10-02T15:00:00.000Z',
      totals: { spend: '377045', impressions: '114028', reach: '57460', clicks: '3105', inline_link_clicks: '1820', ctr: '2.723015', cpc: '121.431562', cpm: '3306.60' },
      previousTotals: { spend: '300000', impressions: '98000', clicks: '2400', inline_link_clicks: '1500' }, previousPeriod: { start: '2026-08-02', end: '2026-08-31' },
      campaigns: [
        { campaign_id: 'k1', campaign_name: 'MUESTRA - SEPTIEMBRE 2026', spend: '350000', impressions: '99852', reach: '50305', clicks: '2800' },
        { campaign_id: 'k2', campaign_name: 'Muestra · interacción', spend: '27045', impressions: '14176', reach: '12485', clicks: '305' }
      ],
      ads: [
        { ad_id: 'a1', ad_name: 'Reel · tres señales', spend: '210000', impressions: '61000', reach: '33000', clicks: '1900' },
        { ad_id: 'a2', ad_name: 'Carrusel · mes planeado', spend: '140000', impressions: '38852', reach: '21000', clicks: '900' },
        { ad_id: 'a3', ad_name: 'Historia · horario', spend: '27045', impressions: '14176', reach: '12485', clicks: '305' }
      ]
    };
  }
};
const meta = createMetaReportService({ db, insights, decrypt: () => 'page-token', systemToken: () => 'user-token' });

// --- Las rutas de verdad -------------------------------------------------------------------------
const saved = [];
const uploads = [];
const prisma = {
  client: db.client,
  $transaction: async (work) => work({ metricReport: { create: async ({ data }) => {
    const report = { ...data, id: `r-${saved.length + 1}`, client: clients.find((row) => row.id === data.clientId), sources: data.sources.create, createdAt: new Date().toISOString() };
    saved.push(report);
    return report;
  } } })
};
const api = express();
api.use(express.json());
api.use((req, _res, next) => { req.user = { userId: 'u-rodny', id: 'u-rodny', role: req.headers['x-demo-role'] || 'ADMIN' }; next(); });
api.get('/api/auth/me', (req, res) => res.json({ user: { id: 'u-rodny', name: 'Rodny Chirinos', role: req.user.role } }));
api.get('/api/db/clients', (_req, res) => res.json(clients));
api.use('/api/reports/meta', createReportMetaRouter({ meta, logger: console }));
api.post('/api/reports/extract-metrics', multer({ storage: multer.memoryStorage() }).any(), createEvidenceExtractionHandler({
  prisma, fetchMetaSources: meta.fetchSources,
  uploadClientFile: async (file) => { uploads.push(file.originalname); return { gcsPath: `clients/muestra/${file.originalname}` }; },
  extractMetrics: async () => { throw new Error('Este recorrido no lee capturas.'); },
  cleanExtraction: (value) => value
}));
api.get('/api/reports', (_req, res) => res.json({ reports: [], nextCursor: null }));

await writeFile(path.join(work, 'index.html'), '<!doctype html><html lang="es"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><div id="root"></div><script type="module" src="./app.jsx"></script></html>');
await writeFile(path.join(work, 'app.jsx'), `import React from 'react'; import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'; import { MemoryRouter } from 'react-router-dom'; import { Toaster } from 'react-hot-toast'; import axios from 'axios';
import Reports from '../../../src/components/modules/Reports.jsx'; import { AuthProvider } from '../../../src/context/AuthContext'; import { ConfirmDialogProvider } from '../../../src/components/ui/ConfirmDialog';
import '../../../src/index.css'; import 'react-datepicker/dist/react-datepicker.css';
const role = new URLSearchParams(location.search).get('rol') || 'ADMIN';
localStorage.setItem('authToken', 'demo.' + btoa(JSON.stringify({ exp: 4102444800 })) + '.demo');
localStorage.setItem('currentUser', JSON.stringify({ id: 'u-rodny', userId: 'u-rodny', name: 'Rodny Chirinos', role, modulePermissions: {} }));
axios.defaults.headers.common['x-demo-role'] = role;
createRoot(document.getElementById('root')).render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><MemoryRouter><AuthProvider><ConfirmDialogProvider><Reports /><Toaster /></ConfirmDialogProvider></AuthProvider></MemoryRouter></QueryClientProvider>);`);

const server = await createServer({
  configFile: false, root, envDir: work, appType: 'mpa', logLevel: 'warn', cacheDir: path.join(work, 'vite-cache'),
  optimizeDeps: { entries: ['tmp/reports-implementation/meta-sources/index.html'] }, esbuild: { jsx: 'automatic' },
  resolve: { alias: { '@': path.join(root, 'src') } }, css: { postcss: { plugins: [tailwindcss(tailwindConfig), autoprefixer()] } },
  server: { host: '127.0.0.1', port: 0 },
  // La API es la de este mismo servidor, en memoria. Sin esto, un `VITE_API_URL` heredado del entorno
  // mandaría la pantalla a otra dirección (y la guarda de abajo corta todo lo que no sea local).
  define: { 'import.meta.env.VITE_API_URL': 'window.location.origin' },
  plugins: [{ name: 'local-report-api', configureServer(vite) { vite.middlewares.use((req, res, next) => (req.url.startsWith('/api/') ? api(req, res, next) : next())); } }]
});

let browser;
try {
  await server.listen();
  const base = `http://127.0.0.1:${server.httpServer.address().port}/tmp/reports-implementation/meta-sources/index.html`;
  browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
  const errors = [];
  const openPage = async ({ today, query = '', dark = false, width = 1440 }) => {
    const context = await browser.newContext({ viewport: { width, height: 1000 }, deviceScaleFactor: 2, timezoneId: 'America/Bogota', locale: 'es-CO' });
    const page = await context.newPage();
    page.on('pageerror', (error) => errors.push(error.message));
    if (process.env.DEBUG_HARNESS) {
      page.on('console', (message) => console.log('[console]', message.type(), message.text().slice(0, 300)));
      page.on('requestfailed', (request) => console.log('[failed]', request.url()));
      page.on('response', (response) => { if (response.url().includes('/api/')) console.log('[api]', response.status(), response.url().replace(/^http:\/\/[^/]+/, '')); });
    }
    page.on('console', (message) => { if (message.type() === 'error' && /Maximum update depth|Warning:/.test(message.text())) errors.push(message.text()); });
    await page.route('**/*', (route) => (route.request().url().startsWith('http://127.0.0.1:') ? route.continue() : route.abort()));
    // El módulo arranca en «del primero de este mes a hoy»: se fija el día para que el período sea septiembre.
    await page.clock.setFixedTime(new Date(today));
    await page.goto(`${base}${query}`, { waitUntil: 'networkidle' });
    if (dark) await page.evaluate(() => document.documentElement.classList.add('dark'));
    await page.evaluate(() => document.fonts.ready);
    return page;
  };
  const chooseClient = async (page, name) => {
    await page.getByRole('combobox', { name: 'Cliente del reporte' }).click();
    if (process.env.DEBUG_HARNESS) console.log('[options]', await page.getByRole('option').allInnerTexts());
    await page.getByRole('option', { name, exact: true }).click();
    await page.locator('[data-report-meta-sources]').waitFor();
    await page.waitForFunction(() => !document.querySelector('[data-report-meta-sources] .animate-spin'));
  };
  const panel = '[data-report-meta-sources]';
  const mainButton = (page) => page.locator('button', { hasText: /Leer capturas|Traer cifras de Meta/ }).first();
  const shot = async (page, name, locator = null) => {
    const noOverflow = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
    assert.ok(noOverflow, `sin desborde horizontal en ${name}`);
    await (locator ? page.locator(locator).first() : page).screenshot({ path: `output/${name}.png`, ...(locator ? {} : { fullPage: true }) });
  };

  for (const [theme, dark] of [['claro', false], ['oscuro', true]]) {
    const page = await openPage({ today: '2026-09-30T15:00:00-05:00', dark });

    // 1. Con el cliente elegido aparece el bloque: su Instagram sin marcar y la pauta sin cuenta todavía.
    await chooseClient(page, 'Cliente de muestra');
    assert.equal(await page.locator('[data-report-meta-instagram]').getAttribute('aria-pressed'), 'false', 'nada viene marcado');
    assert.equal(await mainButton(page).isDisabled(), true, 'sin capturas ni Meta no hay nada que leer');
    assert.equal(await mainButton(page).innerText(), 'Leer capturas');
    assert.equal(await page.locator('#report-social-files').count(), 1, 'subir capturas sigue ahí');
    assert.equal(await page.locator('#report-ads-files').count(), 1);
    await shot(page, `reportes-meta-1-bloque-${theme}`);

    // 2. La cuenta publicitaria se vincula una vez, con la palabra que distingue las campañas del cliente.
    if (!dark) {
      await page.getByRole('button', { name: 'Vincular cuenta publicitaria' }).click();
      await page.getByRole('dialog').waitFor();
      await page.getByLabel('Buscar cuenta publicitaria').fill('agencia');
      assert.equal(await page.locator('input[name="report-ad-account"]').count(), 1, 'la búsqueda deja una');
      assert.equal(await page.getByRole('button', { name: 'Vincular', exact: true }).isDisabled(), true, 'sin elegir no se vincula');
      await page.locator('input[name="report-ad-account"]').check();
      await page.locator('[data-report-campaign-filter]').fill('Muestra');
      await page.waitForTimeout(250);
      await shot(page, `reportes-meta-2-vincular-pauta-${theme}`, '[role="dialog"]');
      await page.getByRole('button', { name: 'Vincular', exact: true }).click();
      await page.locator('[data-report-meta-ad-account]').waitFor();
      assert.deepEqual(ads.map((row) => [row.clientId, row.adAccountId, row.campaignFilter, row.connectedById]), [['c-muestra', '1001', 'Muestra', 'u-rodny']]);
      assert.equal(await page.locator('[data-report-meta-ad-account]').getAttribute('aria-pressed'), 'false', 'vincular no es elegir');
    } else {
      await page.locator('[data-report-meta-ad-account]').waitFor();
    }

    // 3. Se marca lo que se quiere traer y el botón dice lo que va a hacer.
    await page.locator('[data-report-meta-instagram]').click();
    assert.equal(await page.locator('[data-report-meta-facebook]').getAttribute('aria-pressed'), 'false', 'Facebook tampoco viene marcado');
    await page.locator('[data-report-meta-facebook]').click();
    await page.locator('[data-report-meta-facebook-note]').waitFor();
    await page.locator('[data-report-meta-ad-account]').click();
    assert.equal(await mainButton(page).innerText(), 'Traer cifras de Meta');
    assert.equal(await mainButton(page).isEnabled(), true);
    await page.locator(panel).scrollIntoViewIfNeeded();
    await page.waitForTimeout(250);
    await shot(page, `reportes-meta-3-elegido-${theme}`, panel);
    // Lo marcado se puede soltar.
    await page.locator('[data-report-meta-ad-account]').click();
    assert.equal(await page.locator('[data-report-meta-ad-account]').getAttribute('aria-pressed'), 'false');
    await page.locator('[data-report-meta-ad-account]').click();

    // 4. El informe nace sin una sola captura.
    const before = saved.length;
    await mainButton(page).click();
    await page.getByRole('heading', { name: 'Informe de resultados' }).waitFor();
    assert.equal(saved.length, before + 1);
    const report = saved.at(-1);
    assert.deepEqual(report.normalizedMetrics.processingSummary, { totalFiles: 0, metaSources: 5, successfulFiles: 5, partialFiles: 0, failedFiles: 0 });
    assert.deepEqual(report.normalizedMetrics.issues.filter((issue) => issue.blocking), [], 'nada que una persona tenga que desenredar');
    assert.equal(report.normalizedMetrics.reportPeriod.start, '2026-09-01');
    assert.equal(report.normalizedMetrics.reportPeriod.end, '2026-09-30');
    const adsCall = metaCalls.findLast(([kind]) => kind === 'ads');
    assert.deepEqual(adsCall.slice(0, 2), ['ads', '1001']);
    assert.equal(adsCall[3], 'Muestra', 'solo las campañas del cliente');
    assert.equal(uploads.filter((name) => name.endsWith('-cifras-de-meta.json')).length, (before + 1) * 3, 'un comprobante por cuenta consultada');
    assert.ok(metaCalls.some(([kind, id]) => kind === 'facebook' && id === 'p1'), 'la página del cliente');
    const workspace = page.locator('section[aria-label="Revisión del informe"]');
    const text = await workspace.innerText();
    assert.match(text, /5 fuentes de Meta · Resultados por red y pauta/);
    for (const title of ['Resumen de Instagram', 'Rendimiento por formato · Instagram', 'Publicaciones del período · Instagram', 'Resumen de Facebook', 'Publicaciones del período · Facebook', 'Resultados por campaña', 'Resultados por anuncio']) assert.ok(text.includes(title), title);
    assert.match(text, /9\.120/, 'las visualizaciones de la página');
    assert.match(text, /3\.363/, 'los seguidores de la página');
    assert.doesNotMatch(text, /pageActions|profileVisits|videoViews|\breactions\b|\bviewers\b/, 'ningún nombre técnico de Facebook a la vista');
    assert.doesNotMatch(text, /\bsaves\b|\bshares\b|\bAD\b|IGTV/, 'ningún nombre técnico a la vista');
    assert.match(text, /18\.489/);
    assert.match(text, /377\.045/);
    await shot(page, `reportes-meta-4-informe-${theme}`, 'section[aria-label="Revisión del informe"]');

    // 5. Cada cifra dice de dónde salió, y una fuente de Meta no ofrece «ver captura».
    await page.locator('[data-report-audit] > summary').click();
    const audit = page.locator('[data-report-audit]');
    await audit.locator('details > summary', { hasText: 'Instagram @clientedemuestra · cifras de Meta' }).click();
    assert.equal(await audit.locator('details[open] > [data-report-meta-source]').first().isVisible(), true);
    assert.equal(await audit.getByRole('button', { name: 'Ver captura original' }).count(), 0);
    assert.match(await audit.innerText(), /Meta · estadísticas de la cuenta de Instagram @clientedemuestra · consultado el 2 de octubre de 2026/);
    await audit.scrollIntoViewIfNeeded();
    await page.waitForTimeout(250);
    await page.screenshot({ path: `output/reportes-meta-5-de-donde-sale-${theme}.png` });
    await page.context().close();
  }

  // 6. Dos cuentas de Instagram en un cliente: el informe lleva una. Y un mes de 31 días avisa del alcance.
  {
    const page = await openPage({ today: '2026-10-31T15:00:00-05:00' });
    await chooseClient(page, 'Grupo de muestra (dos cuentas)');
    const chips = page.locator('[data-report-meta-instagram]');
    assert.equal(await chips.count(), 2);
    await chips.nth(0).click();
    await chips.nth(1).click();
    assert.deepEqual(await chips.evaluateAll((nodes) => nodes.map((node) => node.getAttribute('aria-pressed'))), ['false', 'true'], 'una sola cuenta de Instagram por informe');
    await page.locator('[data-report-meta-long-period]').waitFor();
    // Elegir otro cliente suelta lo marcado: la cuenta de uno nunca viaja con el informe de otro.
    await shot(page, 'reportes-meta-6-dos-cuentas-y-mes-largo-claro', panel);
    await chooseClient(page, 'Cliente sin redes conectadas');
    assert.equal(await mainButton(page).isDisabled(), true);
    assert.match(await page.locator(panel).innerText(), /Este cliente no tiene Instagram conectado/);
    await page.context().close();
  }

  // 7. Quien no dirige ve la cuenta vinculada y la usa, pero no la cambia.
  {
    const page = await openPage({ today: '2026-09-30T15:00:00-05:00', query: '?rol=EDITOR' });
    await chooseClient(page, 'Cliente de muestra');
    assert.equal(await page.getByRole('button', { name: 'Vincular cuenta publicitaria' }).count(), 0);
    assert.equal(await page.getByRole('button', { name: /^Desvincular/ }).count(), 0);
    assert.equal(await page.locator('[data-report-meta-ad-account]').count(), 1);
    await chooseClient(page, 'Grupo de muestra (dos cuentas)');
    assert.match(await page.locator(panel).innerText(), /La vincula un administrador o project manager\./);
    await page.context().close();
  }

  // 8. En el teléfono, sin desborde.
  for (const [theme, dark] of [['claro', false], ['oscuro', true]]) {
    const page = await openPage({ today: '2026-09-30T15:00:00-05:00', dark, width: 390 });
    await page.locator('#report-client').selectOption({ label: 'Cliente de muestra' }).catch(async () => chooseClient(page, 'Cliente de muestra'));
    await page.locator(panel).waitFor();
    await page.waitForFunction(() => !document.querySelector('[data-report-meta-sources] .animate-spin'));
    await page.locator('[data-report-meta-instagram]').click();
    await page.locator(panel).scrollIntoViewIfNeeded();
    await page.waitForTimeout(250);
    await shot(page, `reportes-meta-7-telefono-${theme}`, panel);
    await page.context().close();
  }

  assert.deepEqual(errors, []);
  console.log('PASS: cifras de Meta en Reportes — bloque, vínculo de pauta, informe sin capturas, origen de cada cifra, dos cuentas, mes largo, rol sin dirección, teléfono. Capturas en output/reportes-meta-*.png');
} finally {
  await browser?.close();
  await server.close();
}
