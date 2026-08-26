import React, { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, Navigate } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { getApiBaseUrl } from '@/lib/apiBaseUrl';
import { cn } from '@/lib/utils';
import TeamAvatar from '@/components/ui/TeamAvatar';
import OperationalTracePanel from './OperationalTracePanel';
import {
  Activity,
  AlertCircle,
  ArrowUpRight,
  BarChart3,
  Calendar,
  CheckCircle2,
  ChevronDown,
  Clock,
  FileText,
  LayoutGrid,
  Loader2,
  MessageSquare,
  RefreshCw,
  ShieldCheck,
  Target,
  TrendingDown,
  TrendingUp,
  Users
} from '@/components/ui/icons';

const panelClass = 'rounded-lg border border-zinc-200/80 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900';

const toneClasses = {
  violet: 'bg-violet-50 text-violet-700 dark:bg-violet-500/10 dark:text-violet-300',
  emerald: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300',
  amber: 'bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300',
  rose: 'bg-rose-50 text-rose-700 dark:bg-rose-500/10 dark:text-rose-300',
  cyan: 'bg-cyan-50 text-cyan-700 dark:bg-cyan-500/10 dark:text-cyan-300'
};

const moduleIcons = {
  gestion: Target,
  actividad: Calendar,
  parrillas: LayoutGrid,
  cotizaciones: FileText,
  anuncios: Activity,
  conversaciones: MessageSquare
};

const moduleTones = ['violet', 'cyan', 'emerald', 'amber', 'rose', 'violet'];

const formatPeriod = (start, end) => {
  if (!start || !end) return '';
  const endInclusive = new Date(new Date(end).getTime() - 24 * 60 * 60 * 1000);
  const format = (value) => new Intl.DateTimeFormat('es-CO', {
    day: 'numeric',
    month: 'short',
    timeZone: 'America/Bogota'
  }).format(new Date(value));
  return `${format(start)} - ${format(endInclusive)}`;
};

const Trend = ({ value }) => {
  const positive = value >= 0;
  const Icon = positive ? TrendingUp : TrendingDown;
  return (
    <span className={cn(
      'inline-flex items-center gap-1 text-xs font-semibold',
      positive ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'
    )}>
      <Icon className="h-3.5 w-3.5" />
      {positive ? '+' : ''}{value}%
    </span>
  );
};

const MetricCard = ({ icon: Icon, label, value, detail, tone = 'violet', trend }) => (
  <section className={cn(panelClass, 'min-h-[152px] p-5')}>
    <div className="flex items-start justify-between gap-3">
      <span className={cn('flex h-9 w-9 items-center justify-center rounded-lg', toneClasses[tone])}>
        <Icon className="h-4.5 w-4.5" />
      </span>
      {typeof trend === 'number' && <Trend value={trend} />}
    </div>
    <p className="mt-5 text-3xl font-bold text-zinc-950 dark:text-white">{value}</p>
    <p className="mt-1 text-sm font-semibold text-zinc-800 dark:text-zinc-200">{label}</p>
    <p className="mt-1 text-xs leading-5 text-zinc-500 dark:text-zinc-400">{detail}</p>
  </section>
);

const LoadingState = () => (
  <div className="flex min-h-[520px] items-center justify-center">
    <div className="text-center">
      <Loader2 className="mx-auto h-6 w-6 animate-spin text-violet-600" />
      <p className="mt-3 text-sm text-zinc-500 dark:text-zinc-400">Calculando salud operativa...</p>
    </div>
  </div>
);

const ScorePanel = ({ data }) => {
  const statusTone = data.status.id === 'HEALTHY'
    ? 'emerald'
    : data.status.id === 'WATCH' ? 'amber' : 'rose';

  return (
    <section className={cn(panelClass, 'relative min-h-[152px] overflow-hidden p-5')}>
      <div className="flex h-full items-center gap-5">
        <div
          className="relative flex h-24 w-24 shrink-0 items-center justify-center rounded-full"
          style={{ background: `conic-gradient(#009EB9 ${data.score * 3.6}deg, rgba(161,161,170,.18) 0deg)` }}
          aria-label={`Puntaje de salud ${data.score} de 100`}
        >
          <div className="flex h-[76px] w-[76px] items-center justify-center rounded-full bg-white dark:bg-zinc-900">
            <span className="text-3xl font-bold text-zinc-950 dark:text-white">{data.score}</span>
          </div>
        </div>
        <div className="min-w-0">
          <span className={cn('inline-flex rounded-md px-2 py-1 text-[11px] font-bold uppercase', toneClasses[statusTone])}>
            {data.status.label}
          </span>
          <h2 className="mt-3 text-lg font-bold text-zinc-950 dark:text-white">Índice general</h2>
          <p className="mt-1 text-xs leading-5 text-zinc-500 dark:text-zinc-400">
            Síntesis de adopción, calidad operativa, colaboración y preparación de clientes.
          </p>
        </div>
      </div>
    </section>
  );
};

