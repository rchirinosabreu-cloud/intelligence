import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('Ritmo offers a weekly entry and requests historical analytics only when history is opened', () => {
  const source = readFileSync('src/components/modules/ManagerTaskAnalytics.jsx', 'utf8');
  assert.match(source, /Esta semana/);
  assert.match(source, /Historial/);
  assert.match(source, /activeTab === 'ritmo' && rhythmView === 'history'/);
  assert.match(source, /rhythmView === 'history' && overview/);
});

test('the weekly entry uses the server forecast, with uncertainty visible and details on request', () => {
  const source = readFileSync('src/components/modules/TeamRhythmPanel.jsx', 'utf8');
  assert.match(source, /view === 'week'/);
  assert.match(source, /<TeamWeekOverview/);
});
