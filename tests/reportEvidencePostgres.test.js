import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createEvidenceExtractionHandler, createEvidenceWorkflowHandlers } from '../src/routes/api/reportEvidenceRoutes.js';
import { composeEvidenceNarrative, saveReportVersion } from '../src/services/reportWorkflowService.js';
import { buildMetricReportHtml } from '../src/services/metricReportPdf.js';
import { sampleAugustExtraction } from './fixtures/reportObservationsAugust.js';

// Opt-in only. Never read .env, use DATABASE_URL, or import the application Prisma
// singleton. This suite accepts only the dedicated loopback test database/role.
const safeUrl = (candidate) => {
  if (!candidate) return null;
  const url = new URL(candidate);
  assert.ok(['postgres:', 'postgresql:'].includes(url.protocol), 'PostgreSQL required');
  assert.equal(url.hostname, '127.0.0.1', 'Loopback test server required');
  assert.equal(url.pathname, '/brain_reports_test', 'Dedicated test database required');
  assert.equal(url.username, 'brain_reports_test', 'Dedicated test role required');
  assert.ok(Number(url.port) > 1024 && url.port !== '5432', 'Explicit isolated port required');
  assert.ok(url.password, 'Test credential required');
  assert.ok([...url.searchParams.keys()].every(key => ['schema', 'connection_limit', 'pool_timeout'].includes(key)), 'Unexpected connection option');
  assert.ok(!url.searchParams.has('schema') || url.searchParams.get('schema') === 'public', 'Only public test schema allowed');
  return url.toString();
};
const reportsPostgresTestUrl = environment => {
  if (environment.RUN_REPORTS_POSTGRES_TESTS !== '1') return null;
  assert.ok(environment.TEST_DATABASE_URL, 'RUN_REPORTS_POSTGRES_TESTS=1 requires TEST_DATABASE_URL for the dedicated isolated database');
  return safeUrl(environment.TEST_DATABASE_URL);
};

test('report PostgreSQL suite refuses production, default-port and unrelated local databases', () => {
  assert.equal(safeUrl(undefined), null);
  const valid = 'postgresql://brain_reports_test:test-only@127.0.0.1:55432/brain_reports_test';
  assert.equal(safeUrl(valid), valid);
  for (const invalid of [valid.replace('127.0.0.1', 'db.railway.internal'), valid.replace(':55432', ':5432'), valid.replace('/brain_reports_test', '/brainstudio'), valid.replace('brain_reports_test:test-only', 'postgres:test-only'), `${valid}?host=production.example`]) {
    assert.throws(() => safeUrl(invalid));
  }
});

test('dedicated reports PostgreSQL suite needs an exact opt-in and never falls back to DATABASE_URL', () => {
  const valid = 'postgresql://brain_reports_test:test-only@127.0.0.1:55432/brain_reports_test';
  const ci = 'postgresql://user:password@localhost:5432/brainstudio';
  for (const flag of [undefined, '', '0', 'false', 'true']) {
    assert.equal(reportsPostgresTestUrl({ RUN_REPORTS_POSTGRES_TESTS: flag, TEST_DATABASE_URL: ci }), null);
    assert.equal(reportsPostgresTestUrl({ RUN_REPORTS_POSTGRES_TESTS: flag, TEST_DATABASE_URL: valid }), null);
  }
  assert.equal(reportsPostgresTestUrl({ RUN_REPORTS_POSTGRES_TESTS: '1', TEST_DATABASE_URL: valid }), valid);
  assert.throws(() => reportsPostgresTestUrl({ RUN_REPORTS_POSTGRES_TESTS: '1', TEST_DATABASE_URL: ci }));
  assert.throws(() => reportsPostgresTestUrl({ RUN_REPORTS_POSTGRES_TESTS: '1' }), /TEST_DATABASE_URL/);
  assert.throws(() => reportsPostgresTestUrl({ RUN_REPORTS_POSTGRES_TESTS: '1', DATABASE_URL: valid }), /TEST_DATABASE_URL/);
});

const response = () => ({ code: 200, payload: null, headers: {},
  status(code) { this.code = code; return this; },
  json(payload) { this.payload = payload; return this; },
  send(payload) { this.payload = payload; return this; },
  set(name, value) { if (typeof name === 'object') Object.assign(this.headers, name); else this.headers[name] = value; return this; }
});
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };
const period = { start: '2026-08-01', end: '2026-08-31' };
const request = (id, body = {}) => ({ params: { reportId: id }, body, query: {}, user: { id: 'report-postgres-reviewer' } });
const analysis = report => composeEvidenceNarrative(report, { claims: [{
  factId: report.normalizedMetrics.facts.find(fact => fact.platform === 'INSTAGRAM' && fact.scope === 'TOTAL' && fact.key === 'views').factId,
  interpretation: 'Conviene comparar el desempeño de los formatos.', action: 'Revisar las piezas del período.', kpi: 'Visualizaciones por pieza'
}] });

