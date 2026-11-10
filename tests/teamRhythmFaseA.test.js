// Ritmo en pantalla. Rodny, 10 de noviembre de 2026: la semana pasó a gráficos con lo que es seguro y las decisiones
// de Bria viven en Manager → Decisiones; la tarjeta de la lectura semanal, el mapa de carga y los escenarios se
// retiraron de la pantalla, y la lectura de los lunes ya no se escribe sola ni avisa a una tarjeta que no existe.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const panel = readFileSync('src/components/modules/TeamRhythmPanel.jsx', 'utf8');
const routes = readFileSync('src/routes/index.js', 'utf8');
const server = readFileSync('server.js', 'utf8');

test('Ritmo opens with the week as charts of registered data', () => {
  const charts = readFileSync('src/components/modules/TeamWeekCharts.jsx', 'utf8');
  assert.match(panel, /view === 'week'.*<TeamWeekCharts/);
  assert.match(charts, /buildWeekCharts/);
  assert.match(charts, /\/api\/manager\/rhythm\/load\?window=week/);
  assert.match(charts, /data-week-chart=\{testId\}/);
});

test('the charts read in light and dark mode with the brand palette only', () => {
  const charts = readFileSync('src/components/modules/TeamWeekCharts.jsx', 'utf8');
  assert.match(charts, /dark:/);
  assert.doesNotMatch(charts, /\b(?:bg|text|border)-(?:red|rose|purple|violet|indigo|fuchsia|sky|teal|emerald|amber|orange)-/);
  assert.doesNotMatch(charts, /#[0-9a-fA-F]{6}/);
  assert.doesNotMatch(charts, /vosotros|tenéis|podéis/);
});

test('the rhythm routes stay behind the Manager gate; the Monday reading is no longer scheduled', () => {
  for (const route of ["'/manager/rhythm/load'", "'/manager/rhythm/reading'"]) {
    assert.match(routes, new RegExp(`router\\.(get|post)\\(${route}, requireModulePermission\\('manager'\\), requireManagerRole`));
  }
  assert.doesNotMatch(server, /initWeeklyReadingScheduler\(\);/);
});
