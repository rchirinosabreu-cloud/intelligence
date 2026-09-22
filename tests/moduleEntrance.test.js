import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

// Rodny, 21 de septiembre de 2026: «los degradados se ven así y luego se acomodan… y al viajar entre módulos
// es como si cargaran de nuevo». La entrada es corta y no se repite al volver a un módulo ya visto.

test('the shell fades the content in quickly, not over most of a second', async () => {
  const shell = await read('src/components/layout/AppLayout.jsx');
  assert.match(shell, /animate-in fade-in duration-200/, 'a short entrance; 700ms read as a page still loading');
  assert.doesNotMatch(shell, /duration-700/);
});

test('a module animates its entrance only the first time it is visited in the session', async () => {
  const helper = await read('src/lib/firstVisit.js');
  assert.match(helper, /const visited = new Set\(\)/, 'one memory per tab, not per mount');
  assert.match(helper, /firstVisit\.current = !visited\.has\(key\)/, 'decided once per mount, before any effect');
  assert.match(helper, /useEffect\(\(\) => \{ visited\.add\(key\); \}, \[key\]\)/, 'marking it visited is an effect, so the render stays pure');

  const dashboard = await read('src/components/modules/Dashboard.jsx');
  assert.match(dashboard, /const firstVisit = useFirstVisit\('dashboard'\)/);
  assert.match(dashboard, /initial=\{firstVisit \? 'hidden' : false\}/, 'coming back, the board is already in place: no stagger replay');
});

test('coming back to Gestión reuses the tasks it already had', async () => {
  const board = await read('src/components/modules/NativeTasks.jsx');
  assert.match(board, /staleTime: 30_000/, 'the periodic refresh already keeps them current');
});
