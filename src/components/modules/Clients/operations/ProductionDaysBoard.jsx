import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { CalendarDays, ExternalLink, FileText, Loader2, MapPin } from '@/components/ui/icons';
import { BrainMonthPicker } from '@/components/ui/BrainDatePicker';
import { useNavigateFrom } from '@/components/layout/BackToOrigin';
import { getApiBaseUrl } from '@/lib/apiBaseUrl';
import { bogotaDate } from '@/lib/colombiaBusinessDays';
import { cn } from '@/lib/utils';
import { PRODUCTION_DAY_STATES } from '@/lib/productionDays';
import { shortDate } from '@/lib/clientOperations';

// La pestaña «Jornadas» de Clientes (Rodny, 12 de noviembre de 2026): reemplaza el Excel «Seguimiento jornadas de
// producción». Un mes, todas las jornadas de todos los clientes con las columnas del Excel, y lo que cada contrato pide
// y todavía no está agendado (lo que en el Excel era «Por realizar» sin fecha). Las jornadas se agendan en el calendario
// de Actividad; aquí se leen.

const STATE_TONE = {
  AGENDADA: 'border-zinc-200 bg-zinc-50 text-zinc-600 dark:border-white/10 dark:bg-white/5 dark:text-zinc-300',
  SIN_EVIDENCIA: 'border-brand-yellow/50 bg-brand-yellow/10 text-zinc-800 dark:text-zinc-100',
  REALIZADA: 'border-brand-green/40 bg-brand-green/10 text-brand-green-deep dark:text-brand-green',
};
const LINK = 'inline-flex min-h-9 items-center gap-1 rounded-lg px-2 text-xs font-semibold text-brand-cyan-deep hover:bg-brand-cyan/10 dark:text-brand-cyan';

const fetchMonth = async (monthKey) => {
  const [year, month] = monthKey.split('-').map(Number);
  const res = await fetch(`${getApiBaseUrl()}/api/client-operations/jornadas?year=${year}&month=${month}`, {
    headers: { Authorization: `Bearer ${localStorage.getItem('authToken')}` },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) { console.error('[Jornadas] Error del servidor:', body); throw new Error(body.error || 'No se pudieron leer las jornadas.'); }
  return body;
};

function Summary({ summary }) {
  const cells = [
    ['Jornadas', summary.total, 'text-zinc-900 dark:text-zinc-50'],
    ['Realizadas', summary.done, 'text-brand-green-deep dark:text-brand-green'],
    ['Falta la evidencia', summary.missingEvidence, 'text-zinc-800 dark:text-brand-yellow'],
    ['Agendadas', summary.scheduled, 'text-zinc-600 dark:text-zinc-300'],
  ];
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4" data-production-month-summary>
      {cells.map(([label, value, tone]) => (
        <div key={label} className="brain-glass p-4">
          <p className="text-xs text-zinc-500 dark:text-zinc-400">{label}</p>
          <p className={cn('mt-1 text-2xl font-bold tabular-nums', tone)}>{value}</p>
        </div>
      ))}
    </div>
  );
}

function DayRow({ item, onOpen }) {
  const state = PRODUCTION_DAY_STATES[item.state] || PRODUCTION_DAY_STATES.AGENDADA;
  return (
    <li className="grid grid-cols-1 gap-2 px-4 py-3 sm:px-6 lg:grid-cols-[4.5rem_minmax(0,1.2fr)_7rem_minmax(0,1fr)_minmax(0,1fr)_8.5rem_14rem] lg:items-center lg:gap-4" data-production-month-row={item.state}>
      <span className="text-sm font-semibold tabular-nums text-zinc-800 dark:text-zinc-100">{shortDate(item.date)}</span>
      <span className="min-w-0">
        <span className="block truncate font-semibold text-zinc-900 dark:text-zinc-50">{item.clientName || 'Sin cliente'}</span>
        <span className="block truncate text-xs text-zinc-500 dark:text-zinc-400" title={item.title}>{item.title}</span>
      </span>
      {/* En celular un dato que falta no ocupa una línea con un guion suelto. */}
      <span className={cn('text-xs tabular-nums text-zinc-600 dark:text-zinc-300', !item.schedule && 'max-lg:hidden')}>{item.schedule || '—'}</span>
      <span className={cn('flex min-w-0 items-center gap-1 text-xs text-zinc-600 dark:text-zinc-300', !item.location && 'max-lg:hidden')}>
        {item.location ? <><MapPin className="h-3.5 w-3.5 shrink-0 text-zinc-400" /><span className="truncate" title={item.location}>{item.location}</span></> : '—'}
      </span>
      <span className={cn('truncate text-xs text-zinc-600 dark:text-zinc-300', !item.responsible && 'max-lg:hidden')} title={item.responsible || ''}>{item.responsible || '—'}</span>
      <span><span className={cn('inline-block rounded-full border px-2 py-0.5 text-xs font-semibold', STATE_TONE[item.state])} title={state.hint}>{state.label}</span></span>
      <span className="flex flex-wrap items-center gap-1 lg:justify-end">
        {item.scriptUrl && <a href={item.scriptUrl} target="_blank" rel="noreferrer noopener" className={LINK}><FileText className="h-3.5 w-3.5" />Guion</a>}
        {item.evidenceUrl && <a href={item.evidenceUrl} target="_blank" rel="noreferrer noopener" className={LINK}>Evidencias<ExternalLink className="h-3.5 w-3.5" /></a>}
        {item.taskId ? (
          <button type="button" onClick={() => onOpen(`/gestion?taskId=${encodeURIComponent(item.taskId)}`)} className={LINK}>Pendiente</button>
        ) : item.eventId ? (
          <button type="button" onClick={() => onOpen(`/actividad?vista=calendario&evento=${encodeURIComponent(item.eventId)}&fecha=${item.date}`)} className={LINK}><CalendarDays className="h-3.5 w-3.5" />Evento</button>
        ) : null}
      </span>
    </li>
  );
}

