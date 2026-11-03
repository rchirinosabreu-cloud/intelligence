import React, { useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { ArrowRight } from '@/components/ui/icons';
import RunnerAvatar from './RunnerAvatar';
import { HABIT_POINTS, EXTRA_POINTS, KUDOS_WEEKLY, MEETING_POINTS, RECOGNITION_POINTS } from '@/lib/platformLeague';

export default function LeagueWelcome({ person, busy, error, onFinish }) {
  const heading = useRef(null);
  useEffect(() => { heading.current?.focus(); }, []);
  return <section data-league-welcome className="flex min-h-0 flex-1 flex-col px-5 pb-5">
    <div data-welcome-content className="min-h-0 flex-1 overflow-y-auto overscroll-contain pb-3 custom-scrollbar">
      <div className="mt-2 flex items-center gap-3">
        {person && <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-2xl bg-brand-cyan/10 dark:bg-brand-cyan/10"><RunnerAvatar person={person} size={68} /></div>}
        <div><p className="text-xs font-semibold uppercase tracking-wider text-brand-cyan-deep dark:text-brand-cyan">Tu liga del mes</p><h2 ref={heading} tabIndex={-1} className="mt-1 text-xl font-bold leading-tight text-zinc-900 outline-none dark:text-zinc-100">Tu buen trabajo suma</h2></div>
      </div>
      <p className="mt-3 text-sm leading-5 text-zinc-600 dark:text-zinc-300">Aquí reconocemos los buenos hábitos al trabajar en Brain Studio. Cada mes sumas puntos y participas por el reconocimiento del equipo.</p>
      <h3 className="mt-4 text-sm font-semibold text-zinc-900 dark:text-zinc-100">Así sumas puntos</h3>
      <ul className="mt-2 list-disc space-y-2 pl-4 text-sm leading-5 text-zinc-600 dark:text-zinc-300">
        <li><strong>{HABIT_POINTS} puntos</strong> por cada hábito cumplido en un día hábil.</li>
        <li><strong>{EXTRA_POINTS} puntos</strong> por registrar la primera actividad desde las 8:00 a. m.</li>
        <li><strong>{MEETING_POINTS} puntos</strong> por llegar primero a la reunión de tráfico. Un administrador lo registra.</li>
        <li>Cada semana puedes regalar <strong>{KUDOS_WEEKLY} puntos</strong> a alguien del equipo. No se descuentan de los tuyos.</li>
        <li><strong>{RECOGNITION_POINTS} puntos</strong> por cada insignia de logro obtenida.</li>
      </ul>
      <div className="mt-4 rounded-2xl border border-zinc-200 bg-white p-3 text-xs leading-5 text-zinc-600 dark:border-white/10 dark:bg-zinc-900 dark:text-zinc-300">
        <p><strong>Mi mes:</strong> tus puntos y hábitos.</p>
        <p><strong>Logros:</strong> tus insignias.</p>
        <p><strong>Equipo:</strong> las posiciones y los puntos para regalar.</p>
      </div>
      <p className="mt-3 text-xs leading-5 text-zinc-500 dark:text-zinc-400">Cada mes la cuenta empieza en cero. El resultado se valida al cierre.</p>
    </div>
    <div className="shrink-0 border-t border-zinc-200 pt-3 dark:border-white/10">
      {error && <p role="alert" className="mb-3 text-sm text-destructive">{error}</p>}
      <Button className="w-full rounded-xl" disabled={busy} onClick={() => onFinish('COMPLETED')}>{busy ? 'Guardando…' : '¡Vamos a sumar!'}<ArrowRight className="h-4 w-4" /></Button>
    </div>
  </section>;
}
