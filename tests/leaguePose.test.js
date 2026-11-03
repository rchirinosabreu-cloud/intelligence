import test from 'node:test';
import assert from 'node:assert/strict';
import { nextLeaguePose, LEAGUE_POSES } from '../src/lib/leaguePose.js';

test('every reopening changes pose, including repeated random values', () => {
  assert.deepEqual(LEAGUE_POSES, ['rest', 'wave', 'celebrate']);
  for (const random of [0, 0.49, 0.9999]) {
    let previous = 0;
    for (let i = 0; i < 15; i++) {
      const next = nextLeaguePose(previous, () => random);
      assert.ok(next >= 0 && next < 3);
      assert.notEqual(next, previous);
      previous = next;
    }
  }
});
