import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('the legacy backend filter symbol has a local compatibility definition', () => {
  const source = readFileSync(new URL('../src/services/reportVisionService.js', import.meta.url), 'utf8');
  assert.match(source, /export const filterTopContentRows = filterExtractedTopContentRows;/);
});

test('the reports route owns its pipeline fingerprint without a cross-module binding', () => {
  const routeSource = readFileSync(new URL('../src/routes/api/reports.js', import.meta.url), 'utf8');
  assert.match(routeSource, /const REPORT_PIPELINE_VERSION = ['"]vision-/);
  assert.doesNotMatch(routeSource, /REPORT_PIPELINE_VERSION\s*\n?\s*}\s*from ['"].*reportVisionService/);
  const routeStart = routeSource.indexOf("router.post('/extract-metrics'");
  const routeBody = routeSource.slice(routeStart, routeSource.indexOf("router.patch('/:reportId/metrics'"));
  assert.ok(routeBody.indexOf('try {') < routeBody.indexOf('Pipeline ${REPORT_PIPELINE_VERSION}'), 'pipeline logging must be inside the route try block');
  assert.match(routeSource, /globalThis\.filterTopContentRows\s*=\s*\(rows = \[\]\) =>/);
  assert.ok(routeSource.indexOf('globalThis.filterTopContentRows') < routeStart, 'legacy global must be installed before extraction requests');
  assert.match(routeSource, /RAILWAY_GIT_COMMIT_SHA/);
  assert.match(routeSource, /router\.get\('\/pipeline-status'/);
  assert.match(routeSource, /res\.setHeader\('X-Report-Pipeline-Version'/);
});
