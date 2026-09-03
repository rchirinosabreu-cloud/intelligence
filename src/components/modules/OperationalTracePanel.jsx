import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { getApiBaseUrl } from '@/lib/apiBaseUrl';
import { cn } from '@/lib/utils';
import TeamAvatar from '@/components/ui/TeamAvatar';
import {
  Activity,
  Bell,
  CheckCircle2,
  Edit2,
  Eye,
  List,
  Plus,
  RefreshCw,
  Search,
  User
} from '@/components/ui/icons';

const eventConfig = {
  TASK_CREATED: { label: 'Tarea creada', icon: Plus, tone: 'text-violet-600 bg-violet-50 dark:bg-violet-500/10 dark:text-violet-300' },
  TASK_ASSIGNED: { label: 'Tarea asignada', icon: User, tone: 'text-cyan-600 bg-cyan-50 dark:bg-cyan-500/10 dark:text-cyan-300' },
  TASK_UPDATED: { label: 'Tarea actualizada', icon: Edit2, tone: 'text-amber-600 bg-amber-50 dark:bg-amber-500/10 dark:text-amber-300' },
  TASK_OPENED: { label: 'Tarea abierta', icon: Eye, tone: 'text-emerald-600 bg-emerald-50 dark:bg-emerald-500/10 dark:text-emerald-300' },
  TASK_LIST_SYNCED: { label: 'Gestión sincronizada', icon: RefreshCw, tone: 'text-blue-600 bg-blue-50 dark:bg-blue-500/10 dark:text-blue-300' },
  NOTIFICATION_CREATED: { label: 'Notificación emitida', icon: Bell, tone: 'text-fuchsia-600 bg-fuchsia-50 dark:bg-fuchsia-500/10 dark:text-fuchsia-300' },
  NOTIFICATION_READ: { label: 'Notificación leída', icon: CheckCircle2, tone: 'text-emerald-600 bg-emerald-50 dark:bg-emerald-500/10 dark:text-emerald-300' },
  SESSION_STARTED: { label: 'Inicio de sesión', icon: User, tone: 'text-cyan-600 bg-cyan-50 dark:bg-cyan-500/10 dark:text-cyan-300' },
  PLATFORM_MUTATION: { label: 'Acción registrada', icon: Activity, tone: 'text-blue-600 bg-blue-50 dark:bg-blue-500/10 dark:text-blue-300' }
};

const formatDateTime = (value) => value
  ? new Intl.DateTimeFormat('es-CO', {
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
    timeZone: 'America/Bogota'
  }).format(new Date(value))
  : 'Sin registro';

