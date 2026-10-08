import test from 'node:test';
import assert from 'node:assert/strict';
import { createResearchGovernancePool } from '../scripts/lib/briaResearchRuntime.js';
import { createGovernanceService } from '../src/services/aiGovernanceService.js';
test('research respects protected client policies and keeps audit writes local', async () => {
  const calls = [], events = [];
  const wrapper = createResearchGovernancePool({ pool: { query: async (sql) => { calls.push(sql); return { rows: [{ enabled: true }] }; } }, record: async event => events.push(event) });
  await assert.rejects(() => createGovernanceService({ pool: wrapper }).assertEgress({ provider: 'openai', model: 'test', useCase: 'bria.assistant' }), { code: 'AI_SCOPE_REQUIRED' });
  assert.equal(calls.length, 1);
  assert.match(calls[0], /^SELECT/);
  assert.equal(events[0].action, 'BLOCKED');
  await assert.rejects(() => wrapper.query('UPDATE "User" SET name=$1', ['a']), /solo lectura/);
});
