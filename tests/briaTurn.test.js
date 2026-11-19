import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { BRIA_TURN, stepTurn, turnColumn, turnRow } from '../src/lib/briaTurn.js';

// Rodny, 18 de noviembre de 2026: «no puede ponerse de frente cuando pongo el cursor sobre ella?»
test('the cycle column follows time and loops without a seam', () => {
  assert.equal(turnColumn(0), 0);
  assert.equal(turnColumn(1000 / BRIA_TURN.fps), 1);
  assert.equal(turnColumn(4000), 0, 'four seconds later the cycle starts again');
  assert.equal(turnColumn(-50), 0);
});

test('the turn eases toward its target, reverses from wherever it is and never overshoots', () => {
  let amount = 0;
  const seen = [];
  for (let t = 0; t < 600; t += 16) { amount = stepTurn(amount, 1, 16); seen.push(amount); }
  assert.equal(amount, 1, 'arrives facing front');
  for (let i = 1; i < seen.length; i += 1) assert.ok(seen[i] >= seen[i - 1] && seen[i] <= 1);
  const rowsVisited = new Set(seen.map(value => turnRow(value)));
  assert.equal(rowsVisited.size, BRIA_TURN.rows - 1, 'passes through every angle: no row is skipped');
  let half = 0.5;
  half = stepTurn(half, 0, 16);
  assert.ok(half < 0.5 && half > 0.3, 'leaving mid-turn goes back from where she is');
});

test('rows: 0 is three quarters, the last row faces the camera', () => {
  assert.equal(turnRow(0), 0);
  assert.equal(turnRow(1), BRIA_TURN.rows - 1);
  assert.equal(turnRow(2), BRIA_TURN.rows - 1);
});

test('the idle mascot turns on hover instead of lifting; reduced motion keeps her still', () => {
  const mascot = readFileSync('src/components/bria/BriaMascot.jsx', 'utf8');
  const css = readFileSync('src/index.css', 'utf8');
  assert.match(mascot, /state === 'idle' && !reduced\) return <BriaTurn facing=\{gesture === 'hover'\}/);
  assert.match(css, /\[data-bria-mascot\]\[data-bria-gesture="hover"\]\s*\{\s*transform: none;/);
  const atlas = readFileSync('src/assets/bria-3d/reposo-giro.webp');
  assert.equal(atlas.subarray(8, 12).toString(), 'WEBP');
});
