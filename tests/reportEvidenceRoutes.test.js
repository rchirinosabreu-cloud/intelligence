import test from 'node:test';
import assert from 'node:assert/strict';
import { validateAndCleanSourceExtraction } from '../src/services/reportVisionService.js';
const routes = await import('../src/routes/api/reportEvidenceRoutes.js').catch(() => ({}));
const response = () => ({ code: 200, payload: null, status(code) { this.code = code; return this; }, json(payload) { this.payload = payload; return this; } });
const file = (fieldname, name) => ({ fieldname, originalname: name, mimetype: 'image/png', buffer: Buffer.from(name), size: name.length });
const req = () => ({ body: { clientId: 'c1', startDate: '2026-08-01', endDate: '2026-08-31', periodKind: 'MONTHLY' }, files: [file('organicFiles', 'ig.png'), file('adsFiles', 'ads.png'), file('logo', 'logo.png')] });
function dependencies() {
  const calls = { extraction: [], saved: null, uploads: [] };
  const db = { client: { findUnique: async () => ({ id: 'c1', name: 'Cliente' }) }, $transaction: async fn => fn({ metricReport: { create: async query => { calls.saved = query.data; return { ...query.data, id: 'r1' }; } } }) };
  return { calls, deps: { prisma: db, uploadClientFile: async f => { calls.uploads.push(f.originalname); return { gcsPath: 'clients/' + f.originalname }; }, extractMetrics: async (buffer, mime, context) => { calls.extraction.push(context); return { platform: 'INSTAGRAM', metrics: [{ key: 'linkClicks', value: 0, label: 'Clics', rawValue: '0', unit: 'count', platform: 'INSTAGRAM', scope: 'TOTAL', precision: 'EXACT', contextKey: 'ACCOUNT_TOTAL', evidence: '0 visible' }] }; }, cleanExtraction: value => ({ ...value, usable: true, warnings: [], screenType: 'METRIC_TRENDS' }) } };
}

test('extraction isolates logo, preserves declared category, and persists observations with context', async () => {
  assert.equal(typeof routes.createEvidenceExtractionHandler, 'function');
  const { calls, deps } = dependencies(); const res = response();
  await routes.createEvidenceExtractionHandler(deps)(req(), res);
  assert.equal(res.code, 201);
  assert.equal(calls.extraction.length, 2);
  assert.deepEqual(calls.extraction.map(c => c.declaredCategory).sort(), ['ADS', 'SOCIAL']);
  assert.equal(calls.saved.normalizedMetrics.schemaVersion, 2);
  assert.equal(calls.saved.normalizedMetrics.facts[0].value, 0);
  assert.equal(calls.saved.normalizedMetrics.processingSummary.totalFiles, 2);
  assert.equal(calls.saved.sources.create.length, 2);
  assert.equal(calls.saved.normalizedMetrics.branding.logoStoragePath, 'clients/logo.png');
  assert.equal(calls.saved.normalizedMetrics.branding.logoDataUrl, 'data:image/png;base64,' + Buffer.from('logo.png').toString('base64'));
  assert.ok(calls.saved.sources.create.every(s => s.extractionData.observations.length === 1));
});

test('oversized report logo is rejected before reading or uploading any screenshots', async () => {
  const { calls, deps } = dependencies(); const res = response(); const request = req();
  request.files.find(item => item.fieldname === 'logo').buffer = Buffer.alloc(1024 * 1024 + 1);
  await routes.createEvidenceExtractionHandler(deps)(request, res);
  assert.equal(res.code, 422); assert.equal(calls.uploads.length, 0); assert.equal(calls.extraction.length, 0);
});

test('screenshots with the same filename receive distinct storage names and retain their original labels', async () => {
  const { calls, deps } = dependencies(); const res = response(); const request = req();
  request.files = [file('organicFiles', 'captura.png'), file('organicFiles', 'captura.png')];
  await routes.createEvidenceExtractionHandler(deps)(request, res);
  assert.equal(res.code, 201);
  assert.equal(new Set(calls.uploads).size, 2);
  assert.ok(calls.uploads.every(name => name.endsWith('-captura.png')));
  assert.ok(calls.saved.normalizedMetrics.sourceExtractions.every(source => source.originalName === 'captura.png'));
});

test('extraction validates period before any model or upload call', async () => {
  assert.equal(typeof routes.createEvidenceExtractionHandler, 'function');
  const { calls, deps } = dependencies(); const res = response(); const request = req(); request.body.startDate = '2026-02-31';
  await routes.createEvidenceExtractionHandler(deps)(request, res);
  assert.equal(res.code, 422); assert.equal(calls.extraction.length, 0); assert.equal(calls.uploads.length, 0);
});

test('extraction persists COP by default, supports explicit USD and rejects invalid currency before upload', async () => {
  for (const currency of [undefined, 'USD', 'not-a-currency']) {
    const { calls, deps } = dependencies(), request = req(), res = response();
    if (currency !== undefined) request.body.currency = currency;
    deps.extractMetrics = async () => ({ metrics: [{ key: 'spend', unit: '$', value: 120, rawValue: '$120', platform: 'META_ADS', scope: 'PAID', contextKey: 'advertising' }] });
    deps.cleanExtraction = validateAndCleanSourceExtraction;
    await routes.createEvidenceExtractionHandler(deps)(request, res);
    if (currency === 'not-a-currency') { assert.equal(res.code, 422); assert.equal(calls.uploads.length, 0); }
    else { assert.equal(res.code, 201); assert.equal(calls.saved.normalizedMetrics.currency, currency || 'COP'); assert.equal(calls.saved.normalizedMetrics.facts[0].unit, currency || 'COP'); }
  }
});