// To run against an already provisioned, dedicated PostgreSQL 17 test instance:
// PowerShell: $env:RUN_REPORTS_POSTGRES_TESTS='1'; $env:TEST_DATABASE_URL='<isolated test URL>'
// Then: node --test tests/reportEvidencePostgres.test.js
// A generic TEST_DATABASE_URL set by CI does not authorize this suite.
test('PostgreSQL stores evidence and rejects competing report versions', {
  skip: process.env.RUN_REPORTS_POSTGRES_TESTS !== '1' ? 'Set RUN_REPORTS_POSTGRES_TESTS=1 with the dedicated isolated TEST_DATABASE_URL to run this suite' : false,
  timeout: 60000
}, async t => {
  const databaseUrl = reportsPostgresTestUrl(process.env);
  const { PrismaClient } = await import('@prisma/client');
  // Independent pools exercise PostgreSQL transactions and JSONB predicates.
  const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
  const competitor = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
  let client;
  t.after(async () => {
    try {
      if (client) {
        await prisma.metricReport.deleteMany({ where: { clientId: client.id } });
        await prisma.client.delete({ where: { id: client.id } });
      }
    } finally { await Promise.all([prisma.$disconnect(), competitor.$disconnect()]); }
  });
  const [identity] = await prisma.$queryRaw`SELECT current_database() AS database, current_user AS role, current_setting('server_version_num')::integer AS version`;
  assert.equal(identity.database, 'brain_reports_test');
  assert.equal(identity.role, 'brain_reports_test');
  assert.ok(identity.version >= 170000 && identity.version < 180000, 'This proof targets PostgreSQL 17');
  t.diagnostic(`Real PostgreSQL ${identity.version}; persistence is not mocked. Vision, upload and generated prose are local fixtures.`);
  client = await prisma.client.create({ data: { name: 'Cliente de prueba', slug: `report-evidence-pg-${randomUUID()}` } });
  const read = id => prisma.metricReport.findUnique({ where: { id }, include: { client: true, sources: true } });
  const create = async () => {
    // Actual screenshot values transcribed by the audit, composed as one fixture.
    // This validates persistence; it does not certify OCR or human approval.
    const handler = createEvidenceExtractionHandler({ prisma,
      uploadClientFile: async () => ({ gcsPath: `isolated-test/${randomUUID()}.png` }),
      extractMetrics: async () => structuredClone(sampleAugustExtraction), cleanExtraction: value => value
    });
    const res = response();
    await handler({ body: { clientId: client.id, periodKind: 'MONTHLY', startDate: period.start, endDate: period.end },
      files: [{ fieldname: 'files', originalname: 'sample-transcribed-fixture.png', mimetype: 'image/png', buffer: Buffer.from('no-external-image-upload') }], user: request().user }, res);
    assert.equal(res.code, 201, res.payload?.error);
    return read(res.payload.report.id);
  };

  await t.test('two writers of one JSONB version have exactly one committed winner', async () => {
    const report = await create();
    const [left, right] = await Promise.all([read(report.id), competitor.metricReport.findUnique({ where: { id: report.id }, include: { client: true, sources: true } })]);
    const attempts = await Promise.allSettled([
      saveReportVersion(prisma, left, { narrative: { marker: 'writer-a' } }),
      saveReportVersion(competitor, right, { narrative: { marker: 'writer-b' } })
    ]);
    const winners = attempts.filter(item => item.status === 'fulfilled');
    const losers = attempts.filter(item => item.status === 'rejected');
    assert.equal(winners.length, 1);
    assert.equal(losers.length, 1);
    assert.equal(losers[0].reason.status, 409);
    const saved = await read(report.id);
    assert.equal(saved.normalizedMetrics.version, 2);
    assert.deepEqual(saved.narrative, winners[0].value.narrative);
    assert.deepEqual(saved.normalizedMetrics.facts, report.normalizedMetrics.facts);
    assert.equal(saved.sources.length, 1);
  });

  await t.test('create, review, analyze, publish and reload preserve separate platform figures', async () => {
    let report = await create();
    assert.equal(report.status, 'DRAFT');
    assert.equal(report.normalizedMetrics.facts.find(f => f.platform === 'CROSS_PLATFORM').value, 9400);
    assert.equal(report.normalizedMetrics.facts.find(f => f.platform === 'CROSS_PLATFORM').precision, 'ROUNDED');
    assert.deepEqual(report.normalizedMetrics.facts.filter(f => f.platform === 'FACEBOOK').map(f => f.value).sort((a, b) => a - b), [1017, 1049]);
    const sourceId = report.sources[0].sourceId;
    assert.ok(report.normalizedMetrics.facts.every(f => f.sourceIds.includes(sourceId)));
    const zero = report.normalizedMetrics.observations.find(o => o.key === 'linkClicks');
    assert.equal(zero.value, 0);
    const handlers = createEvidenceWorkflowHandlers({ prisma, generateNarrative: async value => analysis(value), buildHtml: buildMetricReportHtml });
    const reviewed = response();
    await handlers.review(request(report.id, { expectedVersion: 1, updates: [{ observationId: zero.observationId, value: 3, changePct: -95.5, reason: 'Corrección de prueba para comprobar persistencia.' }] }), reviewed);
    assert.equal(reviewed.code, 200, reviewed.payload?.error);
    report = await read(report.id);
    assert.equal(report.normalizedMetrics.dataVersion, 2);
    const corrected = report.normalizedMetrics.facts.find(f => f.key === 'linkClicks');
    assert.equal(corrected.value, 3);
    assert.equal(corrected.changePct, -95.5);
    assert.equal(report.normalizedMetrics.reviewHistory[0].before.value, 0);
    assert.equal(report.normalizedMetrics.reviewHistory[0].after.value, 3);
    assert.equal(report.narrative.needsRegeneration, true);
    const analyzed = response();
    await handlers.analyze(request(report.id, { expectedVersion: 2 }), analyzed);
    assert.equal(analyzed.code, 200, analyzed.payload?.error);
    report = await read(report.id);
    assert.equal(report.status, 'REVIEW');
    assert.equal(report.narrative.dataVersion, 2);
    assert.match(report.narrative.sections[0].paragraphs[0], /8\.418/);
    const published = response();
    await handlers.publish(request(report.id, { expectedVersion: 3 }), published);
    assert.equal(published.code, 200, published.payload?.error);
    report = await read(report.id);
    assert.equal(report.status, 'PUBLISHED');
    assert.equal(report.normalizedMetrics.version, 4);
    assert.equal(report.normalizedMetrics.publication.actorId, 'report-postgres-reviewer');
    const html = buildMetricReportHtml(report);
    for (const value of ['8.418', '1.017', '1.049', '9,4 mil', '-95,5 %']) assert.ok(html.includes(value), `Published HTML preserves ${value}`);
    const stale = response();
    await handlers.review(request(report.id, { expectedVersion: 2, updates: [] }), stale);
    assert.equal(stale.code, 409);
    assert.equal((await read(report.id)).status, 'PUBLISHED');
  });

  await t.test('analysis started before a correction cannot replace the newer evidence', async () => {
    let report = await create();
    const started = deferred(), finish = deferred();
    const handlers = createEvidenceWorkflowHandlers({ prisma, generateNarrative: async snapshot => { started.resolve(); await finish.promise; return analysis(snapshot); } });
    const analyzed = response();
    const pending = handlers.analyze(request(report.id, { expectedVersion: 1 }), analyzed);
    await started.promise;
    const review = response();
    const competingHandlers = createEvidenceWorkflowHandlers({ prisma: competitor });
    const zero = report.normalizedMetrics.observations.find(o => o.key === 'linkClicks');
    try {
      await competingHandlers.review(request(report.id, { expectedVersion: 1, updates: [{ observationId: zero.observationId, value: 4, reason: 'Nueva revisión durante el análisis de prueba.' }] }), review);
      assert.equal(review.code, 200, review.payload?.error);
    } finally { finish.resolve(); await pending; }
    assert.equal(analyzed.code, 409);
    report = await read(report.id);
    assert.equal(report.normalizedMetrics.version, 2);
    assert.equal(report.normalizedMetrics.facts.find(f => f.key === 'linkClicks').value, 4);
    assert.equal(report.narrative.needsRegeneration, true);
    assert.equal(report.status, 'REVIEW');
  });

  await t.test('failed analysis persists a retryable state without changing saved facts', async () => {
    const before = await create();
    const handlers = createEvidenceWorkflowHandlers({ prisma, generateNarrative: async () => { throw new Error('Injected local provider failure'); } });
    const res = response();
    await handlers.analyze(request(before.id, { expectedVersion: 1 }), res);
    assert.equal(res.code, 422);
    const after = await read(before.id);
    assert.deepEqual(after.normalizedMetrics.facts, before.normalizedMetrics.facts);
    assert.equal(after.normalizedMetrics.dataVersion, 1);
    assert.equal(after.normalizedMetrics.version, 2);
    assert.equal(after.narrative.generationMode, 'NARRATIVE_FAILED');
    assert.equal(after.narrative.needsRegeneration, true);
    assert.throws(() => buildMetricReportHtml(after), /publicad/i);
  });
});
