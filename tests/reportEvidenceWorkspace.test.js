import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { build } from 'esbuild';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

const require = createRequire(import.meta.url);
const workspaceSource = readFileSync('src/components/reports/ReportEvidenceWorkspace.jsx', 'utf8');
const result = await build({ stdin: { contents: `${workspaceSource}\nexport { ObservationEditor as TestObservationEditor };`, loader: 'jsx', resolveDir: path.resolve('src/components/reports') }, bundle: true, write: false, platform: 'node', format: 'cjs', jsx: 'automatic', alias: { '@': path.resolve('src') }, external: ['react', 'react-dom', 'axios'], logLevel: 'silent' });
const compiled = { exports: {} };
new Function('require', 'module', 'exports', result.outputFiles[0].text)(require, compiled, compiled.exports);
const { default: Workspace, TestObservationEditor, getEvidenceWorkspaceState, buildObservationUpdate, buildPanelUpdate } = compiled.exports;
const metric = { observationId: 'source:views', key: 'views', label: 'Visualizaciones', value: 8418, rawValue: '8.418', unit: 'count', platform: 'INSTAGRAM', scope: 'TOTAL', precision: 'EXACT', contextKey: 'instagram-overview', period: { start: '2026-08-01', end: '2026-08-31' }, excluded: false };
const report = { id: 'fixture', status: 'REVIEW', normalizedMetrics: { version: 4, dataVersion: 2, readyForNarrative: true, observations: [metric], facts: [{ ...metric, factId: 'fact', sourceIds: ['source'], observationIds: [metric.observationId], status: 'OBSERVED' }], issues: [], sourceExtractions: [{ sourceId: 'source', originalName: 'Resumen Instagram.png', observations: [metric] }], sourceFailures: [] }, narrative: { generationMode: 'EVIDENCE_AI', dataVersion: 2, needsRegeneration: false, claims: [{ factIds: ['fact'], text: 'Instagram muestra 8.418 visualizaciones.' }] } };

test('current editorial appears beside its result with strategy before audit; stale editorial is hidden', async () => {
  const { buildReportPresentation } = await import('../src/lib/reportPresentationModel.js');
  const sectionId = buildReportPresentation(report).sections[0].id;
  const point = { title: 'Interpretación específica', observation: 'Dato observado', interpretation: 'Lectura del resultado', action: 'Acción propuesta', sourceIds: ['source'] };
  const data = structuredClone(report);
  data.narrative.editorial = { version: 1, summary: { title: 'Balance del mes', text: 'Resumen de prueba' }, sectionComments: [{ ...point, sectionId }], opportunities: [point], recommendations: [{ title: 'Prioridad de prueba', rationale: 'Razón', action: 'Acción', kpi: 'Visitas al perfil', priority: 'ALTA' }], closing: { title: 'Siguiente período', text: 'Cierre de prueba' } };
  const html = renderToStaticMarkup(React.createElement(Workspace, { report: data, onReportChange() {} }));
  assert.ok(html.indexOf('Resumen ejecutivo') < html.indexOf('data-report-presentation'));
  assert.match(html, /data-editorial-comment/);
  assert.ok(html.indexOf('Plan de acción') < html.indexOf('data-report-audit'));
  data.narrative.dataVersion = 1;
  const stale = renderToStaticMarkup(React.createElement(Workspace, { report: data, onReportChange() {} }));
  assert.doesNotMatch(stale, /data-editorial-comment/);
  assert.match(stale, /versión anterior/);
});

