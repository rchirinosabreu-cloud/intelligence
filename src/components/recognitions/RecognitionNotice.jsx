import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { X } from '@/components/ui/icons';
import { recognitionLabels, recognitionMotion } from '@/lib/recognitionPresentation';

function Particles({ count }) {
  const canvas = useRef(null);
  useEffect(() => {
    let cancelled = false;
    let burst;
    import('canvas-confetti').then(({ default: confetti }) => {
      if (cancelled || !canvas.current) return;
      burst = confetti.create(canvas.current, { resize: true, disableForReducedMotion: true });
      burst({ particleCount: count, spread: 70, startVelocity: 16, gravity: 0.7, ticks: 65, scalar: 0.65, origin: { x: 0.16, y: 0.7 }, colors: ['#ffffff', '#00AC8A', '#009EB9'], disableForReducedMotion: true });
    }).catch(error => console.error('[Recognition] Optional animation unavailable:', error));
    return () => { cancelled = true; burst?.reset(); };
  }, [count]);
  return <canvas ref={canvas} aria-hidden="true" className="pointer-events-none absolute inset-0 h-full w-full" />;
}

function Notice({ event, style, onDismiss, durationMs }) {
  const reduced = useReducedMotion();
  const animation = recognitionMotion(style, reduced);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const [hidden, setHidden] = useState(document.hidden);
  const remaining = useRef(durationMs);
  const dismissRef = useRef(onDismiss);
  dismissRef.current = onDismiss;
  useEffect(() => {
    const handle = () => setHidden(document.hidden);
    document.addEventListener('visibilitychange', handle);
    return () => document.removeEventListener('visibilitychange', handle);
  }, []);
  useEffect(() => {
    remaining.current = durationMs;
  }, [durationMs]);
  useEffect(() => {
    if (!durationMs || hovered || focused || hidden) return;
    const started = performance.now();
    const timer = setTimeout(() => dismissRef.current(), Math.max(0, remaining.current));
    return () => { clearTimeout(timer); remaining.current = Math.max(0, remaining.current - (performance.now() - started)); };
  }, [durationMs, hovered, focused, hidden]);
  const title = recognitionLabels[event.kind];
  return (
    <motion.aside
      data-recognition-notice role="status" aria-label="Reconocimiento personal" aria-live="polite" aria-atomic="true"
      initial={{ opacity: 0, y: animation.offset }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: animation.offset }}
      transition={{ duration: animation.duration, ease: [0.22, 1, 0.36, 1] }}
      onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}
      onFocusCapture={() => setFocused(true)} onBlurCapture={e => { if (!e.currentTarget.contains(e.relatedTarget)) setFocused(false); }}
      className="pointer-events-auto relative w-full overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-lg dark:border-zinc-700 dark:bg-zinc-900"
    >
      <div className="brain-ai-header relative flex items-center gap-3 px-5 py-4 pr-12 text-white">
        <motion.span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-white" aria-hidden="true"
          initial={false} animate={animation.duration ? { rotate: [0, -7, 5, 0] } : { rotate: 0 }} transition={{ duration: animation.duration ? 0.55 : 0 }}>
          <img src="/brainstudio-mascot-tip.png" alt="" className="h-11 w-11 object-contain" />
        </motion.span>
        <p className="min-w-0 text-base font-semibold leading-6">{title}</p>
        <button type="button" onClick={onDismiss} aria-label="Cerrar reconocimiento" className="absolute right-1 top-1 flex h-11 w-11 items-center justify-center rounded-lg text-white hover:bg-white/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-white"><X className="h-4 w-4" aria-hidden="true" /></button>
      </div>
      <div className="px-5 py-4"><p className="whitespace-pre-line text-sm leading-6 text-zinc-700 dark:text-zinc-200">{event.personalMessage || event.description}</p>{event.demo && <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">Ejemplo local · No se otorgan premios reales</p>}</div>
      {animation.particles > 0 && <Particles count={animation.particles} />}
    </motion.aside>
  );
}

export default function RecognitionNotice({ event, style = 'subtle', onDismiss, durationMs = 9000 }) {
  return createPortal(<div className="pointer-events-none fixed bottom-4 left-3 right-3 z-[45] sm:bottom-6 sm:left-auto sm:right-6 sm:w-[390px]">
    <AnimatePresence mode="wait">{event && <Notice key={event.presentationId || event.id} event={event} style={style} onDismiss={onDismiss} durationMs={durationMs} />}</AnimatePresence>
  </div>, document.body);
}