const OperationalTracePanel = () => {
  const [userId, setUserId] = useState('');
  const [days, setDays] = useState('7');
  const [taskQuery, setTaskQuery] = useState('');
  const [appliedTaskQuery, setAppliedTaskQuery] = useState('');

  const { data, isLoading, isFetching, error, refetch } = useQuery({
    queryKey: ['operational-trace', userId, days, appliedTaskQuery],
    queryFn: async () => {
      const params = new URLSearchParams({ days, limit: '120' });
      if (userId) params.set('userId', userId);
      if (appliedTaskQuery) params.set('taskQuery', appliedTaskQuery);
      const response = await fetch(`${getApiBaseUrl()}/api/dashboard/operational-trace?${params}`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('authToken')}` },
        cache: 'no-store'
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'No fue posible cargar la trazabilidad.');
      return payload;
    },
    staleTime: 30_000
  });

  const submitSearch = (event) => {
    event.preventDefault();
    setAppliedTaskQuery(taskQuery.trim());
  };

  return (
    <section className="mt-4 rounded-lg border border-zinc-200/80 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
      <div className="border-b border-zinc-100 p-5 dark:border-zinc-800 sm:p-6">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <div className="flex items-center gap-2 text-xs font-bold uppercase text-violet-600 dark:text-violet-400">
              <Activity className="h-4 w-4" /> Evidencia administrativa
            </div>
            <h2 className="mt-2 text-xl font-bold text-zinc-950 dark:text-white">Trazabilidad operativa</h2>
            <p className="mt-1 max-w-2xl text-sm leading-6 text-zinc-500 dark:text-zinc-400">
              Línea de tiempo de inicios de sesión y cambios realizados en todos los módulos de la plataforma.
            </p>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row">
            <label className="sr-only" htmlFor="trace-user">Miembro del equipo</label>
            <select
              id="trace-user"
              value={userId}
              onChange={(event) => setUserId(event.target.value)}
              className="h-10 min-w-52 rounded-lg border border-zinc-200 bg-white px-3 text-sm text-zinc-700 outline-none focus:border-violet-400 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200"
            >
              <option value="">Todo el equipo</option>
              {(data?.users || []).map((user) => <option key={user.id} value={user.id}>{user.name}</option>)}
            </select>

            <label className="sr-only" htmlFor="trace-period">Período</label>
            <select
              id="trace-period"
              value={days}
              onChange={(event) => setDays(event.target.value)}
              className="h-10 rounded-lg border border-zinc-200 bg-white px-3 text-sm text-zinc-700 outline-none focus:border-violet-400 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200"
            >
              <option value="1">Últimas 24 horas</option>
              <option value="7">Últimos 7 días</option>
              <option value="30">Últimos 30 días</option>
            </select>

            <form onSubmit={submitSearch} className="flex min-w-0 sm:w-72">
              <label className="sr-only" htmlFor="trace-task-search">Buscar por tarea</label>
              <div className="relative min-w-0 flex-1">
                <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-zinc-400" />
                <input
                  id="trace-task-search"
                  value={taskQuery}
                  onChange={(event) => setTaskQuery(event.target.value)}
                  placeholder="Buscar por tarea"
                  className="h-10 w-full rounded-l-lg border border-r-0 border-zinc-200 bg-white pl-9 pr-3 text-sm text-zinc-700 outline-none focus:border-violet-400 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200"
                />
              </div>
              <button type="submit" className="h-10 rounded-r-lg bg-violet-600 px-3 text-sm font-semibold text-white hover:bg-violet-700">
                Buscar
              </button>
            </form>

            <button
              type="button"
              onClick={() => refetch()}
              disabled={isFetching}
              aria-label="Actualizar trazabilidad"
              title="Actualizar trazabilidad"
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-zinc-200 text-zinc-500 hover:border-violet-300 hover:text-violet-700 disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-300"
            >
              <RefreshCw className={cn('h-4 w-4', isFetching && 'animate-spin')} />
            </button>
          </div>
        </div>
      </div>

      {isLoading ? (
        <div className="flex min-h-64 items-center justify-center text-sm text-zinc-500 dark:text-zinc-400">
          <RefreshCw className="mr-2 h-4 w-4 animate-spin" /> Consultando eventos...
        </div>
      ) : error ? (
        <div className="p-6 text-sm text-destructive">{error.message}</div>
      ) : (
        <>
          <div className="grid grid-cols-2 border-b border-zinc-100 dark:border-zinc-800 lg:grid-cols-5">
            {[
              ['Eventos registrados', data?.summary.totalEvents || 0],
              ['Inicios de sesión', data?.summary.sessionStarts || 0],
              ['Tareas abiertas', data?.summary.taskOpens || 0],
              ['Cambios en plataforma', data?.summary.platformMutations || 0],
              ['Notificaciones leídas', data?.summary.notificationReads || 0]
            ].map(([label, value], index) => (
              <div key={label} className={cn('min-w-0 p-4 sm:p-5', index > 0 && 'border-l border-zinc-100 dark:border-zinc-800')}>
                <p className="truncate text-xs text-zinc-500 dark:text-zinc-400">{label}</p>
                <p className="mt-2 truncate text-sm font-bold text-zinc-900 dark:text-white" title={String(value)}>{value}</p>
              </div>
            ))}
          </div>

          <div className="min-h-[360px]">
            <div className="max-h-[560px] overflow-y-auto">
              {(data?.timeline || []).length === 0 ? (
                <div className="flex min-h-[360px] flex-col items-center justify-center p-6 text-center">
                  <List className="h-7 w-7 text-zinc-300 dark:text-zinc-600" />
                  <p className="mt-3 text-sm font-semibold text-zinc-700 dark:text-zinc-200">No hay eventos para estos filtros</p>
                  <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">La trazabilidad comienza a registrarse desde esta versión.</p>
                </div>
              ) : data.timeline.map((event) => {
                const config = eventConfig[event.eventType] || { label: 'Actividad', icon: Activity, tone: 'text-zinc-600 bg-zinc-100 dark:bg-zinc-800 dark:text-zinc-300' };
                const Icon = config.icon;
                return (
                  <div key={event.id} className="grid grid-cols-[auto_minmax(0,1fr)_auto] gap-3 border-b border-zinc-100 px-5 py-4 last:border-b-0 dark:border-zinc-800 sm:px-6">
                    <span className={cn('flex h-9 w-9 items-center justify-center rounded-lg', config.tone)}><Icon className="h-4 w-4" /></span>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-xs font-bold uppercase text-zinc-500 dark:text-zinc-400">{config.label}</span>
                        {event.task && (
                          <Link to={`/gestion?taskId=${event.task.id}`} className="truncate text-xs font-semibold text-violet-600 hover:underline dark:text-violet-400">
                            {event.task.clientName ? `${event.task.clientName} · ` : ''}{event.task.title}
                          </Link>
                        )}
                      </div>
                      <p className="mt-1 text-sm leading-5 text-zinc-700 dark:text-zinc-200">{event.description}</p>
                    </div>
                    <time className="whitespace-nowrap text-xs text-zinc-400">{formatDateTime(event.occurredAt)}</time>
                  </div>
                );
              })}
            </div>

          </div>
        </>
      )}
    </section>
  );
};

export default OperationalTracePanel;
