import test from 'node:test';
import assert from 'node:assert/strict';
import { buildEvidenceReport } from '../src/lib/reportEvidence.js';

const period = { start: '2026-08-01', end: '2026-08-31' };
const combined = 'instagram_content_with_facebook_distribution';
const observation = (extra = {}) => ({ key: 'views', label: 'Visualizaciones', value: 100,
  platform: 'INSTAGRAM', scope: 'TOTAL', unit: 'count', precision: 'EXACT', contextKey: 'account_content',
  period, entityLevel: 'ACCOUNT', ...extra });
const source = (sourceId, observations, panels = []) => ({ sourceId, observations, panels });

test('presentation result types do not split equivalent metrics or prevent exact corroboration', () => {
  const result = buildEvidenceReport([
    source('summary', [observation({ key: 'viewers', value: 2606, resultType: 'SUMMARY', originalRawValue: '2,6 mil', review: { reason: 'Revisado' } })]),
    source('metric', [observation({ key: 'viewers', value: 2600, rawValue: '2,6 mil', resultType: 'METRIC' })]),
  ]);
  assert.equal(result.facts.length, 1);
  assert.equal(result.facts[0].value, 2606);
  assert.equal(result.facts[0].precision, 'EXACT');
  assert.equal(result.facts[0].status, 'CORROBORATED');
  assert.deepEqual(result.observations.map(item => item.resultType).sort(), ['METRIC', 'SUMMARY']);
  assert.equal(result.observations.find(item => item.review).review.reason, 'Revisado');
  assert.equal(result.observations.find(item => item.review).originalRawValue, '2,6 mil');
});

test('results and cost per result keep their actual result definitions separate', () => {
  const result = buildEvidenceReport([source('ads', ['results', 'costPerResult'].flatMap(key => [
    observation({ key, resultType: 'CONVERSATIONS', unit: key === 'results' ? 'count' : 'COP' }),
    observation({ key, resultType: 'PURCHASES', unit: key === 'results' ? 'count' : 'COP' }),
  ]))]);
  assert.equal(result.facts.length, 4);
});

test('known count aliases corroborate while UNKNOWN contexts remain source-specific', () => {
  for (const unit of ['viewers', 'followerTotal']) {
    const result = buildEvidenceReport([source('a', [observation({ unit })]), source('b', [observation()])]);
    assert.equal(result.facts.length, 1);
    assert.equal(result.facts[0].unit, 'count');
  }
  const unknown = buildEvidenceReport([
    source('a', [observation({ contextKey: 'UNKNOWN' })]), source('b', [observation({ contextKey: 'unknown' })]),
  ]);
  assert.equal(unknown.facts.length, 2);
  assert.ok(unknown.observations.every(item => item.contextKey.startsWith('SOURCE_SPECIFIC:') && item.contextProvenance === 'SOURCE_SPECIFIC'));
});

const crosspostingSources = () => [source('summary', [
  observation({ id: 'combined', value: 17800, rawValue: '17,8 mil', platform: 'CROSS_PLATFORM', contextKey: combined, resultType: 'VIEWS' }),
  observation({ id: 'fb', value: 1308, platform: 'FACEBOOK', contextKey: combined, parentObservationId: 'combined' }),
  observation({ id: 'ig', value: 16502, contextKey: combined, parentObservationId: 'combined' }),
  observation({ id: 'total', label: 'Total', value: 16502, contextKey: combined, relation: { type: 'CORROBORATES', parentObservationId: 'ig' } }),
  observation({ id: 'organic', value: 6800, scope: 'ORGANIC', contextKey: combined, parentObservationId: 'total' }),
  observation({ id: 'paid', value: 9702, scope: 'PAID', contextKey: combined, parentObservationId: 'total' }),
], [{ id: 'ig', metricKey: 'views', platform: 'INSTAGRAM', scope: 'TOTAL', unit: 'count', contextKey: combined, period,
  observationIds: ['total'], dataset: [{ label: 'Total', value: 16502 }] }]), source('trends', [
  observation({ id: 'combined', value: 17800, rawValue: '17,8 mil', platform: 'CROSS_PLATFORM', contextKey: combined, resultType: 'TOTAL' }),
  observation({ id: 'fb', value: 1308, platform: 'FACEBOOK', contextKey: 'facebook_distribution_of_instagram_content', parentObservationId: 'combined' }),
  observation({ id: 'ig', value: 16502, parentObservationId: 'combined' }),
  observation({ id: 'own-fb', value: 4927, platform: 'FACEBOOK' }),
])];

