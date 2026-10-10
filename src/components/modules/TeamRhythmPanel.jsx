import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertCircle, ChevronDown, Clock, Eye, Users } from '@/components/ui/icons';
import TeamAvatar from '@/components/ui/TeamAvatar';
import { getApiBaseUrl } from '@/lib/apiBaseUrl';
import { cn } from '@/lib/utils';

// Ritmo del equipo (Rodny, 9 de octubre de 2026): cuánto tarda cada persona por tipo de trabajo, qué tan parejo
// trabaja y dónde se le va el tiempo. El orden de la pantalla es deliberado: primero cuánto de lo cerrado está
// medido (lo que no se midió no es rápido), después los tiempos por tipo de trabajo y al final los hallazgos,
// cada uno con las tareas que lo sustentan. Es una lectura para conversar con la persona, no una calificación.

const formatDuration = (milliseconds) => {
  const totalMinutes = Math.max(0, Math.round(Number(milliseconds || 0) / 60_000));
  const hours = Math.floor(totalMinutes / 60), minutes = totalMinutes % 60;
  if (hours === 0) return `${minutes} min`;
  return minutes ? `${hours} h ${minutes} min` : `${hours} h`;
};
const percent = (value) => `${Math.round(Math.max(0, Number(value || 0)) * 100)} %`;
const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const shortDay = (day) => { const [, m, d] = String(day || '').split('-').map(Number); return m && d ? `${d} ${MONTHS[m - 1]}` : ''; };
const warningCount = (person) => person.findings.filter((finding) => finding.severity === 'warning').length;

const CoverageBar = ({ value }) => (
  <div className="h-2 overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800" aria-hidden="true">
    <div className="h-full rounded-full bg-brand-cyan" style={{ width: `${Math.round(Math.min(1, Math.max(0, value)) * 100)}%` }} />
  </div>
);

