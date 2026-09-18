import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('the Brain palette is exposed as shared tokens instead of local hexadecimals', async () => {
  const css = await read('src/index.css');
  const tailwind = await read('tailwind.config.js');

  // Primary action is the official cyan #009BBF.
  assert.match(css, /--primary:\s*191\.3 100% 37\.5%/);
  // RGB triplets so utilities can apply opacity (rgb(var(--x) / <alpha-value>)).
  for (const [name, triplet] of [['cyan', '0 155 191'], ['green', '49 170 138'], ['magenta', '168 17 140'], ['coral', '255 106 104'], ['yellow', '252 210 0']]) {
    assert.match(css, new RegExp(`--brand-${name}:\\s*${triplet};`), `missing --brand-${name}`);
    assert.match(tailwind, new RegExp(`${name}:[\\s\\S]{0,120}rgb\\(var\\(--brand-${name}\\) / <alpha-value>\\)`), `tailwind brand.${name} must read the token`);
  }
  // Traffic-light semantics: green and yellow get status tokens; red stays on the global destructive token.
  assert.match(css, /--status-positive:/);
  assert.match(css, /--status-attention:/);
  assert.match(css, /\.dark[\s\S]*--status-positive-fg:/);
  assert.match(tailwind, /status:\s*\{[\s\S]*positive[\s\S]*attention/);
  assert.doesNotMatch(css, /--status-negative/);
  // Gradients are shared utilities.
  for (const gradient of ['brain-gradient-primary', 'brain-gradient-energy', 'brain-gradient-sunrise', 'brain-gradient-spectrum', 'brain-gradient-text']) {
    assert.match(css, new RegExp(`\\.${gradient}\\s*\\{`), `missing .${gradient}`);
  }
});
