import React, { useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { ArrowRight, Award, CalendarDays, Check, Hand, Sun, Users } from '@/components/ui/icons';
import { pixelAvatars } from './pixelAvatars';
import { HABIT_POINTS, EXTRA_POINTS, KUDOS_WEEKLY, MEETING_POINTS, RECOGNITION_POINTS } from '@/lib/platformLeague';

const team = [['elisa', 'Elisa'], ['jesu', 'Jesu'], ['rodny', 'Rodny'], ['helen', 'Helen'], ['melissa', 'Melissa']];
const waysToScore = [
  { title: 'Cuida los hábitos', detail: 'Por cada hábito cumplido en un día hábil.', points: HABIT_POINTS, icon: Check },
  { title: 'Registra la primera actividad', detail: 'Desde las 8:00 a. m., en horario de Bogotá.', points: EXTRA_POINTS, icon: Sun },
  { title: 'Llega primero a tráfico', detail: 'Un administrador registra quién llegó primero.', points: MEETING_POINTS, icon: Users },
  { title: 'Consigue logros', detail: 'Cada insignia obtenida también suma.', points: RECOGNITION_POINTS, icon: Award },
];

export default function LeagueWelcome({ busy, error, onFinish }) {
  const heading = useRef(null);
  useEffect(() => { heading.current?.focus(); }, []);
  return <section data-league-welcome className="flex min-h-0 flex-1 flex-col px-5 pb-5">
    <div data-welcome-content className="min-h-0 flex-1 overflow-y-auto overscroll-contain pb-5 custom-scrollbar">
      <p className="mt-2 text-xs font-semibold uppercase tracking-wider text-brand-cyan-deep dark:text-brand-cyan">La liga del mes</p>
      <h2 ref={heading} tabIndex={-1} className="mt-2 text-3xl font-bold leading-tight text-zinc-900 outline-none dark:text-zinc-100">El buen trabajo suma</h2>
      <p className="mt-3 text-sm leading-6 text-zinc-600 dark:text-zinc-300">Los buenos hábitos merecen reconocimiento. Aquí cuentan los pendientes bien gestionados, los logros y la ayuda entre compañeros.</p>
      <div data-welcome-team className="mt-5 flex h-32 items-end justify-center gap-2 overflow-hidden rounded-3xl bg-brand-cyan/10 px-3 pt-5 dark:bg-brand-cyan/10" aria-label="El equipo al frente">
        {team.map(([key, name]) => <img key={key} src={pixelAvatars[key]} alt={name} draggable={false} className={`max-w-[18%] shrink-0 object-contain [image-rendering:pixelated] ${key === 'rodny' ? 'h-24' : 'h-20'}`} />)}
      </div>
      <h3 className="mb-1 mt-6 text-base font-bold text-zinc-900 dark:text-zinc-100">Así sumamos puntos</h3>
      <ul className="divide-y divide-zinc-200 dark:divide-white/10">
        {waysToScore.map(({ title, detail, points, icon: Icon }) => <li key={title} className="flex items-center gap-3 py-3.5">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white text-brand-cyan-deep dark:bg-zinc-900 dark:text-brand-cyan"><Icon aria-hidden="true" className="h-4 w-4" /></span>
          <div className="min-w-0 flex-1"><p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">{title}</p><p className="mt-1 text-xs leading-5 text-zinc-500 dark:text-zinc-400">{detail}</p></div>
          <span className="shrink-0 text-base font-bold text-brand-green-deep dark:text-brand-green">+{points} <span className="text-xs font-normal">pts</span></span>
        </li>)}
      </ul>
      <section data-welcome-gift className="mt-4 rounded-2xl border border-zinc-200 bg-white p-4 dark:border-white/10 dark:bg-zinc-900">
        <h3 className="flex items-center gap-2 text-base font-bold text-zinc-900 dark:text-zinc-100"><Hand aria-hidden="true" className="h-4 w-4 text-brand-cyan-deep dark:text-brand-cyan" />La ayuda también cuenta</h3>
        <p className="mt-3 text-sm leading-5 text-zinc-600 dark:text-zinc-300">Cada semana puedes regalar cinco puntos a una persona para agradecerle una ayuda o reconocer su trabajo.</p>
        <div className="mt-4 flex items-center gap-3">
          <img src={pixelAvatars.mariceth} alt="Mariceth" draggable={false} className="h-16 w-10 shrink-0 object-contain [image-rendering:pixelated]" />
          <span className="rounded-xl bg-brand-magenta/10 px-3 py-2 text-xl font-bold text-brand-magenta-deep dark:bg-brand-magenta/15 dark:text-brand-coral">+{KUDOS_WEEKLY}</span>
          <img src={pixelAvatars.elisa} alt="Elisa" draggable={false} className="h-16 w-10 shrink-0 object-contain [image-rendering:pixelated]" />
          <p className="min-w-0 text-xs leading-5 text-zinc-500 dark:text-zinc-400">No salen de tu puntaje. El cupo se renueva cada lunes.</p>
        </div>
      </section>
      <div className="mt-4 flex items-center gap-3 rounded-2xl bg-brand-yellow/10 p-3.5 dark:bg-brand-yellow/5"><CalendarDays aria-hidden="true" className="h-4 w-4 shrink-0 text-brand-yellow-deep dark:text-brand-yellow" /><div><p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Un nuevo comienzo cada mes</p><p className="mt-1 text-xs leading-5 text-zinc-500 dark:text-zinc-400">Los puntos vuelven a cero y el resultado se valida al cierre.</p></div></div>
      <div className="mt-5 grid grid-cols-3 gap-3 text-xs leading-5 text-zinc-500 dark:text-zinc-400">
        <p><strong className="block text-zinc-900 dark:text-zinc-100">Mi mes</strong>Puntos y hábitos</p>
        <p><strong className="block text-zinc-900 dark:text-zinc-100">Logros</strong>Insignias obtenidas</p>
        <p><strong className="block text-zinc-900 dark:text-zinc-100">Equipo</strong>Posiciones y regalos</p>
      </div>
    </div>
    <div className="shrink-0 border-t border-zinc-200 pt-3 dark:border-white/10">
      {error && <p role="alert" className="mb-3 text-sm text-destructive">{error}</p>}
      <Button className="w-full rounded-xl" disabled={busy} onClick={() => onFinish('COMPLETED')}>{busy ? 'Guardando…' : 'Conocer la liga'}<ArrowRight className="h-4 w-4" /></Button>
    </div>
  </section>;
}
