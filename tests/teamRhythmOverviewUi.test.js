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

// Rodny, 10 de noviembre de 2026: la semana se lee en gráficos con lo seguro (horas, entregas, vencidas, cronómetro).
test('the weekly entry is the charts view, built only from registered data', () => {
  const source = readFileSync('src/components/modules/TeamRhythmPanel.jsx', 'utf8');
  assert.match(source, /view === 'week'/);
  assert.match(source, /<TeamWeekCharts/);
});
