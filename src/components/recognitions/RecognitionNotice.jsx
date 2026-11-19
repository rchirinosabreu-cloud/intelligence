import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { X } from '@/components/ui/icons';
import { Bria3D, BriaIsotipo } from '@/components/bria/BriaBrand';
import { recognitionLabels, recognitionMotion, recognitionParagraphs } from '@/lib/recognitionPresentation';
import { RECOGNITION_POINTS } from '@/lib/platformLeague';
import { cn } from '@/lib/utils';

// El aviso de un logro con la marca de Bria (Rodny, 18 de noviembre de 2026: «aparecería siempre como la variante
// compacta … si le doy clic, se abre el logro desbloqueado … que no sea tan grande, tan invasiva»). Llega como una
// píldora con el isotipo, el nombre y los puntos; tocarla abre la tarjeta, baja, con Bria celebrando desde la esquina.
// Sobre el degradado el texto va en azul noche: el blanco no se lee sobre la menta. Se va sola, y el tiempo se detiene
// mientras el cursor o el foco están encima. `leagueEnabled` decide si se nombran los puntos y la liga.

export const OPEN_LEAGUE_EVENT = 'brain:league:open';
export const openLeague = () => window.dispatchEvent(new CustomEvent(OPEN_LEAGUE_EVENT));

const STAR = <svg aria-hidden="true" viewBox="0 0 24 24" className="h-3.5 w-3.5"><path d="M12 1.5c.6 5.6 4.9 9.9 10.5 10.5-5.6.6-9.9 4.9-10.5 10.5C11.4 16.9 7.1 12.6 1.5 12 7.1 11.4 11.4 7.1 12 1.5z" fill="currentColor" /></svg>;
const POINTS_CHIP = 'inline-flex h-8 shrink-0 items-center gap-1 rounded-full bg-bria-gold-soft px-2.5 text-sm font-semibold text-bria-gold-ink dark:bg-bria-gold/15 dark:text-bria-gold';

function Particles({ count }) {
  const canvas = useRef(null);
  useEffect(() => {
    let cancelled = false;
    let burst;
    import('canvas-confetti').then(({ default: confetti }) => {
      if (cancelled || !canvas.current) return;
      burst = confetti.create(canvas.current, { resize: true, disableForReducedMotion: true });
      burst({ particleCount: count, spread: 70, startVelocity: 16, gravity: 0.7, ticks: 65, scalar: 0.65, origin: { x: 0.16, y: 0.4 }, colors: ['#72DD9B', '#2BC1AF', '#14AEBC', '#FBC219'], disableForReducedMotion: true });
    }).catch(error => console.error('[Recognition] Optional animation unavailable:', error));
    return () => { cancelled = true; burst?.reset(); };
  }, [count]);
  return <canvas ref={canvas} aria-hidden="true" className="pointer-events-none absolute inset-0 h-full w-full" />;
}

