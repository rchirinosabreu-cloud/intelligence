import React from 'react';
import { CalendarDays, ExternalLink } from '@/components/ui/icons';
import { useNavigateFrom } from '@/components/layout/BackToOrigin';
import { cn } from '@/lib/utils';
import { shortDate } from '@/lib/clientOperations';
import { PRODUCTION_DAY_STATES } from '@/lib/productionDays';

// Jornadas de producción del ciclo (reunión de Rodny con su jefe, 10 de noviembre de 2026): cuántas lleva frente a las
// contratadas y cuáles ya tienen su evidencia. Se agendan y se dan por hechas desde el evento del calendario.

const STATE_TONE = {
  AGENDADA: 'border-zinc-200 bg-zinc-50 text-zinc-600 dark:border-white/10 dark:bg-white/5 dark:text-zinc-300',
  SIN_EVIDENCIA: 'border-brand-yellow/50 bg-brand-yellow/10 text-zinc-800 dark:text-zinc-100',
  REALIZADA: 'border-brand-green/40 bg-brand-green/10 text-brand-green-deep dark:text-brand-green',
};

export const calendarPathFor = (day) => `/actividad?vista=calendario&evento=${encodeURIComponent(day.eventId)}&fecha=${day.date}`;

export default function ProductionDaysSection({ production, cardClassName, titleClassName }) {
  const navigateFrom = useNavigateFrom();
  if (!production) return null;
  const items = production.items || [];
  const summary = production.contracted
    ? `${production.done} de ${production.contracted} ${production.contracted === 1 ? 'realizada' : 'realizadas'}`
    : `${production.done} ${production.done === 1 ? 'realizada' : 'realizadas'}`;
  return (
    <section className={cn(cardClassName, 'scroll-mt-24 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary')}
      id="client-operation-production" tabIndex={-1} aria-label="Jornadas de producción" data-production-days>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className={titleClassName}>Jornadas de producción · {production.label}</h2>
        <span className="text-sm font-semibold tabular-nums text-zinc-700 dark:text-zinc-200" data-production-summary>{summary}</span>
      </div>
      <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">Una jornada cuenta como realizada cuando tiene el enlace del Drive con sus evidencias. Se agenda en el calendario de Actividad y ahí se sube la evidencia.</p>
      {items.length ? (
        <ul className="mt-3 divide-y divide-zinc-100 dark:divide-white/5">
          {items.map((day) => {
            const state = PRODUCTION_DAY_STATES[day.state] || PRODUCTION_DAY_STATES.AGENDADA;
            return (
              <li key={day.id} className="flex flex-col gap-1.5 py-2.5 sm:flex-row sm:items-center sm:gap-3" data-production-day={day.state}>
                <span className="flex min-w-0 flex-1 items-baseline gap-3">
                  <span className="w-14 shrink-0 text-sm tabular-nums text-zinc-700 dark:text-zinc-200">{shortDate(day.date)}</span>
                  <span className="min-w-0 flex-1 truncate text-sm text-zinc-800 dark:text-zinc-100" title={day.title}>{day.title}</span>
                </span>
                <span className="flex shrink-0 flex-wrap items-center gap-2 pl-[4.25rem] sm:pl-0">
                <span className={cn('shrink-0 rounded-full border px-2 py-0.5 text-xs font-semibold', STATE_TONE[day.state])} title={state.hint}>{state.label}</span>
                {day.evidenceUrl ? (
                  <a href={day.evidenceUrl} target="_blank" rel="noreferrer noopener"
                    className="inline-flex min-h-9 shrink-0 items-center gap-1 rounded-lg px-2 text-xs font-semibold text-brand-cyan-deep hover:bg-brand-cyan/10 dark:text-brand-cyan">
                    Evidencias<ExternalLink className="h-3.5 w-3.5" />
                  </a>
                ) : day.eventId ? (
                  <button type="button" onClick={() => navigateFrom(calendarPathFor(day))}
                    className="inline-flex min-h-9 shrink-0 items-center gap-1 rounded-lg px-2 text-xs font-semibold text-brand-cyan-deep hover:bg-brand-cyan/10 dark:text-brand-cyan">
                    <CalendarDays className="h-3.5 w-3.5" />Abrir en el calendario
                  </button>
                ) : null}
                </span>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="mt-3 rounded-xl border border-dashed border-zinc-300 p-4 text-sm text-zinc-500 dark:border-white/15">
          {production.contracted ? `No hay jornadas ligadas en ${production.label.toLowerCase()}. Agéndala en el calendario de Actividad como evento de Producción y elige este cliente.` : 'No hay jornadas ligadas en este ciclo.'}
        </p>
      )}
    </section>
  );
}
