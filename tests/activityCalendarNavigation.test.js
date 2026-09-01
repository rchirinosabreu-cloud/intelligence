import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('closed reconciliation content never reads events from a null preview', async () => {
  const calendar = await read('src/components/modules/Activity/OperationalCalendar.jsx');

  assert.doesNotMatch(calendar, /reconciliationPreview\.events\.map/);
  assert.match(calendar, /\(reconciliationPreview\?\.events \|\| \[\]\)\.map/);
});

test('the closed delete dialog never reads a title from a null candidate', async () => {
  const calendar = await read('src/components/modules/Activity/OperationalCalendar.jsx');

  assert.doesNotMatch(calendar, /\{deleteCandidate\.title \|\| 'este evento'\}/);
  assert.match(calendar, /\{deleteCandidate\?\.title \|\| 'este evento'\}/);
});

test('the selected activity view survives a reload through the URL', async () => {
  const activity = await read('src/components/modules/Activity/index.jsx');

  assert.match(activity, /useSearchParams/);
  assert.match(activity, /searchParams\.get\('vista'\) === 'calendario'/);
  assert.match(activity, /<Tabs value=\{activeView\} onValueChange=\{handleViewChange\}/);
  assert.match(activity, /nextParams\.set\('vista', 'calendario'\)/);
  assert.match(activity, /nextParams\.delete\('vista'\)/);
});
