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
