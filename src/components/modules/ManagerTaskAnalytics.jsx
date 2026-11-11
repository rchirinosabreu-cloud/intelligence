import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Clock,
  Database,
  Eye,
  RefreshCw,
  Target,
  Users,
} from '@/components/ui/icons';
import { getApiBaseUrl } from '@/lib/apiBaseUrl';
import { cn } from '@/lib/utils';
import PageHeader from '@/components/ui/PageHeader';
import BriaMemoryPanel from './BriaMemoryPanel';
import BriaObserverInbox from './BriaObserverInbox';
import ManagerDecisions from './ManagerDecisions';
import TeamRhythmPanel from './TeamRhythmPanel';
import { useNavigationSelection } from '@/hooks/useNavigationSelection';
import { usePageLabel } from '@/components/layout/BackToOrigin';

const PERIODS = [7, 30, 90];
// «Decisiones» reúne la lectura de Bria y el Observer (Rodny, 10 de noviembre de 2026). La bandeja del Observer sigue
// abriéndose por enlace (?tab=observer) como historial y auditoría, pero ya no es una pestaña.
const TABS = ['decisiones', 'ritmo', 'memory', 'observer'];
const MANAGER_HEADING = { title: 'Manager', description: 'Lo que Bria necesita que decidas, el ritmo del equipo y lo que Bria sabe de la agencia.' };

const formatDuration = (milliseconds) => {
  const totalMinutes = Math.max(0, Math.round(Number(milliseconds || 0) / 60_000));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours === 0) return `${minutes} min`;
  if (minutes === 0) return `${hours} h`;
  return `${hours} h ${minutes} min`;
};

const formatPercentage = (value) => `${Math.round(Math.max(0, Number(value || 0)) * 100)} %`;

