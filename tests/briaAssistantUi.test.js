import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { transformWithEsbuild } from 'vite';
test('Bria docks globally, expands, and source navigation does not close or reset the chat', async () => {
  const file = 'src/components/bria/BriaAssistant.jsx', source = await readFile(file, 'utf8'), layout = await readFile('src/components/layout/AppLayout.jsx', 'utf8');
  await transformWithEsbuild(source, file, { loader: 'jsx', jsx: 'automatic' });
  assert.match(source, /createPortal/); assert.match(source, /fullScreen/); assert.match(source, /sessionStorage/);
  assert.match(source, /onOpenSource/); assert.match(source, /navigate\(source.url\)/);
  assert.doesNotMatch(source, /DialogContent|Enseñar a Bria|setTurns\(\[\]\)/);
  assert.match(layout, /briaDockWidth/);
});
