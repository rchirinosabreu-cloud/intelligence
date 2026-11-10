import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { AlertCircle, Clock, RefreshCw } from '@/components/ui/icons';
import { getApiBaseUrl } from '@/lib/apiBaseUrl';
import { cn } from '@/lib/utils';
import { buildWeekCharts } from '@/lib/teamWeekCharts';

// Ritmo en gráficos (Rodny, 10 de noviembre de 2026): solo lo seguro —horas registradas, entregas por día, vencidas y
// uso del cronómetro—, sin estimaciones de horas futuras. La regla vive en `src/lib/teamWeekCharts.js`.
const CYAN = 'rgb(var(--brand-cyan))';
const CYAN_SOFT = 'rgb(var(--brand-cyan) / 0.35)';
const DAY = new Intl.DateTimeFormat('es-CO', { weekday: 'short', day: 'numeric', timeZone: 'UTC' });
const dayLabel = (day) => DAY.format(new Date(`${day}T12:00:00Z`)).replace('.', '').replace(',', '');
const SHORT = new Intl.DateTimeFormat('es-CO', { day: 'numeric', month: 'short', timeZone: 'UTC' });
const weekLabel = (day) => SHORT.format(new Date(`${day}T12:00:00Z`)).replace('.', '').replace(' de ', ' ');
const HEAT = ['bg-zinc-50 dark:bg-zinc-900', 'bg-brand-cyan/15', 'bg-brand-cyan/30', 'bg-brand-cyan/50', 'bg-brand-cyan text-white'];
const percent = (value) => `${Math.round((value || 0) * 100)} %`;

const request = async (path, signal) => {
  const token = localStorage.getItem('authToken');
  const response = await fetch(`${getApiBaseUrl()}${path}`, { headers: { Authorization: token ? `Bearer ${token}` : '' }, signal });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data.message || data.error || 'No pude cargar el ritmo de la semana.');
    error.response = { data, status: response.status };
    throw error;
  }
  return data;
};

