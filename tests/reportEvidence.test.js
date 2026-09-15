import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeReportObservations, buildEvidenceReport } from '../src/lib/reportEvidence.js';

// Provisional assistant transcriptions of SAMPLE/Cliente Demo, not human-approved OCR references.
const period = { start: '2026-08-01', end: '2026-08-31' };
const observation = (extra = {}) => ({ key: 'views', label: 'Visualizaciones', value: 8418,
  unit: 'count', platform: 'INSTAGRAM', scope: 'TOTAL', precision: 'EXACT', contextKey: 'instagram-overview',
  entityLevel: 'ACCOUNT', period, evidence: 'Visualizaciones 8.418', ...extra });
const source = (id, observations, extra = {}) => ({ sourceId: id, observations, ...extra });
const sample = [
  observation({ id: 'combined', platform: 'CROSS_PLATFORM', value: 9400, rawValue: '9,4 mil', precision: 'ROUNDED', changePct: -58.1, contextKey: 'instagram-crossposting' }),
  observation({ id: 'fb-component', platform: 'FACEBOOK', value: 1017, contextKey: 'instagram-crossposting', relation: { type: 'COMPONENT_OF', parentObservationId: 'combined', exhaustive: true } }),
  observation({ id: 'ig-component', value: 8418, contextKey: 'instagram-crossposting', relation: { type: 'COMPONENT_OF', parentObservationId: 'combined', exhaustive: true } }),
  observation({ id: 'ig-total', changePct: -59, breakdownComplete: true }),
  observation({ id: 'organic', scope: 'ORGANIC', value: 8411, changePct: 32.9, parentObservationId: 'ig-total' }),
  observation({ id: 'paid', scope: 'PAID', value: 7, changePct: -100, parentObservationId: 'ig-total' }),
];

test('SAMPLE keeps all six same-key observations and each own platform, scope and change', () => {
  const result = normalizeReportObservations({ metrics: sample }, { sourceId: 'sample' });
  assert.equal(result.length, 6);
  assert.deepEqual(result.map(({ value, platform, scope, changePct }) => ({ value, platform, scope, changePct })),
    sample.map(({ value, platform, scope, changePct = null }) => ({ value, platform, scope, changePct })));
  assert.equal(result[4].relation.parentObservationId, result[3].observationId);
});

test('accepts fenced JSON returned by an LLM without losing metrics', () => {
  const result = normalizeReportObservations('```json\n' + JSON.stringify({ metrics: [observation()] }) + '\n```', { sourceId: 'fenced' });
  assert.equal(result[0].value, 8418);
  assert.throws(() => normalizeReportObservations('```json\nnot json\n```'), /JSON/i);
});

test('CONTENT_FORMAT is normalized as FORMAT without changing entity or measured value', () => {
  const result = normalizeReportObservations({ metrics: [observation({ entityLevel: 'CONTENT_FORMAT', entityName: 'Historias', value: 7 })] }, { sourceId: 'format-alias' });
  assert.equal(result[0].entityLevel, 'FORMAT');
  assert.equal(result[0].entityName, 'Historias');
  assert.equal(result[0].value, 7);
});

test('zero, missing, dashes, unknown scope and confidence zero remain distinct', () => {
  const result = normalizeReportObservations({ metrics: [
    observation({ key: 'linkClicks', value: 0, confidence: 0, scope: 'UNKNOWN' }),
    observation({ key: 'results', value: null, rawValue: '—' }),
    observation({ key: 'reach', value: '' }),
  ] }, { sourceId: 'zero' });
  assert.equal(result[0].value, 0);
  assert.equal(result[0].scope, 'UNKNOWN');
  assert.equal(result[0].confidence, 0);
  assert.equal(result[1].value, null);
  assert.equal(result[2].value, null);
});

test('parses displayed numeric conventions without scaling or sign loss', () => {
  const normalized = normalizeReportObservations({ observations: [
    observation({ value: '20.1K' }), observation({ value: '1,2 M' }),
    observation({ value: '1.017' }), observation({ value: '0.123%', unit: '%' }),
    observation({ value: '0,123%', unit: '%' }), observation({ value: 12, changePct: '−42,9%' }),
  ] });
  assert.deepEqual(normalized.map(item => item.value), [20100, 1200000, 1017, 0.123, 0.123, 12]);
  assert.equal(normalized[0].precision, 'ROUNDED');
  assert.equal(normalized[5].changePct, -42.9);
});

test('mixed scope means total but mixed platform means cross-platform', () => {
  const [metric] = normalizeReportObservations({ metrics: [observation({ scope: 'MIXED', platform: 'MIXED' })] });
  assert.equal(metric.scope, 'TOTAL');
  assert.equal(metric.platform, 'CROSS_PLATFORM');
});

