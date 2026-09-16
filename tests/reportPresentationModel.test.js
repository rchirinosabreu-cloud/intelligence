import test from 'node:test';
import assert from 'node:assert/strict';
import { formatEvidenceValue } from '../src/lib/reportEvidenceFormat.js';
const module = await import('../src/lib/reportPresentationModel.js').catch(() => ({}));
const build = report => { assert.equal(typeof module.buildReportPresentation, 'function'); return module.buildReportPresentation(report); };
const period = { start: '2026-08-01', end: '2026-08-31' };
const fact = (id, extra = {}) => ({ factId: id, key: 'views', label: 'Total', value: 100, rawValue: '100', unit: 'count', precision: 'EXACT', platform: 'FACEBOOK', scope: 'TOTAL', contextKey: 'account_content', entityLevel: 'ACCOUNT', period, sourceIds: ['source'], observationIds: [`source:${id}`], status: 'OBSERVED', ...extra });
const report = (facts, panels = [], issues = []) => ({ normalizedMetrics: { schemaVersion: 2, facts, panels, issues } });
const allRows = result => result.sections.flatMap(section => section.rows);

test('unresolved conflicts never supply a numeric chart value or comparison, including linked panels', () => {
  const disputed = fact('disputed', { status: 'CONFLICT', changePct: 50, entityLevel: 'FORMAT', entityName: 'Reels' });
  const panel = { panelId: 'p', sourceId: 'source', platform: 'FACEBOOK', metricKey: 'views', unit: 'count', dataset: [{ label: 'Reels', value: 100 }], cellReferences: [{ rowLabel: 'Reels', columnKey: 'value', observationId: 'source:disputed' }] };
  const result = build(report([disputed], [panel]));
  const cells = allRows(result).flatMap(row => Object.values(row.cells || {}));
  assert.equal(cells.length, 2);
  for (const cell of cells) { assert.equal(cell.value, null); assert.equal(cell.text, 'Por conciliar'); assert.ok(!cell.changeText); }
  const metrics = build(report([fact('account', { status: 'CONFLICT', changePct: 50 })]));
  assert.equal(allRows(metrics)[0].changeText, '');
});

test('metric names use their meaning and null headings remain in detail without ghost KPI rows', () => {
  const zero = fact('zero', { key: 'linkClicks', value: 0, rawValue: '0' });
  const heading = fact('heading', { key: 'contentCount', value: null, rawValue: null, entityLevel: 'UNKNOWN', scope: 'UNKNOWN', status: 'MISSING' });
  const result = build(report([fact('views'), zero, heading]));
  assert.deepEqual(allRows(result).map(row => row.label), ['Visualizaciones', 'Clics en el enlace']);
  assert.equal(allRows(result).find(row => row.metricKey === 'linkClicks').valueText, '0');
  assert.deepEqual(result.detailFacts.map(item => item.factId), ['heading']);
});

test('format performance columns stay independent from published volume and preserve distinct row labels', () => {
  const result = build(report([
    fact('links-views', { value: 3032, entityLevel: 'FORMAT', entityName: 'Enlaces', scope: 'UNKNOWN' }),
    fact('links-interactions', { key: 'interactions', value: 11, entityLevel: 'FORMAT', entityName: 'Enlaces', scope: 'UNKNOWN' }),
    fact('photos-count', { key: 'contentCount', value: 4, entityLevel: 'FORMAT', entityName: 'Fotos', scope: 'UNKNOWN' }),
    fact('photo-views', { value: 206, entityLevel: 'FORMAT', entityName: 'Foto', scope: 'UNKNOWN' })
  ]));
  assert.equal(result.sections.length, 2);
  const section = result.sections.find(item => item.columns.some(column => column.key === 'views'));
  assert.equal(section.kind, 'table');
  const links = section.rows.find(row => row.label === 'Enlaces');
  assert.equal(links.cells.views.text, '3.032');
  assert.equal(links.cells.interactions.text, '11');
  assert.deepEqual(links.cells.views.observationIds, ['source:links-views']);
  assert.deepEqual(section.rows.map(row => row.label).sort(), ['Enlaces', 'Foto']);
  assert.match(section.title, /Rendimiento por formato/);
  const volume = result.sections.find(item => item.columns.some(column => column.key === 'contentCount'));
  assert.match(volume.title, /Volumen publicado/);
  assert.deepEqual(volume.columns.map(column => column.key), ['contentCount']);
  assert.deepEqual(volume.rows.map(row => row.label), ['Fotos']);
  assert.deepEqual(volume.rows[0].cells.contentCount.observationIds, ['source:photos-count']);
});

