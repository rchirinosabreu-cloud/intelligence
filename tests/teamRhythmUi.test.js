// La pestaña Ritmo de Manager (Rodny, 9 de octubre de 2026: «en la pestaña de Observer vas a dejar solamente el
// tema de que Bria revisa las fuentes … y el tema de los tiempos y esfuerzos lo vas a colocar en una nueva pestaña»).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const manager = readFileSync('src/components/modules/ManagerTaskAnalytics.jsx', 'utf8');
const panel = readFileSync('src/components/modules/TeamRhythmPanel.jsx', 'utf8');

test('Manager has an Observer tab with only the inbox and a Ritmo tab with the times', () => {
  assert.match(manager, /data-bria-tab="ritmo"/);
  assert.match(manager, /setActiveTab\('ritmo'\)/);
  assert.match(readFileSync('src/components/modules/BriaObserverInbox.jsx', 'utf8'), /Bria revisa las fuentes automáticamente y conserva evidencia de cada hallazgo/);
  assert.match(manager, /Señales que Bria detecta por su cuenta, cada una con su evidencia/);
  assert.match(manager, /activeTab === 'observer' \? <BriaObserverInbox \/> : <>\s*<TeamRhythmPanel/, 'Observer is only the inbox; the times live in Ritmo');
  assert.ok(manager.indexOf('<TeamRhythmPanel') < manager.indexOf('Esfuerzo registrado'), 'effort metrics moved under Ritmo');
  assert.match(manager, /<TeamRhythmPanel periodDays=\{periodDays\} refreshKey=\{refreshKey\} \/>/);
  assert.match(manager, /get\('tab'\)/, 'Bria links straight to the tab with /manager?tab=ritmo');
});

test('Ritmo says first how much is measured, then times by type of work, then findings with their tasks', () => {
  assert.match(panel, /\/api\/manager\/rhythm\?days=/);
  assert.match(panel, /Authorization/);
  const main = panel.slice(panel.indexOf('export default function TeamRhythmPanel'));
  assert.ok(main.indexOf('data-rhythm-coverage') < main.indexOf('<PersonCard'), 'the team coverage comes before anyone’s times');
  const card = panel.slice(panel.indexOf('function PersonCard'), panel.indexOf('export default function TeamRhythmPanel'));
  assert.ok(card.indexOf('<CoverageBar') < card.indexOf('data-rhythm-types'), 'each person: coverage, then times');
  assert.ok(card.indexOf('data-rhythm-types') < card.indexOf('data-rhythm-findings'), 'then findings');
  assert.match(panel, /tasks\[id\]/, 'each finding names its tasks');
  assert.match(panel, /mezcla trabajos distintos/, 'catch-all categories are marked, not compared');
  assert.match(panel, /<TeamAvatar/);
});

test('it reads in light and dark mode and uses only the brand palette', () => {
  assert.match(panel, /dark:bg-zinc-950/);
  assert.match(panel, /dark:text-zinc-50|dark:text-white/);
  assert.doesNotMatch(panel, /\b(?:bg|text|border)-(?:red|rose|purple|violet|indigo|fuchsia|sky|teal|emerald|amber|orange)-/);
  assert.doesNotMatch(panel, /#[0-9a-fA-F]{6}/, 'colors come from the tokens');
  assert.match(panel, /console\.error\('\[TeamRhythmPanel\]/);
});
