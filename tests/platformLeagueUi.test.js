// La liga en pantalla (27 de octubre, 2 y 3 de noviembre de 2026): la copa asomada al borde derecho en toda la
// plataforma, el panel «La carrera del mes» acoplado a la derecha (sin niveles ni barras, pista compacta sin
// nombres, personajes siempre en movimiento) y el aviso de las 3 encima de Bria. Nada en el dashboard. Contratos
// de código fuente: paleta oficial, claro y oscuro, español de Latinoamérica, sin juicios, sin reloj en los componentes.
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

const dock = readFileSync('src/components/league/LeagueDock.jsx', 'utf8');
const race = readFileSync('src/components/league/RaceOfTheMonth.jsx', 'utf8');
const runner = readFileSync('src/components/league/RunnerAvatar.jsx', 'utf8');
const layout = readFileSync('src/components/layout/AppLayout.jsx', 'utf8');
const dashboard = readFileSync('src/components/modules/Dashboard.jsx', 'utf8');
const nudge = readFileSync('src/components/bria/BriaNudge.jsx', 'utf8');
const css = readFileSync('src/index.css', 'utf8');

test('nothing in the dashboard: the league is the trophy peeking from the right edge of every screen (mounted in the layout)', () => {
  assert.ok(!existsSync('src/components/modules/dashboard/DashboardLeague.jsx'), 'the dashboard card is gone');
  assert.doesNotMatch(dashboard, /DashboardLeague|RaceOfTheMonth|dashboard\.league/, 'the dashboard neither draws nor reads the league');
  assert.match(layout, /import LeagueDock from '@\/components\/league\/LeagueDock'/);
  assert.match(layout, /<LeagueDock key=\{`league-\$\{currentUser\.id\}`\} enabled=\{!isOnboardingBlocking\} \/>/);
  assert.match(dock, /data-league-dock/);
  assert.match(dock, /fixed right-0 top-1\/2 z-\[45\]/, 'pinned to the right edge, mid-height, under the header and the sidebar');
  assert.match(dock, /rounded-l-2xl border-r-0/, 'a tab that grows out of the edge');
  assert.match(css, /\.league-dock \{\s*transform: translate\(45%, -50%\)/, 'peeks out halfway');
  assert.match(css, /\.league-dock:hover \{\s*transform: translate\(0, -50%\)/, 'comes out on hover');
  assert.match(dock, /<Trophy className="h-5 w-5" \/>/, 'only the trophy, no number');
  assert.match(dock, /has\('carrera'\)/, 'the Bria notices open it with ?carrera');
  assert.match(dock, /error\?\.status === 404\) return null/, 'no team card, no trophy');
  assert.match(dock, /requestLeague\(''\)/, 'it reads /api/league itself');
  assert.match(dock, /<RaceOfTheMonth open=\{open\} onOpenChange=\{setOpen\} league=\{league \|\| null\} \/>/);
});

test('the race is a side panel docked on the right like Bria’s, without levels or progress bars: points, position and the track', () => {
  assert.match(race, /DialogPrimitive\.Root open=\{open\} onOpenChange=\{onOpenChange\} modal=\{false\}/, 'not modal: nothing behind is blocked');
  assert.match(race, /onInteractOutside=\{\(event\) => event\.preventDefault\(\)\}/, 'it stays open while the person works');
  assert.match(race, /fixed bottom-3 right-3 top-20 z-\[70\] flex w-\[min\(400px,calc\(100vw-24px\)\)\]/, 'docked on the right, above the sidebar, never full screen');
  assert.match(race, /data-league-panel/);
  assert.match(race, /data-race-hero/);
  assert.match(race, /brain-gradient-primary/, 'the hero card wears the brand gradient');
  assert.match(race, /data-race-panel-score/);
  assert.match(race, /data-race-position/);
  assert.match(race, /data-race-today-points/);
  assert.doesNotMatch(race, /levelFor|nextLevel|LEAGUE_LEVELS|Leyenda|\bPro\b|data-race-panel-level/, 'no levels (Rodny took them out)');
  assert.doesNotMatch(race, /\/ 100|de 100/, 'points add up, there is no ceiling of 100');
  assert.doesNotMatch(race, /transition-\[width\]|h-2 w-full overflow-hidden rounded-full/, 'no progress bar');
  assert.match(race, /marker="hoy"/, 'the stat tiles: today, the streak and what the team gave');
  assert.match(race, /data-race-podium/);
  assert.match(race, /data-race-kudos-open/);
  assert.match(race, /Regalar mis \{KUDOS_WEEKLY\} puntos/);
  assert.match(race, /requestLeague\('\/kudos', \{ method: 'POST'/, 'the gift goes to the server; the screen says what it answered');
  assert.match(race, /toast\.success\(/);
  assert.match(race, /motion-reduce:transition-none/);
  assert.match(race, /El resultado se valida al cierre del mes/);
  assert.match(race, /data-race-winner/);
});

test('the track is compact and nameless: a short lane per person, the runner at its score on the server’s scale, the name only on hover or focus', () => {
  assert.match(race, /const LANE_HEIGHT = 28/, 'short lanes');
  assert.match(race, /const RUNNER_SIZE = 26/);
  assert.match(race, /data-race-track/);
  assert.match(race, /data-race-lane=\{lane\.id\}/, 'one lane per person');
  assert.match(race, /data-race-lane-self/);
  assert.match(race, /data-race-runner=\{lane\.id\}/);
  assert.match(race, /style=\{\{ left: `\$\{position\}%` \}\}/);
  assert.match(race, /const position = trackPosition\(lane\.score, track\.max\)/, 'the position is the score over the scale the server sends, never copied from an illustration');
  assert.match(race, /league\?\.race\?\.track \|\| \{ max: 100, marks: \[0, 25, 50, 75, 100\] \}/);
  assert.match(race, /data-race-lane-tip/);
  assert.match(race, /opacity-0 shadow-sm transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100/, 'the name appears on hover and on keyboard focus');
  assert.match(race, /aria-label=\{`\$\{lane\.name\}: \$\{points\(lane\.score\)\}`\}/, 'a screen reader hears the name');
  assert.doesNotMatch(race, /w-16 shrink-0 items-center truncate px-2/, 'no name column');
  assert.doesNotMatch(race, /data-race-selected|Solo se ve su puntaje/, 'no selection state: hovering is enough');
  assert.match(race, /Los extras del día valen \{EXTRA_POINTS\}/, 'the rules name the extras');
  assert.match(race, /data-race-today-extra/, 'today shows the two extras beside the five habits');
});

test('the pixel character is always moving, like a sprite at rest, and the photo is the fallback', () => {
  assert.match(runner, /person\?\.pixelAvatarUrl/, 'the pixel design, never the photo stretched as a sprite');
  assert.match(runner, /data-runner-avatar/);
  assert.match(runner, /<TeamAvatar member=\{person\}/, 'without a pixel avatar, the photo of always');
  assert.match(runner, /draggable=\{false\}/);
  assert.match(runner, /league-pixel/, 'the idle animation class');
  assert.match(runner, /animationDelay/, 'runners do not bob in unison');
  assert.match(css, /@keyframes league-pixel-idle/);
  assert.match(css, /animation: league-pixel-idle 0\.9s steps\(1, end\) infinite/, 'two frames, stepped: pixel motion, not a tween');
  assert.match(css, /image-rendering: pixelated/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\) \{[\s\S]*\.league-pixel \{\s*animation: none/, 'still when the person asked for less motion');
  assert.match(race, /import RunnerAvatar from '\.\/RunnerAvatar'/);
});

test('the dock, the race and the nudge never judge, never invent a clock and keep the palette and both themes', () => {
  for (const source of [dock, race]) {
    assert.doesNotMatch(source, /lento|flojo|mal uso|mejor que|peor/i);
    assert.doesNotMatch(source, /new Date\(\)/, 'the month, the days left and the ranking come from the server');
    assert.doesNotMatch(source, /#[0-9a-fA-F]{6}/);
    assert.doesNotMatch(source, /\b(?:bg|text|border|stroke|fill)-(?:red|rose|purple|violet|indigo|fuchsia|sky|teal|emerald|amber|orange)-/);
    assert.doesNotMatch(source, /vosotros|tenéis|podéis|\bos\b/);
    assert.match(source, /dark:text-/);
    assert.match(source, /dark:bg-/);
  }
  assert.match(race, /bg-brand-magenta/, 'the kindness wears the brand magenta');
  assert.match(dock, /text-brand-yellow-deep/, 'the trophy in the brand yellow');
  const routes = readFileSync('src/routes/index.js', 'utf8');
  assert.match(routes, /router\.use\('\/league', createPlatformLeagueRouter\(\)\);/, 'the league and the weekly gift hang under /api/league');
  const api = readFileSync('src/routes/api/platformLeague.js', 'utf8');
  assert.match(api, /router\.post\('\/kudos'/);
  assert.match(api, /if \(!req\.user\?\.userId\) return res\.status\(401\)/);
  const personal = readFileSync('src/services/personalDashboardService.js', 'utf8');
  assert.doesNotMatch(personal, /league|League/, 'the dashboard payload no longer carries the league');
});

test('the three o’clock nudge is the same Bria card with a small block: points, what moved today and the position; no ring, no level', () => {
  assert.match(nudge, /nudge\.progress/);
  assert.match(nudge, /data-bria-nudge-progress/);
  assert.match(nudge, /data-bria-nudge-delta/);
  assert.match(nudge, /progress\.position/);
  assert.doesNotMatch(nudge, /MINI_RING|progress\.level|strokeDasharray/, 'no ring, no level');
  assert.doesNotMatch(nudge, /new Date\(\)/);
});
