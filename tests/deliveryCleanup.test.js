import test from 'node:test';
import assert from 'node:assert/strict';
import { runDeliveryCleanup } from '../src/services/deliveryCleanupService.js';

test('each delivery cleanup runs even if the other fails, without logging storage details', async () => {
  const messages = [], calls = [];
  const result = await runDeliveryCleanup({
    taskCleanup: () => { calls.push('task'); throw new Error('https://storage/private-key?signature=secret'); },
    contentCleanup: async () => { calls.push('content'); return { removed: 2 }; },
    logger: { warn: message => messages.push(message) }
  });
  assert.deepEqual(calls, ['task', 'content']);
  assert.equal(result.tasks.status, 'rejected'); assert.equal(result.content.status, 'fulfilled');
  assert.equal(messages.length, 1); assert.doesNotMatch(messages.join(), /storage|key|signature|secret/);
});
