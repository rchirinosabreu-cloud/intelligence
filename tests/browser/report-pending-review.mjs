import assert from 'node:assert/strict';
import path from 'node:path';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { createServer } from 'vite';
import tailwindcss from 'tailwindcss';
import autoprefixer from 'autoprefixer';
import { chromium } from 'playwright-core';
import tailwindConfig from '../../tailwind.config.js';
import { createEvidenceWorkflowHandlers } from '../../src/routes/api/reportEvidenceRoutes.js';
import { buildMetricReportHtml, renderMetricReportPdf } from '../../src/services/metricReportPdf.js';

// Actual UI, workflow handlers and PDF renderer. Synthetic data, in-memory storage,
// and a fixed narrative response: no database or paid model calls.
const root = process.cwd(), out = path.join(root, 'tmp/reports-implementation/pending-review');
await mkdir(out, { recursive: true });
const period = { start: '2026-08-01', end: '2026-08-31' };
const base = { key: 'views', label: 'Visualizaciones', platform: 'INSTAGRAM', scope: 'TOTAL', unit: 'count', precision: 'EXACT', contextKey: 'account_content', entityLevel: 'ACCOUNT', period, sourceIds: ['source'], observationIds: [] };
let record = { id: 'pending-demo', status: 'DRAFT', client: { name: 'Cliente de muestra' }, startDate: period.start, endDate: period.end,
  normalizedMetrics: { schemaVersion: 2, version: 1, dataVersion: 1, reportPeriod: period, readyForNarrative: false,
    facts: [{ ...base, factId: 'ok', value: 5200, status: 'OBSERVED' }, { ...base, key: 'reach', label: 'Alcance', factId: 'disputed', value: 99999, status: 'CONFLICT' }],
    issues: [{ id: 'pending', blocking: true, message: 'El alcance tiene dos lecturas por revisar.' }],
    sourceFailures: [{ sourceId: 'failed', originalName: 'Captura de pauta.png', error: 'Lectura pendiente' }],
    processingSummary: { totalFiles: 2, failedFiles: 1 }, sourceExtractions: [], observations: [], panels: [] } };
const original = structuredClone(record.normalizedMetrics);
const narrative = { generationMode: 'EVIDENCE_AI', dataVersion: 1, claims: [{ factId: 'ok', text: 'Instagram registra 5.200 visualizaciones.' }],
  headline: 'Resultados del período', sections: [{ platform: 'INSTAGRAM', title: 'Instagram', paragraphs: ['Instagram registra 5.200 visualizaciones.'] }] };
const metricReport = { findUnique: async () => structuredClone(record), updateMany: async ({ where, data }) => {
  if (where.normalizedMetrics.equals !== record.normalizedMetrics.version) return { count: 0 };
  record = { ...record, ...structuredClone(data) }; return { count: 1 };
} };
const handlers = createEvidenceWorkflowHandlers({ prisma: { metricReport, $transaction: fn => fn({ metricReport }) },
  generateNarrative: async () => structuredClone(narrative), buildHtml: buildMetricReportHtml, renderPdf: renderMetricReportPdf });
await writeFile(path.join(out, 'fixture.json'), JSON.stringify(record));
await writeFile(path.join(out, 'index.html'), '<html lang="es"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><div id="root"></div><script type="module" src="./app.jsx"></script></html>');
await writeFile(path.join(out, 'app.jsx'), `import React, {useState} from 'react'; import {createRoot} from 'react-dom/client';
import Workspace from '../../../src/components/reports/ReportEvidenceWorkspace.jsx'; import '../../../src/index.css'; import fixture from './fixture.json';
function App(){const [report,setReport]=useState(fixture);return <main className="bg-background p-4 text-foreground"><Workspace report={report} onReportChange={setReport} apiBaseUrl="" /></main>}
createRoot(document.getElementById('root')).render(<App/>);`);
const server = await createServer({ configFile: false, root, envDir: out, appType: 'mpa', logLevel: 'warn',
  cacheDir: path.join(out, 'vite-cache'), optimizeDeps: { entries: ['tmp/reports-implementation/pending-review/index.html'] },
  esbuild: { jsx: 'automatic' }, resolve: { alias: { '@': path.join(root, 'src') } },
  css: { postcss: { plugins: [tailwindcss(tailwindConfig), autoprefixer()] } }, server: { host: '127.0.0.1', port: 0 },
  plugins: [{ name: 'local-report-api', configureServer(vite) { vite.middlewares.use(async (req, res, next) => {
    const url = new URL(req.url, 'http://localhost'), action = url.pathname.split('/').at(-1);
    if (!url.pathname.includes('/reports/') || !handlers[action]) return next();
    let body = ''; for await (const chunk of req) body += chunk;
    const response = { status(code) { res.statusCode = code; return this; }, json(data) { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(data)); },
      set(headers) { for (const [key, value] of Object.entries(headers)) res.setHeader(key, value); }, send(data) { res.end(data); } };
    await handlers[action]({ params: { reportId: record.id }, body: body ? JSON.parse(body) : {}, query: Object.fromEntries(url.searchParams), user: { id: 'local-reviewer' } }, response);
  }); } }] });
let browser;
try {
  await server.listen();
  browser = await chromium.launch({ executablePath: process.env.CHROMIUM_EXECUTABLE_PATH || (process.platform === 'win32' ? 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe' : '/usr/bin/chromium'), headless: true });
  const page = await browser.newPage(), errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/*', route => route.request().url().startsWith('http://127.0.0.1:') ? route.continue() : route.abort());
  await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/tmp/reports-implementation/pending-review/index.html`, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: 'Generar análisis', exact: true }).click();
  await page.getByText('En revisión · Versión 2', { exact: true }).waitFor();
  assert.equal(await page.getByRole('button', { name: 'Emitir informe', exact: true }).isEnabled(), true);
  for (const width of [1440, 390]) for (const theme of ['light', 'dark']) {
    await page.setViewportSize({ width, height: 1000 });
    await page.evaluate(theme => document.documentElement.classList.toggle('dark', theme === 'dark'), theme);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await page.screenshot({ path: path.join(out, `pending-${width}-${theme}.png`), fullPage: true });
  }
  await page.getByRole('button', { name: 'Emitir informe', exact: true }).click();
  await page.getByText('Informe emitido · Versión 3', { exact: true }).waitFor();
  assert.equal(await page.getByRole('button', { name: 'Descargar PDF', exact: true }).isEnabled(), true);
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Descargar PDF', exact: true }).click();
  const download = await downloadPromise; await download.saveAs(path.join(out, 'pending-review.pdf'));
  assert.equal((await readFile(path.join(out, 'pending-review.pdf'))).subarray(0, 5).toString(), '%PDF-');
  for (const key of ['issues', 'sourceFailures', 'facts', 'readyForNarrative']) assert.deepEqual(record.normalizedMetrics[key], original[key]);
  assert.deepEqual(record.normalizedMetrics.publication.pendingReview, { issueCount: 1, sourceCount: 1, conflictFactIds: ['disputed'] });
  assert.deepEqual(errors, []);
  console.log('PASS: pending review -> analysis -> issuance -> real PDF; preserved pending evidence; desktop/mobile light/dark screenshots:', out);
} finally { await browser?.close(); await server.close(); }
