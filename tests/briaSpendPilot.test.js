import test from 'node:test';
import assert from 'node:assert/strict';
import { createGovernedFetch } from '../src/services/aiEgress.js';
import { currentAiContext, runWithAiContext } from '../src/lib/aiRequestContext.js';
import { createBriaModelRuntime } from '../src/services/briaModelRuntime.js';

test('only the pilot owner can reach the provider through the chat', async () => {
  let calls = 0;
  const send = createGovernedFetch({
    env: { BRIA_SPEND_PILOT: 'true', BRIA_SPEND_PILOT_USER_ID: 'owner' },
    governance: { assertEgress: async () => {} },
    usageLog: { record: async () => {} },
    fetchImpl: async () => { calls++; return new Response('{}'); }
  });
  const ask = (model = 'gpt-6-luna') => send('https://api.openai.com/v1/responses', {
    body: JSON.stringify({ model, reasoning: { effort: 'low' }, store: false })
  });
  await assert.rejects(() => ask(), { code: 'BRIA_PILOT_SCOPE' });
  const asChat = (userId, channel, fn) => runWithAiContext({ briaPilotChat: { userId, channel } }, fn);
  await assert.rejects(asChat('other', 'web', () => ask()), { code: 'BRIA_PILOT_SCOPE' });
  await assert.rejects(asChat('owner', 'web', () => ask('gpt-6.1-sol')), { code: 'BRIA_PILOT_SCOPE' });
  assert.equal(calls, 0);
  for (const channel of ['web', 'whatsapp']) await asChat('owner', channel, () => ask());
  assert.equal(calls, 2);
});

test('the chat runtime pins Luna low and never retries a provider spend cutoff', async () => {
  let calls = 0;
  const pilotChat = { userId: 'owner', channel: 'whatsapp' };
  const ai = { generate: async (params) => {
    calls++;
    assert.equal(params.model, 'gpt-6-luna');
    assert.equal(params.reasoningEffort, 'low');
    assert.deepEqual(currentAiContext().briaPilotChat, pilotChat);
    throw Object.assign(new Error('limit reached'), { status: 429, code: 'project_spend_limit_exceeded' });
  } };
  const runtime = createBriaModelRuntime({
    ai, user: { userId: 'owner' }, pilotChat,
    env: { BRIA_SPEND_PILOT: 'true', BRIA_CHAT_MODEL: 'gpt-6.1-sol', BRIA_CHAT_REASONING_EFFORT: 'high' }
  });
  await assert.rejects(runtime.generate({}), { code: 'project_spend_limit_exceeded' });
  assert.equal(calls, 1);
  assert.equal(currentAiContext(), null);
});