test('permits pending corrections but requires saved data and a current narrative', () => {
  assert.equal(getEvidenceWorkspaceState(report).canPublish, true);
  assert.equal(getEvidenceWorkspaceState(report, true).canPublish, false);
  assert.equal(getEvidenceWorkspaceState({ ...report, narrative: { ...report.narrative, dataVersion: 1 } }).canPublish, false);
  const failed = { ...report, normalizedMetrics: { ...report.normalizedMetrics, sourceFailures: [{ sourceId: 'missing' }] } };
  failed.normalizedMetrics.readyForNarrative = false;
  failed.normalizedMetrics.issues = [{ blocking: true, message: 'Lectura por confirmar' }];
  assert.equal(getEvidenceWorkspaceState(failed).canAnalyze, true);
  assert.equal(getEvidenceWorkspaceState(failed).canPublish, true);
  assert.equal(getEvidenceWorkspaceState({ ...failed, status: 'PUBLISHED' }).canDownload, true);
  const html = renderToStaticMarkup(React.createElement(Workspace, { report: failed, onReportChange() {} }));
  assert.match(html, /Emitir informe/);
  assert.match(html, /Puedes emitir el informe con los datos disponibles/);
  assert.doesNotMatch(html, /Revisa los puntos pendientes para continuar/);
  assert.equal(getEvidenceWorkspaceState({ ...failed, normalizedMetrics: { ...failed.normalizedMetrics, excludedSources: [{ sourceId: 'missing', reason: 'No pertenece al informe' }] } }).canAnalyze, true);
});

test('final PDF requires published status and a current analysis', () => {
  assert.equal(getEvidenceWorkspaceState(report).canDownload, false);
  assert.equal(getEvidenceWorkspaceState({ ...report, status: 'PUBLISHED' }).canDownload, true);
  assert.equal(getEvidenceWorkspaceState({ ...report, status: 'PUBLISHED', narrative: { ...report.narrative, needsRegeneration: true } }).canDownload, false);
});

test('observation payload contains only changed fields, explicit reason and identity', () => {
  const payload = buildObservationUpdate(metric, { ...metric, value: '0', reason: 'La captura muestra cero.' });
  assert.deepEqual(payload, { observationId: metric.observationId, value: 0, reason: 'La captura muestra cero.' });
  assert.deepEqual(buildObservationUpdate(metric, { ...metric, value: '', reason: 'Dato ausente.' }), { observationId: metric.observationId, value: null, reason: 'Dato ausente.' });
  assert.deepEqual(buildObservationUpdate(metric, { ...metric, excluded: true, reason: 'Otro período' }), { observationId: metric.observationId, excluded: true, reason: 'Otro período' });
  assert.deepEqual(buildObservationUpdate(metric, { ...metric, key: 'followers', label: 'Seguidores del período', reason: 'La leyenda identifica seguidores, no visualizaciones.' }), { observationId: metric.observationId, key: 'followers', label: 'Seguidores del período', reason: 'La leyenda identifica seguidores, no visualizaciones.' });
});

test('rejects invalid numeric edits or missing reasons without creating payloads', () => {
  assert.throws(() => buildObservationUpdate(metric, { ...metric, value: 'abc', reason: 'Corrección' }), /número/i);
  assert.throws(() => buildObservationUpdate(metric, { ...metric, value: '-1', reason: 'Corrección' }), /número/i);
  assert.throws(() => buildObservationUpdate(metric, { ...metric, value: '0', reason: '' }), /motivo/i);
  assert.throws(() => buildObservationUpdate(metric, { ...metric, value: String(metric.value), reason: 'Sin cambio' }), /cambio/i);
});

test('the indicator selector preserves the canonical three-second video metric without duplicate options', () => {
  const observation = { ...metric, key: 'threeSecondVideoViews', label: 'Reproducciones de 3 segundos' };
  const html = renderToStaticMarkup(React.createElement(TestObservationEditor, {
    editing: { observation, draft: { ...observation, value: String(observation.value), changePct: '', reason: '' } },
    onChange() {}, onSave() {}, onCancel() {}, busy: false, stale: false,
  }));
  const optionValues = [...html.matchAll(/<option\b[^>]*value="([^"]+)"[^>]*>Reproducciones de 3 segundos<\/option>/g)].map(match => match[1]);
  assert.deepEqual(optionValues, ['threeSecondVideoViews']);
});

