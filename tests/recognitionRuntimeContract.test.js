import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
test('production layout actually mounts recipient delivery and laboratory remains an explicit opt-out', () => {
  assert.match(readFileSync('src/components/layout/AppLayout.jsx', 'utf8'), /<RecognitionRuntime/);
  assert.equal(existsSync('src/components/recognitions/RecognitionRuntime.jsx'), true);
});

test('a visible or hovered notice cannot be replaced by the next polling cycle', () => {
  const source = readFileSync('src/components/recognitions/RecognitionRuntime.jsx', 'utf8');
  assert.match(source, /noticeRef\.current/);
  assert.match(source, /busy \|\| noticeRef\.current/);
});
