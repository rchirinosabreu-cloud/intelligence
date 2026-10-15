import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
test('historical readings include contextual durations and recorded work hours', () => {
  assert.match(readFileSync('src/components/modules/TeamRhythmPanel.jsx', 'utf8'), /<WorkProfileExplorer/);
});
test('task creation and editing do not mount or request a delivery forecast; scenarios stay in Ritmo', () => {
  const source = readFileSync('src/components/modules/TaskSidePanel.jsx', 'utf8');
  assert.equal(/TaskAssignmentForecast|assignment-preview/.test(source), false);
  assert.match(readFileSync('src/components/modules/AssignmentScenario.jsx', 'utf8'), /<TaskAssignmentForecast/);
});
test('the forecast supports tomorrow and next week without exposing history periods as forecast periods', () => {
  const source = readFileSync('src/components/modules/TeamWeekOverview.jsx', 'utf8');
  assert.match(source, /Próxima semana/);
  assert.match(source, /Mañana/);
  assert.match(source, /window=\$\{/);
});
