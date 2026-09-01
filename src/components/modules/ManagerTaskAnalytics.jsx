import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Activity,
  AlertCircle,
  Bot,
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
import BriaMemoryPanel from './BriaMemoryPanel';

const PERIODS = [7, 30, 90];

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
    accent && 'border-[#009EB9]/30 bg-[#009EB9]/[0.04] dark:border-[#009EB9]/35 dark:bg-[#009EB9]/[0.08]'
  )}>
    <div className="flex items-start justify-between gap-3">
      <div>
        <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400">{label}</p>
        <p className="mt-2 text-2xl font-semibold tracking-tight text-zinc-950 dark:text-zinc-50">{value}</p>
      </div>
      <span className={cn(
        'flex h-9 w-9 items-center justify-center rounded-xl',
        accent ? 'bg-[#009EB9] text-white' : 'bg-zinc-100 text-zinc-600 dark:bg-zinc-900 dark:text-zinc-300'
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
                  className="h-full rounded-full bg-[#009EB9]"
                  style={{ width: `${maximum > 0 ? Math.max(4, (item.workMs / maximum) * 100) : 0}%` }}
                />
              </div>
              <p className="mt-1 text-[11px] text-zinc-400 dark:text-zinc-500">
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
          ? <CheckCircle2 className="h-4 w-4 text-[#00AC8A]" />
          : <AlertCircle className="h-4 w-4 text-amber-500" />}
        <span className="text-sm text-zinc-700 dark:text-zinc-200">{label}</span>
      </div>
      <span className="text-sm font-semibold tabular-nums text-zinc-950 dark:text-zinc-50">{value}</span>
    </div>
  );
};

const SIGNAL_STYLES = {
  critical: 'border-red-200 bg-red-50/70 dark:border-red-900/60 dark:bg-red-950/25',
  warning: 'border-amber-200 bg-amber-50/70 dark:border-amber-900/60 dark:bg-amber-950/20',
  attention: 'border-violet-200 bg-violet-50/70 dark:border-violet-900/60 dark:bg-violet-950/20',
  info: 'border-sky-200 bg-sky-50/70 dark:border-sky-900/60 dark:bg-sky-950/20',
  positive: 'border-emerald-200 bg-emerald-50/70 dark:border-emerald-900/60 dark:bg-emerald-950/20',
};