function PersonCard({ person, tasks }) {
  const [open, setOpen] = useState(false);
  const findings = open ? person.findings : person.findings.slice(0, 2);
  const types = open ? person.byType : person.byType.slice(0, 3);
  const hidden = person.findings.length - findings.length + person.byType.length - types.length;
  return (
    <article className="min-w-0 rounded-2xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950" data-rhythm-person={person.personId}>
      <header className="flex items-center gap-3">
        <TeamAvatar member={{ name: person.personName, avatarUrl: person.avatarUrl }} size={40} className="h-10 w-10 shrink-0" />
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-sm font-semibold text-zinc-950 dark:text-zinc-50">{person.personName}</h3>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">{person.measured} de {person.closed} tareas con tiempo medido{person.declared ? ` (${person.declared} ${person.declared === 1 ? 'declarada' : 'declaradas'})` : ''} · {formatDuration(person.measuredMs)}</p>
        </div>
        <span className="shrink-0 whitespace-nowrap text-sm font-semibold tabular-nums text-zinc-950 dark:text-zinc-50">{percent(person.coverage)}</span>
      </header>
      <div className="mt-3"><CoverageBar value={person.coverage} /></div>

      {types.length > 0 && (
        <div className="mt-4 overflow-x-auto" data-rhythm-types>
          <table className="w-full min-w-[420px] whitespace-nowrap text-left text-xs">
            <thead className="text-zinc-500 dark:text-zinc-400">
              <tr><th className="pb-2 font-medium">Tipo de trabajo</th><th className="pb-2 font-medium">Medidas</th><th className="pb-2 font-medium">Suele tardar</th><th className="pb-2 font-medium">Rango</th><th className="pb-2 font-medium">Resto del equipo</th></tr>
            </thead>
            <tbody className="divide-y divide-zinc-100 dark:divide-zinc-900">
              {types.map((type) => (
                <tr key={type.workType} className="text-zinc-700 dark:text-zinc-200">
                  <td className="py-2 pr-3">{type.workType}{!type.comparable && <span className="block text-[11px] text-zinc-400 dark:text-zinc-500">mezcla trabajos distintos</span>}</td>
                  <td className="py-2 pr-3 tabular-nums">{type.measured}</td>
                  <td className="py-2 pr-3 tabular-nums">{formatDuration(type.medianMs)}</td>
                  <td className="py-2 pr-3 tabular-nums">{formatDuration(type.minMs)} a {formatDuration(type.maxMs)}</td>
                  <td className="py-2 tabular-nums text-zinc-500 dark:text-zinc-400">{type.teamMedianMs ? formatDuration(type.teamMedianMs) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {findings.length > 0 && (
        <ul className="mt-4 space-y-3 border-t border-zinc-100 pt-4 dark:border-zinc-900" data-rhythm-findings>
          {findings.map((finding, index) => (
            <li key={`${finding.kind}-${index}`} className="flex gap-2.5">
              {/* Un hallazgo es algo para mirar, no una alerta: el icono de alerta queda para errores. */}
              {finding.severity === 'warning'
                ? <Eye className="mt-0.5 h-4 w-4 shrink-0 text-brand-coral-deep dark:text-brand-coral" />
                : <Clock className="mt-0.5 h-4 w-4 shrink-0 text-brand-cyan-deep dark:text-brand-cyan" />}
              <div className="min-w-0">
                <p className="text-sm leading-6 text-zinc-700 dark:text-zinc-200">{finding.message}</p>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {finding.taskIds.slice(0, 4).map((id) => tasks[id] && (
                    <span key={id} className="inline-flex max-w-full items-center gap-1 rounded-lg border border-zinc-200 px-2 py-0.5 text-[11px] text-zinc-600 dark:border-zinc-700 dark:text-zinc-300" title={tasks[id].title}>
                      <span className="truncate">{tasks[id].title}</span>
                      <span className="shrink-0 tabular-nums text-zinc-400 dark:text-zinc-500">· {tasks[id].measuredMs ? formatDuration(tasks[id].measuredMs) : 'sin medir'} · {shortDay(tasks[id].day)}</span>
                    </span>
                  ))}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      {(hidden > 0 || open) && (
        <button type="button" onClick={() => setOpen((value) => !value)} aria-expanded={open} className="mt-3 inline-flex min-h-11 items-center gap-1.5 text-xs font-medium text-brand-cyan-deep dark:text-brand-cyan">
          {open ? 'Ver menos' : 'Ver todo'}
          <ChevronDown className={cn('h-4 w-4 transition-transform', open && 'rotate-180')} />
        </button>
      )}
    </article>
  );
}

export default function TeamRhythmPanel({ periodDays = 30, refreshKey = 0 }) {
  const [data, setData] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setIsLoading(true);
    setError('');
    try {
      const token = localStorage.getItem('authToken');
      const response = await fetch(`${getApiBaseUrl()}/api/manager/rhythm?days=${periodDays}`, { headers: { Authorization: token ? `Bearer ${token}` : '' } });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || 'No pudimos calcular el ritmo del equipo.');
      setData(payload);
    } catch (requestError) {
      console.error('[TeamRhythmPanel] Error cargando el ritmo:', requestError.message || requestError);
      setError(requestError.message);
    } finally {
      setIsLoading(false);
    }
  }, [periodDays]);

  useEffect(() => { load(); }, [load, refreshKey]);

  const people = useMemo(() => [...(data?.people || [])].sort((a, b) => warningCount(b) - warningCount(a) || a.personName.localeCompare(b.personName, 'es')), [data]);

  if (error) {
    return (
      <div className="brain-alert-surface rounded-2xl p-4 text-sm">
        <div className="flex items-center gap-2 font-medium"><AlertCircle className="h-4 w-4 text-destructive" /> No pudimos cargar el ritmo del equipo</div>
        <p className="mt-1 pl-6">{error}</p>
      </div>
    );
  }
  if (isLoading && !data) {
    return <div className="grid gap-4 lg:grid-cols-2">{[0, 1, 2, 3].map((item) => <div key={item} className="h-48 animate-pulse rounded-2xl bg-zinc-200/70 dark:bg-zinc-900" />)}</div>;
  }
  if (!data) return null;

  return (
    <section className="space-y-5" aria-labelledby="rhythm-title">
      <div className="rounded-2xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950" data-rhythm-coverage>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="max-w-2xl">
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4 text-brand-cyan-deep dark:text-brand-cyan" />
              <h2 id="rhythm-title" className="text-sm font-semibold text-zinc-950 dark:text-zinc-50">Cuánto de lo cerrado está medido</h2>
            </div>
            <p className="mt-1 text-xs leading-5 text-zinc-500 dark:text-zinc-400">
              {data.team.measured} de {data.team.closed} tareas cerradas en {data.period.days} días tienen tiempo medido{data.team.declared ? `, ${data.team.declared} de ellas con un tiempo que la persona declaró al cerrar` : ''}. Las demás pasaron a Realizada sin pasar por En proceso: no son rápidas, simplemente no se midieron.
            </p>
          </div>
          <span className="shrink-0 whitespace-nowrap text-3xl font-semibold tabular-nums text-zinc-950 dark:text-white">{percent(data.team.coverage)}</span>
        </div>
        <div className="mt-4"><CoverageBar value={data.team.coverage} /></div>
      </div>

      {people.length === 0 ? (
        <div className="flex min-h-40 items-center justify-center rounded-2xl border border-dashed border-zinc-200 text-sm text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">Nadie cerró tareas en este periodo.</div>
      ) : (
        <div className="grid items-start gap-4 lg:grid-cols-2">
          {people.map((person) => <PersonCard key={person.personId} person={person} tasks={data.tasks || {}} />)}
        </div>
      )}
    </section>
  );
}