test('explicit crossposting relations canonicalize child facts and their breakdown without altering originals', () => {
  const sources = crosspostingSources();
  const before = JSON.stringify(sources);
  const result = buildEvidenceReport(sources);
  assert.equal(result.facts.length, 6);
  assert.equal(result.observations.length, 10);
  assert.equal(result.facts.find(item => item.platform === 'INSTAGRAM' && item.scope === 'TOTAL').observationIds.length, 3);
  assert.ok(result.facts.filter(item => item.platform === 'INSTAGRAM').every(item => item.contextKey === 'account_content'));
  assert.deepEqual(result.facts.filter(item => item.platform === 'FACEBOOK').map(item => item.value).sort((a, b) => a - b), [1308, 4927]);
  assert.equal(result.observations.find(item => item.observationId === 'summary:ig').contextKey, combined);
  assert.equal(result.readyForNarrative, true);
  assert.equal(JSON.stringify(sources), before);
  assert.deepEqual(buildEvidenceReport([...sources].reverse()), result);
});

test('matching values or a relation to an incompatible or excluded parent cannot invent context or platform', () => {
  for (const parent of [null, observation({ id: 'parent', platform: 'CROSS_PLATFORM', contextKey: combined, excluded: true }),
    observation({ id: 'parent', platform: 'CROSS_PLATFORM', contextKey: combined, period: { start: '2026-07-01', end: '2026-07-31' } })]) {
    const result = buildEvidenceReport([source('a', [
      ...(parent ? [parent] : []), observation({ id: 'child', contextKey: combined, parentObservationId: parent ? 'parent' : undefined }),
      observation({ id: 'own' }), observation({ id: 'unknown', platform: 'UNKNOWN', contextKey: combined }),
    ])]);
    assert.equal(result.facts.filter(item => item.platform === 'INSTAGRAM').length, 2);
    assert.ok(result.issues.some(item => item.code === 'PLATFORM_UNKNOWN' && item.blocking));
  }
});

test('cyclic crossposting references cannot authorize a context change', () => {
  const result = buildEvidenceReport([source('cycle', [
    observation({ id: 'parent', platform: 'CROSS_PLATFORM', contextKey: combined, parentObservationId: 'child' }),
    observation({ id: 'child', contextKey: combined, parentObservationId: 'parent' }),
    observation({ id: 'account' }),
  ])]);
  assert.equal(result.facts.filter(item => item.platform === 'INSTAGRAM').length, 2);
});

test('corroboration does not transfer contexts across networks, audiences or another named account', () => {
  const cases = [
    { child: { platform: 'FACEBOOK' }, parent: { platform: 'FACEBOOK', contextKey: 'account_content' } },
    { child: { platform: 'INSTAGRAM' }, parent: { platform: 'FACEBOOK', contextKey: 'account_content' } },
    { child: {}, parent: { contextKey: 'account_audience' } },
    { child: { entityName: 'Cuenta A' }, parent: { entityName: 'Cuenta B' } },
    { child: {}, parent: { key: 'reach' } },
    { child: {}, parent: { unit: '%' } },
    { child: {}, parent: { period: { start: '2026-07-01', end: '2026-07-31' } } },
  ];
  for (const entry of cases) {
    const result = buildEvidenceReport([source('invalid', [
      observation({ id: 'parent', ...entry.parent }),
      observation({ id: 'child', contextKey: combined, relation: { type: 'CORROBORATES', parentObservationId: 'parent' }, ...entry.child }),
    ])]);
    const child = result.facts.find(item => item.observationIds.includes('invalid:child'));
    assert.equal(child.contextKey, combined, JSON.stringify(entry));
    assert.equal(child.contextResolution, undefined);
  }
});

