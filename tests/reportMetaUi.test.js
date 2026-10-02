import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describeReportSources, filterAdAccounts, humanizeMetaReadError, isMetaSource, reportSourcePlan } from '../src/lib/metaReportSources.js';

// Reportes: the figures of Meta sit next to the screenshots, never instead of them (Rodny, 2 October
// 2026: «no eliminemos la opción que tenemos actualmente de subir los pantallazos»).

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const reports = read('src/components/modules/Reports.jsx');
const panel = read('src/components/reports/ReportMetaSources.jsx');
const workspace = read('src/components/reports/ReportEvidenceWorkspace.jsx');

test('the button says what it is going to do, and without screenshots or Meta there is nothing to read', () => {
  assert.deepEqual(reportSourcePlan({}), { ready: false, label: 'Leer capturas', busyLabel: 'Leyendo capturas…' });
  assert.equal(reportSourcePlan({ screenshots: 2 }).ready, true);
  assert.equal(reportSourcePlan({ screenshots: 2 }).label, 'Leer capturas');
  assert.deepEqual(reportSourcePlan({ instagramAccountId: 's-ig' }), { ready: true, label: 'Traer cifras de Meta', busyLabel: 'Consultando Meta…' });
  assert.equal(reportSourcePlan({ adAccountId: 'ad-1' }).ready, true);
  assert.equal(reportSourcePlan({ screenshots: 1, adAccountId: 'ad-1' }).label, 'Leer capturas y traer cifras');
  assert.deepEqual(reportSourcePlan({ facebookAccountId: 's-fb' }), { ready: true, label: 'Traer cifras de Meta', busyLabel: 'Consultando Meta…' });
});

// «Ahora añadamos las cifras de Facebook» (Rodny, 2 October 2026).
test('Facebook is chosen like Instagram: the page already connected, nothing ticked, one per report', () => {
  assert.match(panel, /data-report-meta-facebook=\{account\.id\}/);
  assert.match(panel, /onFacebookChange\(active \? '' : account\.id\)/);
  assert.match(panel, /facebook\.some\(\(account\) => account\.id === facebookAccountId\)/);
  assert.match(panel, /Este cliente no tiene página de Facebook conectada\. Se conecta en su ficha/);
  assert.match(panel, /data-report-meta-facebook-note/);
  assert.match(reports, /const \[metaFacebookId, setMetaFacebookId\] = useState\(''\)/);
  assert.match(reports, /formData\.append\('metaFacebookAccountId', metaFacebookId\)/);
  assert.match(reports, /facebookAccountId: metaFacebookId/);
});

test('uploading screenshots stays exactly where it was', () => {
  for (const field of ['report-social-files', 'report-ads-files']) assert.ok(reports.includes(`id="${field}"`), field);
  assert.match(reports, /formData\.append\('organicFiles', file\)/);
  assert.match(reports, /formData\.append\('adsFiles', file\)/);
  assert.match(reports, /<ReportMetaSources/);
  assert.match(reports, /formData\.append\('metaInstagramAccountId', metaInstagramId\)/);
  assert.match(reports, /formData\.append\('metaAdAccountId', metaAdAccountId\)/);
  assert.match(reports, /disabled=\{isGenerating \|\| !sourcePlan\.ready\}/);
  // What was chosen belongs to a client: changing the client lets go of it.
  assert.match(reports, /setSelectedClientId\(e\.target\.value\); setMetaInstagramId\(''\); setMetaFacebookId\(''\); setMetaAdAccountId\(''\);/);
});

test('nothing comes ticked: the person chooses what the report brings, and can let go of it', () => {
  assert.match(panel, /aria-pressed=\{active\}/);
  assert.match(panel, /onInstagramChange\(active \? '' : account\.id\)/);
  assert.match(panel, /onAdAccountChange\(active \? '' : account\.id\)/);
  assert.doesNotMatch(reports, /useState\((?!'')[^)]*\);\s*\/\/ meta/);
  assert.match(reports, /const \[metaInstagramId, setMetaInstagramId\] = useState\(''\)/);
  assert.match(reports, /const \[metaAdAccountId, setMetaAdAccountId\] = useState\(''\)/);
  // What was chosen is only sent if it is still on the list.
  assert.match(panel, /instagram\.some\(\(account\) => account\.id === instagramAccountId\)/);
});

