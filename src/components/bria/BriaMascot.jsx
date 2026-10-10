import BriaPortrait from '@/components/bria/BriaPortrait';
import React, { useEffect, useRef, useState } from 'react';
import chispaUrl from '@/assets/bria-chispa/poses.png';
import { advanceBriaMascot, BRIA_CELEBRATION_MS } from '@/lib/briaMascotActivity';
import { drawBriaMascot } from './briaMascotRenderer';

let imagePromise;
const loadImages = () => imagePromise ||= Promise.all(Object.entries({ chispa: chispaUrl }).map(([name, url]) => new Promise((resolve, reject) => {
  const image = new Image(); image.onload = () => resolve([name, image]); image.onerror = () => reject(new Error(`No se pudo cargar ${name}`)); image.src = url;
}))).then(Object.fromEntries).catch(error => { imagePromise = null; throw error; });

export default function BriaMascot({ working = false, completionId = null, className = 'h-10 w-10' }) {
  const canvas = useRef(null), activity = useRef(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    const el = canvas.current;
    if (!el) return;
    let disposed = false, frame = 0, settle = 0, images, inViewport = true, lastPaint = 0;
    const media = matchMedia('(prefers-reduced-motion: reduce)');
    const input = { working, completionId };
    activity.current = advanceBriaMascot(activity.current, input, performance.now());
    const paint = now => {
      activity.current = advanceBriaMascot(activity.current, input, now);
      const { state, startedAt } = activity.current;
      el.dataset.briaState = state;
      if (images) drawBriaMascot(el.getContext('2d'), images, state, media.matches ? (state === 'celebrate' ? 450 : 0) : now - startedAt, el.width, el.height);
    };
    const tick = now => {
      if (disposed) return;
      if (now - lastPaint >= 50) { paint(now); lastPaint = now; }
      frame = requestAnimationFrame(tick);
    };
    const sync = () => {
      cancelAnimationFrame(frame); clearTimeout(settle);
      const now = performance.now(); paint(now);
      const animated = !!images && !media.matches && !document.hidden && inViewport;
      el.dataset.briaAnimating = String(animated);
      if (animated) frame = requestAnimationFrame(tick);
      else if (activity.current.state === 'celebrate') {
        // Hidden/reduced-motion pets also settle once; never replay a stale celebration.
        settle = setTimeout(() => { if (!disposed) sync(); }, Math.max(1, BRIA_CELEBRATION_MS - (now - activity.current.startedAt)));
      }
    };
    loadImages().then(result => {
      if (disposed) return;
      images = result; el.dataset.briaReady = 'true'; sync();
    }).catch(error => { if (!disposed) { console.error('[BriaMascot]', error.message); setFailed(true); } });
    media.addEventListener('change', sync);
    document.addEventListener('visibilitychange', sync);
    const observer = new IntersectionObserver(entries => { inViewport = entries[0].isIntersecting; sync(); });
    observer.observe(el);
    sync();
    return () => { disposed = true; cancelAnimationFrame(frame); clearTimeout(settle); observer.disconnect(); media.removeEventListener('change', sync); document.removeEventListener('visibilitychange', sync); };
  }, [working, completionId, failed]);
  if (failed) return <BriaPortrait  alt="" className={`object-contain ${className}`} />;
  return <canvas ref={canvas} width="288" height="288" data-bria-mascot data-bria-design="chispa" aria-hidden="true" className={`pointer-events-none shrink-0 ${className}`} />;
}
