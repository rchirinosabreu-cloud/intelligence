import React, { useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { ArrowRight, Check, Clock, Layers, Video, Zap } from '@/components/ui/icons';
import { pixelAvatars } from './pixelAvatars';
import LeagueTour from './LeagueTour';
import { CAMERA_POINTS, HABIT_POINTS, EXTRA_POINTS, KUDOS_WEEKLY, MEETING_POINTS, RECOGNITION_POINTS } from '@/lib/platformLeague';

// Presentación breve de las reglas del lunes 23 de noviembre de 2026 (Rodny, 21 de noviembre: «sería genial tener una
// presentación breve»). La primera vez (`interactive`) es el recorrido animado de `LeagueTour`; después, «Ver bienvenida»
// enseña este resumen fijo de una sola página: primero lo que cambia, después lo que sigue igual.
const team = [['elisa', 'Elisa'], ['jesu', 'Jesu'], ['rodny', 'Rodny'], ['helen', 'Helen'], ['melissa', 'Melissa']];
const changes = [
  { title: 'Tu área también suma', detail: 'Los registros de Financiero, las gestiones del CRM y las jornadas de producción con evidencia ya cuentan como esfuerzo.', icon: Layers },
  { title: 'Cada hábito, con tu trabajo', detail: 'Los hábitos se miden con lo que hace tu área. El que no te aplica no juega en tu día.', icon: Check },
  { title: 'Al día cierra a las 5:00 p. m.', detail: 'Lo ganas si a esa hora no tienes nada vencido, sin mover fechas.', icon: Clock },
  { title: 'Cámara encendida en tráfico', detail: 'Un administrador la marca después de la reunión.', points: `+${CAMERA_POINTS}`, icon: Video },
  { title: 'Entrega anticipada', detail: '5 puntos la primera del día y 2 la segunda.', points: 'hasta 7', icon: Zap },
];
const same = [
  ['Cada hábito cumplido', HABIT_POINTS], ['Primera actividad desde las 8:00 a. m.', EXTRA_POINTS], ['Llegar primero a tráfico', MEETING_POINTS],
  ['Cada logro', RECOGNITION_POINTS], ['Regalo semanal a un compañero', KUDOS_WEEKLY],
];

export default function LeagueWelcome({ interactive, ...props }) {
  return interactive ? <LeagueTour {...props} /> : <LeagueSummary {...props} />;
}

function LeagueSummary({ busy, error, onFinish }) {
  const heading = useRef(null);
  useEffect(() => { heading.current?.focus(); }, []);
  return <section data-league-welcome className="flex min-h-0 flex-1 flex-col px-5 pb-5">
    <div data-welcome-content className="min-h-0 flex-1 overflow-y-auto overscroll-contain pb-5 custom-scrollbar">
      <p className="mt-2 text-xs font-medium text-brand-cyan-deep dark:text-brand-cyan">Novedades · desde el lunes 23 de noviembre</p>
      <h2 ref={heading} tabIndex={-1} className="mt-2 text-3xl font-bold leading-tight text-zinc-900 outline-none dark:text-zinc-100">El buen trabajo suma</h2>
      <p className="mt-3 text-sm leading-6 text-zinc-600 dark:text-zinc-300">Ajustamos las reglas para que todas las áreas tengan la misma oportunidad de sumar.</p>
      <div data-welcome-team className="mt-5 flex h-28 items-end justify-center gap-2 overflow-hidden rounded-3xl bg-brand-cyan/10 px-3 pt-4 dark:bg-brand-cyan/10" aria-label="El equipo al frente">
        {team.map(([key, name]) => <img key={key} src={pixelAvatars[key]} alt={name} draggable={false} className={`max-w-[18%] shrink-0 object-contain [image-rendering:pixelated] ${key === 'rodny' ? 'h-20' : 'h-16'}`} />)}
      </div>
      <h3 className="mb-1 mt-6 text-base font-bold text-zinc-900 dark:text-zinc-100">Lo que cambia</h3>
      <ul data-welcome-changes className="divide-y divide-zinc-200 dark:divide-white/10">
        {changes.map(({ title, detail, points, icon: Icon }) => <li key={title} className="flex items-start gap-3 py-3.5">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white text-brand-cyan-deep dark:bg-zinc-900 dark:text-brand-cyan"><Icon aria-hidden="true" className="h-4 w-4" /></span>
          <div className="min-w-0 flex-1"><p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">{title}</p><p className="mt-1 text-xs leading-5 text-zinc-500 dark:text-zinc-400">{detail}</p></div>
          {points && <span className="shrink-0 whitespace-nowrap pt-0.5 text-sm font-bold text-brand-green-deep dark:text-brand-green">{points} <span className="text-xs font-normal">pts</span></span>}
        </li>)}
      </ul>
      <section data-welcome-same className="mt-4 rounded-2xl border border-zinc-200 bg-white p-4 dark:border-white/10 dark:bg-zinc-900">
        <h3 className="text-base font-bold text-zinc-900 dark:text-zinc-100">Lo que sigue igual</h3>
        <ul className="mt-2">
          {same.map(([label, points]) => <li key={label} className="flex items-baseline justify-between gap-3 py-1.5 text-sm text-zinc-600 dark:text-zinc-300">
            <span className="min-w-0">{label}</span><span className="shrink-0 font-bold text-brand-green-deep dark:text-brand-green">+{points}</span>
          </li>)}
        </ul>
        <p className="mt-2 text-xs leading-5 text-zinc-500 dark:text-zinc-400">La liga empieza de cero cada mes. Los días anteriores al lunes 23 quedan como se jugaron.</p>
      </section>
    </div>
    <div className="shrink-0 border-t border-zinc-200 pt-3 dark:border-white/10">
      {error && <p role="alert" className="mb-3 text-sm text-destructive">{error}</p>}
      <Button className="w-full rounded-xl" disabled={busy} onClick={() => onFinish('COMPLETED')}>{busy ? 'Guardando…' : 'Entendido'}<ArrowRight className="h-4 w-4" /></Button>
    </div>
  </section>;
}
