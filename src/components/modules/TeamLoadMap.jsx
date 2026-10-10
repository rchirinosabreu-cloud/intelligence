import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertCircle, ArrowRight, Eye } from '@/components/ui/icons';
import TeamAvatar from '@/components/ui/TeamAvatar';
import { getApiBaseUrl } from '@/lib/apiBaseUrl';
import { cn } from '@/lib/utils';

// Mapa de carga (Rodny, 10 de octubre de 2026, Fase A de Ritmo): quién está saturado y quién tiene espacio en los
// próximos días hábiles. Una fila por persona, una celda por día con las horas estimadas; tocar una celda muestra
// las tareas que la componen. Las horas son estimaciones a partir de lo que suele tardar cada tipo de trabajo:
// la pantalla lo dice y nunca las presenta como un hecho.

const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const WEEKDAYS = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];
const dayHeading = (day) => { const date = new Date(`${day}T12:00:00Z`); return { weekday: WEEKDAYS[date.getUTCDay()], date: `${date.getUTCDate()} ${MONTHS[date.getUTCMonth()]}` }; };
const formatHours = (ms) => {
  const minutes = Math.round(ms / 60_000);
  if (minutes === 0) return '';
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60), rest = minutes % 60;
  return rest ? `${hours} h ${String(rest).padStart(2, '0')}` : `${hours} h`;
};
const LEVELS = {
  libre: { label: 'Con espacio', cell: 'bg-white text-zinc-500 dark:bg-zinc-950 dark:text-zinc-400', dot: 'bg-zinc-300 dark:bg-zinc-600' },
  ok: { label: 'Al día', cell: 'bg-brand-green-soft text-brand-green-deep dark:bg-brand-green/15 dark:text-brand-green', dot: 'bg-brand-green' },
  alta: { label: 'Día completo', cell: 'bg-brand-yellow-soft text-brand-yellow-deep dark:bg-brand-yellow/15 dark:text-brand-yellow', dot: 'bg-brand-yellow' },
  excedida: { label: 'Más de lo que cabe', cell: 'bg-brand-coral-soft text-brand-coral-deep dark:bg-brand-coral/15 dark:text-brand-coral', dot: 'bg-brand-coral' }
};
const SOURCE_LABEL = { persona: 'según su historial', equipo: 'según el equipo', supuesto: 'sin historial, supuesto' };

