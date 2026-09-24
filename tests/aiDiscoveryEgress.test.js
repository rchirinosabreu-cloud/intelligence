import test from 'node:test';
import assert from 'node:assert/strict';
import { searchCloudStorage } from '../src/services/discoveryService.js';
test('Discovery no consulta ni intenta alternativas externas si gobierno deniega', async () => {
  let calls = 0, checks = 0;
  const result = await searchCloudStorage('Synthetic', {
    client: { search: async () => { calls++; return [[]]; } },
    governance: { assertEgress: async () => { checks++; throw Object.assign(new Error('AI_SCOPE_REQUIRED'), { code: 'AI_SCOPE_REQUIRED' }); } }
  });
  assert.equal(checks, 1); assert.equal(calls, 0);
  assert.match(result.text, /AI_SCOPE_REQUIRED/);
});