test('the panel says where each thing is connected and what Meta does not give', () => {
  assert.match(panel, /Este cliente no tiene Instagram conectado\. Se conecta en su ficha/);
  assert.match(panel, /Instagram, Facebook y la pauta llegan directo de Meta/);
  assert.doesNotMatch(panel, /Facebook, por ahora/, 'Facebook ya llega de Meta');
  assert.match(panel, /data-report-meta-long-period/);
  assert.match(panel, /Solo las campañas cuyo nombre contiene/);
  assert.match(panel, /data-report-campaign-filter/);
  // The ad account is chosen by administrators and project managers; the rest read why it is missing.
  assert.match(panel, /\{canManage && \(\s*<button type="button" disabled=\{disabled\} onClick=\{\(\) => setDialogOpen\(true\)\}/);
  assert.match(panel, /La vincula un administrador o project manager\./);
  // No native select, no local hex, no legacy palette.
  assert.doesNotMatch(panel, /<select|#[0-9a-fA-F]{6}|purple-|violet-|indigo-|emerald-|teal-|sky-/);
  // Every error is logged with what the server said.
  assert.equal((panel.match(/console\.error\(/g) || []).length, 2);
  assert.match(panel, /err\.response\?\.data/);
});

test('the ad accounts are searched by name or number, the live ones first', () => {
  const accounts = [{ id: '9', name: 'Vieja', isActive: false }, { id: '123', name: 'Francisco Villa', isActive: true }, { id: '77', name: 'Ácido Estudio', isActive: true }];
  assert.deepEqual(filterAdAccounts(accounts).map((account) => account.id), ['77', '123', '9']);
  assert.deepEqual(filterAdAccounts(accounts, 'acido').map((account) => account.id), ['77']);
  assert.deepEqual(filterAdAccounts(accounts, '12').map((account) => account.id), ['123']);
  assert.deepEqual(filterAdAccounts(null, 'x'), []);
});

test('a source of Meta is not called a screenshot and has no image to open', () => {
  assert.equal(isMetaSource({ origin: 'META_API' }), true);
  assert.equal(isMetaSource({ extractionData: { origin: 'META_API' } }), true);
  assert.equal(isMetaSource({ originalName: 'captura.png' }), false);
  assert.equal(describeReportSources({ processingSummary: { totalFiles: 2, metaSources: 3 } }), '3 fuentes de Meta · 2 capturas');
  assert.equal(describeReportSources({ processingSummary: { totalFiles: 0, metaSources: 1 } }), '1 fuente de Meta');
  // Reports from before this change keep reading as they did.
  assert.equal(describeReportSources({ processingSummary: { totalFiles: 5 } }), '5 capturas');
  assert.equal(describeReportSources({ sourceExtractions: [{}, { origin: 'META_API' }] }), '1 fuente de Meta · 1 captura');
  assert.equal(describeReportSources({}), '0 capturas');
  assert.match(workspace, /describeReportSources\(metrics\)/);
  assert.ok(workspace.includes('{!isMetaSource(findSource(item.sourceId)) && <button className={button} disabled={busy} onClick={() => onOriginal(item.sourceId)}>Ver captura original</button>}'));
  assert.match(workspace, /data-report-meta-source/);
  assert.match(workspace, /section\.entityLevel === 'CONTENT' \? 'Publicación'/);
});

test('why Meta did not give the figures is said in plain words, never a bare code', () => {
  assert.match(humanizeMetaReadError({ name: 'MetaGraphError', code: 190, message: 'Error validating access token' }), /venció/);
  assert.match(humanizeMetaReadError({ name: 'MetaGraphError', code: 10, message: 'x' }), /no tiene permiso/);
  assert.match(humanizeMetaReadError({ name: 'MetaGraphError', code: 80004, message: 'x' }), /límite temporal/);
  assert.match(humanizeMetaReadError({ code: 'ETIMEDOUT' }), /No se pudo llegar a Meta/);
  assert.equal(humanizeMetaReadError({ name: 'MetaGraphError', code: 100, message: 'Unsupported get request' }), 'Meta respondió: Unsupported get request');
  assert.equal(humanizeMetaReadError(new Error('clave de cifrado ausente')), 'No se pudieron traer las cifras: clave de cifrado ausente');
  assert.equal(humanizeMetaReadError(null), 'Meta no respondió.');
});