test('ad figures pivot into one row per entity and remain separate from campaign totals', () => {
  const ad = { platform: 'META_ADS', scope: 'PAID', contextKey: 'advertising', entityLevel: 'AD', entityName: 'Anuncio A' };
  const result = build(report([
    fact('results', { ...ad, key: 'results', value: 3, resultType: 'CONVERSATIONS' }),
    fact('reach', { ...ad, key: 'reach', value: 237 }),
    fact('spend', { ...ad, key: 'spend', value: 4666, unit: '$UNKNOWN' }),
    fact('cost', { ...ad, key: 'costPerResult', value: 1555, unit: '$UNKNOWN' }),
    fact('campaign', { ...ad, key: 'spend', value: 180000, unit: '$UNKNOWN', entityLevel: 'CAMPAIGN', entityName: 'Campaña A' })
  ]));
  assert.equal(result.sections.length, 2);
  const row = allRows(result).find(item => item.label === 'Anuncio A');
  assert.equal(row.cells.results.text, '3');
  assert.equal(row.cells.spend.text, '$ 4.666');
  assert.equal(row.cells.costPerResult.text, '$ 1.555');
  assert.equal(row.facts.length, 4);
  assert.equal(result.contextNotes.filter(item => item.code === 'CURRENCY_UNKNOWN').length, 1);
  assert.equal(allRows(result).some(item => item.label === 'Total'), false);
});

test('unknown currency preserves the observed symbol without printing an internal sentinel', () => {
  assert.equal(formatEvidenceValue({ value: 4666, unit: '$UNKNOWN' }), '$ 4.666');
  assert.equal(formatEvidenceValue({ value: 0, unit: '$UNKNOWN' }), '$ 0');
  assert.equal(formatEvidenceValue({ value: 4666, unit: 'COP' }), '4.666 COP');
});

test('distribution from Instagram and unknown entities do not become Facebook account KPIs', () => {
  const result = build(report([
    fact('account', { value: 4927 }),
    fact('distribution', { value: 1308, contextKey: 'facebook_distribution_of_instagram_content', entityLevel: 'UNKNOWN' }),
    fact('unknown', { platform: 'INSTAGRAM', contextKey: 'SOURCE_SPECIFIC:s1', entityLevel: 'UNKNOWN' }),
    fact('combined', { platform: 'CROSS_PLATFORM', contextKey: 'instagram_content_with_facebook_distribution', entityLevel: 'UNKNOWN', value: 17800, precision: 'ROUNDED', rawValue: '17,8 mil' })
  ]));
  const own = result.sections.find(section => section.rows.some(row => row.facts.some(item => item.factId === 'account')));
  assert.equal(own.rows.length, 1);
  const distribution = result.sections.find(section => section.rows.some(row => row.facts.some(item => item.factId === 'distribution')));
  assert.match(distribution.title, /distribu.*Instagram|Instagram.*Facebook/i);
  const unknown = result.sections.find(section => section.rows.some(row => row.facts.some(item => item.factId === 'unknown')));
  assert.doesNotMatch(unknown.title, /resumen de (?:la )?cuenta/i);
});

test('linked panel cells are represented once while independent panel cells retain editable references', () => {
  const values = [fact('reels', { value: 933, entityLevel: 'FORMAT', entityName: 'Reels' })];
  const panels = [{ panelId: 'p', sourceId: 'source', title: 'Formatos', metricKey: 'views', unit: 'count', platform: 'FACEBOOK', scope: 'TOTAL', contextKey: 'account_content', period,
    cellReferences: [{ rowLabel: 'Reels', columnKey: 'value', observationId: 'source:reels' }], dataset: [{ label: 'Reels', value: 933, views: 933, ignored: null }, { label: 'Otro', value: 7, views: 7, ignored: null }]
  }];
  const result = build(report(values, panels));
  const linked = allRows(result).flatMap(row => Object.values(row.cells || {})).filter(cell => cell.observationIds.includes('source:reels'));
  assert.equal(linked.length, 1);
  const extra = allRows(result).find(row => row.label === 'Otro');
  assert.equal(extra.cells.views.text, '7');
  assert.deepEqual(extra.cells.views.references, [{ panelId: 'p', rowIndex: 1, rowLabel: 'Otro', columnKey: 'views' }]);
  assert.ok(result.sections.every(section => !section.columns?.some(column => ['ignored', 'value'].includes(column.key))));
});

