import test from 'node:test';
import assert from 'node:assert/strict';
import { createBriaConversationService } from '../src/services/briaConversationService.js';

test('chat deletion uses freshly resolved owner and expected revision without touching learning', async () => {
  let calls = 0, saved;
  const service = createBriaConversationService({ resolveActor: async () => ({ ref: `owner:${++calls}` }), repository: { remove: async (...args) => { saved = args; return { deleted: true, filesPending: false }; } } });
  assert.deepEqual(await service.remove({}, 'chat', 3), { deleted: true, filesPending: false });
  assert.deepEqual(saved, [{ ref: 'owner:1' }, 'chat', 3]);
  await assert.rejects(() => service.remove({}, 'chat', -1), { status: 400 });
});

test('deleting a chat during generation prevents a later memory write and append', async () => {
  let exists = true;
  const service = createBriaConversationService({ resolveActor: async () => ({ ref: 'owner' }), repository: { get: async () => exists ? { id: 'chat', revision: 0, turns: [] } : null, append: async () => assert.fail('deleted chat recreated') }, assistant: { ask: async ({ revalidateConversation }) => { exists = false; await revalidateConversation(); assert.fail('learning happened after deletion'); } } });
  await assert.rejects(() => service.send({ user: {}, id: 'chat', question: 'Recuerda esto' }), { status: 404 });
});
