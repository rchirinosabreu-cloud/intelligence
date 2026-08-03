import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('the obsolete filterTopContentRows identifier is absent from production source', () => {
  const files = [
    'src/services/reportVisionService.js',
    'src/routes/api/reports.js',
    'src/lib/reportPresentation.js',
    'src/components/modules/Reports.jsx'
  ];
  for (const file of files) {
    const source = readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
    assert.equal(source.includes('filterTopContentRows'), false, `${file} still contains the obsolete identifier`);
  }
});

test('the reports route owns its pipeline fingerprint without a cross-module binding', () => {
  const routeSource = readFileSync(new URL('../src/routes/api/reports.js', import.meta.url), 'utf8');
  assert.match(routeSource, /const REPORT_PIPELINE_VERSION = ['"]vision-/);
  assert.doesNotMatch(routeSource, /REPORT_PIPELINE_VERSION\s*\n?\s*}\s*from ['"].*reportVisionService/);
  const routeStart = routeSource.indexOf("router.post('/extract-metrics'");
  const routeBody = routeSource.slice(routeStart, routeSource.indexOf("router.patch('/:reportId/metrics'"));
  assert.ok(routeBody.indexOf('try {') < routeBody.indexOf('Pipeline ${REPORT_PIPELINE_VERSION}'), 'pipeline logging must be inside the route try block');
});
