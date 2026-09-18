import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

// Decisions of Rodny, 18 September 2026: official palette beyond cyan, gradients allowed on accents,
// a subtle glass surface for dashboard panels, and the profile photo always visible in the sidebar.

test('the glass surface and the brand ambient are shared utilities that work in both themes', async () => {
  const css = await read('src/index.css');

  assert.match(css, /\.brain-glass\s*\{/, 'one shared glass surface');
  assert.match(css, /\.brain-glass[\s\S]*?backdrop-blur/, 'glass blurs what sits behind it');
  assert.match(css, /\.dark \.brain-glass|dark:bg-zinc-900/, 'glass has an explicit dark variant');
  assert.match(css, /\.brain-ambient\s*\{/, 'a soft brand ambient gives the glass something to blur');
  assert.match(css, /\.brain-ambient[\s\S]*?--brand-cyan/, 'the ambient is painted with brand tokens, never local hex');
  assert.doesNotMatch(css.slice(css.indexOf('.brain-ambient')), /blur\((?:12|14)0px\)/, 'no giant blurs (visual quality boundary)');
});

test('the rules record the palette, the gradients and the glass surface as approved styles', async () => {
  const agents = await read('AGENTS.md');

  assert.match(agents, /Paleta oficial de Brainstudio/);
  assert.match(agents, /#009BBF[\s\S]*#31AA8A[\s\S]*#A8118C[\s\S]*#FF6A68[\s\S]*#FCD200/, 'the five brand colors');
  assert.match(agents, /brain-gradient-primary/, 'gradients are documented by name');
  assert.match(agents, /brain-glass/, 'the glass surface is an approved shared style, not a local skin');
  assert.doesNotMatch(agents, /acentos en tonos morados\/violetas corporativos/, 'the obsolete violet rule is gone');
});

test('the sidebar shows the person with a large photo, name, role and the account menu', async () => {
  const [sidebar, profile] = await Promise.all([
    read('src/components/layout/Sidebar.jsx'),
    read('src/components/layout/SidebarProfile.jsx')
  ]);

  assert.match(sidebar, /<SidebarProfile/, 'the profile block is mounted in the sidebar');
  assert.ok(sidebar.indexOf('<SidebarProfile') < sidebar.indexOf('<nav'), 'the photo sits above the navigation, always visible');
  assert.match(profile, /TeamAvatar/, 'the shared avatar renders the real photo with boring-avatars fallback');
  assert.match(profile, /size=\{(?:64|72|80|96)\}/, 'the photo is large');
  assert.match(profile, /\bring\b/, 'the photo carries the per-person brand ring');
  assert.match(profile, /avatarUrl/, 'the photo comes from the user profile');
  assert.match(profile, /DropdownMenu/, 'perfil, ajustes and cerrar sesión live in the shared dropdown');
  assert.match(profile, /\/perfil/);
  assert.match(profile, /brain-destructive-text/, 'logout keeps the destructive text treatment');
  assert.doesNotMatch(profile, /(bg|text|border)-(violet|indigo|purple)-\d/);
  assert.doesNotMatch(profile, /brain-glass/, 'no box behind the photo (Rodny, 18 September 2026)');
  assert.match(profile, /teamRole/, 'the visible role is the team role (Director, Community Manager…), not the account role');
  assert.doesNotMatch(profile, /uppercase/, 'the role reads small and quiet, in one line');
  assert.match(profile, /ChevronDown/, 'the arrow signals more options');
  assert.match(await read('src/services/userService.js'), /teamRole/, 'the profile endpoint ships the team role');
});

test('dashboard cards use full soft borders, white numbers and a single row of tiles', async () => {
  const [dashboard, upcoming, meetings, crm] = await Promise.all([
    read('src/components/modules/Dashboard.jsx'),
    read('src/components/modules/dashboard/DashboardUpcomingTasks.jsx'),
    read('src/components/modules/dashboard/DashboardMeetings.jsx'),
    read('src/components/modules/dashboard/DashboardReminders.jsx')
  ]);

  for (const [name, source] of [['upcoming', upcoming], ['meetings', meetings], ['reminders', crm], ['dashboard', dashboard]]) {
    assert.doesNotMatch(source, /border-l-\[|border-l-4|border-l-2/, `${name}: no left-only bands`);
  }
  assert.match(upcoming, /border border-zinc-200\/80/, 'upcoming rows carry a full soft grey border');
  assert.match(meetings, /border border-zinc-200\/80/, 'meeting rows carry a full soft grey border');
  assert.doesNotMatch(dashboard, /rounded-full bg-white\/15/, 'no decorative circle on the tiles');
  assert.match(dashboard, /text-3xl font-semibold leading-none text-white/, 'the number is white on every tile');
  assert.doesNotMatch(dashboard, /text-zinc-900'?\s*\}/, 'no dark number on a tile');
  assert.match(dashboard, /snap-x[^"]*overflow-x-auto/, 'tiles stay in one row and scroll sideways on narrow screens');
  assert.doesNotMatch(dashboard, /grid-cols-2 gap-3 sm:grid-cols-3/, 'tiles never wrap into several rows');
});

test('every modal opens centred: the historical slide-over no longer slides in from the right', async () => {
  const slideOver = await read('src/components/ui/SlideOver.jsx');
  assert.doesNotMatch(slideOver, /slide-in-from-right|right-0 top-0 h-full/, 'no side panel anymore (Rodny, 18 September 2026)');
  assert.match(slideOver, /left-1\/2 top-1\/2[^"]*-translate-x-1\/2 -translate-y-1\/2/, 'centred on screen');
  assert.match(slideOver, /w-\[calc\(100vw-2rem\)\]/, 'fits phones with the 16px gutter');
  assert.match(slideOver, /aria-label="Cerrar"/);
  assert.doesNotMatch(await read('src/components/modules/Dashboard.jsx'), /brain-gradient-spectrum|brain-gradient-sunrise/, 'the yellow gradients left the tiles');
});

test('the shared dialog always sits above the header and the sidebar', async () => {
  const dialog = await read('src/components/ui/dialog.jsx');
  const overlay = dialog.match(/fixed inset-0 z-\[(\d+)\]/);
  const content = dialog.match(/top-\[50%\] z-\[(\d+)\]/);
  assert.ok(overlay && Number(overlay[1]) > 60, 'overlay above the sidebar (z-[60]) and the header (z-50)');
  assert.ok(content && Number(content[1]) > Number(overlay[1]), 'content above its overlay');
});

test('the streak meter in the sidebar speaks the brand palette', async () => {
  const meter = await read('src/components/layout/ChaosMeter.jsx');

  assert.doesNotMatch(meter, /(from|to|bg|text|border|fill)-(orange|red|violet|amber)-\d/, 'no legacy hues');
  assert.match(meter, /brand-coral|brand-yellow|brain-gradient-sunrise/, 'the flame uses the warm brand tones');
  assert.match(meter, /destructive/, 'returned tasks use the global destructive token');
  assert.match(meter, /Authorization|getAuthHeaders/, 'the streak request carries the session token');
});

test('the dashboard header dropped its duplicated account menu but kept notifications and theme', async () => {
  const layout = await read('src/components/layout/AppLayout.jsx');

  assert.doesNotMatch(layout, /Mi Cuenta/);
  assert.match(layout, /aria-label="Abrir notificaciones"/);
  assert.match(layout, /aria-label="Cambiar tema"/);
});