test('observation IDs and consolidated result do not depend on input order', () => {
  const a = source('a', sample);
  const b = source('b', [observation({ id: 'fb-own', value: 1049, platform: 'FACEBOOK', contextKey: 'facebook-overview' })]);
  const before = buildEvidenceReport([a, b]);
  const after = buildEvidenceReport([{ ...b }, { ...a, observations: [...sample].reverse() }]);
  assert.deepEqual(after, before);
  const withoutIds = sample.map(({ id, ...item }) => item);
  const first = normalizeReportObservations({ metrics: withoutIds }, { sourceId: 'a' });
  const second = normalizeReportObservations({ metrics: [...withoutIds].reverse() }, { sourceId: 'a' });
  assert.deepEqual(first.map(item => item.observationId).sort(), second.map(item => item.observationId).sort());
});

test('retains duplicate originals while equal compatible values corroborate one fact', () => {
  const result = buildEvidenceReport([source('a', [observation(), observation()]), source('b', [observation()])]);
  assert.equal(result.observations.length, 3);
  assert.equal(result.facts.length, 1);
  assert.equal(result.facts[0].value, 8418);
  assert.deepEqual(result.facts[0].sourceIds, ['a', 'b']);
  assert.equal(result.facts[0].status, 'CORROBORATED');
});

test('SAMPLE crossposting and Facebook own overview remain independent contexts', () => {
  const result = buildEvidenceReport([source('sample', sample), source('fb', [observation({ value: 1049, platform: 'FACEBOOK', contextKey: 'facebook-overview' })])]);
  assert.equal(result.facts.length, 7);
  assert.equal(result.issues.some(item => item.code === 'VALUE_CONFLICT'), false);
  assert.equal(result.issues.some(item => item.code === 'BREAKDOWN_MISMATCH'), false);
  assert.equal(result.readyForNarrative, true);
  assert.equal(result.facts.find(item => item.platform === 'CROSS_PLATFORM').value, 9400);
});

test('Cliente Demo preserves both platform triplets without sum across totals and components', () => {
  const metrics = ['TOTAL', 'ORGANIC', 'PAID'].flatMap((scope, index) => [
    observation({ scope, value: [16502, 6800, 9702][index], contextKey: 'instagram-overview' }),
    observation({ platform: 'FACEBOOK', scope, value: [4927, 1321, 3606][index], contextKey: 'facebook-overview' }),
  ]);
  const result = buildEvidenceReport([source('client-demo', metrics)]);
  assert.equal(result.facts.length, 6);
  assert.deepEqual(result.facts.filter(item => item.platform === 'INSTAGRAM').map(item => item.value).sort((a, b) => a - b), [6800, 9702, 16502]);
  assert.equal(result.facts.some(item => item.value === 21429), false);
});

test('exact number corroborates compatible rounded number with visible precision', () => {
  const result = buildEvidenceReport([
    source('rounded', [observation({ value: 9400, rawValue: '9,4 mil', precision: 'ROUNDED' })]),
    source('exact', [observation({ value: 9435 })]),
  ]);
  assert.equal(result.facts.length, 1);
  assert.equal(result.facts[0].value, 9435);
  assert.equal(result.facts[0].precision, 'EXACT');
  assert.equal(result.facts[0].status, 'CORROBORATED');
  assert.equal(result.observations.find(item => item.sourceId === 'rounded').precision, 'ROUNDED');
});

test('incompatible values do not choose first or last; block narrative with all evidence', () => {
  const result = buildEvidenceReport([source('a', [observation()]), source('b', [observation({ value: 9200 })])]);
  assert.equal(result.facts[0].value, null);
  assert.equal(result.facts[0].status, 'CONFLICT');
  assert.equal(result.readyForNarrative, false);
  assert.deepEqual(result.issues.find(item => item.code === 'VALUE_CONFLICT').sourceIds, ['a', 'b']);
});

test('manual exclusion preserves original and resolves its conflict only when excluded', () => {
  const wrong = observation({ value: 9200, excluded: true, review: { reason: 'Otra selección de fechas', actorId: 'reviewer' } });
  const result = buildEvidenceReport([source('a', [observation()]), source('b', [wrong])]);
  assert.equal(result.observations.length, 2);
  assert.equal(result.observations.find(item => item.excluded).review.reason, wrong.review.reason);
  assert.equal(result.facts[0].value, 8418);
  assert.equal(result.readyForNarrative, true);
});

