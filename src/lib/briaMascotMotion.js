function smooth(value) { const t = Math.max(0, Math.min(1, value)); return t * t * (3 - 2 * t); }
function lerp(a, b, t) { return a + (b - a) * smooth(t); }

export function sampleBriaPose(state, time) {
  const t = Math.max(0, time);
  const pose = { bodyScale: 1, bodyX: 0, bodyY: 0, direction: 1, face: 'open', arms: { left: .12, right: -.12 }, feet: { left: { x: 0, y: 0 }, right: { x: 0, y: 0 } }, finished: false };
  if (state === 'idle') {
    pose.bodyY = -.65 + .65 * Math.cos(2 * Math.PI * t / 4000);
    if (t % 4000 >= 3100 && t % 4000 < 3250) pose.face = 'blink';
  } else if (state === 'work') {
    pose.seated = true;
    pose.bodyY = -.15 + .15 * Math.cos(2 * Math.PI * t / 4000);
    const period = t % 4000;
    const typing = period < 1800 ? Math.sin(Math.PI * period / 1800) : 0;
    pose.arms.left = -1.28 + Math.sin(t / 90) * .055 * typing;
    pose.arms.right = .80 + Math.cos(t / 90) * .055 * typing;
    if (period >= 3100 && period < 3250) pose.face = 'blink';
  } else if (state === 'celebrate') {
    if (t < 220) {
      pose.bodyY = lerp(0, 3, t / 220);
      pose.arms.left = lerp(.12, -.35, t / 220);
      pose.arms.right = -pose.arms.left;
    } else if (t < 650) {
      const p = (t - 220) / 430;
      pose.bodyY = 3 * (1 - smooth(p * 5)) - 18 * Math.sin(Math.PI * p);
      pose.feet.left.y = pose.bodyY; pose.feet.right.y = pose.bodyY;
      pose.arms.left = lerp(-.35, 2.4, Math.min(1, p * 3));
      pose.arms.right = -pose.arms.left;
      pose.face = 'joy';
    } else if (t < 930) {
      pose.bodyY = 2 * Math.sin(Math.PI * (t - 650) / 280);
      pose.arms.left = lerp(2.4, .12, (t - 650) / 280);
      pose.arms.right = -pose.arms.left;
      pose.face = 'joy';
    } else {
      pose.finished = true;
    }
  }
  return pose;
}
