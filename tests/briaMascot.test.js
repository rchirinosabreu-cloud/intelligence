import test from 'node:test';
import assert from 'node:assert/strict';

const activity = await import('../src/lib/briaMascotActivity.js').catch(() => null);

test('only a fresh confirmed assistant response permits celebration', () => {
  assert.equal(typeof activity?.completedBriaReplyId, 'function');
  const reply = { id: 'reply-1', role: 'assistant', text: 'Listo.', failures: [] };
  assert.equal(activity.completedBriaReplyId({ turns: [reply] }), 'reply-1');
  assert.equal(activity.completedBriaReplyId({ turns: [{ ...reply, failures: [{ tool: 'read' }] }] }), null);
  assert.equal(activity.completedBriaReplyId({ turns: [{ ...reply, role: 'user' }] }), null);
  assert.equal(activity.completedBriaReplyId({ turns: [] }), null);
});

test('working takes priority, success celebrates once, errors and reloads do not invent success', () => {
  assert.equal(typeof activity?.advanceBriaMascot, 'function');
  let pose = activity.advanceBriaMascot(null, {}, 0);
  assert.equal(pose.state, 'idle');
  pose = activity.advanceBriaMascot(pose, { working: true }, 100);
  assert.equal(pose.state, 'work');
  pose = activity.advanceBriaMascot(pose, { working: true, completionId: 'a' }, 200);
  assert.equal(pose.state, 'work', 'saved response does not interrupt work still in progress');
  pose = activity.advanceBriaMascot(pose, { completionId: 'a' }, 250);
  assert.equal(pose.state, 'celebrate');
  const startedAt = pose.startedAt;
  pose = activity.advanceBriaMascot(pose, { completionId: 'a' }, 300);
  assert.equal(pose.startedAt, startedAt, 'rerender does not restart celebration');
  pose = activity.advanceBriaMascot(pose, { completionId: 'a' }, 1180);
  assert.equal(pose.state, 'idle');
  pose = activity.advanceBriaMascot(pose, { working: true, completionId: 'a' }, 1300);
  pose = activity.advanceBriaMascot(pose, { completionId: 'a' }, 1500);
  assert.equal(pose.state, 'idle', 'a failed request cannot replay the previous success');
  pose = activity.advanceBriaMascot(pose, { completionId: 'b' }, 1600);
  assert.equal(pose.state, 'celebrate');
  pose = activity.advanceBriaMascot(pose, { working: true, completionId: 'b' }, 1650);
  assert.equal(pose.state, 'work', 'a new request interrupts celebration immediately');
});