export default function TeamLoadMap({ refreshKey = 0 }) {
  const [data, setData] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [open, setOpen] = useState(null); // { personId, day }

  const load = useCallback(async () => {
    setIsLoading(true);
    setError('');
    try {
      const token = localStorage.getItem('authToken');
      const response = await fetch(`${getApiBaseUrl()}/api/manager/rhythm/load`, { headers: { Authorization: token ? `Bearer ${token}` : '' } });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || 'No pudimos armar el mapa de carga.');
      setData(payload);
    } catch (requestError) {
      console.error('[TeamLoadMap] Error cargando el mapa:', requestError.message || requestError);
      setError(requestError.message);
    } finally {
      setIsLoading(false);
    }
  }, []);
  useEffect(() => { load(); }, [load, refreshKey]);

  if (error) {
    return (
      <div className="brain-alert-surface rounded-2xl p-4 text-sm">
        <div className="flex items-center gap-2 font-medium"><AlertCircle className="h-4 w-4 text-destructive" /> No pudimos armar el mapa de carga</div>
        <p className="mt-1 pl-6">{error}</p>
      </div>
    );
  }
  if (isLoading && !data) return <div className="h-64 animate-pulse rounded-2xl bg-zinc-200/70 dark:bg-zinc-900" />;
  if (!data) return null;

  const openPerson = open && data.people.find((p) => p.personId === open.personId);
  const openCell = openPerson && openPerson.cells.find((c) => c.day === open.day);
  const toggle = (personId, day) => setOpen((current) => current && current.personId === personId && current.day === day ? null : { personId, day });

  return (
    <section className="rounded-2xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950" aria-labelledby="load-map-title" data-load-map>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="max-w-2xl">
          <h2 id="load-map-title" className="text-sm font-semibold text-zinc-950 dark:text-zinc-50">Quién tiene espacio y quién está lleno</h2>
          <p className="mt-1 text-xs leading-5 text-zinc-500 dark:text-zinc-400">
            Horas estimadas por persona en los próximos {data.days.length} días hábiles, según sus tareas abiertas y lo que suele tardar cada tipo de trabajo. Son estimaciones para repartir mejor, no un registro. Una jornada son {Math.round(data.capacityMs / 3_600_000)} horas.
          </p>
        </div>
        <ul className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-zinc-500 dark:text-zinc-400" aria-label="Qué significa cada color">
          {Object.entries(LEVELS).map(([key, level]) => <li key={key} className="flex items-center gap-1.5"><span className={cn('h-2.5 w-2.5 rounded-full', level.dot)} aria-hidden="true" />{level.label}</li>)}
        </ul>
      </div>

      {data.people.length === 0 ? (
        <div className="mt-4 flex min-h-32 items-center justify-center rounded-2xl border border-dashed border-zinc-200 text-sm text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">No hay personas activas en el equipo.</div>
      ) : (
        <div className="mt-4 overflow-x-auto" data-load-grid>
          <table className="w-full min-w-[720px] border-separate border-spacing-y-1 text-left text-xs">
            <thead>
              <tr className="text-zinc-500 dark:text-zinc-400">
                <th scope="col" className="w-48 pb-1 pr-3 font-medium">Persona</th>
                {data.days.map((day) => { const h = dayHeading(day); return <th key={day} scope="col" className={cn('pb-1 text-center font-medium', day === data.today && 'text-zinc-950 dark:text-zinc-50')}><span className="block">{h.weekday}</span><span className="block tabular-nums">{h.date}</span></th>; })}
                <th scope="col" className="pb-1 pl-3 text-right font-medium">Vencidas</th>
              </tr>
            </thead>
            <tbody>
              {data.people.map((person) => (
                <tr key={person.personId} data-load-person={person.personId}>
                  <th scope="row" className="pr-3 font-normal">
                    <div className="flex items-center gap-2">
                      <TeamAvatar member={{ name: person.personName, avatarUrl: person.avatarUrl }} size={28} className="h-7 w-7 shrink-0" />
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-zinc-950 dark:text-zinc-50">{person.personName}</p>
                        <p className="text-[11px] text-zinc-500 dark:text-zinc-400">{formatHours(person.weekMs) || '0 h'} en total{person.undated.count ? ` · ${person.undated.count} sin fecha` : ''}</p>
                      </div>
                    </div>
                  </th>
                  {person.cells.map((cell) => {
                    const level = LEVELS[cell.level] || LEVELS.libre;
                    const active = open && open.personId === person.personId && open.day === cell.day;
                    return (
                      <td key={cell.day} className="px-0.5">
                        <button
                          type="button"
                          disabled={cell.count === 0}
                          onClick={() => toggle(person.personId, cell.day)}
                          aria-pressed={active}
                          aria-label={`${person.personName}, ${dayHeading(cell.day).date}: ${cell.count ? `${formatHours(cell.ms)} en ${cell.count} ${cell.count === 1 ? 'tarea' : 'tareas'}, ${level.label.toLowerCase()}` : 'sin tareas'}`}
                          className={cn('flex h-11 w-full flex-col items-center justify-center rounded-lg border text-center tabular-nums transition-colors', level.cell, active ? 'border-brand-cyan ring-2 ring-brand-cyan/30' : 'border-zinc-200/80 dark:border-zinc-800', cell.count === 0 ? 'cursor-default' : 'hover:border-brand-cyan')}
                          data-load-cell={cell.level}
                        >
                          <span className="text-[13px] font-semibold leading-tight">{formatHours(cell.ms) || '—'}</span>
                          {cell.count > 0 && <span className="text-[10px] leading-tight opacity-80">{cell.count} {cell.count === 1 ? 'tarea' : 'tareas'}</span>}
                        </button>
                      </td>
                    );
                  })}
                  <td className={cn('pl-3 text-right tabular-nums', person.overdue.count ? 'font-semibold text-brand-coral-deep dark:text-brand-coral' : 'text-zinc-400 dark:text-zinc-500')} data-load-overdue>
                    {person.overdue.count ? `${person.overdue.count} · ${formatHours(person.overdue.ms)}` : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {openCell && (
        <div className="mt-3 rounded-2xl bg-zinc-100/70 p-4 dark:bg-zinc-900/60" data-load-detail>
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-semibold text-zinc-950 dark:text-zinc-50">{openPerson.personName} · {dayHeading(openCell.day).weekday} {dayHeading(openCell.day).date} · {formatHours(openCell.ms)} estimadas</p>
            <button type="button" onClick={() => setOpen(null)} className="min-h-11 px-2 text-xs font-medium text-zinc-500 hover:text-brand-cyan-deep dark:text-zinc-400">Cerrar</button>
          </div>
          <ul className="mt-2 divide-y divide-zinc-200/70 dark:divide-zinc-800">
            {openCell.tasks.map((task) => (
              <li key={task.id} className="flex items-center justify-between gap-3 py-2">
                <div className="min-w-0">
                  <p className="truncate text-sm text-zinc-800 dark:text-zinc-100">{task.title}</p>
                  <p className="text-[11px] text-zinc-500 dark:text-zinc-400">{[task.clientName, task.workType, `${formatHours(task.ms)} ${SOURCE_LABEL[task.source] || ''}`.trim()].filter(Boolean).join(' · ')}</p>
                </div>
                <Link to={`/gestion?taskId=${encodeURIComponent(task.id)}`} className="inline-flex min-h-11 shrink-0 items-center gap-1 text-xs font-medium text-brand-cyan-deep dark:text-brand-cyan">Abrir<ArrowRight className="h-3.5 w-3.5" /></Link>
              </li>
            ))}
          </ul>
        </div>
      )}

      {data.signals?.length > 0 && (
        <ul className="mt-4 space-y-2 border-t border-zinc-100 pt-4 dark:border-zinc-900" data-load-signals>
          {data.signals.map((signal, index) => (
            <li key={`${signal.kind}-${signal.personId}-${index}`} className="flex gap-2.5 text-sm leading-6 text-zinc-700 dark:text-zinc-200">
              <Eye className={cn('mt-1 h-4 w-4 shrink-0', signal.kind === 'CON_ESPACIO' ? 'text-brand-green-deep dark:text-brand-green' : 'text-brand-coral-deep dark:text-brand-coral')} />
              <span>{signal.message}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