const formatDateTime = (value) => {
  if (!value) return 'En curso';
  return new Intl.DateTimeFormat('es-CO', {
    day: '2-digit',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(value));
};

const MetricCard = ({ icon: Icon, label, value, detail, accent = false }) => (
  <article className={cn(
    'rounded-2xl border p-4 sm:p-5',
    'border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950',
    accent && 'border-brand-cyan/30 bg-brand-cyan/[0.04] dark:border-brand-cyan/35 dark:bg-brand-cyan/[0.08]'
  )}>
    <div className="flex items-start justify-between gap-3">
      <div>
        <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400">{label}</p>
        <p className="mt-2 text-2xl font-semibold tracking-tight text-zinc-950 dark:text-zinc-50">{value}</p>
      </div>
      <span className={cn(
        'flex h-9 w-9 items-center justify-center rounded-xl',
        accent ? 'bg-brand-cyan text-white' : 'bg-zinc-100 text-zinc-600 dark:bg-zinc-900 dark:text-zinc-300'
      )}>
        <Icon className="h-4 w-4" />
      </span>
    </div>
    <p className="mt-3 text-xs leading-5 text-zinc-500 dark:text-zinc-400">{detail}</p>
  </article>
);

const Distribution = ({ title, description, items = [], emptyLabel }) => {
  const maximum = Math.max(0, ...items.map((item) => Number(item.workMs || 0)));
  return (
    <section className="rounded-2xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950">
      <div className="mb-5">
        <h2 className="text-sm font-semibold text-zinc-950 dark:text-zinc-50">{title}</h2>
        <p className="mt-1 text-xs leading-5 text-zinc-500 dark:text-zinc-400">{description}</p>
      </div>
      {items.length === 0 ? (
        <div className="flex min-h-36 items-center justify-center rounded-xl border border-dashed border-zinc-200 px-4 text-center text-sm text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
          {emptyLabel}
        </div>
      ) : (
        <div className="space-y-4">
          {items.slice(0, 6).map((item) => (
            <div key={item.label}>
              <div className="mb-1.5 flex items-center justify-between gap-3 text-xs">
                <span className="truncate font-medium text-zinc-700 dark:text-zinc-200">{item.label}</span>
                <span className="shrink-0 tabular-nums text-zinc-500 dark:text-zinc-400">{formatDuration(item.workMs)}</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-900">
                <div
                  className="h-full rounded-full bg-brand-cyan"
                  style={{ width: `${maximum > 0 ? Math.max(4, (item.workMs / maximum) * 100) : 0}%` }}
                />
              </div>
              <p className="mt-1 text-xs text-zinc-400 dark:text-zinc-500">
                {item.tasks} {item.tasks === 1 ? 'tarea' : 'tareas'} · {item.sessions} {item.sessions === 1 ? 'sesión' : 'sesiones'}
              </p>
            </div>
          ))}
        </div>
      )}
    </section>
  );
};

const QualityItem = ({ value, label, goodWhenZero = true }) => {
  const isGood = goodWhenZero && value === 0;
  return (
    <div className="flex items-center justify-between gap-4 border-b border-zinc-100 py-3 last:border-0 dark:border-zinc-900">
      <div className="flex items-center gap-2.5">
        {isGood
          ? <CheckCircle2 className="h-4 w-4 text-brand-green" />
          : <AlertCircle className="h-4 w-4 text-destructive" />}
        <span className="text-sm text-zinc-700 dark:text-zinc-200">{label}</span>
      </div>
      <span className="text-sm font-semibold tabular-nums text-zinc-950 dark:text-zinc-50">{value}</span>
    </div>
  );
};

export default function ManagerTaskAnalytics() {
  const [navigation, updateNavigation] = useNavigationSelection();
  const activeTab = TABS.includes(navigation.get('tab')) ? navigation.get('tab') : 'decisiones';
  const rhythmView = navigation.get('rhythmView') === 'history' ? 'history' : 'week';
  const periodDays = PERIODS.includes(Number(navigation.get('days'))) ? Number(navigation.get('days')) : 30;
  const setActiveTab = tab => updateNavigation({ tab });
  const setRhythmView = rhythmView => updateNavigation({ rhythmView });
  const setPeriodDays = days => updateNavigation({ days });
  usePageLabel(activeTab === 'ritmo' ? 'Manager · Ritmo' : activeTab === 'decisiones' ? 'Manager · Decisiones' : 'Manager');
  const [analytics, setAnalytics] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [refreshKey, setRefreshKey] = useState(0);

  const fetchAnalytics = useCallback(async () => {
    setIsLoading(true);
    setError('');
    try {
      const baseUrl = getApiBaseUrl();
      const token = localStorage.getItem('authToken');
      const response = await fetch(`${baseUrl}/api/manager/task-analytics?days=${periodDays}`, {
        headers: { Authorization: token ? `Bearer ${token}` : '' },
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || 'No fue posible cargar los datos de tareas');
      setAnalytics(payload);
    } catch (requestError) {
      console.error('[ManagerTaskAnalytics] Request failed:', requestError);
      setError(requestError.message);
    } finally {
      setIsLoading(false);
    }
  }, [periodDays]);

  // Las métricas de esfuerzo solo se piden en Ritmo; Observer es solo la bandeja.
  useEffect(() => {
    if (activeTab === 'ritmo' && rhythmView === 'history') fetchAnalytics();
  }, [activeTab, rhythmView, fetchAnalytics]);

  // «Actualizar» recalcula las métricas y la lectura por persona.
  const loadAnalytics = useCallback(() => {
    if (rhythmView === 'history') fetchAnalytics();
    setRefreshKey((key) => key + 1);
  }, [fetchAnalytics, rhythmView]);

  const overview = analytics?.overview;
  const sampleMessage = useMemo(() => {
    if (!overview) return '';
    if (overview.sessionCount < 10) {
      return `Muestra inicial: ${overview.sessionCount} sesiones. Úsala para validar el registro, todavía no como estándar.`;
    }
    return `${overview.sessionCount} sesiones distribuidas en ${overview.taskCount} tareas durante el periodo.`;
  }, [overview]);

  return (
    <div data-manager-task-analytics className="mx-auto w-full max-w-7xl pb-10">
      <div className="space-y-6">
        {/* Un solo título para todo el módulo, cambie o no la pestaña, y el mismo encabezado del resto de la plataforma
            (Rodny, 10 de noviembre de 2026: «el título debe ser el mismo no importa si la pestaña cambia»). */}
        <PageHeader title={MANAGER_HEADING.title} subtitle={MANAGER_HEADING.description} />

        <nav aria-label="Modos de Bria" className="flex items-center gap-2 overflow-x-auto whitespace-nowrap border-b border-zinc-200 dark:border-zinc-800">
          <button
            data-bria-tab="decisiones"
            type="button"
            onClick={() => setActiveTab('decisiones')}
            aria-current={activeTab === 'decisiones' ? 'page' : undefined}
            className={cn(
              'inline-flex min-h-11 items-center gap-2 border-b-2 px-3 py-3 text-sm font-semibold',
              activeTab === 'decisiones' ? 'border-brand-cyan text-zinc-950 dark:text-white' : 'border-transparent text-zinc-500 dark:text-zinc-400'
            )}
          >
            <CheckCircle2 className="h-4 w-4" />
            Decisiones
          </button>
          <button
            data-bria-tab="ritmo"
            type="button"
            onClick={() => setActiveTab('ritmo')}
            aria-current={activeTab === 'ritmo' ? 'page' : undefined}
            className={cn(
              'inline-flex items-center gap-2 border-b-2 px-3 py-3 text-sm font-semibold',
              activeTab === 'ritmo' ? 'border-brand-cyan text-zinc-950 dark:text-white' : 'border-transparent text-zinc-500 dark:text-zinc-400'
            )}
          >
            <Clock className="h-4 w-4" />
            Ritmo
          </button>
          <button
            data-bria-tab="memory"
            type="button"
            onClick={() => setActiveTab('memory')}
            aria-current={activeTab === 'memory' ? 'page' : undefined}
            className={cn(
              'inline-flex items-center gap-2 border-b-2 px-3 py-3 text-sm font-semibold',
              activeTab === 'memory' ? 'border-brand-cyan text-zinc-950 dark:text-white' : 'border-transparent text-zinc-500 dark:text-zinc-400'
            )}
          >
            <Database className="h-4 w-4" />
            Memoria
          </button>
        </nav>

        {activeTab === 'decisiones' ? <ManagerDecisions /> : activeTab === 'memory' ? <BriaMemoryPanel /> : activeTab === 'observer' ? <><div className="inline-flex items-center gap-2 rounded-full bg-brand-cyan/10 px-3 py-1.5 text-xs font-medium text-brand-cyan-deep dark:text-brand-cyan"><Eye className="h-3.5 w-3.5" />Observa y explica; no ejecuta acciones</div><BriaObserverInbox /></> : <>
        <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-1 rounded-xl bg-zinc-100 p-1 dark:bg-zinc-900 w-fit" aria-label="Lectura de Ritmo">
          {[['week', 'Esta semana'], ['history', 'Historial']].map(([value, label]) => <button key={value} type="button" aria-pressed={rhythmView === value} onClick={() => setRhythmView(value)} className={cn('min-h-11 rounded-lg px-4 text-sm font-medium', rhythmView === value ? 'bg-white text-zinc-950 shadow-sm dark:bg-zinc-800 dark:text-zinc-50' : 'text-zinc-600 dark:text-zinc-400')}>{label}</button>)}
        </div>
            <div className="flex flex-wrap items-center gap-3">
              {rhythmView === 'history' && <div className="inline-flex rounded-xl border border-zinc-200 bg-zinc-50 p-1 dark:border-zinc-800 dark:bg-zinc-900" aria-label="Periodo del historial">
                {PERIODS.map((days) => (
                  <button
                    key={days}
                    type="button"
                    onClick={() => setPeriodDays(days)}
                    className={cn(
                      'min-h-11 rounded-lg px-3 py-2 text-xs font-medium transition-colors',
                      periodDays === days
                        ? 'bg-white text-zinc-950 shadow-sm dark:bg-zinc-800 dark:text-white'
                        : 'text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-100'
                    )}
                  >
                    {days} días
                  </button>
                ))}
              </div>}
              <button
                type="button"
                onClick={loadAnalytics}
                disabled={isLoading}
                className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-brand-cyan-deep px-4 text-xs font-semibold text-white transition-transform active:scale-95 disabled:opacity-60"
              >
                <RefreshCw className={cn('h-4 w-4', isLoading && 'animate-spin')} />
                Actualizar
              </button>
            </div>
        </div>

        <TeamRhythmPanel periodDays={periodDays} refreshKey={refreshKey} view={rhythmView} onHistory={() => setRhythmView('history')} />

        {rhythmView === 'history' && <h2 className="pt-4 text-base font-semibold text-zinc-950 dark:text-zinc-50">Esfuerzo del equipo</h2>}
        {rhythmView === 'history' && error && (
          <div className="brain-alert-surface rounded-2xl p-4 text-sm">
            <div className="flex items-center gap-2 font-medium"><AlertCircle className="h-4 w-4 text-destructive" /> No pudimos cargar el panel</div>
            <p className="mt-1 pl-6">{error}</p>
          </div>
        )}

        {rhythmView === 'history' && isLoading && !analytics ? (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {[0, 1, 2, 3].map((item) => <div key={item} className="h-40 animate-pulse rounded-2xl bg-zinc-200/70 dark:bg-zinc-900" />)}
          </div>
        ) : rhythmView === 'history' && overview ? (
          <>
            <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <MetricCard icon={Clock} label="Esfuerzo registrado" value={formatDuration(overview.totalWorkMs)} detail={`${overview.sessionCount} sesiones dentro del periodo`} accent />
              <MetricCard icon={Target} label="Mediana por sesión" value={formatDuration(overview.medianSessionMs)} detail={`El 75 % no supera ${formatDuration(overview.p75SessionMs)}`} />
              <MetricCard icon={RefreshCw} label="Retrabajo" value={formatPercentage(overview.reworkRate)} detail={`${formatDuration(overview.reworkMs)} después del ciclo inicial`} />
              <MetricCard icon={CheckCircle2} label="Tareas completadas" value={overview.completedTasks} detail={`${overview.activeTasks} en proceso · ${overview.openSessions} sesiones abiertas`} />
            </section>

            <div className="rounded-2xl border border-brand-cyan/20 bg-brand-cyan/[0.04] px-4 py-3 text-xs leading-5 text-zinc-600 dark:border-brand-cyan/25 dark:bg-brand-cyan/[0.07] dark:text-zinc-300">
              <strong className="font-semibold text-zinc-900 dark:text-zinc-100">Base descriptiva:</strong> {sampleMessage}
            </div>

            <section className="grid gap-5 lg:grid-cols-2">
              <Distribution title="Por categoría" description="Dónde se está concentrando el esfuerzo registrado." items={analytics.byCategory} emptyLabel="Aún no hay sesiones clasificadas en este periodo." />
              <Distribution title="Por cliente" description="Carga observada por cuenta, sin convertirla todavía en un estándar." items={analytics.byClient} emptyLabel="Aún no hay sesiones asociadas a clientes." />
              <Distribution title="Por complejidad" description="Cómo se distribuye el esfuerzo entre niveles de complejidad." items={analytics.byComplexity} emptyLabel="Las tareas necesitan clasificación de complejidad." />
              <Distribution title="Por responsable" description="Distribución de carga contextual; no es un ranking de productividad." items={analytics.byResponsible} emptyLabel="Aún no hay responsables con sesiones registradas." />
            </section>

            <section className="grid gap-5 xl:grid-cols-[0.8fr_1.2fr]">
              <div className="rounded-2xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950">
                <div className="mb-3 flex items-center gap-2">
                  <Database className="h-4 w-4 text-brand-cyan" />
                  <h2 className="text-sm font-semibold text-zinc-950 dark:text-zinc-50">Calidad del dato</h2>
                </div>
                <p className="mb-2 text-xs leading-5 text-zinc-500 dark:text-zinc-400">Estas alertas deben resolverse antes de convertir los datos en predicciones.</p>
                <QualityItem value={analytics.dataQuality.inProgressWithoutSession} label="Tareas en proceso sin sesión abierta" />
                <QualityItem value={analytics.dataQuality.unclassifiedTasks} label="Tareas sin categoría o complejidad" />
                <QualityItem value={analytics.dataQuality.overlappingSessions} label="Sesiones simultáneas activas ahora" />
                <QualityItem value={analytics.dataQuality.sessionsWithoutTask} label="Sesiones sin tarea asociada" />
              </div>

              <div className="rounded-2xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950">
                <h2 className="text-sm font-semibold text-zinc-950 dark:text-zinc-50">Sesiones recientes</h2>
                <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">Últimos tramos de trabajo capturados en el periodo.</p>
                <div className="mt-4 divide-y divide-zinc-100 dark:divide-zinc-900">
                  {analytics.recentSessions.length === 0 ? (
                    <div className="flex min-h-40 items-center justify-center text-sm text-zinc-500 dark:text-zinc-400">Todavía no hay sesiones para mostrar.</div>
                  ) : analytics.recentSessions.map((session) => (
                    <div key={session.id} className="grid gap-2 py-3 sm:grid-cols-[1fr_auto] sm:items-center">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-zinc-800 dark:text-zinc-100">{session.taskTitle}</p>
                        <p className="mt-0.5 truncate text-xs text-zinc-500 dark:text-zinc-400">{session.clientName} · {session.workerName}</p>
                      </div>
                      <div className="flex items-center gap-3 text-xs sm:justify-end">
                        <span className="text-zinc-400 dark:text-zinc-500">{formatDateTime(session.startedAt)}</span>
                        <span className="min-w-20 text-right font-semibold tabular-nums text-zinc-700 dark:text-zinc-200">{formatDuration(session.durationMs)}</span>
                        {!session.endedAt && <span className="h-2 w-2 animate-pulse rounded-full bg-brand-green" aria-label="Sesión activa" />}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </section>
          </>
        ) : null}
        </>}
      </div>
    </div>
  );
}