test('declared period is inherited visibly; conflicting visible period blocks', () => {
  const inherited = buildEvidenceReport([source('a', [observation({ period: null })])], { reportPeriod: period });
  assert.deepEqual(inherited.observations[0].period, period);
  assert.equal(inherited.observations[0].periodProvenance, 'REPORT_DECLARED');
  assert.equal(inherited.issues.find(item => item.code === 'PERIOD_INHERITED').blocking, false);
  const mismatch = buildEvidenceReport([source('a', [observation({ period: { start: '2026-07-01', end: '2026-07-31' } })])], { reportPeriod: period });
  assert.equal(mismatch.issues.find(item => item.code === 'PERIOD_MISMATCH').blocking, true);
  assert.equal(mismatch.readyForNarrative, false);
});

test('unknown scope stays usable as undisclosed scope; missing platform and period are explicit', () => {
  const undisclosed = buildEvidenceReport([source('a', [observation({ scope: 'UNKNOWN' })])]);
  assert.equal(undisclosed.readyForNarrative, true);
  assert.equal(undisclosed.facts[0].scope, 'UNKNOWN');
  const unknown = buildEvidenceReport([source('a', [observation({ platform: 'UNKNOWN', period: null, contextKey: null })])]);
  assert.equal(unknown.readyForNarrative, false);
  assert.ok(unknown.issues.some(item => item.code === 'PLATFORM_UNKNOWN'));
  assert.ok(unknown.issues.some(item => item.code === 'PERIOD_UNKNOWN'));
});

test('only explicit exhaustive breakdown checks sums; partial visible ads do not', () => {
  const complete = buildEvidenceReport([source('a', [
    observation({ id: 'total', value: 100, breakdownComplete: true }),
    observation({ id: 'organic', value: 70, scope: 'ORGANIC', parentObservationId: 'total' }),
    observation({ id: 'paid', value: 20, scope: 'PAID', parentObservationId: 'total' }),
  ])]);
  assert.equal(complete.issues.find(item => item.code === 'BREAKDOWN_MISMATCH').blocking, true);
  const partial = buildEvidenceReport([source('a', [
    observation({ id: 'campaign', key: 'spend', value: 180000, unit: 'COP', platform: 'META_ADS', entityLevel: 'CAMPAIGN', entityId: 'c' }),
    observation({ id: 'ad', key: 'spend', value: 168680, unit: 'COP', platform: 'META_ADS', entityLevel: 'AD', entityId: 'a', parentEntityId: 'c', parentObservationId: 'campaign' }),
  ])]);
  assert.equal(partial.issues.some(item => item.code === 'BREAKDOWN_MISMATCH'), false);
  assert.deepEqual(partial.facts.map(item => item.value).sort((a, b) => a - b), [168680, 180000]);
});

test('does not sum reach even when child relations are marked complete', () => {
  const result = buildEvidenceReport([source('a', [
    observation({ id: 'total', key: 'reach', value: 100, breakdownComplete: true }),
    observation({ key: 'reach', scope: 'ORGANIC', value: 70, parentObservationId: 'total' }),
    observation({ key: 'reach', scope: 'PAID', value: 60, parentObservationId: 'total' }),
  ])]);
  assert.equal(result.issues.some(item => item.code === 'BREAKDOWN_MISMATCH'), false);
  assert.equal(result.facts.find(item => item.scope === 'TOTAL').value, 100);
});

test('currency, result definition, entity identity and hierarchy stay separate', () => {
  const result = buildEvidenceReport([source('ads', [
    observation({ key: 'spend', unit: 'USD', value: 100, platform: 'META_ADS', entityLevel: 'CAMPAIGN', entityId: 'c1' }),
    observation({ key: 'spend', unit: 'COP', value: 100, platform: 'META_ADS', entityLevel: 'CAMPAIGN', entityId: 'c1' }),
    observation({ key: 'spend', unit: 'COP', value: 60, platform: 'META_ADS', entityLevel: 'AD_SET', entityId: 'as1', parentEntityId: 'c1' }),
    observation({ key: 'results', resultType: 'CONVERSATIONS', value: 157 }),
    observation({ key: 'results', resultType: 'PURCHASES', value: 20 }),
  ])]);
  assert.equal(result.facts.length, 5);
  assert.equal(result.facts.some(item => item.value === 260), false);
  assert.equal(result.facts.filter(item => item.key === 'results').length, 2);
});

test('the agency default resolves monetary symbols as COP and preserves their origin', () => {
  const result = buildEvidenceReport([source('a', [observation({ key: 'spend', unit: '$', value: 180000 })])]);
  assert.equal(result.facts[0].unit, 'COP');
  assert.equal(result.observations[0].originalUnit, '$');
  assert.equal(result.observations[0].currencyProvenance, 'AGENCY_DEFAULT');
  assert.equal(result.issues.some(item => item.code === 'CURRENCY_UNKNOWN'), false);
});