export default function ProductionDaysBoard() {
  const navigateFrom = useNavigateFrom();
  const [monthKey, setMonthKey] = useState(() => `${bogotaDate(Date.now()).slice(0, 7)}-01`);
  const { data, isLoading, isError, error } = useQuery({ queryKey: ['production-days-month', monthKey], queryFn: () => fetchMonth(monthKey), staleTime: 30_000 });
  return (
    <div className="space-y-6" data-production-days-board>
      <div className="brain-glass flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-base font-semibold text-zinc-900 dark:text-zinc-50">Jornadas de producción</p>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">Se agendan en el calendario de Actividad como evento de Producción; cada una crea su pendiente y queda realizada con su entrega.</p>
        </div>
        <label className="flex items-center gap-2 text-sm text-zinc-600 dark:text-zinc-300">
          <span className="shrink-0">Mes</span>
          <BrainMonthPicker ariaLabel="Mes de las jornadas" value={monthKey} onChange={(value) => value && setMonthKey(value)} className="min-h-11 rounded-xl" />
        </label>
      </div>

      {isLoading ? (
        <div className="flex min-h-[30vh] items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-brand-cyan" /></div>
      ) : isError ? (
        <p role="alert" className="brain-alert-surface rounded-xl p-4 text-sm">{error.message}</p>
      ) : (
        <>
          <Summary summary={data.summary} />
          <section className="overflow-hidden rounded-3xl border border-zinc-200 bg-white dark:border-white/10 dark:bg-zinc-900" aria-label="Jornadas del mes">
            <div className="hidden border-b border-zinc-100 bg-zinc-50/60 px-6 py-3 text-xs font-medium text-zinc-500 dark:border-white/5 dark:bg-white/[0.02] lg:grid lg:grid-cols-[4.5rem_minmax(0,1.2fr)_7rem_minmax(0,1fr)_minmax(0,1fr)_8.5rem_14rem] lg:gap-4">
              <span>Fecha</span><span>Cliente</span><span>Horario</span><span>Lugar</span><span>Responsable</span><span>Estado</span><span />
            </div>
            {data.items.length ? (
              <ul className="divide-y divide-zinc-100 dark:divide-white/5">
                {data.items.map((item) => <DayRow key={item.id} item={item} onOpen={navigateFrom} />)}
              </ul>
            ) : <p className="p-10 text-center text-sm text-zinc-500">No hay jornadas este mes.</p>}
          </section>
          {data.pending.length > 0 && (
            <section className="rounded-3xl border border-zinc-200 bg-white p-5 dark:border-white/10 dark:bg-zinc-900 sm:p-6" aria-label="Por agendar" data-production-month-pending>
              <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-50">Por agendar este mes</h2>
              <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">Clientes cuyo contrato pide jornadas que todavía no están en el calendario.</p>
              <ul className="mt-3 flex flex-wrap gap-2">
                {data.pending.map((row) => (
                  <li key={row.client.id}>
                    <button type="button" onClick={() => navigateFrom(`/clientes/operacion/${row.client.slug}`)}
                      className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-zinc-200 px-3 text-sm hover:border-brand-cyan/50 dark:border-white/10">
                      <span className="font-semibold text-zinc-900 dark:text-zinc-50">{row.client.name}</span>
                      <span className="text-xs text-zinc-500 dark:text-zinc-400">falta{row.missing === 1 ? '' : 'n'} {row.missing} de {row.contracted}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}
    </div>
  );
}
