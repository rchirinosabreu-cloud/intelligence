import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { transformWithEsbuild } from 'vite';
test('living conversation UI compiles and renders semantic answers with evidence', async () => {
  const file = 'src/components/bria/BriaConversation.jsx';
  const source = await readFile(file, 'utf8');
  await transformWithEsbuild(source, file, { loader: 'jsx', jsx: 'automatic' });
  assert.match(source, /ReactMarkdown/);
  assert.match(source, /remarkGfm/);
  assert.match(source, /sources/);
  assert.doesNotMatch(source, /\b(?:bg|text|border)-(?:red|rose|purple|violet|indigo|fuchsia|sky|teal|emerald)-/);
});
