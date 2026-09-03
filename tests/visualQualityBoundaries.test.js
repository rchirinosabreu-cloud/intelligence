import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('application shell avoids persistent animated blur decorations', async () => {
  const source = await read('src/components/layout/AppLayout.jsx');

  assert.doesNotMatch(source, /Ambient Glow|Top Left Orb|Bottom Right Orb|Center Orb/);
  assert.doesNotMatch(source, /blur-\[(?:120|140)px\]/);
});

test('new platform dialog supports both themes and the destructive token', async () => {
  const source = await read('src/components/ui/ConfirmDialog.jsx');

  assert.match(source, /bg-white/);
  assert.match(source, /dark:bg-slate-900/);
  assert.match(source, /bg-destructive/);
  assert.match(source, /text-destructive/);
  assert.doesNotMatch(source, /#[Ee]11[Dd]48/, 'Shared dialogs must consume the global token instead of duplicating its hex value.');
});

test('DM Sans is loaded once through the document head', async () => {
  const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
  const css = await readFile(new URL('../src/index.css', import.meta.url), 'utf8');

  assert.match(html, /fonts\.googleapis\.com\/css2\?family=DM\+Sans/);
  assert.doesNotMatch(css, /@import[^;]*fonts\.googleapis\.com/);
});