function Notice({ event, style, onDismiss, durationMs, leagueEnabled }) {
  const reduced = useReducedMotion();
  const animation = recognitionMotion(style, reduced);
  const [open, setOpen] = useState(false);
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
  useEffect(() => { remaining.current = durationMs; }, [durationMs]);
  // Abrir la tarjeta le devuelve el tiempo entero: quien la abrió quiere leerla.
  useEffect(() => { if (open) remaining.current = durationMs; }, [open, durationMs]);
  useEffect(() => {
    if (!durationMs || hovered || focused || hidden) return;
    const started = performance.now();
    const timer = setTimeout(() => dismissRef.current(), Math.max(0, remaining.current));
    return () => { clearTimeout(timer); remaining.current = Math.max(0, remaining.current - (performance.now() - started)); };
  }, [durationMs, hovered, focused, hidden, open]);
  const title = recognitionLabels[event.kind];
  const message = event.personalMessage || event.description;
  const paragraphs = recognitionParagraphs(message);
  const firstLine = paragraphs[0] || '';
  const close = <button type="button" onClick={onDismiss} aria-label="Cerrar reconocimiento" className={cn('flex h-11 w-11 shrink-0 items-center justify-center rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-bria-cyan', open ? 'text-bria-night hover:bg-white/30' : 'text-bria-muted hover:bg-bria-night/5 dark:text-zinc-300 dark:hover:bg-white/10')}><X className="h-4 w-4" aria-hidden="true" /></button>;
  return (
    <motion.aside
      data-recognition-notice data-recognition-state={open ? 'open' : 'pill'} role="status" aria-label="Reconocimiento personal" aria-live="polite" aria-atomic="true"
      initial={{ opacity: 0, y: animation.offset }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: animation.offset }}
      transition={{ duration: animation.duration, ease: [0.22, 1, 0.36, 1] }}
      onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}
      onFocusCapture={() => setFocused(true)} onBlurCapture={e => { if (!e.currentTarget.contains(e.relatedTarget)) setFocused(false); }}
      className={cn('pointer-events-auto relative w-full border text-bria-night dark:text-white',
        open ? 'mt-9 rounded-[20px] border-bria-night/5 bg-white shadow-[0_22px_44px_-20px_rgba(9,32,56,0.45)] dark:border-white/10 dark:bg-bria-night dark:shadow-[0_22px_44px_-18px_rgba(0,0,0,0.7)]'
          : 'rounded-full border-bria-night/5 bg-white p-1.5 pl-2 shadow-[0_12px_28px_-16px_rgba(9,32,56,0.45)] dark:border-white/10 dark:bg-bria-night dark:shadow-[0_12px_28px_-14px_rgba(0,0,0,0.6)]')}
    >
      {!open ? <div className="flex items-center gap-1">
        <button type="button" onClick={() => setOpen(true)} aria-expanded="false" aria-label={`Abrir el logro ${title}`}
          className="flex min-h-11 min-w-0 flex-1 items-center gap-2.5 rounded-full pl-1 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-bria-cyan">
          <BriaIsotipo className="h-9 shrink-0" />
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="truncate font-bria text-base font-bold leading-5">{title}</span>
            <span className="truncate text-sm leading-5 text-bria-muted dark:text-zinc-300">{firstLine}</span>
          </span>
          {leagueEnabled && <span className={POINTS_CHIP}>{STAR}+{RECOGNITION_POINTS}</span>}
        </button>
        {close}
      </div> : <>
        <div className="relative h-[70px] overflow-hidden rounded-t-[20px] bg-bria pl-[100px] pr-12 pt-3">
          <p className="text-sm font-medium leading-5 text-bria-night/90">Logro desbloqueado</p>
          <p className="truncate font-bria text-xl font-bold leading-7 text-bria-night">{title}</p>
          <svg aria-hidden="true" viewBox="0 0 360 30" preserveAspectRatio="none" className="absolute inset-x-0 -bottom-px h-4 w-full fill-white dark:fill-bria-night"><path d="M0 30 L0 16 C70 2 130 28 205 15 C262 5 312 7 360 19 L360 30 Z" /></svg>
        </div>
        <motion.span aria-hidden="true" className="pointer-events-none absolute -top-[34px] left-1.5 w-[88px]"
          initial={animation.duration ? { y: 12, rotate: -6 } : false} animate={{ y: 0, rotate: 0 }} transition={{ duration: animation.duration ? 0.45 : 0, ease: [0.22, 1, 0.36, 1] }}>
          <Bria3D mood="celebra" className="w-full" />
        </motion.span>
        <div className="absolute right-0.5 top-0.5">{close}</div>
        <div className="flex flex-col gap-3 px-[18px] pb-4 pt-1.5">
          {paragraphs.map((text, index) => <p key={index} className="text-pretty text-base leading-6 text-bria-ink dark:text-zinc-200">{text}</p>)}
          {event.demo && <p className="text-xs text-bria-muted dark:text-zinc-400">Ejemplo local · No se otorgan premios reales</p>}
          {leagueEnabled && <div className="flex items-center gap-2">
            <span className={POINTS_CHIP}>{STAR}+{RECOGNITION_POINTS} puntos</span>
            <button type="button" onClick={() => { openLeague(); onDismiss(); }} className="ml-auto flex h-11 items-center rounded-xl bg-bria-night px-3.5 text-sm font-semibold text-white hover:bg-bria-night/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-bria-cyan dark:bg-white dark:text-bria-night dark:hover:bg-white/90">Ver la liga</button>
          </div>}
        </div>
      </>}
      {animation.particles > 0 && open && <Particles count={animation.particles} />}
    </motion.aside>
  );
}

export default function RecognitionNotice({ event, style = 'subtle', onDismiss, durationMs = 9000, leagueEnabled = false }) {
  return createPortal(<div className="pointer-events-none fixed bottom-4 left-3 right-3 z-[45] sm:bottom-6 sm:left-auto sm:right-6 sm:w-[380px]">
    <AnimatePresence mode="wait">{event && <Notice key={event.presentationId || event.id} event={event} style={style} onDismiss={onDismiss} durationMs={durationMs} leagueEnabled={leagueEnabled} />}</AnimatePresence>
  </div>, document.body);
}
