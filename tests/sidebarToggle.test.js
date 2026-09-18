import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

// Rodny, 18 September 2026: the sidebar can be hidden on desktop and the choice is remembered on the device.

test('the shell lets the person hide the sidebar on desktop and remembers it', async () => {
  const shell = await read('src/components/layout/AppLayout.jsx');
  assert.match(shell, /brain:sidebar-hidden/, 'the preference lives in localStorage under a namespaced key');
  assert.match(shell, /aria-label=\{isSidebarHidden \? 'Mostrar menú' : 'Ocultar menú'\}/, 'one desktop toggle with an accessible name for each state');
  assert.match(shell, /aria-label="Abrir menú"/, 'the mobile opener stays');
  assert.match(shell, /isSidebarHidden \? 'lg:pl-0' : 'lg:pl-64'/, 'the header follows the sidebar');
  assert.match(shell, /isSidebarHidden \? 'lg:ml-0' : 'lg:ml-64'/, 'the content takes the full width when hidden');
  assert.match(shell, /<Sidebar[^>]*hidden=\{isSidebarHidden\}/);
});

test('the sidebar slides away on desktop when hidden and keeps its mobile behaviour', async () => {
  const sidebar = await read('src/components/layout/Sidebar.jsx');
  assert.match(sidebar, /hidden \? "lg:-translate-x-full" : "lg:translate-x-0"/);
  assert.match(sidebar, /isOpen \? "translate-x-0" : "-translate-x-full"/, 'mobile off-canvas untouched');
  assert.match(sidebar, /aria-hidden=\{hidden\}/, 'a hidden sidebar is hidden from assistive technology too');
});
