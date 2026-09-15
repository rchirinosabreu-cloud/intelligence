import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

test('active upload route uses the evidence handler and admits fourteen screenshots plus a separate logo', async () => {
  const code = await fs.readFile(new URL('../src/routes/api/reports.js', import.meta.url), 'utf8');
  assert.match(code, /router\.post\('\/extract-metrics', upload\.any\(\), createEvidenceExtractionHandler/);
  assert.match(code, /files: 15/);
  assert.match(code, /router\.patch\('\/:reportId\/observations', evidenceHandlers\.review\)/);
  assert.match(code, /router\.get\('\/:reportId\/pdf', evidenceHandlers\.pdf\)/);
});

test('active UI preserves upload categories and routes evidence reports to persistent review', async () => {
  const code = await fs.readFile(new URL('../src/components/modules/Reports.jsx', import.meta.url), 'utf8');
  assert.match(code, /formData\.append\('adsFiles', file\)/);
  assert.match(code, /formData\.append\('organicFiles', file\)/);
  assert.match(code, /<ReportEvidenceWorkspace/);
  assert.match(code, /schemaVersion === 2/);
});

test('report intake exposes accessible sources and persisted history in both themes', async () => {
  const code = await fs.readFile(new URL('../src/components/modules/Reports.jsx', import.meta.url), 'utf8');
  assert.match(code, /<ReportHistory/);
  assert.match(code, /aria-label="Cliente del reporte"/);
  assert.match(code, /aria-label="Capturas de Facebook e Instagram"/);
  assert.match(code, /aria-label="Capturas de pauta"/);
  const intake = code.slice(code.indexOf('{/* Control Panel */}'), code.indexOf('{/* Main Report Canvas */}'));
  assert.doesNotMatch(intake, /bg-red-|bg-rose-|Multimodal|v7\.0/);
  assert.match(intake, /dark:bg-slate-900/);
});
