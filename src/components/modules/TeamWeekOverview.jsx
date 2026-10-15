import React, { useCallback, useEffect, useId, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertCircle, ArrowRight, ChevronDown } from '@/components/ui/icons';
import TeamAvatar from '@/components/ui/TeamAvatar';
import { getApiBaseUrl } from '@/lib/apiBaseUrl';
import { cn } from '@/lib/utils';
import WeeklyReadingCard from './WeeklyReadingCard';
import TeamLoadMap from './TeamLoadMap';
import AssignmentScenario from './AssignmentScenario';
import { RHYTHM_POLICY } from '@/lib/workPrediction';

const hours = (ms) => { const m = Math.round((ms || 0) / 60_000); return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h${m % 60 ? ` ${m % 60} min` : ''}`; };
const day = (value) => value ? new Intl.DateTimeFormat('es-CO', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'America/Bogota' }).format(new Date(`${value}T12:00:00Z`)) : 'Sin fecha';
const range = (a, b) => a == null || b == null ? 'Sin estimación comparable' : a === b ? hours(a) : `${hours(a)} a ${hours(b)}`;
const briefRange = (a, b) => {
  if (a == null || b == null) return 'Sin estimación completa';
  if (b < 3_600_000) return range(a, b);
  const low = Math.round(a / 3_600_000 * 2) / 2, high = Math.ceil(b / 3_600_000 * 2) / 2;
  const n = value => new Intl.NumberFormat('es-CO', { maximumFractionDigits: 1 }).format(value);
  return low === high ? `${n(low)} h` : `${n(low)}–${n(high)} h`;
};
const STATUS = {
  revisar: ['Revisar entregas', 'text-brand-coral-deep dark:text-brand-coral'],
  ajustada: ['Margen ajustado', 'text-brand-yellow-deep dark:text-brand-yellow'],
  con_espacio: ['Con espacio estimado', 'text-brand-green-deep dark:text-brand-green'],
  al_dia: ['Dentro de la capacidad', 'text-brand-cyan-deep dark:text-brand-cyan'],
  sin_datos: ['Falta información', 'text-zinc-600 dark:text-zinc-400']
};
const RISK = { vencida: 'Fecha vencida', riesgo: 'Supera la capacidad hasta esa fecha', ajustada: 'Margen ajustado', ok: 'Dentro de la capacidad estimada' };
const SOURCE = { persona: 'Misma persona, cliente y complejidad', sin_estimacion: 'Sin historial predictivo válido' };

function PersonRow({ person, people, until, onHistory }) {
  const [open, setOpen] = useState(false);
  const [scenario, setScenario] = useState(null);
  const detailId = useId();
  const [label, tone] = STATUS[person.status] || STATUS.sin_datos;
  return <li data-week-team-person={person.personId} className="border-t border-zinc-100 first:border-0 dark:border-zinc-800">
    <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} aria-controls={detailId} aria-label={`Ver tareas de ${person.personName}`} className="grid w-full grid-cols-[auto_1fr_auto] items-center gap-3 px-4 py-4 text-left hover:bg-zinc-50 focus-visible:outline-primary dark:hover:bg-zinc-900/60 sm:px-5 lg:grid-cols-[auto_minmax(150px,1.1fr)_minmax(150px,1fr)_minmax(145px,1fr)_auto]">
      <TeamAvatar member={{ name: person.personName, avatarUrl: person.avatarUrl }} size={36} className="h-9 w-9 shrink-0" />
      <span className="min-w-0"><span className="block truncate text-sm font-semibold text-zinc-950 dark:text-zinc-50">{person.personName}</span><span className={cn('block text-xs', tone)}>{label}</span><span className="mt-1 block text-[11px] text-zinc-500 dark:text-zinc-400">Hoy {hours(person.recordedTodayMs)} · semana {hours(person.recordedWeekMs)} cronometradas{person.hoursIncomplete ? ' (parciales)' : ''}</span></span>
      <span className="col-start-2 row-start-2 text-xs text-zinc-600 dark:text-zinc-400 lg:col-auto lg:row-auto"><span className="block font-medium tabular-nums text-zinc-800 dark:text-zinc-200">{briefRange(person.remainingMs, person.upperMs)} por hacer hasta {day(until)}</span>{person.confidence === 'suficiente' ? 'Historial comparable' : 'No se completa con supuestos'}{person.undatedCount > 0 && ` · ${person.undatedCount} sin fecha`}</span>
      <span className="col-start-2 text-xs text-zinc-600 dark:text-zinc-400 lg:col-auto"><span className="block">{person.overdueCount ? `${person.overdueCount} vencidas` : person.dueCount ? `${person.dueCount} entregas en el periodo` : 'Sin entregas fechadas en el periodo'}</span>{person.nextDueDay && <span className="block">Próxima: {day(person.nextDueDay)}</span>}</span>
      <ChevronDown className={cn('col-start-3 row-start-1 h-4 w-4 text-zinc-400 transition-transform lg:col-auto lg:row-auto', open && 'rotate-180')} />
    </button>
    {open && <div id={detailId} data-week-person-detail className="px-4 pb-5 sm:px-5">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2 border-t border-zinc-100 pt-3 text-xs text-zinc-600 dark:border-zinc-800 dark:text-zinc-400">
        <span>Capacidad nominal desde hoy hasta {day(until)}: {hours(person.capacityMs)} · Espacio con margen: {person.confidence === 'suficiente' ? hours(person.availableMs) : 'por confirmar'}</span>
        <button type="button" onClick={onHistory} className="min-h-11 font-medium text-brand-cyan-deep dark:text-brand-cyan">Ver historial del equipo <ArrowRight className="inline h-3 w-3" /></button>
      </div>
      <p className="mb-3 text-xs leading-5 text-zinc-500 dark:text-zinc-400">Tareas abiertas y estimación hasta cada vencimiento en los próximos 15 días hábiles. El cronómetro no mide el porcentaje terminado.</p>
      {person.tasks.length === 0 ? <p className="text-sm text-zinc-600 dark:text-zinc-400">No tiene tareas abiertas asignadas.</p> : <ul className="divide-y divide-zinc-100 dark:divide-zinc-800">
        {person.tasks.map(task => <li key={task.id} className="flex items-start justify-between gap-3 py-3">
          <div className="min-w-0"><p className="break-words text-sm font-medium text-zinc-900 dark:text-zinc-100">{task.title}</p><p className="text-xs text-zinc-500 dark:text-zinc-400">{task.clientName} · {day(task.dueDay)} · {range(task.remainingMs, task.upperMs)} por hacer</p>
            <p className={cn('mt-1 text-xs', ['riesgo', 'vencida'].includes(task.risk) ? STATUS.revisar[1] : 'text-zinc-600 dark:text-zinc-400')}>{task.dueDay ? RISK[task.risk] || (task.queueComplete === false ? 'No se puede prever: cola con datos insuficientes' : 'Sin previsión respaldada') : 'Asigna una fecha para prever esta entrega'} · {SOURCE[task.source]}{task.confidence === 'suficiente' && ` (${task.sample} mediciones)`}{task.needsReview ? ' · Revisa cuánto falta: ya alcanzó su tiempo habitual' : ''}{task.deadlineAt && ` · Límite ${new Intl.DateTimeFormat('es-CO', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Bogota' }).format(new Date(task.deadlineAt))}`}</p>
            {task.risk === 'riesgo' && <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">Hasta esa fecha: {hours(task.committedToDeadlineMs)} pendientes acumuladas frente a {hours(task.capacityToDeadlineMs)} de capacidad.</p>}
          </div>
          <div className="shrink-0"><Link to={`/gestion?taskId=${encodeURIComponent(task.id)}`} className="inline-flex min-h-11 items-center gap-1 text-xs font-medium text-brand-cyan-deep dark:text-brand-cyan">Abrir <ArrowRight className="h-3 w-3" /></Link>{task.clientId && <button type="button" aria-expanded={scenario === task.id} onClick={() => setScenario(scenario === task.id ? null : task.id)} className="block min-h-11 text-xs font-medium text-brand-cyan-deep dark:text-brand-cyan">{scenario === task.id ? 'Cerrar escenario' : 'Simular'}</button>}</div>
        </li>)}
      </ul>}
      {scenario && person.tasks.some(t => t.id === scenario) && <AssignmentScenario key={scenario} task={person.tasks.find(t => t.id === scenario)} personId={person.personId} people={people} />}
    </div>}
  </li>;
}