const SignalCard = ({ signal }) => (
  <article className={cn('rounded-2xl border p-4', SIGNAL_STYLES[signal.severity] || SIGNAL_STYLES.info)}>
    <div className="flex items-start gap-3">
      <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-white/80 text-[#009EB9] shadow-sm dark:bg-zinc-900">
        {signal.severity === 'positive'
          ? <CheckCircle2 className="h-4 w-4 text-[#00AC8A]" />
          : <AlertCircle className="h-4 w-4" />}
      </span>
      <div className="min-w-0">
        <h3 className="text-sm font-semibold text-zinc-950 dark:text-zinc-50">{signal.title}</h3>
        <p className="mt-1 text-xs leading-5 text-zinc-600 dark:text-zinc-300">{signal.evidence}</p>
      </div>
    </div>
  </article>
);

export default function ManagerTaskAnalytics() {
  const [activeTab, setActiveTab] = useState('observer');
  const [periodDays, setPeriodDays] = useState(30);
  const [analytics, setAnalytics] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  const loadAnalytics = useCallback(async () => {
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

  useEffect(() => {
    loadAnalytics();
  }, [loadAnalytics]);

  const overview = analytics?.overview;
  const sampleMessage = useMemo(() => {
    if (!overview) return '';
    if (overview.sessionCount < 10) {
      return `Muestra inicial: ${overview.sessionCount} sesiones. Úsala para validar el registro, todavía no como estándar.`;
    }
    return `${overview.sessionCount} sesiones distribuidas en ${overview.taskCount} tareas durante el periodo.`;
  }, [overview]);

  return (
    <div data-manager-task-analytics className="min-h-full bg-zinc-50/70 px-4 py-5 dark:bg-zinc-950/40 sm:px-6 lg:px-8 lg:py-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <header className="rounded-3xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950 sm:p-7">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
            <div className="max-w-3xl">
              <div className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-[#009EB9]">
                <Activity className="h-4 w-4" />
                Manager · Bria
              </div>
              <h1 className="text-2xl font-semibold tracking-tight text-zinc-950 dark:text-white sm:text-3xl">
                {activeTab === 'memory' ? 'Memoria de Bria' : 'Observer operativo'}
              </h1>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-zinc-600 dark:text-zinc-300">
                {activeTab === 'memory'
                  ? 'Centro de conocimiento trazable: convierte documentos y datos autorizados en evidencia recuperable, auditable y lista para Bria.'
                  : 'Centro descriptivo de tareas: Bria convierte esfuerzo, ciclos y calidad de datos en señales explicables para comprender el trabajo, no vigilar personas.'}
              </p>
              {activeTab === 'observer' && <div className="mt-4 flex flex-wrap gap-2">
                <div className="inline-flex items-center gap-2 rounded-full bg-[#00AC8A]/10 px-3 py-1.5 text-xs font-medium text-[#007D6B] dark:text-[#68E0C8]">
                  <Users className="h-3.5 w-3.5" />
                  No compara velocidad individual
                </div>
                <div className="inline-flex items-center gap-2 rounded-full bg-[#009EB9]/10 px-3 py-1.5 text-xs font-medium text-[#007D92] dark:text-[#74D9EA]">
                  <Eye className="h-3.5 w-3.5" />
                  Observa y explica; no ejecuta acciones
                </div>
              </div>}
            </div>
            {activeTab === 'observer' && <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center">
              <div className="inline-flex rounded-xl border border-zinc-200 bg-zinc-50 p-1 dark:border-zinc-800 dark:bg-zinc-900">
                {PERIODS.map((days) => (
                  <button
                    key={days}
                    type="button"
                    onClick={() => setPeriodDays(days)}
                    className={cn(
                      'rounded-lg px-3 py-2 text-xs font-medium transition-colors',
                      periodDays === days
                        ? 'bg-white text-zinc-950 shadow-sm dark:bg-zinc-800 dark:text-white'
                        : 'text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-100'
                    )}
                  >
                    {days} días
                  </button>
                ))}
              </div>
              <button
                type="button"
                onClick={loadAnalytics}
                disabled={isLoading}
                className="inline-flex h-10 items-center gap-2 rounded-xl bg-[#009EB9] px-4 text-xs font-semibold text-white transition-transform active:scale-95 disabled:opacity-60"
              >
                <RefreshCw className={cn('h-4 w-4', isLoading && 'animate-spin')} />
                Actualizar
              </button>
            </div>}
          </div>
        </header>

        <nav aria-label="Modos de Bria" className="flex items-center gap-2 border-b border-zinc-200 dark:border-zinc-800">
          <button
            data-bria-tab="observer"
            type="button"
            onClick={() => setActiveTab('observer')}
            aria-current={activeTab === 'observer' ? 'page' : undefined}
            className={cn(
              'inline-flex items-center gap-2 border-b-2 px-3 py-3 text-sm font-semibold',
              activeTab === 'observer' ? 'border-[#009EB9] text-zinc-950 dark:text-white' : 'border-transparent text-zinc-500 dark:text-zinc-400'
            )}
          >
            <Eye className="h-4 w-4" />
            Observer
          </button>
          <button
            data-bria-tab="memory"
            type="button"
            onClick={() => setActiveTab('memory')}
            aria-current={activeTab === 'memory' ? 'page' : undefined}
            className={cn(
              'inline-flex items-center gap-2 border-b-2 px-3 py-3 text-sm font-semibold',
              activeTab === 'memory' ? 'border-[#009EB9] text-zinc-950 dark:text-white' : 'border-transparent text-zinc-500 dark:text-zinc-400'
            )}
          >
            <Database className="h-4 w-4" />
            Memoria
          </button>
          <button
            data-bria-tab="copilot"
            type="button"
            disabled
            title="Copilot será la próxima etapa de Bria"
            className="inline-flex cursor-not-allowed items-center gap-2 px-3 py-3 text-sm font-medium text-zinc-400 dark:text-zinc-600"
          >
            <Bot className="h-4 w-4" />
            Copilot
            <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-zinc-500 dark:bg-zinc-900 dark:text-zinc-500">Próxima etapa</span>
          </button>
        </nav>

        {activeTab === 'memory' ? <BriaMemoryPanel /> : <>
        {error && (
          <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-300">
            <div className="flex items-center gap-2 font-medium"><AlertCircle className="h-4 w-4" /> No pudimos cargar el panel</div>
            <p className="mt-1 pl-6">{error}</p>
          </div>
        )}

        {isLoading && !analytics ? (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {[0, 1, 2, 3].map((item) => <div key={item} className="h-40 animate-pulse rounded-2xl bg-zinc-200/70 dark:bg-zinc-900" />)}
          </div>
        ) : overview ? (
          <>
            <section className="rounded-2xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <Eye className="h-4 w-4 text-[#009EB9]" />
                    <h2 className="text-sm font-semibold text-zinc-950 dark:text-zinc-50">Señales observadas</h2>
                  </div>
                  <p className="mt-1 text-xs leading-5 text-zinc-500 dark:text-zinc-400">
                    Desviaciones y vacíos ordenados por prioridad, siempre acompañados por su evidencia.
                  </p>
                </div>
                {analytics.observer?.sample && (
                  <span className={cn(
                    'w-fit rounded-full px-3 py-1.5 text-xs font-medium',
                    analytics.observer.sample.readyForPrediction
                      ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300'
                      : 'bg-zinc-100 text-zinc-600 dark:bg-zinc-900 dark:text-zinc-400'
                  )}>
                    {analytics.observer.sample.readyForPrediction
                      ? 'Base comparativa inicial disponible'
                      : 'Muestra insuficiente para predecir'}
                  </span>
                )}
              </div>
              <div className="mt-4 grid gap-3 lg:grid-cols-2">
                {(analytics.observer?.signals || []).map((signal) => (
                  <SignalCard key={signal.code} signal={signal} />
                ))}
              </div>
            </section>

            <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <MetricCard icon={Clock} label="Esfuerzo registrado" value={formatDuration(overview.totalWorkMs)} detail={`${overview.sessionCount} sesiones dentro del periodo`} accent />
              <MetricCard icon={Target} label="Mediana por sesión" value={formatDuration(overview.medianSessionMs)} detail={`El 75 % no supera ${formatDuration(overview.p75SessionMs)}`} />
              <MetricCard icon={RefreshCw} label="Retrabajo" value={formatPercentage(overview.reworkRate)} detail={`${formatDuration(overview.reworkMs)} después del ciclo inicial`} />
              <MetricCard icon={CheckCircle2} label="Tareas completadas" value={overview.completedTasks} detail={`${overview.activeTasks} en proceso · ${overview.openSessions} sesiones abiertas`} />
            </section>

            <div className="rounded-2xl border border-[#009EB9]/20 bg-[#009EB9]/[0.04] px-4 py-3 text-xs leading-5 text-zinc-600 dark:border-[#009EB9]/25 dark:bg-[#009EB9]/[0.07] dark:text-zinc-300">
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
                  <Database className="h-4 w-4 text-[#009EB9]" />
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
                        {!session.endedAt && <span className="h-2 w-2 animate-pulse rounded-full bg-[#00AC8A]" aria-label="Sesión activa" />}
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
