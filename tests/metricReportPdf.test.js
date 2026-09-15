import test from 'node:test';
import assert from 'node:assert/strict';
import { load } from 'cheerio';
import { buildMetricReportHtml, renderMetricReportPdf } from '../src/services/metricReportPdf.js';
import { formatEvidenceValue, formatEvidenceChangePct } from '../src/lib/reportEvidenceFormat.js';

const fact = (overrides = {}) => ({ factId: 'ig-views', key: 'views', label: 'Visualizaciones', value: 16502, rawValue: '16.502', unit: 'count', platform: 'INSTAGRAM', scope: 'TOTAL', precision: 'EXACT', contextKey: 'account', period: { start: '2026-08-01', end: '2026-08-31' }, changePct: 2.6, evidence: [], sourceIds: ['capture-ig'], observationIds: ['observation-ig'], status: 'CORROBORATED', ...overrides });
const report = (overrides = {}) => ({
  id: 'report-client-demo', name: 'Resultados de agosto', client: { name: 'Cliente Demo' }, startDate: '2026-08-01', endDate: '2026-08-31', status: 'PUBLISHED', updatedAt: '2026-09-15T17:00:00.000Z',
  normalizedMetrics: { schemaVersion: 2, dataVersion: 3, facts: [fact()], panels: [], issues: [] },
  narrative: { generationMode: 'EVIDENCE_AI', dataVersion: 3, headline: 'Lectura del período', summaryPoints: ['La respuesta varía por formato.'], sections: [{ platform: 'INSTAGRAM', title: 'Aprendizajes', paragraphs: ['Revisar el contenido de mayor respuesta.'] }], actionPlan: [{ action: 'Comparar formatos', kpi: 'Interacciones por publicación' }], claims: [] },
  sources: [{ id: 'capture-ig', originalName: 'resumen ing.png' }], ...overrides
});

test('embeds only the uploaded raster logo and keeps the document independent of remote images', () => {
  const fixture = report();
  const logo = 'data:image/png;base64,iVBORw0KGgo=';
  fixture.normalizedMetrics.branding = { logoDataUrl: logo };
  let $ = load(buildMetricReportHtml(fixture));
  assert.equal($('.client-logo').attr('src'), logo);
  for (const unsafe of ['https://remote.test/logo.png', 'data:image/svg+xml;base64,PHN2Zz4=', 'data:image/png;base64,a" onerror="x']) {
    fixture.normalizedMetrics.branding.logoDataUrl = unsafe;
    $ = load(buildMetricReportHtml(fixture));
    assert.equal($('img').length, 0);
  }
});

test('single-series table bars scale from observed values and preserve missing and zero cells', () => {
  const fixture = report();
  fixture.normalizedMetrics.panels = [{ panelId: 'format', platform: 'FACEBOOK', metricKey: 'views', unit: 'count', dataset: [{ label: 'Reels', value: 100 }, { label: 'Fotos', value: 25 }, { label: 'Historias', value: 0 }, { label: 'Ausente', value: null }] }];
  const $ = load(buildMetricReportHtml(fixture));
  assert.equal($('.value-bar').length, 3);
  assert.match($('.value-bar').eq(1).attr('style'), /width:25%/);
  assert.match($('.value-bar').eq(2).attr('style'), /width:0%/);
  assert.match($('.panel-table').text(), /Ausente[\s\S]*No disponible/);
  assert.equal($('.panel-table tbody tr').length, 4);
});

