import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const read = path => readFileSync(path, 'utf8');
const panel = read('src/components/league/RaceOfTheMonth.jsx');
const dock = read('src/components/league/LeagueDock.jsx');
const avatar = read('src/components/league/RunnerAvatar.jsx');

test('recognition remains an opt-in side panel, outside the dashboard', () => {
  const layout = read('src/components/layout/AppLayout.jsx');
  assert.match(layout, /canUseLeague\(currentUser\)/);
  assert.match(layout, /enabled=\{!isOnboardingBlocking\}/);
  assert.doesNotMatch(read('src/components/modules/Dashboard.jsx'), /DashboardLeague|RaceOfTheMonth|dashboard\.league/);
  assert.match(dock, /has\('carrera'\)/);
  assert.match(dock, /error\?\.status === 404/);
  assert.match(panel, /modal=\{false\}/);
});

test('the collection and team replace the track without changing score calculations in the screen', () => {
  for (const label of ['Mi mes', 'Logros', 'Equipo']) assert.ok(panel.includes(label));
  assert.doesNotMatch(panel, /data-race-track|trackPosition|leagueScore\(/);
  assert.match(panel, /requestLeague\('\/recognitions'\)/);
  assert.match(panel, /data-race-panel-score/);
  assert.match(read('src/components/league/KudosGift.jsx'), /requestLeague\('\/kudos'/);
});

test('production bundles the avatars, supports fallback and honors reduced motion', () => {
  assert.match(avatar, /pixelAvatarKey/);
  assert.match(avatar, /onError/);
  assert.match(avatar, /TeamAvatar/);
  const assets = read('src/components/league/pixelAvatars.js');
  assert.equal((assets.match(/import .* from '@\/assets\/team-pixel/g) || []).length, 13);
  assert.doesNotMatch(assets, /tests\/fixtures/);
  assert.match(read('src/index.css'), /prefers-reduced-motion: reduce[\s\S]*\.league-pixel \{\s*animation: none/);
});

test('the UI uses brand tokens and supports both themes', () => {
  for (const source of [panel, dock, read('src/components/league/RecognitionCollection.jsx')]) {
    assert.doesNotMatch(source, /#[0-9a-fA-F]{6}/);
    assert.doesNotMatch(source, /\b(?:bg|text|border)-(?:purple|violet|indigo|fuchsia|sky|teal|emerald)-/);
    assert.match(source, /dark:bg-|brain-popover-surface/);
    assert.match(source, /dark:text-/);
  }
});

test('the existing Bria notice retains server score and position without invented levels', () => {
  const nudge = read('src/components/bria/BriaNudge.jsx');
  assert.match(nudge, /data-bria-nudge-progress/);
  assert.match(nudge, /data-bria-nudge-delta/);
  assert.doesNotMatch(nudge, /MINI_RING|progress\.level|strokeDasharray/);
});