test('an explicit currency overrides the default without converting figures or changing count columns', () => {
  const originals = [observation({ key: 'spend', unit: '$UNKNOWN', value: 123.45 }), observation({ key: 'spend', unit: 'EUR', value: 12.5 }), observation({ key: 'views', unit: 'count', value: 8 })];
  const result = buildEvidenceReport([source('a', originals, { panels: [{ panelId: 'money', platform: 'META_ADS', metricKey: 'spend', unit: '$', dataset: [{ label: 'Anuncio', value: 0 }] }] })], { currency: 'USD' });
  assert.equal(result.observations.find(item => item.value === 123.45).unit, 'USD');
  assert.equal(result.observations.find(item => item.value === 12.5).unit, 'EUR');
  assert.equal(result.observations.find(item => item.value === 8).unit, 'count');
  assert.equal(result.panels[0].unit, 'USD');
  assert.equal(originals[0].unit, '$UNKNOWN');
  assert.deepEqual(normalizeReportObservations({ observations: result.observations }, { sourceId: 'a', currency: 'USD' }), result.observations);
});

test('panels retain their own metric identity and exact dataset; no daily curves are invented', () => {
  const panels = [
    { title: 'Contenido publicado', metricKey: 'publishedContent', platform: 'FACEBOOK', scope: 'UNKNOWN', unit: 'count', chartType: 'BAR', dataset: [{ label: 'Reels', value: 5 }, { label: 'Historias', value: 5 }] },
    { title: 'Visualizaciones', metricKey: 'views', platform: 'FACEBOOK', scope: 'TOTAL', unit: 'count', chartType: 'BAR', dataset: [{ label: 'Reels', value: 933 }] },
    { title: 'Interacciones', metricKey: 'interactions', platform: 'FACEBOOK', scope: 'UNKNOWN', unit: 'count', chartType: 'BAR', dataset: [{ label: 'Reels', value: 40 }] },
    { title: 'Tendencia', metricKey: 'views', platform: 'INSTAGRAM', chartType: 'LINE', dataset: [] },
  ];
  const result = buildEvidenceReport([source('formats', [observation()], { panels })]);
  assert.equal(result.panels.length, 4);
  for (const panel of panels) {
    assert.deepEqual(result.panels.find(item => item.title === panel.title).dataset, panel.dataset);
  }
});

test('missing-only observations are retained but never permit an empty narrative', () => {
  const result = buildEvidenceReport([source('a', [observation({ value: null })])]);
  assert.equal(result.facts[0].value, null);
  assert.equal(result.facts[0].status, 'MISSING');
  assert.equal(result.readyForNarrative, false);
});

test('pure builder leaves input unchanged including relation objects', () => {
  const sources = [source('a', sample)];
  const before = JSON.stringify(sources);
  buildEvidenceReport(sources, { reportPeriod: period });
  assert.equal(JSON.stringify(sources), before);
});

test('normalizing stored evidence again preserves IDs, source period provenance and relations', () => {
  const first = normalizeReportObservations({ observations: sample.map(item => ({ ...item, period: null })) }, { sourceId: 'sample', reportPeriod: period });
  const second = normalizeReportObservations({ sourceId: 'sample', observations: first }, { reportPeriod: period });
  assert.deepEqual(second, first);
});

test('qualified cross-source references keep identity and cannot bind to an invented local parent', () => {
  const result = buildEvidenceReport([
    source('total', [observation({ observationId: 'total:views', value: 100, breakdownComplete: true })]),
    source('components', [
      observation({ value: 70, scope: 'ORGANIC', relation: { type: 'COMPONENT_OF', parentObservationId: 'total:views', exhaustive: true } }),
      observation({ value: 20, scope: 'PAID', relation: { type: 'COMPONENT_OF', parentObservationId: 'total:views', exhaustive: true } }),
    ]),
  ]);
  assert.equal(result.observations.find(item => item.scope === 'PAID').relation.parentObservationId, 'total:views');
  assert.equal(result.issues.find(item => item.code === 'BREAKDOWN_MISMATCH').blocking, true);
});

test('duplicate IDs assigned to different observations produce a blocking identity issue', () => {
  const result = buildEvidenceReport([source('a', [
    observation({ id: 'same', value: 100 }), observation({ id: 'same', key: 'reach', value: 90 }),
  ])]);
  assert.equal(result.issues.find(item => item.code === 'OBSERVATION_ID_CONFLICT').blocking, true);
  assert.equal(result.readyForNarrative, false);
});