test('partial extraction preserves failed source identity and the pending reconciliation signal', async () => {
  assert.equal(typeof routes.createEvidenceExtractionHandler, 'function');
  const { calls, deps } = dependencies();
  const original = deps.extractMetrics;
  deps.extractMetrics = async (...args) => { if (args[2].declaredCategory === 'ADS') throw new Error('Lectura incompleta'); return original(...args); };
  const res = response(); await routes.createEvidenceExtractionHandler(deps)(req(), res);
  assert.equal(res.code, 201); assert.equal(calls.saved.status, 'DRAFT');
  assert.equal(calls.saved.normalizedMetrics.sourceFailures.length, 1);
  assert.ok(calls.saved.normalizedMetrics.sourceFailures[0].sourceId);
  assert.equal(calls.saved.normalizedMetrics.processingSummary.failedFiles, 1);
  assert.equal(calls.saved.normalizedMetrics.readyForNarrative, false);
});

test('analyze, issue and download work with pending corrections without resolving or excluding them', async () => {
  let record = { id: 'pending', status: 'DRAFT', normalizedMetrics: { schemaVersion: 2, version: 1, dataVersion: 1,
    readyForNarrative: false, facts: [{ factId: 'ok', value: 0, status: 'OBSERVED' }, { factId: 'conflict', value: 55, status: 'CONFLICT' }],
    issues: [{ id: 'review', blocking: true, message: 'Verificar lectura' }], sourceFailures: [{ sourceId: 'failed' }],
    processingSummary: { failedFiles: 1, partialFiles: 0 } } };
  const original = structuredClone(record.normalizedMetrics);
  const metricReport = { findUnique: async () => structuredClone(record), updateMany: async ({ where, data }) => {
    assert.equal(where.normalizedMetrics.equals, record.normalizedMetrics.version);
    record = { ...record, ...structuredClone(data) }; return { count: 1 };
  } };
  const handlers = routes.createEvidenceWorkflowHandlers({ prisma: { metricReport, $transaction: fn => fn({ metricReport }) },
    generateNarrative: async () => ({ generationMode: 'EVIDENCE_AI', dataVersion: 1, claims: [{ factId: 'ok' }] }),
    renderPdf: async current => { assert.equal(current.status, 'PUBLISHED'); return Buffer.from('%PDF-fixture'); } });
  const request = () => ({ params: { reportId: 'pending' }, body: { expectedVersion: record.normalizedMetrics.version }, user: { id: 'actor' }, query: { version: String(record.normalizedMetrics.version) } });
  let res = response(); await handlers.analyze(request(), res); assert.equal(res.code, 200); assert.equal(record.status, 'REVIEW');
  res = response(); await handlers.publish(request(), res); assert.equal(res.code, 200); assert.equal(record.status, 'PUBLISHED');
  assert.equal(record.normalizedMetrics.publication.actorId, 'actor');
  assert.deepEqual(record.normalizedMetrics.publication.pendingReview, { issueCount: 1, sourceCount: 1, conflictFactIds: ['conflict'] });
  for (const key of ['issues', 'sourceFailures', 'facts', 'readyForNarrative']) assert.deepEqual(record.normalizedMetrics[key], original[key]);
  assert.equal(record.normalizedMetrics.excludedSources, undefined);
  res = { ...response(), set() {}, send(body) { this.payload = body; } };
  await handlers.pdf(request(), res); assert.equal(res.code, 200); assert.equal(res.payload.subarray(0, 5).toString(), '%PDF-');
});

test('routes require expected version and reject generation for a changed snapshot', async () => {
  assert.equal(typeof routes.createEvidenceWorkflowHandlers, 'function');
  const record = { id: 'r1', status: 'REVIEW', normalizedMetrics: { schemaVersion: 2, version: 2, dataVersion: 1, facts: [{ factId: 'f', value: 1 }], issues: [] } };
  const handlers = routes.createEvidenceWorkflowHandlers({ prisma: { metricReport: { findUnique: async () => record } } });
  const res = response(); await handlers.analyze({ params: { reportId: 'r1' }, body: { expectedVersion: 1 } }, res);
  assert.equal(res.code, 409);
});

test('preview and PDF share a saved snapshot and PDF checks the version again after rendering', async () => {
  assert.equal(typeof routes.createEvidenceWorkflowHandlers, 'function');
  let reads = 0;
  const report = { id: 'r1', status: 'PUBLISHED', normalizedMetrics: { schemaVersion: 2, version: 2 }, client: { name: 'Cliente' } };
  const handlers = routes.createEvidenceWorkflowHandlers({ prisma: { metricReport: { findUnique: async () => ({ ...report, normalizedMetrics: { ...report.normalizedMetrics, version: ++reads === 1 ? 2 : 3 } }) } }, renderPdf: async () => Buffer.from('%PDF-test') });
  const res = response(); await handlers.pdf({ params: { reportId: 'r1' }, query: { version: '2' } }, res);
  assert.equal(res.code, 409);
});
