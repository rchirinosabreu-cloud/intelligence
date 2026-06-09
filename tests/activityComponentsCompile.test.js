import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { transformWithEsbuild } from 'vite';

for (const file of [
  'src/components/modules/Activity/ActivityMap.jsx',
  'src/components/modules/Activity/OperationalCalendar.jsx',
  'src/components/modules/Activity/ActivityMapView.jsx',
  'src/components/modules/Activity/OperationalCalendarView.jsx',
  'src/components/modules/Activity/cards/MemberActivityCard.jsx',
  'src/components/modules/Activity/cards/EventActivityCard.jsx'
]) {
  test(`${file} compiles as JSX`, async () => {
    const source = await readFile(file, 'utf8');
    await transformWithEsbuild(source, file, { loader: 'jsx', jsx: 'automatic' });
  });
}

test('activity source has one card implementation and no AnimatePresence portal ownership', async () => {
  const activityMap = await readFile('src/components/modules/Activity/ActivityMapView.jsx', 'utf8');
  const operationalCalendar = await readFile('src/components/modules/Activity/OperationalCalendarView.jsx', 'utf8');

  assert.equal((activityMap.match(/const MemberActivityCard\s*=/g) || []).length, 0);
  assert.equal((operationalCalendar.match(/const EventActivityCard\s*=/g) || []).length, 0);
  assert.doesNotMatch(activityMap, /AnimatePresence/);
  assert.doesNotMatch(operationalCalendar, /AnimatePresence/);
});

test('legacy activity entrypoints are minimal re-export wrappers', async () => {
  const activityMap = (await readFile('src/components/modules/Activity/ActivityMap.jsx', 'utf8')).trim();
  const operationalCalendar = (await readFile('src/components/modules/Activity/OperationalCalendar.jsx', 'utf8')).trim();

  assert.equal(activityMap, "export { default } from './ActivityMapView';");
  assert.equal(operationalCalendar, "export { default } from './OperationalCalendarView';");
});
