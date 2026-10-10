// Fase A de Ritmo en pantalla (Rodny, 10 de octubre de 2026): la lectura de la semana arriba, el mapa de carga
// debajo y después la lectura por persona. Las acciones de una decisión abren Gestión o dejan el mensaje listo
// en Bria; ninguna manda nada sola. Todo lee en claro y oscuro con la paleta oficial.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const panel = readFileSync('src/components/modules/TeamRhythmPanel.jsx', 'utf8');
const reading = readFileSync('src/components/modules/WeeklyReadingCard.jsx', 'utf8');
const loadMap = readFileSync('src/components/modules/TeamLoadMap.jsx', 'utf8');
const routes = readFileSync('src/routes/index.js', 'utf8');
const server = readFileSync('server.js', 'utf8');

test('Ritmo shows the weekly reading first, then the load map, then coverage and people', () => {
  const main = panel.slice(panel.indexOf('export default function TeamRhythmPanel'));
  assert.ok(main.indexOf('<WeeklyReadingCard') < main.indexOf('<TeamLoadMap'));
  assert.ok(main.indexOf('<TeamLoadMap') < main.indexOf('data-rhythm-coverage'));
});

test('the reading is a Bria surface: gradient header with the mascot, decisions with evidence, server-first toasts', () => {
  assert.match(reading, /brain-ai-header/);
  assert.match(reading, /brainstudio-mascot-tip\.png/);
  assert.match(reading, /\/api\/manager\/rhythm\/reading/);
  assert.match(reading, /method: 'POST'/);
  assert.match(reading, /data-weekly-reading-decisions/);
  assert.match(reading, /decision\.evidence/);
  assert.ok(reading.indexOf('toast.success') > reading.indexOf('if (!response.ok) throw'), 'success is said only after the server answered');
  assert.match(reading, /Se escribe sola los lunes a las 7 de la mañana/);
});

test('a decision opens the task in Gestión or leaves the message ready in Bria, never sends it', () => {
  assert.match(reading, /to=\{`\/gestion\?taskId=\$\{encodeURIComponent\(action\.taskId\)\}`\}/);
  assert.match(reading, /askBria\(action\.suggestedMessage\)/);
  assert.doesNotMatch(reading, /fetch\([^)]*bria/i, 'the reading never talks to Bria’s chat by itself');
  assert.match(reading, /action\.kind === 'NINGUNA'\) return null/);
});

test('the load map says they are estimates, one cell per working day, tasks behind each cell, overdue apart', () => {
  assert.match(loadMap, /\/api\/manager\/rhythm\/load/);
  assert.match(loadMap, /Son estimaciones para repartir mejor, no un registro/);
  assert.match(loadMap, /data-load-cell=\{cell\.level\}/);
  assert.match(loadMap, /data-load-detail/);
  assert.match(loadMap, /data-load-overdue/);
  assert.match(loadMap, /data-load-signals/);
  assert.match(loadMap, /aria-label=\{`\$\{person\.personName\}/, 'each cell reads aloud');
  assert.match(loadMap, /<TeamAvatar/);
  assert.match(loadMap, /sin historial, supuesto/);
});

test('both read in light and dark mode with the brand palette only', () => {
  for (const source of [reading, loadMap]) {
    assert.match(source, /dark:bg-zinc-950/);
    assert.doesNotMatch(source, /\b(?:bg|text|border)-(?:red|rose|purple|violet|indigo|fuchsia|sky|teal|emerald|amber|orange)-/);
    assert.doesNotMatch(source, /#[0-9a-fA-F]{6}/);
    assert.doesNotMatch(source, /vosotros|tenéis|podéis/);
  }
});

test('the three routes sit behind the Manager gate and the Monday reading is scheduled at start-up', () => {
  for (const route of ["'/manager/rhythm/load'", "'/manager/rhythm/reading'"]) {
    assert.match(routes, new RegExp(`router\\.(get|post)\\(${route}, requireModulePermission\\('manager'\\), requireManagerRole`));
  }
  assert.equal((routes.match(/'\/manager\/rhythm\/reading'/g) || []).length, 2, 'GET and POST');
  assert.match(server, /initWeeklyReadingScheduler\(\);/);
});