test('server rendering preserves platform, scope, zero and unavailable as separate values', () => {
  const data = { ...report, normalizedMetrics: { ...report.normalizedMetrics, facts: [
    ...report.normalizedMetrics.facts,
    { ...metric, factId: 'zero', key: 'linkClicks', label: 'Clics en el enlace', value: 0, scope: 'UNKNOWN', observationIds: [] },
    { ...metric, factId: 'missing', platform: 'FACEBOOK', label: 'Alcance', value: null, observationIds: [] },
  ] } };
  const html = renderToStaticMarkup(React.createElement(Workspace, { report: data, onReportChange() {}, apiBaseUrl: '' }));
  assert.match(html, /Instagram/);
  assert.match(html, /Facebook/);
  assert.match(html, /Sin desglose/);
  assert.match(html, /8\.418/);
  assert.match(html, />0</);
  assert.match(html, /No disponible/);
  assert.doesNotMatch(html, /100 ?%.*(?:exactitud|precisión)/i);
});

test('blocking issues and pending captures are visible before metrics', () => {
  const data = { ...report, normalizedMetrics: { ...report.normalizedMetrics, issues: [{ id: 'conflict', blocking: true, message: 'Hay dos lecturas incompatibles.' }], sourceFailures: [{ sourceId: 'missing', originalName: 'Campaña.png', error: 'Lectura fallida' }] } };
  const html = renderToStaticMarkup(React.createElement(Workspace, { report: data, onReportChange() {}, apiBaseUrl: '' }));
  assert.match(html, /Hay dos lecturas incompatibles/);
  assert.match(html, /Campaña.png/);
  assert.ok(html.indexOf('Hay dos lecturas incompatibles') < html.indexOf('8.418'));
});

test('panel edit keeps row label, field identity and zero distinct from missing', () => {
  const panel = { panelId: 'p:formats', dataset: [{ label: 'Reels', views: 933, interactions: 40 }] };
  assert.deepEqual(buildPanelUpdate(panel, { rowIndex: '0', field: 'views', value: '0', reason: 'Corregí contra la captura' }), { panelId: 'p:formats', rowIndex: 0, rowLabel: 'Reels', field: 'views', value: 0, reason: 'Corregí contra la captura' });
  assert.equal(buildPanelUpdate(panel, { rowIndex: '0', field: 'interactions', value: '', reason: 'Dato ausente' }).value, null);
  assert.throws(() => buildPanelUpdate(panel, { rowIndex: '0', field: 'label', value: '2', reason: 'Cambio' }), /columna/i);
});

test('panels can be excluded with a reason and stay readable in review', () => {
  const panel = { panelId: 'p:formats', title: 'Visualizaciones por formato', metricKey: 'views', platform: 'FACEBOOK', unit: 'count', dataset: [{ label: 'Reels', value: 933 }] };
  assert.deepEqual(buildPanelUpdate(panel, { excluded: true, reason: 'Otro período' }), { panelId: 'p:formats', excluded: true, reason: 'Otro período' });
  const html = renderToStaticMarkup(React.createElement(Workspace, { report: { ...report, normalizedMetrics: { ...report.normalizedMetrics, panels: [panel] } }, onReportChange() {}, apiBaseUrl: '' }));
  assert.match(html, /Visualizaciones por formato/);
  assert.match(html, /933/);
  assert.match(html, /Corregir panel/);
});

test('shows the saved narrative sections and action plan returned by the evidence API', () => {
  const data = { ...report, narrative: { ...report.narrative, claims: [{ factId: 'fact', interpretation: 'Conviene revisar formatos.', action: 'Comparar formatos.', kpi: 'Visualizaciones' }], sections: [{ platform: 'INSTAGRAM', title: 'Instagram', paragraphs: ['Instagram registra 8.418 visualizaciones. Conviene revisar formatos.'] }], actionPlan: [{ action: 'Comparar formatos.', kpi: 'Visualizaciones', factId: 'fact' }] } };
  const html = renderToStaticMarkup(React.createElement(Workspace, { report: data, onReportChange() {}, apiBaseUrl: '' }));
  assert.match(html, /Instagram registra 8\.418 visualizaciones/);
  assert.match(html, /Comparar formatos/);
  assert.match(html, /Indicador: Visualizaciones/);
});

