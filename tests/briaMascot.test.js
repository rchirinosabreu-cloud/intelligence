import test from 'node:test';
import assert from 'node:assert/strict';

const motion = await import('../src/lib/briaMascotMotion.js').catch(() => null);
const activity = await import('../src/lib/briaMascotActivity.js').catch(() => null);
const { drawBriaMascot } = await import('../src/components/bria/briaMascotRenderer.js');

test('Bria Chispa renders smooth artwork with distinct idle, laptop and celebration poses', () => {
  const images = { body: {}, calm: {}, laptop: {}, chispa: {} };
  const sourceRects = [];
  for (const state of ['idle', 'work', 'celebrate']) {
    const calls = [];
    const ctx = { clearRect() {}, save() {}, restore() {}, scale() {}, translate() {}, rotate() {}, drawImage(...args) { calls.push(args); } };
    drawBriaMascot(ctx, images, state, 450, 288, 288);
    assert.equal(ctx.imageSmoothingEnabled, true, 'smooth mascot artwork must not use pixel sampling');
    assert.equal(ctx.imageSmoothingQuality, 'high');
    assert.equal(calls.length, 1, 'the complete pose preserves the character proportions');
    assert.equal(calls[0][0], images.chispa);
    sourceRects.push(calls[0].slice(1, 5));
  }
  assert.equal(new Set(sourceRects.map(rect => rect.join(','))).size, 3, 'each activity uses its own illustrated pose');
});

test('Bria stands seriously, works seated and celebrates without stretching or drifting', () => {
  assert.equal(typeof motion?.sampleBriaPose, 'function', 'the approved mascot motion must be available');
  for (const state of ['idle', 'work', 'celebrate']) {
    for (let time = 0; time <= 8000; time += 50) {
      const pose = motion.sampleBriaPose(state, time);
      assert.equal(pose.bodyX, 0);
      assert.equal(pose.bodyScale, 1);
      if (state === 'work') { assert.equal(pose.seated, true); assert.notEqual(pose.face, 'joy'); }
      if (state === 'idle') assert.notEqual(pose.face, 'joy');
    }
  }
  assert.equal(motion.sampleBriaPose('celebrate', 930).finished, true);
  assert.equal(motion.sampleBriaPose('idle', 3150).face, 'blink');
});

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
