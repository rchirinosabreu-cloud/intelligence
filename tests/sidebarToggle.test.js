import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

// Rodny, 18 de septiembre de 2026: la barra lateral se puede recoger en escritorio y la elección se recuerda.
// Rodny, 21 de septiembre de 2026: al recogerla **no desaparece**; queda una franja con los iconos y la foto.

test('the shell collapses the sidebar to a rail on desktop and remembers it', async () => {
  const shell = await read('src/components/layout/AppLayout.jsx');
  assert.match(shell, /brain:sidebar-collapsed/, 'the preference lives in localStorage under a namespaced key');
  assert.match(shell, /aria-label=\{isSidebarCollapsed \? 'Expandir menú' : 'Recoger menú'\}/, 'one desktop toggle with an accessible name for each state');
  assert.match(shell, /aria-label="Abrir menú"/, 'the mobile opener stays');
  assert.match(shell, /isSidebarCollapsed \? 'lg:pl-20' : 'lg:pl-64'/, 'the header follows the rail, it does not reach the edge');
  assert.match(shell, /isSidebarCollapsed \? 'lg:ml-20' : 'lg:ml-64'/, 'the content leaves the rail its room');
  assert.match(shell, /<Sidebar[^>]*collapsed=\{isSidebarCollapsed\}/);
});

test('the collapsed sidebar keeps the icons and the photo, and mobile stays off-canvas', async () => {
  const sidebar = await read('src/components/layout/Sidebar.jsx');
  assert.match(sidebar, /collapsed \? "lg:w-20" : "lg:w-64"/, 'collapsed is a narrow rail, not a hidden panel');
  assert.match(sidebar, /"lg:translate-x-0"/, 'on desktop it is always on screen');
  assert.doesNotMatch(sidebar, /lg:-translate-x-full/, 'it never slides away on desktop any more (Rodny, 21 September 2026)');
  assert.doesNotMatch(sidebar, /aria-hidden/, 'a rail you can use is not hidden from assistive technology');
  assert.match(sidebar, /isOpen \? "translate-x-0" : "-translate-x-full"/, 'mobile off-canvas untouched');
  assert.match(sidebar, /title=\{collapsed \? item\.label : undefined\}/, 'the module name becomes the tooltip');
  assert.match(sidebar, /<span className=\{cn\(collapsed && "lg:sr-only"\)\}>\{item\.label\}<\/span>/, 'and stays in the page for screen readers');
  assert.match(sidebar, /<SidebarProfile collapsed=\{collapsed\} \/>/, 'the person stays visible in the rail');

  const profile = await read('src/components/layout/SidebarProfile.jsx');
  assert.match(profile, /collapsed && 'lg:h-11 lg:w-11/, 'the photo shrinks instead of disappearing');
  assert.match(profile, /collapsed && 'lg:sr-only'/, 'the name is kept for screen readers only');

  // Everything that changes when collapsed is a `lg:` variant, so the mobile drawer is always complete.
  const collapsedClasses = [...sidebar.matchAll(/collapsed && "([^"]+)"/g), ...sidebar.matchAll(/collapsed && '([^']+)'/g)]
    .flatMap((match) => match[1].split(/\s+/));
  assert.ok(collapsedClasses.length > 0);
  assert.deepEqual(collapsedClasses.filter((className) => !className.startsWith('lg:')), [], 'collapsing must not touch the mobile drawer');
});
