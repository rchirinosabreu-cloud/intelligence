import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { transformWithEsbuild } from 'vite';

const files = [
  'src/components/public/CommercialRequest/CommercialRequestForm.jsx',
  'src/components/public/CommercialRequest/CommercialRequestPage.jsx'
];

for (const file of files) {
  test(`${file} compiles as JSX`, async () => {
    await transformWithEsbuild(await readFile(file, 'utf8'), file, { loader: 'jsx', jsx: 'automatic' });
  });
}

test('the public form follows the platform rules: shared calendar, brand tokens, links that keep the form open', async () => {
  const source = await readFile(files[0], 'utf8');
  assert.doesNotMatch(source, /<input[^>]*\btype="(date|datetime-local)"/s);
  assert.doesNotMatch(source, /#(E11D48|009EB9|009BBF|31AA8A|A8118C|FF6A68|FCD200)/i);
  assert.doesNotMatch(source, /\b(bg|text|border)-(red|rose|purple|violet|indigo)-\d{2,3}\b/);
  assert.match(source, /target="_blank" rel="noopener noreferrer"/);
  assert.doesNotMatch(source, /now = new Date\(\)/, 'no clock defaults in props (render-loop incident)');
});
