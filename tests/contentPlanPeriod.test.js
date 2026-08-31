import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('content plan month labels depend only on the stored month number', async () => {
  const { getContentPlanMonthName } = await import('../src/lib/contentPlanPeriod.js');

  assert.equal(getContentPlanMonthName(9), 'septiembre');
  assert.equal(getContentPlanMonthName(10), 'octubre');
  assert.equal(getContentPlanMonthName('9'), 'septiembre');
  assert.equal(getContentPlanMonthName(0), '');
  assert.equal(getContentPlanMonthName(13), '');
});

test('content plan publication dates keep their stored calendar day', async () => {
  const { formatContentPlanDate } = await import('../src/lib/contentPlanPeriod.js');

  assert.equal(formatContentPlanDate('2026-09-01T00:00:00.000Z'), '01/09/2026');
  assert.equal(formatContentPlanDate(null), '');
});

test('all content plan views use the date-independent period formatter', async () => {
  const files = [
    'src/components/modules/ContentGrids.jsx',
    'src/components/modules/ContentPlanDetail.jsx',
    'src/components/public/SharedContentPlan.jsx'
  ];

  for (const file of files) {
    const source = await read(file);
    assert.match(source, /getContentPlanMonthName/);
    assert.doesNotMatch(source, /\.setMonth\(/);
  }

  const shared = await read('src/components/public/SharedContentPlan.jsx');
  assert.match(shared, /formatContentPlanDate\(item\.publishDate\)/);
});
