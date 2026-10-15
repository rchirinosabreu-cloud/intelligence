import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
test('historical readings include contextual durations and recorded work hours', () => {
  assert.match(readFileSync('src/components/modules/TeamRhythmPanel.jsx', 'utf8'), /<WorkProfileExplorer/);
});
test('the single task creator offers an advisory forecast without replacing its submit flow', () => {
  const source = readFileSync('src/components/modules/TaskSidePanel.jsx', 'utf8');
  assert.match(source, /<TaskAssignmentForecast/);
  assert.match(source, /hasModuleAccess\(currentUser, 'manager'\)/);
});
test('the forecast supports tomorrow and next week without exposing history periods as forecast periods', () => {
  const source = readFileSync('src/components/modules/TeamWeekOverview.jsx', 'utf8');
  assert.match(source, /Próxima semana/);
  assert.match(source, /Mañana/);
  assert.match(source, /window=\$\{/);
});
