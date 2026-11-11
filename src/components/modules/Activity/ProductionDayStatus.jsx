import React from 'react';
import { ExternalLink } from '@/components/ui/icons';
import { useNavigateFrom } from '@/components/layout/BackToOrigin';
import { cn } from '@/lib/utils';
import { PRODUCTION_DAY_STATES } from '@/lib/productionDays';

// En qué va la jornada, en una línea dentro del evento (Rodny, 10 de noviembre de 2026: «es demasiado espacio»). La
// evidencia ya no se sube aquí: es la entrega del pendiente que la jornada crea en Gestión.

const STATE_TONE = {
  AGENDADA: 'border-zinc-200 bg-zinc-50 text-zinc-600 dark:border-white/10 dark:bg-white/5 dark:text-zinc-300',
  SIN_EVIDENCIA: 'border-brand-yellow/50 bg-brand-yellow/10 text-zinc-800 dark:text-zinc-100',
  REALIZADA: 'border-brand-green/40 bg-brand-green/10 text-brand-green-deep dark:text-brand-green',
};

export default function ProductionDayStatus({ view }) {
  const navigateFrom = useNavigateFrom();
  const day = view?.productionDay;
  if (!day) return null;
  const state = PRODUCTION_DAY_STATES[day.state] || PRODUCTION_DAY_STATES.AGENDADA;
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-xl border border-zinc-200 px-3 py-2 text-xs dark:border-white/10" data-production-day-status={day.state}>
      <span className={cn('rounded-full border px-2 py-0.5 font-semibold', STATE_TONE[day.state])} title={state.hint}>{state.label}</span>
      <span className="min-w-0 flex-1 text-zinc-600 dark:text-zinc-300">
        {day.state === 'REALIZADA' ? 'Tiene su entrega con las evidencias.' : 'Queda realizada cuando su pendiente en Gestión tenga la entrega con las evidencias.'}
      </span>
      {day.evidenceUrl && (
        <a href={day.evidenceUrl} target="_blank" rel="noreferrer noopener" className="inline-flex min-h-8 items-center gap-1 font-semibold text-brand-cyan-deep hover:underline dark:text-brand-cyan">
          Evidencias<ExternalLink className="h-3.5 w-3.5" />
        </a>
      )}
      {day.taskId && (
        <button type="button" onClick={() => navigateFrom(`/gestion?taskId=${encodeURIComponent(day.taskId)}`)}
          className="min-h-8 rounded-lg px-2 font-semibold text-brand-cyan-deep hover:bg-brand-cyan/10 dark:text-brand-cyan" data-production-day-task>
          Abrir pendiente
        </button>
      )}
    </div>
  );
}
