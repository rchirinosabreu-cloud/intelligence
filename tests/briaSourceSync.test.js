import test from 'node:test';
import assert from 'node:assert/strict';
import { applySourceSync } from './support/briaSourceSyncPrototype.js';

test('source updates preserve human memory and only advance the cursor after every write', async () => {
  const events = [], repository = { importSource: async row => { events.push(row.id); return { changed: true }; }, excludeSources: async ids => events.push(ids.join(',')) };
  const batch = { account: 'social.brainstudio@gmail.com', verified: true, complete: true, cursor: { drive: 'next', gmail: '100' }, actions: [{ action: 'UPSERT', source: { id: 'drive:1', status: 'indexed' } }, { action: 'EXCLUDE', ids: ['mail:2', 'attachment:2-1'] }] };
  const result = await applySourceSync({ batch, repository, commitCursor: async cursor => events.push(cursor.drive) });
  assert.deepEqual(events, ['drive:1', 'mail:2,attachment:2-1', 'next']);
  assert.equal(result.updated, 1); assert.equal(result.excluded, 2);
  repository.importSource = async () => { throw new Error('transient database failure'); };
  await assert.rejects(() => applySourceSync({ batch, repository, commitCursor: async () => assert.fail('cursor advanced') }), /transient/);
});

test('unverified, partial and wrong-account snapshots cannot change the corpus', async () => {
  for (const batch of [{ account: 'other', verified: true, complete: true }, { account: 'social.brainstudio@gmail.com', verified: false, complete: true }, { account: 'social.brainstudio@gmail.com', verified: true, complete: false }]) {
    await assert.rejects(() => applySourceSync({ batch, repository: {}, commitCursor: async () => assert.fail() }), /cuenta|completa/);
  }
});