test('equal numbers from different panel metrics do not prove a duplicated value column', () => {
  const result = build(report([], [{ panelId: 'panel', title: 'Contenido', platform: 'FACEBOOK', metricKey: 'views', unit: 'count', dataset: [{ label: 'Reels', value: 10, interactions: 10 }] }]));
  const section = result.sections[0];
  assert.deepEqual(section.columns.map(column => column.label), ['Visualizaciones', 'Interacciones con el contenido']);
  assert.equal(section.rows[0].cells.value.text, '10');
  assert.equal(section.rows[0].cells.interactions.text, '10');
  assert.equal(section.rows[0].cells.value.references[0].columnKey, 'value');
});

test('mixed summary aliases are removed only through explicit metric observation links', () => {
  const facts = [fact('views', { platform: 'CROSS_PLATFORM', value: 17800 }), fact('reach', { platform: 'INSTAGRAM', key: 'reach', value: 3900 }), fact('interactions', { platform: 'INSTAGRAM', key: 'interactions', value: 348 })];
  const panel = { panelId: 'summary', platform: 'CROSS_PLATFORM', sourceId: 'source', metricKey: 'summary', unit: 'count',
    dataset: [{ label: 'Visualizaciones', value: 17800, views: 17800, reach: null, interactions: null }, { label: 'Alcance', value: 3900, views: null, reach: 3900, interactions: null }, { label: 'Interacciones', value: 348, views: null, reach: null, interactions: 348 }],
    cellReferences: [{ rowLabel: 'Visualizaciones', columnKey: 'views', observationId: 'source:views' }, { rowLabel: 'Alcance', columnKey: 'reach', observationId: 'source:reach' }, { rowLabel: 'Interacciones', columnKey: 'interactions', observationId: 'source:interactions' }]
  };
  const result = build(report(facts, [panel]));
  assert.equal(result.sections.filter(section => section.panelId).length, 0);
  assert.equal(allRows(result).flatMap(row => row.facts).length, 3);
  const withoutLinks = build(report(facts, [{ ...panel, cellReferences: [] }]));
  assert.ok(withoutLinks.sections.find(section => section.panelId === 'summary').columns.some(column => column.key === 'value'));
});

test('a panel with a declared metric mismatch remains in detail without hiding valid facts', () => {
  const invalid = { panelId: 'invalid-panel', platform: 'FACEBOOK', sourceId: 'source', metricKey: 'views', dataset: [{ label: 'Espectadores', value: 2606 }] };
  const valid = { panelId: 'valid-panel', platform: 'FACEBOOK', sourceId: 'source', metricKey: 'views', dataset: [{ label: 'Reels', value: 300 }] };
  const input = report([fact('viewers', { key: 'viewers', value: 2606 })], [invalid, valid], [{ code: 'PANEL_METRIC_MISMATCH', blocking: true, panelIds: ['invalid-panel'], sourceIds: ['source'], message: 'La métrica declarada contradice la fila.' }]);
  const before = structuredClone(input);
  const result = build(input);
  assert.equal(result.sections.some(section => section.panelId === 'invalid-panel'), false);
  assert.ok(result.sections.some(section => section.panelId === 'valid-panel'));
  assert.equal(allRows(result).filter(row => row.metricKey === 'viewers')[0].valueText, '2.606');
  assert.deepEqual(result.detailPanels, [invalid]);
  assert.equal(result.contextNotes.find(note => note.code === 'PANEL_METRIC_MISMATCH').blocking, true);
  assert.deepEqual(input, before);
});

