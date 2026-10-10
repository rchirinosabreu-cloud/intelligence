import { sampleBriaPose } from '../../lib/briaMascotMotion.js';

// Equal source-pixel scale preserves the character volume across full poses.
const frames = {
  idle: { x: 246, y: 55, w: 444, h: 624 },
  work: { x: 856, y: 103, w: 431, h: 576 },
  celebrate: { x: 1425, y: 92, w: 515, h: 587 },
};

// Fixed transparent viewport, including the hop and laptop, in either theme.
export function drawBriaMascot(ctx, images, state, time, width, height) {
  ctx.clearRect(0, 0, width, height);
  ctx.save(); ctx.scale(width / 144, height / 144);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  const frame = frames[state] || frames.idle;
  const pose = sampleBriaPose(state, time);
  const scale = 94 / frames.idle.h;
  const w = frame.w * scale, h = frame.h * scale;
  // Subpixel drawing keeps breathing and the short hop smooth, with no drift.
  ctx.drawImage(images.chispa, frame.x, frame.y, frame.w, frame.h, 72 - w / 2, 132 - h + pose.bodyY, w, h);
  ctx.restore();
}
