import test from 'node:test';
import assert from 'node:assert/strict';
import { sourceSearchChunks } from '../src/lib/briaSourceChunks.js';
test('chunk boundaries preserve emoji and valid Unicode for PostgreSQL JSON', () => {
  const body = 'a'.repeat(6999) + '😀' + 'b'.repeat(8000);
  const chunks = sourceSearchChunks(body);
  assert.equal(chunks.map(row => row.content).join(''), body);
  for (const row of chunks) assert.equal(row.content.isWellFormed(), true);
});