test('different currencies, contexts and conflicting values survive without sums or silent selection', () => {
  const ad = { platform: 'META_ADS', entityLevel: 'AD', entityId: 'ad1', entityName: 'Anuncio', contextKey: 'advertising' };
  const result = build(report([
    fact('usd', { ...ad, key: 'spend', unit: 'USD', value: 10 }),
    fact('cop', { ...ad, key: 'spend', unit: 'COP', value: 10 }),
    fact('conflict', { key: 'views', value: null, status: 'CONFLICT' })
  ]));
  const text = JSON.stringify(result.sections);
  assert.match(text, /10 USD/); assert.match(text, /10 COP/); assert.doesNotMatch(text, /20 (?:USD|COP)/);
  assert.equal(allRows(result).find(row => row.facts.some(item => item.factId === 'conflict')).valueText, 'Por conciliar');
});

test('presentation is deterministic, preserves input, and groups repeated context notes', () => {
  const input = report([fact('a')], [], Array.from({ length: 112 }, (_, i) => ({ id: `i${i}`, code: 'PERIOD_INHERITED', sourceIds: ['source'], message: `Período de ${i}`, blocking: false })));
  const before = structuredClone(input), result = build(input);
  assert.deepEqual(input, before);
  assert.deepEqual(build(input), result);
  assert.equal(result.contextNotes.length, 1);
  assert.equal(result.contextNotes[0].count, 112);
  assert.match(result.contextNotes[0].text, /período seleccionado/i);
});

test('account summary contexts share a section but scopes and row contexts remain explicit', () => {
  const result = build(report([
    fact('total', { platform: 'INSTAGRAM', entityLevel: 'UNKNOWN' }),
    fact('organic', { platform: 'INSTAGRAM', entityLevel: 'UNKNOWN', scope: 'ORGANIC', value: 60 }),
    fact('paid', { platform: 'INSTAGRAM', entityLevel: 'UNKNOWN', scope: 'PAID', value: 40 }),
    fact('audience', { platform: 'INSTAGRAM', entityLevel: 'UNKNOWN', contextKey: 'account_audience', key: 'followerTotal', value: 39 })
  ]));
  assert.equal(result.sections.length, 1);
  assert.match(result.sections[0].title, /Resumen de Instagram/);
  assert.match(result.sections[0].rows.find(row => row.scope === 'ORGANIC').label, /Visualizaciones.*Orgánico/i);
  assert.match(result.sections[0].rows.find(row => row.scope === 'PAID').label, /Visualizaciones.*Anuncios/i);
  assert.ok(result.sections[0].rows.every(row => row.entityLevel === 'UNKNOWN'));
  assert.equal(result.sections[0].rows.find(row => row.metricKey === 'followerTotal').contextLabel, 'Audiencia de la cuenta');
});

test('different advertising result types remain attached to each value in a shared entity', () => {
  const ad = { platform: 'META_ADS', entityLevel: 'AD', entityId: 'ad1', entityName: 'Anuncio', key: 'results' };
  const result = build(report([fact('conversations', { ...ad, value: 10, resultType: 'CONVERSATIONS' }), fact('leads', { ...ad, value: 20, resultType: 'LEADS' })]));
  const cell = allRows(result)[0].cells.results;
  assert.match(cell.text, /10.*Conversaciones/);
  assert.match(cell.text, /20.*Clientes potenciales/);
  assert.equal(cell.facts.length, 2);
});

test('summary captions stay generic while metric labels and scopes remain explicit', () => {
  const result = build(report([
    fact('followers', { platform: 'INSTAGRAM', key: 'followers', contextKey: 'account_audience', contextLabel: 'Seguidores de Instagram en el período' }),
    fact('paid', { platform: 'INSTAGRAM', scope: 'PAID' }),
    fact('organic', { platform: 'INSTAGRAM', scope: 'ORGANIC' }),
    fact('total', { platform: 'INSTAGRAM' }),
    fact('budget', { platform: 'META_ADS', key: 'budget', entityLevel: 'CAMPAIGN', entityName: 'Campaña', unit: '$UNKNOWN' })
  ]));
  const summary = result.sections.find(section => section.platform === 'INSTAGRAM');
  assert.equal(summary.contextLabel, 'Actividad de la cuenta en el período');
  assert.deepEqual(summary.rows.filter(row => row.metricKey === 'views').map(row => row.scope), ['TOTAL', 'ORGANIC', 'PAID']);
  assert.equal(summary.rows.find(row => row.metricKey === 'followers').label, 'Seguidores del período');
  const campaign = result.sections.find(section => section.platform === 'META_ADS');
  assert.equal(campaign.columns.find(column => column.key === 'budget').label, 'Presupuesto');
});