test('a monetary panel does not apply its currency to unrelated numeric columns', () => {
  const panel = { panelId: 'p:ads', title: 'Anuncios', metricKey: 'spend', platform: 'META_ADS', unit: 'USD', dataset: [{ label: 'Anuncio', impressions: 1000, spend: 5 }] };
  const html = renderToStaticMarkup(React.createElement(Workspace, { report: { ...report, normalizedMetrics: { ...report.normalizedMetrics, panels: [panel] } }, onReportChange() {}, apiBaseUrl: '' }));
  assert.match(html, /5 USD/);
  assert.doesNotMatch(html, /1\.000 USD/);
});

test('panel metadata correction sends only changed metadata and preserves an unchanged cell', () => {
  const panel = { panelId: 'p:format', platform: 'UNKNOWN', scope: 'UNKNOWN', unit: 'count', contextKey: 'account_content', period: { start: '2026-08-01', end: '2026-08-31' }, dataset: [{ label: 'Reels', value: 933 }] };
  const update = buildPanelUpdate(panel, { ...panel, rowIndex: '0', field: 'value', value: '933', platform: 'FACEBOOK', period: { start: '2026-07-01', end: '2026-07-31' }, reason: 'Plataforma y período visibles en el selector.' });
  assert.deepEqual(update, { panelId: 'p:format', platform: 'FACEBOOK', period: { start: '2026-07-01', end: '2026-07-31' }, reason: 'Plataforma y período visibles en el selector.' });
});

test('a change percentage can be negative or absent and keeps its own field identity', () => {
  const original = { ...metric, changePct: 32.9 };
  assert.deepEqual(buildObservationUpdate(original, { ...original, changePct: '-59', reason: 'La variación visible es negativa.' }), { observationId: metric.observationId, changePct: -59, reason: 'La variación visible es negativa.' });
  assert.equal(buildObservationUpdate(original, { ...original, changePct: '', reason: 'No hay comparación visible.' }).changePct, null);
  assert.throws(() => buildObservationUpdate(original, { ...original, changePct: 'incorrecto', reason: 'Comprobar' }), /porcentaje/i);
});

test('the report presents one row per ad and keeps source observations inside a folded audit', () => {
  const facts = ['reach', 'impressions', 'spend', 'results', 'costPerResult'].map((key, index) => ({ ...metric,
    factId: `ad:${key}`, key, label: key, platform: 'META_ADS', scope: 'PAID', entityLevel: 'AD', entityName: 'Anuncio de ejemplo',
    contextKey: 'advertising', value: [337, 481, 4473, 1, 4473][index], unit: ['spend', 'costPerResult'].includes(key) ? '$UNKNOWN' : 'count',
    observationIds: [], sourceIds: ['source'], status: 'OBSERVED',
  }));
  const html = renderToStaticMarkup(React.createElement(Workspace, { report: { ...report, normalizedMetrics: { ...report.normalizedMetrics, facts } }, onReportChange() {} }));
  assert.match(html, /data-report-presentation/);
  assert.match(html, /<th[^>]*>Importe gastado<\/th>/);
  assert.match(html, /<th[^>]*>Alcance<\/th>/);
  assert.match(html, /\$ 4\.473/);
  assert.doesNotMatch(html, /\$UNKNOWN/);
  assert.match(html, /<details[^>]*data-report-audit/);
  assert.match(html, /Fuentes y revisión detallada/);
});

test('the main report uses metric names and moves repeated methodological notes below the results', () => {
  const facts = [{ ...metric, factId: 'total', label: 'Total', status: 'OBSERVED', observationIds: [], sourceIds: ['source'], entityLevel: 'ACCOUNT' }];
  const issues = Array.from({ length: 20 }, (_, index) => ({ id: `p${index}`, code: 'PERIOD_INHERITED', message: 'El período de Total procede del informe solicitado y no de una fecha visible en esta captura.', sourceIds: ['source'], observationIds: [`o${index}`], blocking: false }));
  const html = renderToStaticMarkup(React.createElement(Workspace, { report: { ...report, normalizedMetrics: { ...report.normalizedMetrics, facts, issues } }, onReportChange() {} }));
  assert.match(html, /Visualizaciones/);
  assert.doesNotMatch(html, /Contexto y limitaciones \(20\)/);
  assert.equal((html.match(/El período de Total procede/g) || []).length <= 1, true);
  assert.ok(html.indexOf('data-report-presentation') < html.indexOf('Metodología y contexto'));
});