test('repeated period and scope notices retain all references while dollar symbols use COP', () => {
  const sources = ['a', 'b'].map(id => source(id, [observation({ id: 'spend', key: 'spend', unit: '$UNKNOWN', rawValue: '$100', period: null, scope: 'UNKNOWN' })], [
    { id: 'spend', metricKey: 'spend', platform: 'INSTAGRAM', unit: '$UNKNOWN', scope: 'UNKNOWN', dataset: [{ label: 'Importe', value: 100 }] },
  ]));
  const result = buildEvidenceReport(sources, { reportPeriod: period });
  for (const code of ['PERIOD_INHERITED', 'SCOPE_UNDISCLOSED']) {
    const issues = result.issues.filter(item => item.code === code);
    assert.equal(issues.length, 1, code);
    assert.deepEqual(issues[0].sourceIds, ['a', 'b']);
    assert.deepEqual(issues[0].observationIds, ['a:spend', 'b:spend']);
    assert.deepEqual(issues[0].panelIds, ['a:panel-spend', 'b:panel-spend']);
    assert.equal(issues[0].blocking, false);
  }
  assert.ok(result.observations.every(item => item.unit === 'COP' && item.rawValue === '$100'));
  assert.equal(result.issues.some(item => item.code === 'CURRENCY_UNKNOWN'), false);
  assert.equal(result.readyForNarrative, true);
});

test('specific period mismatches remain separate blocking issues', () => {
  const result = buildEvidenceReport(['a', 'b'].map(id => source(id, [observation({ period: { start: '2026-07-01', end: '2026-07-31' } })])), { reportPeriod: period });
  assert.equal(result.issues.filter(item => item.code === 'PERIOD_MISMATCH' && item.blocking).length, 2);
  assert.equal(result.readyForNarrative, false);
});

test('default COP enables checking explicit breakdowns without replacing the source total', () => {
  const missing = buildEvidenceReport([source('missing', [observation({ key: 'spend', unit: 'UNKNOWN' })])]);
  assert.equal(missing.facts[0].unit, 'COP');
  assert.equal(missing.issues.some(item => item.code === 'CURRENCY_UNKNOWN'), false);
  const symbolic = buildEvidenceReport([source('money', [
    observation({ id: 'total', key: 'spend', unit: '$UNKNOWN', value: 100, breakdownComplete: true }),
    observation({ key: 'spend', unit: '$UNKNOWN', value: 80, scope: 'ORGANIC', parentObservationId: 'total' }),
    observation({ key: 'spend', unit: '$UNKNOWN', value: 80, scope: 'PAID', parentObservationId: 'total' }),
  ])]);
  assert.equal(symbolic.facts.find(item => item.scope === 'TOTAL').value, 100);
  assert.equal(symbolic.issues.some(item => item.code === 'BREAKDOWN_MISMATCH' && item.blocking), true);
});

test('default COP corroborates COP evidence but never merges or sums different currencies', () => {
  const result = buildEvidenceReport([source('currencies', [
    observation({ id: 'total', key: 'spend', unit: 'USD', value: 100, breakdownComplete: true }),
    observation({ id: 'cop', key: 'spend', unit: 'COP', value: 100, parentObservationId: 'total' }),
    observation({ id: 'symbol', key: 'spend', unit: '$UNKNOWN', value: 100, parentObservationId: 'total' }),
  ])]);
  assert.equal(result.facts.length, 2);
  assert.deepEqual(result.facts.map(item => item.unit).sort(), ['COP', 'USD']);
  assert.equal(result.facts.find(item => item.unit === 'COP').value, 100);
  assert.equal(result.facts.find(item => item.unit === 'COP').observationIds.length, 2);
  assert.equal(result.issues.some(item => item.code === 'BREAKDOWN_MISMATCH'), false);
  assert.ok(result.issues.some(item => item.code === 'BREAKDOWN_INCOMPLETE'));
});

test('an explicitly transcribed currency symbol remains usable when the extractor omitted its unit', () => {
  const result = buildEvidenceReport([source('raw-symbol', [
    observation({ key: 'spend', unit: 'UNKNOWN', rawValue: '$100' }),
  ])]);
  assert.equal(result.facts[0].unit, 'COP');
  assert.equal(result.observations[0].rawValue, '$100');
  assert.equal(result.issues.some(item => item.code === 'CURRENCY_UNKNOWN'), false);
  assert.equal(result.readyForNarrative, true);
});