test('uses platform per fact, keeping combined views and organic/paid totals apart', () => {
  const fixture = report();
  fixture.normalizedMetrics.facts.push(fact({ factId: 'cross', platform: 'CROSS_PLATFORM', value: 17810, rawValue: '17,8 mil', precision: 'ROUNDED', changePct: 1.8 }), fact({ factId: 'organic', scope: 'ORGANIC', value: 6800, changePct: 27.2 }), fact({ factId: 'paid', scope: 'PAID', value: 9702, changePct: -9.7 }), fact({ factId: 'fb', platform: 'FACEBOOK', value: 4927, changePct: -79.1 }));
  const $ = load(buildMetricReportHtml(fixture));
  assert.match($('[data-platform="INSTAGRAM"]').text(), /16\.502/);
  assert.doesNotMatch($('[data-platform="INSTAGRAM"]').text(), /17,8 mil/);
  assert.match($('[data-platform="CROSS_PLATFORM"]').text(), /17,8 mil/);
  assert.match($('[data-fact-id="organic"]').text(), /Orgánico[\s\S]*6\.800[\s\S]*\+27,2 %/);
  assert.match($('[data-fact-id="paid"]').text(), /Pagado[\s\S]*9\.702[\s\S]*-9,7 %/);
});

test('shares browser-safe number, abbreviation, currency, time and change formatting', () => {
  assert.equal(formatEvidenceValue({ value: 0, unit: 'count' }), '0');
  assert.equal(formatEvidenceValue({ value: null, unit: 'count' }), 'No disponible');
  assert.equal(formatEvidenceValue({ value: '', unit: 'count' }), 'No disponible');
  assert.equal(formatEvidenceValue({ value: 4900, rawValue: '4,9 mil', precision: 'ROUNDED', unit: 'count' }), '≈ 4,9 mil');
  assert.equal(formatEvidenceValue({ value: 1.999, unit: '%' }), '1,999 %');
  assert.equal(formatEvidenceValue({ value: 180000, unit: 'COP' }), '180.000 COP');
  assert.equal(formatEvidenceValue({ value: 180000, unit: 'currency' }), '180.000 (moneda sin confirmar)');
  assert.equal(formatEvidenceValue({ value: 4740, unit: 'seconds' }), '1 h 19 min');
  assert.equal(formatEvidenceValue({ value: 0, unit: 'seconds' }), '0 s');
  assert.equal(formatEvidenceChangePct(1.999), '+1,999 %');
  assert.equal(formatEvidenceChangePct(0), '0 %');
  assert.equal(formatEvidenceChangePct(null), 'Sin comparación');
});

test('preserves zero, missing data, fractional percentages and each own change without coercion', () => {
  const fixture = report();
  fixture.normalizedMetrics.facts = [fact({ factId: 'zero', value: 0, changePct: 0 }), fact({ factId: 'missing', value: null, status: 'MISSING', changePct: null }), fact({ factId: 'rate', key: 'ctr', label: 'CTR', value: 1.999, unit: '%', changePct: -1.999 })];
  const $ = load(buildMetricReportHtml(fixture));
  assert.equal($('[data-fact-id="zero"] .metric-value').text(), '0');
  assert.equal($('[data-fact-id="missing"] .metric-value').text(), 'No disponible');
  assert.equal($('[data-fact-id="rate"] .metric-value').text(), '1,999 %');
  assert.match($('[data-fact-id="rate"]').text(), /-1,999 %/);
  assert.match($('[data-fact-id="zero"]').text(), /0 %/);
});