const ActivityChart = ({ days }) => {
  const maxValue = Math.max(1, ...days.map((day) => day.count));
  const dayFormatter = new Intl.DateTimeFormat('es-CO', {
    weekday: 'short',
    timeZone: 'America/Bogota'
  });

  return (
    <div className="mt-6 flex h-44 items-end justify-between gap-2" aria-label="Actividad diaria de la semana">
      {days.map((day) => {
        const height = day.count === 0 ? 4 : Math.max(14, Math.round((day.count / maxValue) * 132));
        return (
          <div key={day.date} className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-2">
            <span className="text-[11px] font-semibold text-zinc-500 dark:text-zinc-400">{day.count}</span>
            <div className="flex h-[132px] w-full max-w-12 items-end rounded-md bg-zinc-100 dark:bg-zinc-800/70">
              <div
                className="w-full rounded-md bg-violet-600 transition-[height] duration-500 dark:bg-violet-500"
                style={{ height }}
              />
            </div>
            <span className="text-[11px] font-semibold capitalize text-zinc-500 dark:text-zinc-400">
              {dayFormatter.format(new Date(day.date)).replace('.', '')}
            </span>
          </div>
        );
      })}
    </div>
  );
};

const IssueList = ({ issues }) => {
  const firstIssue = issues.find((issue) => issue.count > 0)?.id || null;
  const [expandedIssue, setExpandedIssue] = useState(firstIssue);

  return (
    <section className={cn(panelClass, 'p-5')}>
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-bold uppercase text-rose-600 dark:text-rose-400">Atención requerida</p>
          <h2 className="mt-1 text-lg font-bold text-zinc-950 dark:text-white">Incidencias accionables</h2>
        </div>
        <AlertCircle className="h-5 w-5 text-rose-500" />
      </div>

      <div className="mt-5 divide-y divide-zinc-100 border-y border-zinc-100 dark:divide-zinc-800 dark:border-zinc-800">
        {issues.map((issue) => {
          const expanded = expandedIssue === issue.id;
          return (
            <div key={issue.id}>
              <button
                type="button"
                onClick={() => setExpandedIssue(expanded ? null : issue.id)}
                className="flex w-full items-center gap-3 py-4 text-left"
                aria-expanded={expanded}
              >
                <span className={cn('flex h-8 min-w-8 items-center justify-center rounded-md px-2 text-xs font-bold', toneClasses[issue.tone])}>
                  {issue.count}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold text-zinc-900 dark:text-zinc-100">{issue.title}</span>
                  <span className="mt-0.5 block text-xs leading-5 text-zinc-500 dark:text-zinc-400">{issue.description}</span>
                </span>
                <ChevronDown className={cn('h-4 w-4 shrink-0 text-zinc-400 transition-transform', expanded && 'rotate-180')} />
              </button>

              {expanded && (
                <div className="pb-4 pl-11">
                  {issue.items.length === 0 ? (
                    <div className="flex items-center gap-2 py-2 text-xs font-medium text-emerald-600 dark:text-emerald-400">
                      <CheckCircle2 className="h-4 w-4" /> Sin pendientes en esta categoría
                    </div>
                  ) : (
                    <div className="divide-y divide-zinc-100 border-l border-zinc-200 pl-3 dark:divide-zinc-800 dark:border-zinc-700">
                      {issue.items.map((item) => (
                        <Link
                          key={item.id}
                          to={item.url}
                          className="flex items-center gap-3 py-2.5 text-sm transition-colors hover:text-violet-700 dark:hover:text-violet-300"
                        >
                          <span className="min-w-0 flex-1">
                            <span className="block truncate font-medium text-zinc-800 dark:text-zinc-200">{item.title}</span>
                            <span className="block truncate text-xs text-zinc-500 dark:text-zinc-400">{item.subtitle}</span>
                          </span>
                          <ArrowUpRight className="h-3.5 w-3.5 shrink-0 text-zinc-400" />
                        </Link>
                      ))}
                      {issue.count > issue.items.length && (
                        <p className="py-2 text-xs text-zinc-500 dark:text-zinc-400">
                          Mostrando {issue.items.length} de {issue.count} registros.
                        </p>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
};

const OperationalHealth = () => {
  const { currentUser } = useAuth();
  const [showMethod, setShowMethod] = useState(false);
  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ['operational-health'],
    queryFn: async () => {
      const response = await fetch(`${getApiBaseUrl()}/api/dashboard/operational-health`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('authToken')}` },
        cache: 'no-store'
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'No fue posible cargar la salud operativa.');
      return payload;
    },
    enabled: currentUser?.role === 'ADMIN',
    staleTime: 60_000
  });

  const maxModuleActivity = useMemo(
    () => Math.max(1, ...(data?.modules || []).map((module) => module.current)),
    [data?.modules]
  );

  if (currentUser?.role !== 'ADMIN') return <Navigate to="/" replace />;
  if (isLoading) return <LoadingState />;

  if (error || !data) {
    return (
      <div className="flex min-h-[520px] items-center justify-center">
        <div className={cn(panelClass, 'max-w-md p-6 text-center')}>
          <AlertCircle className="mx-auto h-6 w-6 text-rose-500" />
          <h1 className="mt-3 text-lg font-bold text-zinc-950 dark:text-white">No pudimos calcular la salud operativa</h1>
          <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">{error?.message}</p>
          <button type="button" onClick={() => refetch()} className="mt-5 rounded-lg bg-violet-600 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-700">
            Intentar nuevamente
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-[1600px] pb-10">
      <header className="flex flex-col gap-4 py-6 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="flex items-center gap-2 text-xs font-bold uppercase text-violet-600 dark:text-violet-400">
            <ShieldCheck className="h-4 w-4" /> Vista administrativa
          </div>
          <h1 className="mt-2 text-3xl font-bold text-zinc-950 dark:text-white">Salud Operativa</h1>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-zinc-500 dark:text-zinc-400">
            Adopción, calidad de información y centralización del trabajo en una sola lectura.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span className="inline-flex h-10 items-center gap-2 rounded-lg border border-zinc-200 bg-white px-3 text-xs font-semibold text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300">
            <Calendar className="h-4 w-4 text-violet-500" />
            {formatPeriod(data.period.currentStart, data.period.currentEnd)}
          </span>
          <button
            type="button"
            onClick={() => refetch()}
            disabled={isFetching}
            title="Actualizar métricas"
            aria-label="Actualizar métricas"
            className="flex h-10 w-10 items-center justify-center rounded-lg border border-zinc-200 bg-white text-zinc-600 hover:border-violet-300 hover:text-violet-700 disabled:opacity-50 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300"
          >
            <RefreshCw className={cn('h-4 w-4', isFetching && 'animate-spin')} />
          </button>
        </div>
      </header>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-[1.35fr_repeat(3,minmax(0,0.75fr))]">
        <ScorePanel data={data} />
        <MetricCard
          icon={Users}
          label="Adopción semanal"
          value={`${data.adoption.rate}%`}
          detail={`${data.adoption.activeUsers} de ${data.adoption.totalUsers} personas con actividad verificable`}
          trend={data.adoption.trend}
          tone="violet"
        />
        <MetricCard
          icon={Target}
          label="Calidad de tareas"
          value={`${data.quality.score}%`}
          detail={`${data.quality.openTasks} tareas abiertas evaluadas`}
          tone="cyan"
        />
        <MetricCard
          icon={ShieldCheck}
          label="Clientes preparados"
          value={`${data.clients.score}%`}
          detail={`${data.clients.incomplete} de ${data.clients.active} requieren información`}
          tone="emerald"
        />
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1.45fr)_minmax(320px,0.55fr)]">
        <section className={cn(panelClass, 'p-5 sm:p-6')}>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="text-xs font-bold uppercase text-violet-600 dark:text-violet-400">Ritmo semanal</p>
              <h2 className="mt-1 text-lg font-bold text-zinc-950 dark:text-white">Actividad registrada</h2>
              <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">Acciones operativas confirmadas por Brainstudio, no simples visitas.</p>
            </div>
            <div className="flex items-center gap-2 text-xs text-zinc-500 dark:text-zinc-400">
              <Clock className="h-4 w-4" /> Actualizado ahora
            </div>
          </div>
          <ActivityChart days={data.dailyActivity} />

          <div className="mt-6 border-t border-zinc-100 pt-5 dark:border-zinc-800">
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-sm font-bold text-zinc-900 dark:text-white">Participación del equipo</h3>
              <span className="text-xs text-zinc-500 dark:text-zinc-400">Acciones esta semana</span>
            </div>
            <div className="mt-4 grid grid-cols-1 gap-x-5 gap-y-3 sm:grid-cols-2">
              {data.users.slice(0, 8).map((user) => (
                <div key={user.id} className="flex min-w-0 items-center gap-3">
                  <TeamAvatar member={user} className="h-8 w-8" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-zinc-800 dark:text-zinc-200">{user.name}</p>
                    <p className="truncate text-[11px] text-zinc-500 dark:text-zinc-400">{user.role}</p>
                  </div>
                  <span className={cn(
                    'text-xs font-bold',
                    user.active ? 'text-zinc-800 dark:text-zinc-200' : 'text-zinc-400'
                  )}>{user.actions}</span>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className={cn(panelClass, 'p-5 sm:p-6')}>
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-bold uppercase text-cyan-600 dark:text-cyan-400">Transparencia</p>
              <h2 className="mt-1 text-lg font-bold text-zinc-950 dark:text-white">Como se calcula</h2>
            </div>
            <button
              type="button"
              onClick={() => setShowMethod((current) => !current)}
              className="flex h-8 w-8 items-center justify-center rounded-lg bg-zinc-100 text-zinc-600 hover:text-violet-700 dark:bg-zinc-800 dark:text-zinc-300"
              aria-label="Mostrar metodología"
              aria-expanded={showMethod}
              title="Mostrar metodología"
            >
              <ChevronDown className={cn('h-4 w-4 transition-transform', showMethod && 'rotate-180')} />
            </button>
          </div>

          <div className="mt-6 space-y-5">
            {[
              ['Adopción', data.adoption.rate, data.weights.adoption, 'violet'],
              ['Calidad de tareas', data.quality.score, data.weights.taskQuality, 'cyan'],
              ['Colaboracion', data.collaboration.score, data.weights.collaboration, 'amber'],
              ['Clientes preparados', data.clients.score, data.weights.clientReadiness, 'emerald']
            ].map(([label, value, weight, tone]) => (
              <div key={label}>
                <div className="flex items-center justify-between gap-3 text-xs">
                  <span className="font-semibold text-zinc-700 dark:text-zinc-300">{label}</span>
                  <span className="text-zinc-500 dark:text-zinc-400">{value}% · peso {weight}%</span>
                </div>
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800">
                  <div className={cn('h-full rounded-full', toneClasses[tone].split(' ')[0])} style={{ width: `${value}%` }} />
                </div>
              </div>
            ))}
          </div>

          {showMethod && (
            <div className="mt-6 border-t border-zinc-100 pt-5 text-xs leading-5 text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
              Una persona cuenta como activa cuando crea o comenta tareas, registra eventos, lidera parrillas, publica anuncios o participa en conversaciones. El puntaje no usa clics ni contenido privado.
            </div>
          )}
        </section>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1.15fr)_minmax(380px,0.85fr)]">
        <section className={cn(panelClass, 'p-5 sm:p-6')}>
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-bold uppercase text-emerald-600 dark:text-emerald-400">Centralización</p>
              <h2 className="mt-1 text-lg font-bold text-zinc-950 dark:text-white">Uso por módulo</h2>
              <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">Volumen de acciones confirmadas durante la semana actual.</p>
            </div>
            <BarChart3 className="h-5 w-5 text-emerald-500" />
          </div>

          <div className="mt-6 space-y-5">
            {data.modules.map((module, index) => {
              const Icon = moduleIcons[module.id] || Activity;
              const tone = moduleTones[index % moduleTones.length];
              return (
                <Link key={module.id} to={module.route} className="group/module grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3">
                  <span className={cn('flex h-9 w-9 items-center justify-center rounded-lg', toneClasses[tone])}>
                    <Icon className="h-4 w-4" />
                  </span>
                  <span className="min-w-0">
                    <span className="flex items-center justify-between gap-3">
                      <span className="text-sm font-semibold text-zinc-800 group-hover/module:text-violet-700 dark:text-zinc-200 dark:group-hover/module:text-violet-300">{module.label}</span>
                      <span className="text-[11px] text-zinc-500 dark:text-zinc-400">{module.contributors} participantes</span>
                    </span>
                    <span className="mt-2 block h-1.5 overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800">
                      <span className="block h-full rounded-full bg-zinc-700 dark:bg-zinc-300" style={{ width: `${Math.max(2, (module.current / maxModuleActivity) * 100)}%` }} />
                    </span>
                  </span>
                  <span className="min-w-12 text-right">
                    <span className="block text-sm font-bold text-zinc-900 dark:text-white">{module.current}</span>
                    <Trend value={module.trend} />
                  </span>
                </Link>
              );
            })}
          </div>
        </section>

        <IssueList issues={data.issues} />
      </div>

      <OperationalTracePanel />
    </div>
  );
};

export default OperationalHealth;
