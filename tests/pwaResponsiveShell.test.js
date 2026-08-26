import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('Brainstudio exposes an installable standalone web app manifest', async () => {
  const manifest = JSON.parse(await read('public/manifest.webmanifest'));
  const index = await read('index.html');

  assert.equal(manifest.name, 'Brainstudio Intelligence');
  assert.equal(manifest.short_name, 'Brainstudio');
  assert.equal(manifest.display, 'standalone');
  assert.equal(manifest.start_url, '/');
  assert.equal(manifest.scope, '/');
  assert.ok(manifest.icons.some((icon) => icon.sizes === '192x192'));
  assert.ok(manifest.icons.some((icon) => icon.sizes === '512x512' && icon.purpose.includes('maskable')));
  assert.match(index, /rel="manifest" href="\/manifest\.webmanifest"/);
  assert.match(index, /name="theme-color" content="#009EB9"/);
  assert.match(index, /rel="apple-touch-icon" href="\/icons\/apple-touch-icon\.png"/);
});

test('service worker keeps authenticated API data online-first and offers only a shell fallback', async () => {
  const worker = await read('public/sw.js');
  const registration = await read('src/pwa/registerServiceWorker.js');
  const main = await read('src/main.jsx');

  assert.match(worker, /request\.method !== 'GET'/);
  assert.match(worker, /url\.pathname\.startsWith\('\/api\/'\)/);
  assert.match(worker, /request\.mode === 'navigate'/);
  assert.match(worker, /cache\.match\('\/offline\.html'\)/);
  assert.doesNotMatch(worker, /cache\.put\(request[^,]*,\s*response[^)]*\).*\/api/s);
  assert.match(registration, /navigator\.serviceWorker\.register/);
  assert.match(registration, /__BUILD_SHA__/);
  assert.match(main, /registerBrainstudioServiceWorker/);
});

test('shared page headers wrap long titles instead of truncating them', async () => {
  const header = await read('src/components/ui/PageHeader.jsx');

  assert.doesNotMatch(header, /<h1[^>]*className="[^"]*truncate/);
  assert.match(header, /layout = 'responsive'/);
  assert.match(header, /layout === 'stacked'/);
});

test('task management controls and columns adapt to their actual available width', async () => {
  const board = await read('src/components/modules/NativeTasks.jsx');
  const styles = await read('src/index.css');
  const shell = await read('src/components/layout/AppLayout.jsx');

  assert.match(board, /layout="stacked"/);
  assert.match(board, /task-toolbar-grid/);
  assert.match(board, /task-filter-grid/);
  assert.match(board, /task-board-grid/);
  assert.doesNotMatch(board, /grid grid-cols-1 md:grid-cols-3 gap-6 flex-1/);
  assert.match(styles, /\.task-board-grid\s*\{[^}]*repeat\(auto-fit,\s*minmax\(min\(100%,\s*20rem\),\s*1fr\)\)/s);
  assert.match(styles, /\.task-toolbar-grid/);
  assert.match(styles, /@media \(min-width: 1536px\)[\s\S]*\.task-toolbar-grid/);
  assert.match(shell, /<main className="[^"]*min-w-0[^"]*overflow-x-clip/);
});

test('mobile sidebar stays above its overlay and scrolls inside the viewport', async () => {
  const sidebar = await read('src/components/layout/Sidebar.jsx');
  const shell = await read('src/components/layout/AppLayout.jsx');

  assert.match(sidebar, /z-\[60\]/);
  assert.match(sidebar, /h-\[100dvh\]/);
  assert.match(sidebar, /w-\[min\(86vw,20rem\)\]/);
  assert.match(sidebar, /<nav className="[^"]*overflow-y-auto/);
  assert.match(sidebar, /aria-label="Cerrar menú"/);
  assert.match(shell, /z-\[55\]/);
  assert.match(shell, /document\.body\.style\.overflow = isSidebarOpen \? 'hidden' : ''/);
});
