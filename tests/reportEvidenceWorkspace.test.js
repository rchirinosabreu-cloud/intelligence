import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { createRequire } from 'node:module';
import { build } from 'esbuild';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

const require = createRequire(import.meta.url);
const result = await build({ entryPoints: ['src/components/reports/ReportEvidenceWorkspace.jsx'], bundle: true, write: false, platform: 'node', format: 'cjs', jsx: 'automatic', alias: { '@': path.resolve('src') }, external: ['react', 'react-dom', 'axios'], logLevel: 'silent' });
const compiled = { exports: {} };
new Function('require', 'module', 'exports', result.outputFiles[0].text)(require, compiled, compiled.exports);
const { default: Workspace, getEvidenceWorkspaceState, buildObservationUpdate, buildPanelUpdate } = compiled.exports;
const metric = { observationId: 'source:views', key: 'views', label: 'Visualizaciones', value: 8418, rawValue: '8.418', unit: 'count', platform: 'INSTAGRAM', scope: 'TOTAL', precision: 'EXACT', contextKey: 'instagram-overview', period: { start: '2026-08-01', end: '2026-08-31' }, excluded: false };
const report = { id: 'fixture', status: 'REVIEW', normalizedMetrics: { version: 4, dataVersion: 2, readyForNarrative: true, observations: [metric], facts: [{ ...metric, factId: 'fact', sourceIds: ['source'], observationIds: [metric.observationId], status: 'OBSERVED' }], issues: [], sourceExtractions: [{ sourceId: 'source', originalName: 'Resumen Instagram.png', observations: [metric] }], sourceFailures: [] }, narrative: { generationMode: 'EVIDENCE_AI', dataVersion: 2, needsRegeneration: false, claims: [{ factIds: ['fact'], text: 'Instagram muestra 8.418 visualizaciones.' }] } };

test('blocks publication for stale narrative, unresolved source failures or local draft', () => {
  assert.equal(getEvidenceWorkspaceState(report).canPublish, true);
  assert.equal(getEvidenceWorkspaceState(report, true).canPublish, false);
  assert.equal(getEvidenceWorkspaceState({ ...report, narrative: { ...report.narrative, dataVersion: 1 } }).canPublish, false);
  const failed = { ...report, normalizedMetrics: { ...report.normalizedMetrics, sourceFailures: [{ sourceId: 'missing' }] } };
  assert.equal(getEvidenceWorkspaceState(failed).canAnalyze, false);
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
});

test('rejects invalid numeric edits or missing reasons without creating payloads', () => {
  assert.throws(() => buildObservationUpdate(metric, { ...metric, value: 'abc', reason: 'Corrección' }), /número/i);
  assert.throws(() => buildObservationUpdate(metric, { ...metric, value: '-1', reason: 'Corrección' }), /número/i);
  assert.throws(() => buildObservationUpdate(metric, { ...metric, value: '0', reason: '' }), /motivo/i);
  assert.throws(() => buildObservationUpdate(metric, { ...metric, value: String(metric.value), reason: 'Sin cambio' }), /cambio/i);
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
