import React, { Suspense, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { CalendarDays, ExternalLink, FileText, Loader2, MapPin, Plus } from '@/components/ui/icons';
import { BrainMonthPicker } from '@/components/ui/BrainDatePicker';
import { useNavigateFrom } from '@/components/layout/BackToOrigin';
import { getApiBaseUrl } from '@/lib/apiBaseUrl';
import { bogotaDate } from '@/lib/colombiaBusinessDays';
import { cn } from '@/lib/utils';
import { PRODUCTION_DAY_STATES, monthBoardRows, proposedJornadaDate } from '@/lib/productionDays';
import { shortDate } from '@/lib/clientOperations';
import { lazyWithRecovery } from '@/pwa/preloadRecovery';

// La pestaña «Jornadas» de Clientes (Rodny, 12 de noviembre de 2026): reemplaza el Excel «Seguimiento jornadas de
// producción». Un mes, todas las jornadas de todos los clientes con las columnas del Excel, y en la misma tabla lo que
// cada contrato pide y todavía no está agendado («No agendada»). Esas se agendan desde la fila: su estado abre el
// mismo formulario de evento del calendario de Actividad, con el cliente ya elegido.

// El formulario del calendario es pesado; solo se descarga cuando alguien va a agendar.
const OperationalCalendar = lazyWithRecovery(() => import('@/components/modules/Activity/OperationalCalendar'));

const STATE_TONE = {
  AGENDADA: 'border-zinc-200 bg-zinc-50 text-zinc-600 dark:border-white/10 dark:bg-white/5 dark:text-zinc-300',
  SIN_EVIDENCIA: 'border-brand-yellow/50 bg-brand-yellow/10 text-zinc-800 dark:text-zinc-100',
  REALIZADA: 'border-brand-green/40 bg-brand-green/10 text-brand-green-deep dark:text-brand-green',
  NO_AGENDADA: 'border-dashed border-brand-magenta/50 bg-brand-magenta/5 text-brand-magenta-deep hover:bg-brand-magenta/10 dark:text-brand-magenta-soft',
};
const LINK = 'inline-flex min-h-9 items-center gap-1 rounded-lg px-2 text-xs font-semibold text-brand-cyan-deep hover:bg-brand-cyan/10 dark:text-brand-cyan';
const COLUMNS = 'lg:grid-cols-[4.5rem_minmax(0,1.2fr)_7rem_minmax(0,1fr)_minmax(0,1fr)_8.5rem_14rem]';

const fetchMonth = async (monthKey) => {
  const [year, month] = monthKey.split('-').map(Number);
  const res = await fetch(`${getApiBaseUrl()}/api/client-operations/jornadas?year=${year}&month=${month}`, {
    headers: { Authorization: `Bearer ${localStorage.getItem('authToken')}` },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) { console.error('[Jornadas] Error del servidor:', body); throw new Error(body.error || 'No se pudieron leer las jornadas.'); }
  return body;
};

function Summary({ summary, unscheduled }) {
  const cells = [
    ['Jornadas', summary.total, 'text-zinc-900 dark:text-zinc-50'],
    ['Realizadas', summary.done, 'text-brand-green-deep dark:text-brand-green'],
    ['Falta la evidencia', summary.missingEvidence, 'text-zinc-800 dark:text-brand-yellow'],
    ['Agendadas', summary.scheduled, 'text-zinc-600 dark:text-zinc-300'],
    ['No agendadas', unscheduled, 'text-brand-magenta-deep dark:text-brand-magenta-soft'],
  ];
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5" data-production-month-summary>
      {cells.map(([label, value, tone]) => (
        <div key={label} className="brain-glass p-4">
          <p className="text-xs text-zinc-500 dark:text-zinc-400">{label}</p>
          <p className={cn('mt-1 text-2xl font-bold tabular-nums', tone)}>{value}</p>
        </div>
      ))}
    </div>
  );
}

function DayRow({ item, onOpen, onSchedule }) {
  const state = PRODUCTION_DAY_STATES[item.state] || PRODUCTION_DAY_STATES.AGENDADA;
  const unscheduled = item.state === 'NO_AGENDADA';
  const chip = cn('inline-block rounded-full border px-2 py-0.5 text-xs font-semibold', STATE_TONE[item.state]);
  return (
    <li className={cn('grid grid-cols-1 gap-2 px-4 py-3 sm:px-6 lg:items-center lg:gap-4', COLUMNS)} data-production-month-row={item.state}>
      <span className={cn('text-sm font-semibold tabular-nums', unscheduled ? 'text-zinc-400 dark:text-zinc-500 max-lg:hidden' : 'text-zinc-800 dark:text-zinc-100')}>{unscheduled ? 'Sin fecha' : shortDate(item.date)}</span>
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
      <span>
        {unscheduled ? (
          // El estado es el botón (Rodny: «si le doy click a su estado podría abrirse allí el panel del calendario»).
          <button type="button" onClick={() => onSchedule(item)} className={cn(chip, 'min-h-7 transition')} title={state.hint} data-production-schedule={item.clientId}>
            {state.label}
          </button>
        ) : <span className={chip} title={state.hint}>{state.label}</span>}
      </span>
      <span className="flex flex-wrap items-center gap-1 lg:justify-end">
        {item.scriptUrl && <a href={item.scriptUrl} target="_blank" rel="noreferrer noopener" className={LINK}><FileText className="h-3.5 w-3.5" />Guion</a>}
        {item.evidenceUrl && <a href={item.evidenceUrl} target="_blank" rel="noreferrer noopener" className={LINK}>Evidencias<ExternalLink className="h-3.5 w-3.5" /></a>}
        {unscheduled ? (
          <button type="button" onClick={() => onSchedule(item)} className={LINK}><Plus className="h-3.5 w-3.5" />Agendar</button>
        ) : item.taskId ? (
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
  const [scheduling, setScheduling] = useState(null);
  const { data, isLoading, isError, error } = useQuery({ queryKey: ['production-days-month', monthKey], queryFn: () => fetchMonth(monthKey), staleTime: 30_000 });
  const rows = useMemo(() => (data ? monthBoardRows(data.items, data.pending) : []), [data]);
  const unscheduled = rows.length - (data?.items?.length || 0);
  const schedule = (item) => setScheduling({
    date: proposedJornadaDate(monthKey, bogotaDate(Date.now())),
    clientId: item.clientId,
    clientName: item.clientName,
  });
  return (
    <div className="space-y-6" data-production-days-board>
      <div className="brain-glass flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-base font-semibold text-zinc-900 dark:text-zinc-50">Jornadas de producción</p>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">Cada jornada es un evento de Producción del calendario: crea su pendiente y queda realizada con su entrega. Las que el contrato pide y faltan se agendan desde su fila.</p>
        </div>
        <label className="flex items-center gap-2 text-sm text-zinc-600 dark:text-zinc-300">
          <span className="shrink-0">Mes</span>
          <BrainMonthPicker ariaLabel="Mes de las jornadas" value={monthKey} onChange={(value) => value && setMonthKey(value)} className="w-56" />
        </label>
      </div>

      {isLoading ? (
        <div className="flex min-h-[30vh] items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-brand-cyan" /></div>
      ) : isError ? (
        <p role="alert" className="brain-alert-surface rounded-xl p-4 text-sm">{error.message}</p>
      ) : (
        <>
          <Summary summary={data.summary} unscheduled={unscheduled} />
          <section className="overflow-hidden rounded-3xl border border-zinc-200 bg-white dark:border-white/10 dark:bg-zinc-900" aria-label="Jornadas del mes">
            <div className={cn('hidden border-b border-zinc-100 bg-zinc-50/60 px-6 py-3 text-xs font-medium text-zinc-500 dark:border-white/5 dark:bg-white/[0.02] lg:grid lg:gap-4', COLUMNS)}>
              <span>Fecha</span><span>Cliente</span><span>Horario</span><span>Lugar</span><span>Responsable</span><span>Estado</span><span />
            </div>
            {rows.length ? (
              <ul className="divide-y divide-zinc-100 dark:divide-white/5">
                {rows.map((item) => <DayRow key={item.id} item={item} onOpen={navigateFrom} onSchedule={schedule} />)}
              </ul>
            ) : <p className="p-10 text-center text-sm text-zinc-500">No hay jornadas este mes.</p>}
          </section>
        </>
      )}

      {scheduling && (
        <Suspense fallback={null}>
          <OperationalCalendar createRequest={scheduling} onClose={() => setScheduling(null)} />
        </Suspense>
      )}
    </div>
  );
}