const Stat = ({ label, value, detail, tone }) => (
  <div className="rounded-2xl border border-zinc-200 bg-white px-4 py-3 dark:border-zinc-800 dark:bg-zinc-950">
    <p className="text-xs text-zinc-500 dark:text-zinc-400">{label}</p>
    <p className={cn('mt-1 text-2xl font-semibold tabular-nums', tone || 'text-zinc-950 dark:text-zinc-50')}>{value}</p>
    {detail && <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">{detail}</p>}
  </div>
);

const Card = ({ title, subtitle, children, testId }) => (
  <section data-week-chart={testId} className="min-w-0 rounded-2xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950 sm:p-5">
    <h3 className="text-sm font-semibold text-zinc-950 dark:text-zinc-50">{title}</h3>
    {subtitle && <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">{subtitle}</p>}
    <div className="mt-4">{children}</div>
  </section>
);

const ChartTip = ({ active, payload, label, suffix }) => (active && payload?.length ? (
  <div className="brain-popover-surface rounded-lg px-3 py-2 text-xs">
    <p className="font-medium text-zinc-900 dark:text-zinc-100">{label}</p>
    <p className="text-zinc-600 dark:text-zinc-300">{payload[0].value} h{suffix ? ` ${suffix(payload[0].payload)}` : ''}</p>
  </div>
) : null);

export default function TeamWeekCharts({ refreshKey = 0, now = null }) {
  const [state, setState] = useState({ load: null, rhythm: null, recent: null });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async (signal) => {
    setLoading(true);
    setError('');
    try {
      const [weekLoad, rhythm, recent] = await Promise.all([
        request('/api/manager/rhythm/load?window=week', signal),
        request('/api/manager/rhythm?days=90', signal),
        request('/api/manager/rhythm?days=30', signal)
      ]);
      setState({ load: weekLoad, rhythm, recent });
    } catch (requestError) {
      if (requestError.name === 'AbortError') return;
      console.error('[TeamWeekCharts] Error cargando la semana:', requestError.response?.data || requestError.message);
      setError(requestError.message);
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    load(controller.signal);
    return () => controller.abort();
  }, [load, refreshKey]);

  const charts = useMemo(() => buildWeekCharts({ ...state, now: now || new Date() }), [state, now]);

  if (loading && !state.load) return <div className="grid gap-3 sm:grid-cols-4" aria-busy="true">{[0, 1, 2, 3].map((item) => <div key={item} className="h-24 animate-pulse rounded-2xl bg-zinc-200/70 dark:bg-zinc-900" />)}</div>;
  if (error && !state.load) {
    return (
      <div className="brain-alert-surface rounded-2xl p-4 text-sm">
        <div className="flex items-center gap-2 font-medium"><AlertCircle className="h-4 w-4 text-destructive" />No pude cargar el ritmo de la semana</div>
        <p className="mt-1 pl-6">{error}</p>
        <button type="button" onClick={() => load()} className="ml-6 mt-3 inline-flex min-h-11 items-center gap-1.5 rounded-xl border border-zinc-200 px-3 text-sm dark:border-zinc-700"><RefreshCw className="h-4 w-4" />Reintentar</button>
      </div>
    );
  }

  const { stats, heatmap, hoursByPerson, weeklyHours, unmeasured } = charts;
  const behind = stats.usualWeekHours ? `normal: ~${stats.usualWeekHours} h a la semana` : null;

  return (
    <div data-team-week-charts className="space-y-5">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Horas registradas esta semana" value={`${stats.weekHours} h`} detail={behind} />
        <Stat label="Entregas esta semana" value={stats.due} detail={stats.mostDue ? `${stats.mostDue.name} tiene ${stats.mostDue.count}` : null} />
        <Stat label="Vencidas" value={stats.overdue} tone={stats.overdue ? 'text-destructive' : undefined} detail={stats.mostOverdue ? `${stats.mostOverdue.count} de ${stats.mostOverdue.name}` : null} />
        <Stat label="Cronómetro" value={stats.coverage == null ? '—' : percent(stats.coverage)} detail="de lo cerrado en 30 días" />
      </div>

      <Card title="Entregas por día" subtitle="Cuántas tareas vencen cada día hábil, por persona, y cuántas ya están vencidas." testId="heatmap">
        {heatmap.rows.length ? (
          <div className="overflow-x-auto">
            <div className="grid min-w-[480px] gap-1 text-xs" style={{ gridTemplateColumns: `minmax(90px,1.2fr) repeat(${heatmap.days.length}, minmax(44px,1fr)) minmax(64px,0.8fr)` }}>
              <div />
              {heatmap.days.map((day) => <div key={day} className={cn('py-1 text-center', day === charts.today ? 'font-semibold text-brand-cyan-deep dark:text-brand-cyan' : 'text-zinc-500 dark:text-zinc-400')}>{day === charts.today ? 'Hoy' : dayLabel(day)}</div>)}
              <div className="py-1 text-center text-zinc-500 dark:text-zinc-400">Vencidas</div>
              {heatmap.rows.map((row) => (
                <React.Fragment key={row.name}>
                  <div className="truncate py-2 pr-2 text-sm text-zinc-700 dark:text-zinc-200">{row.name}</div>
                  {row.counts.map((count, index) => (
                    <div key={heatmap.days[index]} title={`${row.name}: ${count} ${count === 1 ? 'entrega' : 'entregas'}`}
                      className={cn('flex min-h-9 items-center justify-center rounded-md text-sm tabular-nums', HEAT[Math.min(count, 4)], count && count < 4 ? 'text-brand-cyan-deep dark:text-zinc-50' : '')}>
                      {count || ''}
                    </div>
                  ))}
                  <div className={cn('flex min-h-9 items-center justify-center text-sm tabular-nums', row.overdue ? 'font-semibold text-destructive' : 'text-zinc-400')}>{row.overdue || ''}</div>
                </React.Fragment>
              ))}
            </div>
          </div>
        ) : <p className="text-sm text-zinc-500 dark:text-zinc-400">Nadie tiene entregas en los próximos días hábiles.</p>}
      </Card>

      <div className="grid gap-5 xl:grid-cols-2">
        <Card title="Horas registradas esta semana" subtitle="Lo que marcó el cronómetro de cada persona, de lunes a hoy." testId="hours-person">
          <div className="text-zinc-500 dark:text-zinc-400" style={{ height: Math.max(180, hoursByPerson.length * 30 + 30) }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={hoursByPerson} layout="vertical" margin={{ top: 0, right: 16, bottom: 0, left: 0 }}>
                <CartesianGrid horizontal={false} stroke="currentColor" strokeOpacity={0.15} />
                <XAxis type="number" tick={{ fill: 'currentColor', fontSize: 12 }} tickFormatter={(v) => `${v} h`} axisLine={false} tickLine={false} />
                <YAxis type="category" dataKey="name" width={96} tick={{ fill: 'currentColor', fontSize: 12 }} axisLine={false} tickLine={false} />
                <Tooltip cursor={{ fill: 'currentColor', fillOpacity: 0.06 }} content={<ChartTip />} />
                <Bar dataKey="hours" fill={CYAN} radius={[0, 4, 4, 0]} barSize={16} isAnimationActive={false} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card title="Horas del equipo por semana" subtitle="Suma de lo registrado; la última barra es la semana en curso." testId="hours-week">
          <div className="h-[260px] text-zinc-500 dark:text-zinc-400">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={weeklyHours.map((row) => ({ ...row, label: weekLabel(row.week) }))} margin={{ top: 8, right: 8, bottom: 0, left: -12 }}>
                <CartesianGrid vertical={false} stroke="currentColor" strokeOpacity={0.15} />
                <XAxis dataKey="label" tick={{ fill: 'currentColor', fontSize: 11 }} axisLine={false} tickLine={false} interval={0} />
                <YAxis tick={{ fill: 'currentColor', fontSize: 12 }} tickFormatter={(v) => `${v} h`} axisLine={false} tickLine={false} />
                <Tooltip cursor={{ fill: 'currentColor', fillOpacity: 0.06 }} content={<ChartTip suffix={(row) => (row.current ? '(semana en curso)' : '')} />} />
                <Bar dataKey="hours" radius={[4, 4, 0, 0]} barSize={22} isAnimationActive={false}>
                  {weeklyHours.map((row) => <Cell key={row.week} fill={row.current ? CYAN_SOFT : CYAN} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>

      {unmeasured.length > 0 && (
        <Card title="Sin cronómetro, no se puede leer su ritmo" subtitle="Personas que cerraron tareas sin marcar el tiempo en los últimos 30 días." testId="unmeasured">
          <div className="flex flex-wrap gap-2">
            {unmeasured.map((person) => (
              <span key={person.name} className="inline-flex items-center gap-1.5 rounded-full bg-brand-yellow/15 px-3 py-1.5 text-sm text-zinc-800 dark:text-brand-yellow">
                <Clock className="h-3.5 w-3.5" />{person.name} · {percent(person.coverage)} de {person.closed}
              </span>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