test('escapes every user-controlled string and emits no external resources or executable content', () => {
  const injected = '</style><script>alert(1)</script><img src="https://evil.test/pixel">';
  const fixture = report({ name: injected, client: { name: injected } });
  fixture.normalizedMetrics.facts[0] = fact({ factId: injected, label: injected, unit: injected });
  fixture.normalizedMetrics.panels = [{ panelId: injected, title: injected, platform: 'INSTAGRAM', metricKey: 'views', unit: 'count', dataset: [{ label: injected, value: 0 }] }];
  fixture.narrative.headline = injected;
  fixture.narrative.sections[0].paragraphs = [injected];
  fixture.sources[0].originalName = injected;
  const html = buildMetricReportHtml(fixture);
  const $ = load(html);
  assert.equal($('script,img,link,iframe,object,embed').length, 0);
  assert.match($('body').text(), /<script>alert\(1\)<\/script>/);
  assert.match($('meta[http-equiv="Content-Security-Policy"]').attr('content'), /default-src 'none'/);
  assert.doesNotMatch($('style').text(), /url\(|@import/);
});

test('presents panel values under the actual metric label without cloning or summing columns', () => {
  const fixture = report();
  fixture.normalizedMetrics.panels = [{ panelId: 'format', title: 'Respuesta por formato', metricKey: 'interactions', metricLabel: 'Interacciones con el contenido', platform: 'FACEBOOK', scope: 'TOTAL', unit: 'count', dataset: [{ label: 'Reels', value: 19 }, { label: 'Fotos', value: 0 }, { label: 'Sin lectura', value: null }] }];
  const $ = load(buildMetricReportHtml(fixture));
  const panel = $('[data-panel-id="format"]');
  assert.match(panel.text(), /Interacciones con el contenido/);
  assert.match(panel.find('.caption').text(), /Facebook/);
  assert.doesNotMatch(panel.text(), /Impresiones|Alcance/);
  assert.equal(panel.find('thead th').length, 2);
  assert.equal(panel.find('tbody tr').length, 3);
  assert.match(panel.text(), /Fotos[\s\S]*0/);
  assert.match(panel.text(), /Sin lectura[\s\S]*No disponible/);
});

test('does not invent the paid platform, ISO currency, account or comparative period', () => {
  const fixture = report();
  fixture.normalizedMetrics.facts = [fact({ factId: 'spend', platform: 'META_ADS', label: 'Importe gastado', value: 180000, unit: '$', period: null, contextKey: 'campaign:CLIENTE DEMO/AGOSTO', changePct: null })];
  const $ = load(buildMetricReportHtml(fixture));
  assert.match($('[data-platform="META_ADS"]').text(), /Pauta Meta/);
  assert.match($('[data-fact-id="spend"]').text(), /180\.000 \$/);
  assert.doesNotMatch($('body').text(), /COP|USD|Coordinador/);
  assert.match($('[data-fact-id="spend"]').text(), /Período sin confirmar/);
});

test('requires published/current/complete evidence and narrative before final export', () => {
  assert.throws(() => buildMetricReportHtml(report({ status: 'REVIEW' })), /publicado/i);
  const blocked = report(); blocked.normalizedMetrics.issues = [{ blocking: true, message: 'Período incompatible' }];
  assert.throws(() => buildMetricReportHtml(blocked), /pendientes/i);
  const conflict = report(); conflict.normalizedMetrics.facts[0].status = 'CONFLICT';
  assert.throws(() => buildMetricReportHtml(conflict), /pendientes/i);
  const stale = report(); stale.narrative.dataVersion = 2;
  assert.throws(() => buildMetricReportHtml(stale), /vigente/i);
  const failed = report(); failed.narrative.needsRegeneration = true;
  assert.throws(() => buildMetricReportHtml(failed), /narrativa/i);
  assert.throws(() => buildMetricReportHtml(report({ narrative: null })), /narrativa/i);
  const legacy = report(); legacy.normalizedMetrics.schemaVersion = 1;
  assert.throws(() => buildMetricReportHtml(legacy), /evidencia/i);
});

test('labels incomplete preview visibly and suppresses stale narrative without mutating report', () => {
  const fixture = report({ status: 'REVIEW' });
  fixture.narrative.dataVersion = 2;
  fixture.narrative.headline = 'NO PUBLICAR NARRATIVA OBSOLETA';
  fixture.normalizedMetrics.issues = [{ blocking: true, message: 'Revisar el período' }];
  const before = JSON.stringify(fixture);
  const html = buildMetricReportHtml(fixture, { preview: true });
  assert.match(html, /BORRADOR/);
  assert.match(html, /Revisar el período/);
  assert.doesNotMatch(html, /NO PUBLICAR NARRATIVA OBSOLETA/);
  assert.equal(JSON.stringify(fixture), before);
  assert.equal(html, buildMetricReportHtml(fixture, { preview: true }));
});

test('uses responsive, printable pagination with repeating table headers and split-safe rows', () => {
  const html = buildMetricReportHtml(report());
  const $ = load(html);
  assert.equal($('[data-fact-id="ig-views"] td[data-label]').length, 4);
  assert.match(html, /@page[\s\S]*size:\s*A4 portrait/);
  assert.match(html, /thead[^{]*\{[^}]*display:\s*table-header-group/);
  assert.match(html, /break-inside:\s*avoid/);
  assert.match(html, /prefers-color-scheme:\s*dark/);
  assert.match(html, /@media print/);
  assert.doesNotMatch(html, /window\.print|setTimeout|height:\s*297mm/);
});

test('renders the exact shared HTML to PDF bytes and rejects invalid renderer output', async () => {
  const fixture = report();
  let received;
  const body = await renderMetricReportPdf(fixture, { renderPdf: async (html) => { received = html; return new Uint8Array(Buffer.from('%PDF-1.7\nfixture')); } });
  assert.equal(received, buildMetricReportHtml(fixture));
  assert.equal(Buffer.isBuffer(body), true);
  assert.equal(body.subarray(0, 5).toString(), '%PDF-');
  await assert.rejects(renderMetricReportPdf(fixture, { renderPdf: async () => Buffer.from('<html>error</html>') }), /PDF/i);
  await assert.rejects(renderMetricReportPdf(report({ status: 'REVIEW' }), { renderPdf: async () => { assert.fail('must not render unpublished report'); } }), /publicado/i);
});

test('formats database Date ranges without losing the calendar date', () => {
  const fixture = report({ startDate: new Date('2026-08-01T00:00:00.000Z'), endDate: new Date('2026-08-31T00:00:00.000Z') });
  const $ = load(buildMetricReportHtml(fixture));
  assert.match($('.cover').text(), /1 ago\.? 2026 - 31 ago\.? 2026/);
  assert.doesNotMatch($('.cover').text(), /Fecha sin confirmar/);
});

test('preserves multiple ad metric columns and separates entity levels instead of adding them', () => {
  const fixture = report();
  fixture.normalizedMetrics.facts = [fact({ factId: 'campaign-spend', platform: 'META_ADS', key: 'spend', label: 'Importe gastado', unit: '$', value: 180000, entityLevel: 'CAMPAIGN', entityName: 'CLIENTE DEMO / AGOSTO' })];
  fixture.normalizedMetrics.panels = [{ panelId: 'ads', platform: 'META_ADS', title: 'Anuncios observados', entityLevel: 'AD', dataset: [{ label: 'POST - Pisos', spend: 146906, impressions: 21724, reach: 10825, results: 125, costPerResult: 1175 }] }];
  const $ = load(buildMetricReportHtml(fixture));
  assert.match($('[data-fact-id="campaign-spend"]').text(), /Campaña: CLIENTE DEMO \/ AGOSTO/);
  const panel = $('[data-panel-id="ads"]');
  assert.match(panel.text(), /146\.906/);
  assert.match(panel.text(), /21\.724/);
  assert.match(panel.text(), /10\.825/);
  assert.equal(panel.find('thead th').length, 6);
  assert.doesNotMatch(panel.text(), /326\.906/);
});

test('reuses source identities and names across persisted records and extraction evidence', () => {
  const fixture = report({ sources: [{ id: 'database-row', sourceId: 'capture-ig', extractionData: { originalName: 'Resumen de Instagram.png' } }] });
  fixture.normalizedMetrics.sourceExtractions = [{ sourceId: 'capture-ig', originalName: 'Resumen de Instagram.png' }];
  const $ = load(buildMetricReportHtml(fixture));
  assert.equal($('.source-list li').length, 1);
  assert.equal($('.source-list li').text(), '[1]Resumen de Instagram.png');
  assert.equal($('[data-fact-id="ig-views"] .source-ref').text(), '[1]');
  assert.doesNotMatch($('.source-list').text(), /database-row|capture-ig/);
});

test('labels context, selected report periods and missing breakdown without inventing comparison dates', () => {
  const fixture = report();
  fixture.normalizedMetrics.facts = [fact({ factId:'fb-part',platform:'FACEBOOK',value:1017,scope:'UNKNOWN',contextKey:'instagram-crossposting',periodProvenance:'REPORT_DECLARED',comparisonPeriod:{start:null,end:null} }),fact({ factId:'fb-total',platform:'FACEBOOK',value:1049,contextKey:'facebook-overview' })];
  const $ = load(buildMetricReportHtml(fixture));
  assert.match($('[data-fact-id="fb-part"]').text(), /Tarjeta combinada de Instagram/);
  assert.match($('[data-fact-id="fb-total"]').text(), /Resumen de Facebook/);
  assert.match($('[data-fact-id="fb-part"]').text(), /Período seleccionado/);
  assert.match($('[data-fact-id="fb-part"]').text(), /Sin desglose/);
  assert.doesNotMatch($('[data-fact-id="fb-part"]').text(), /Comparado con Período sin confirmar/);
});

test('groups repeated source notices in the methodology annex without repeating per-metric warnings', () => {
  const fixture=report();
  fixture.normalizedMetrics.issues=Array.from({length:67},(_,index)=>({code:'PERIOD_INHERITED',message:`El período de métrica ${index} procede del informe solicitado y no de una fecha visible.`,sourceIds:['capture-ig'],blocking:false}));
  const $=load(buildMetricReportHtml(fixture));
  assert.equal($('[data-issue-code="PERIOD_INHERITED"]').length,1);
  assert.match($('.sources').text(),/67 observaciones/);
  assert.doesNotMatch($('.sources').text(),/métrica 66/);
});

test('blocks unresolved failed sources and discloses source and observation exclusions with their reasons', () => {
  const fixture=report();
  fixture.normalizedMetrics.sourceFailures=[{sourceId:'failed',originalName:'Captura incompleta.png',message:'Respuesta incompleta'}];
  assert.throws(()=>buildMetricReportHtml(fixture),/fuentes/i);
  fixture.normalizedMetrics.excludedSources=[{sourceId:'failed',reason:'Es de otro mes'}];
  fixture.normalizedMetrics.observations=[{sourceId:'capture-ig',observationId:'old',label:'Alcance',excluded:true,review:{reason:'El intervalo visible no corresponde'}}];
  const $=load(buildMetricReportHtml(fixture));
  assert.match($('.sources').text(),/Captura incompleta.png/);
  assert.match($('.sources').text(),/Es de otro mes/);
  assert.match($('.sources').text(),/El intervalo visible no corresponde/);
});

test('excludes reviewed panels from results while preserving their exclusion reason', () => {
  const fixture=report();
  fixture.normalizedMetrics.panels=[{panelId:'excluded-panel',platform:'FACEBOOK',title:'Panel de otro período',sourceId:'capture-ig',excluded:true,review:{reason:'Corresponde a julio'},dataset:[{label:'Reels',value:99999}]}];
  const $=load(buildMetricReportHtml(fixture));
  assert.equal($('[data-panel-id="excluded-panel"]').length,0);
  assert.match($('.sources').text(),/Panel de otro período/);
  assert.match($('.sources').text(),/Corresponde a julio/);
  assert.doesNotMatch($('.platform').text(),/99\.999/);
});

test('finds excluded evidence in source extractions after consolidation removes it from active metrics', () => {
  const fixture=report();
  fixture.normalizedMetrics.sourceExtractions=[{sourceId:'capture-ig',originalName:'Resumen.png',panels:[{panelId:'old-panel',title:'Panel antiguo',excluded:true,review:{reason:'De julio'}}],observations:[{observationId:'old-value',label:'Valor antiguo',excluded:true,review:{reason:'Otro filtro'}}]}];
  const $=load(buildMetricReportHtml(fixture));
  assert.match($('.sources').text(),/Panel antiguo.*De julio/);
  assert.match($('.sources').text(),/Valor antiguo.*Otro filtro/);
});
