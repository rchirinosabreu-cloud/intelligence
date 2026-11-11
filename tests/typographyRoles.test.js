// Papeles de texto de la plataforma (Rodny, 10 de noviembre de 2026: «en otras partes del mismo módulo todo se ve
// gigante, todo es negrilla … ¿cómo hacemos para que la plataforma tenga esa consistencia?»). Una pantalla elige un
// papel (sección, etiqueta, cifra, texto, ayuda), no un tamaño ni un grosor; el desorden que queda solo puede bajar.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { BASELINE_PATH, HANDMADE_TYPE, countHandmadeType } from '../scripts/typography-baseline.mjs';

const css = readFileSync('src/index.css', 'utf8');
const baseline = JSON.parse(readFileSync(BASELINE_PATH, 'utf8'));

test('the roles are defined once, and only section and figure carry weight', () => {
  const role = (name) => css.match(new RegExp(`\\.brain-type-${name} \\{\\s*@apply ([^;]+);`))?.[1] || '';
  assert.match(role('section'), /text-sm font-semibold/);
  assert.match(role('value'), /text-sm font-semibold tabular-nums/);
  for (const quiet of ['label', 'body', 'help']) {
    assert.match(role(quiet), /font-normal/, `${quiet} never goes bold`);
    assert.match(role(quiet), /dark:text-/, `${quiet} reads in dark mode`);
  }
  assert.match(role('label'), /text-xs/);
  assert.match(css, /\.brain-button-quiet \{\s*@apply [^;]*min-h-11[^;]*font-medium/);
});

test('no screen adds hand-made type: each file may only keep or lower its count, new files start at zero', () => {
  const current = countHandmadeType();
  const grew = Object.entries(current).filter(([file, count]) => count > (baseline[file] || 0))
    .map(([file, count]) => `${file}: ${baseline[file] || 0} → ${count}`);
  assert.deepEqual(grew, [], 'Usa los papeles brain-type-* en lugar de font-black o tamaños en píxeles');
});

test('Nómina speaks with the roles: figures, sections and quiet buttons, no heavy or pixel sizes left', () => {
  const periods = readFileSync('src/components/modules/financial/PayrollPeriods.jsx', 'utf8');
  const figures = readFileSync('src/components/ui/FigureList.jsx', 'utf8');
  const dashboard = readFileSync('src/components/modules/FinancialDashboard.jsx', 'utf8');
  const payroll = dashboard.slice(dashboard.indexOf("{activeTab === 'payroll' && ("), dashboard.indexOf("{activeTab === 'parties' && ("));
  assert.match(figures, /brain-type-label/);
  assert.match(figures, /brain-type-value/);
  assert.match(periods, /const Figures = FigureList/);
  assert.match(periods, /brain-type-section/);
  assert.doesNotMatch(periods, /<h3 className="(?:text-sm )?font-semibold"/);
  for (const source of [periods, payroll]) assert.equal((source.match(HANDMADE_TYPE) || []).length, 0);
  assert.doesNotMatch(payroll, /\b(?:bg|text)-(?:amber|blue|emerald)-/, 'payroll states use the brand palette');
});