export default function TeamWeekOverview({ refreshKey = 0, onHistory }) {
  const [stored, setData] = useState(null), [error, setError] = useState('');
  const [selectedWindow, setSelectedWindow] = useState('week');
  const data = stored?.window === selectedWindow ? stored : null;
  const request = useRef(null);
  const [filter, setFilter] = useState('all'), [mapOpen, setMapOpen] = useState(false);
  const load = useCallback(async () => {
    request.current?.abort();
    const controller = new AbortController(); request.current = controller;
    setError('');
    try {
      const token = localStorage.getItem('authToken');
      const response = await fetch(`${getApiBaseUrl()}/api/manager/rhythm/load?window=${selectedWindow}`, { headers: { Authorization: token ? `Bearer ${token}` : '' }, signal: controller.signal });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || 'No pudimos leer la semana.');
      if (payload.forecast?.policy !== RHYTHM_POLICY) throw new Error('La previsión anterior necesita actualizarse. Intenta de nuevo en un momento.');
      if (!controller.signal.aborted) setData(payload.forecast || null);
      if (!payload.forecast) throw new Error('La previsión todavía no está disponible. Actualiza en un momento.');
    } catch (e) { if (controller.signal.aborted) return; console.error('[TeamWeekOverview] No se pudo leer la semana:', e.message || e); setError(e.message); }
  }, [selectedWindow]);
  useEffect(() => { load(); return () => request.current?.abort(); }, [load, refreshKey]);

  const people = [...(data?.people || [])].sort((a, b) => (b.overdueCount + b.riskCount + b.tightCount) - (a.overdueCount + a.riskCount + a.tightCount) || a.personName.localeCompare(b.personName, 'es'));
  const visible = people.filter(p => filter === 'attention' ? p.overdueCount + p.riskCount + p.tightCount > 0 : filter === 'space' ? p.canReceive : true);
  return <section className="space-y-5" aria-label="Previsión de la semana" data-forecast-window={data?.window}>
    <div className="flex flex-wrap gap-1" aria-label="Horizonte de la previsión">{[['today','Hoy'],['tomorrow','Mañana'],['week','Semana actual'],['next_week','Próxima semana']].map(([value,label]) => <button key={value} type="button" aria-pressed={selectedWindow === value} onClick={() => { setSelectedWindow(value); setFilter('all'); }} className={cn('min-h-11 rounded-lg px-3 text-xs font-medium', selectedWindow === value ? 'bg-zinc-200/70 text-zinc-950 dark:bg-zinc-800 dark:text-zinc-50' : 'text-zinc-600 dark:text-zinc-400')}>{label}</button>)}</div>
    {error && <div role="alert" className="brain-alert-surface rounded-2xl p-4 text-sm"><AlertCircle className="mr-2 inline h-4 w-4 text-destructive" />{error}<button type="button" onClick={load} className="ml-3 min-h-11 underline">Reintentar</button></div>}
    {!data && !error && <div role="status" className="h-52 animate-pulse rounded-2xl bg-zinc-200/70 dark:bg-zinc-900"><span className="sr-only">Leyendo la semana…</span></div>}
    {data && <>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div><h2 className="text-base font-semibold text-zinc-950 dark:text-zinc-50">{selectedWindow === 'today' ? 'Hoy' : selectedWindow === 'tomorrow' ? 'El próximo día hábil' : data.nextWeek ? 'La próxima semana' : 'Lo que queda de esta semana'}</h2><p className="mt-1 text-xs text-zinc-600 dark:text-zinc-400">{data.days.length ? `${day(data.days[0])} — ${day(data.days.at(-1))}` : 'Hoy no es un día hábil'} · Previsión según tareas abiertas e historial de 90 días.</p></div>
      </div>
      <div className="grid gap-3 sm:grid-cols-3" aria-label="Resumen de la semana">
        {[
          ['all', 'Entregas previstas', data.summary.dueCount, 'Con vencimiento en el periodo', 'text-brand-cyan-deep dark:text-brand-cyan'],
          ['attention', 'Necesitan revisión', data.summary.attentionCount, 'Vencidas o con poco margen', 'text-brand-coral-deep dark:text-brand-coral'],
          ['space', 'Pueden recibir trabajo', data.summary.withSpace, 'Personas con espacio estimado', 'text-brand-green-deep dark:text-brand-green']
        ].map(([key, label, value, hint, tone]) => <button type="button" key={key} aria-pressed={filter === key} onClick={() => setFilter(key)} className={cn('rounded-2xl border bg-white p-4 text-left dark:bg-zinc-950', filter === key ? 'border-brand-cyan dark:border-brand-cyan' : 'border-zinc-200 dark:border-zinc-800')}><span className="block text-xs font-medium text-zinc-600 dark:text-zinc-400">{label}</span><span className={cn('mt-2 block text-3xl font-semibold tabular-nums', tone)}>{value}</span><span className="mt-1 block text-xs text-zinc-500 dark:text-zinc-400">{hint}</span></button>)}
      </div>
      <div className="text-xs leading-5 text-zinc-600 dark:text-zinc-400" data-forecast-confidence>
        <p>Estimación con jornada de 8 h; no incluye reuniones ni ausencias.{data.summary.unknownCount > 0 && ` Hay ${data.summary.unknownCount} tareas sin estimación comparable: los riesgos no están completamente evaluados.`}{data.summary.undatedCount > 0 && ` Hay ${data.summary.undatedCount} tareas sin fecha: falta información.`}{data.incomplete && ' La consulta está incompleta: revisa Gestión.'}</p>
        <details className="mt-1"><summary className="cursor-pointer w-fit">Cómo se calcula</summary><p className="mt-1 max-w-3xl">Se reparte el trabajo pendiente desde hoy hasta cada vencimiento, empezando por las tareas vencidas. Hoy solo cuenta la fracción restante de la franja 8:00–18:00 de Bogotá. Solo se estiman formatos concretos con la misma persona, cliente y complejidad, tres mediciones válidas, cobertura de la mitad y sin diferencias de cuatro veces entre tiempos. El rango usa mediana y percentil 75; no se completa con referencias ajenas ni horas supuestas. No garantiza una entrega ni representa porcentaje terminado. Con menos de tres mediciones comparables, relojes fuera de lo habitual o tareas sin fecha, el espacio queda por confirmar.</p></details>
      </div>
      <section className="overflow-hidden rounded-2xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950" aria-labelledby="week-team-title">
        <div className="flex items-center justify-between gap-3 px-4 py-4 sm:px-5"><h3 id="week-team-title" className="text-sm font-semibold text-zinc-950 dark:text-zinc-50">{filter === 'attention' ? 'Dónde mirar primero' : filter === 'space' ? 'Quién tiene espacio' : 'El equipo esta semana'}</h3>{filter !== 'all' && <button type="button" onClick={() => setFilter('all')} className="min-h-11 text-xs font-medium text-brand-cyan-deep dark:text-brand-cyan">Ver todo el equipo</button>}</div>
        <ul>{visible.map(person => <PersonRow key={person.personId} person={person} people={data.people} until={data.weekEnd} onHistory={onHistory} />)}</ul>
        {!visible.length && <p className="px-5 pb-5 text-sm text-zinc-600 dark:text-zinc-400">{filter === 'space' ? 'No hay espacio confirmado con la información disponible.' : filter === 'attention' ? data.summary.unknownCount ? 'Faltan estimaciones comparables para confirmar el margen de todas las entregas.' : 'No se detectan entregas con poco margen en este periodo.' : 'No hay personas activas en el equipo.'}</p>}
      </section>
    </>}
    <WeeklyReadingCard refreshKey={refreshKey} compact />
    <details onToggle={e => setMapOpen(e.currentTarget.open)} className="rounded-2xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
      <summary className="cursor-pointer px-5 py-4 text-sm font-medium text-zinc-700 dark:text-zinc-300">Explorar las fechas de entrega · próximos 10 días hábiles</summary>
      {mapOpen && <div className="px-3 pb-3"><p className="px-2 pb-3 text-xs text-zinc-500 dark:text-zinc-400">Este mapa agrupa entregas por vencimiento; la previsión de arriba cuenta los días anteriores disponibles para trabajarlas.</p><TeamLoadMap refreshKey={refreshKey} /></div>}
    </details>
  </section>;
}