test('a number that disagrees with its readable raw value cannot pass unflagged', () => {
  const result = buildEvidenceReport([source('a', [observation({ value: 9.4, rawValue: '9,4 mil' })])]);
  assert.equal(result.issues.find(item => item.code === 'RAW_VALUE_MISMATCH').blocking, true);
  assert.equal(result.observations[0].value, 9.4);
});

test('rounded claims whose displayed values differ are compared as intervals without false exactness', () => {
  const result = buildEvidenceReport([
    source('z', [observation({ value: 9400, rawValue: '9,4 mil', precision: 'ROUNDED' })]),
    source('a', [observation({ value: 9000, rawValue: '9 mil', precision: 'ROUNDED' })]),
  ]);
  assert.equal(result.facts[0].precision, 'ROUNDED');
  assert.equal(result.facts[0].value, 9400);
  assert.equal(result.readyForNarrative, true);
});

test('a complete breakdown must not deduplicate different unnamed components as one', () => {
  const result = buildEvidenceReport([source('a', [
    observation({ id: 'total', value: 100, breakdownComplete: true }),
    observation({ id: 'reels', label: 'Reels', value: 60, parentObservationId: 'total' }),
    observation({ id: 'stories', label: 'Historias', value: 40, parentObservationId: 'total' }),
  ])]);
  assert.ok(result.issues.some(item => item.blocking));
  assert.equal(result.readyForNarrative, false);
});

test('preserves a human-readable context without altering the semantic fact identity', () => {
  const result = buildEvidenceReport([source('a', [observation({ contextLabel: 'Contenido de Instagram distribuido en Facebook', platform: 'FACEBOOK', contextKey: 'facebook_distribution_of_instagram_content' })])]);
  assert.equal(result.observations[0].contextLabel, 'Contenido de Instagram distribuido en Facebook');
  assert.equal(result.facts[0].contextLabel, result.observations[0].contextLabel);
});

test('explicit complete cross-platform breakdown permits each child own context but verifies its sum', () => {
  const result = buildEvidenceReport([source('a', [
    observation({ id: 'parent', platform: 'CROSS_PLATFORM', value: 9400, rawValue: '9,4 mil', precision: 'ROUNDED', contextKey: 'instagram_content_with_facebook_distribution', breakdownComplete: true }),
    observation({ platform: 'FACEBOOK', value: 1017, contextKey: 'facebook_distribution_of_instagram_content', parentObservationId: 'parent' }),
    observation({ platform: 'INSTAGRAM', value: 8000, contextKey: 'account_content', parentObservationId: 'parent' }),
  ])]);
  assert.equal(result.issues.find(item => item.code === 'BREAKDOWN_MISMATCH').blocking, true);
});

test('known count units reconcile without altering currency units', () => {
  const result = buildEvidenceReport([source('a', [observation({ unit: 'views' })]), source('b', [observation({ unit: 'count' })])]);
  assert.equal(result.facts.length, 1);
  assert.equal(result.facts[0].unit, 'count');
});

test('panels inherit declared period visibly and excluded panels stay out of the report', () => {
  const result = buildEvidenceReport([source('a', [observation()], { panels: [
    { panelId: 'a:visible', metricKey: 'views', platform: 'FACEBOOK', unit: 'count', dataset: [{ label: 'Reels', value: 933 }] },
    { panelId: 'a:excluded', excluded: true, metricKey: 'views', platform: 'FACEBOOK', unit: 'count', dataset: [{ label: 'Reels', value: 900 }] },
  ] })], { reportPeriod: period });
  assert.equal(result.panels.length, 1);
  assert.deepEqual(result.panels[0].period, period);
  assert.equal(result.panels[0].periodProvenance, 'REPORT_DECLARED');
  assert.equal(result.panels[0].panelId, 'a:visible');
});

test('a panel from another month or unknown platform blocks publication', () => {
  const result = buildEvidenceReport([source('a', [observation()], { panels: [
    { panelId: 'a:wrong', metricKey: 'views', platform: 'UNKNOWN', unit: 'count', period: { start: '2026-07-01', end: '2026-07-31' }, dataset: [{ label: 'Reels', value: 933 }] },
  ] })], { reportPeriod: period });
  assert.equal(result.readyForNarrative, false);
  assert.ok(result.issues.some(issue => issue.code === 'PERIOD_MISMATCH' && issue.panelIds?.includes('a:wrong')));
  assert.ok(result.issues.some(issue => issue.code === 'PLATFORM_UNKNOWN' && issue.panelIds?.includes('a:wrong')));
});
