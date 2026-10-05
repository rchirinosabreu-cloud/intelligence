import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { useAuth } from '@/context/AuthContext';
import { getApiBaseUrl } from '@/lib/apiBaseUrl';
import { cn } from '@/lib/utils';
import { ChevronDown, Loader2, RefreshCw } from '@/components/ui/icons';

/**
 * Semáforo de servicios (Rodny, 4 de octubre de 2026): si algún servicio externo del que depende
 * Intelligence está caído, con problemas o funcionando. Solo administradores. Las reglas del color
 * viven en `src/lib/serviceHealth.js`; aquí solo se pintan.
 */

const panelClass = 'rounded-lg border border-zinc-200/80 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900';

const LIGHT_TONES = {
  GREEN: { label: 'Funciona', dot: 'bg-status-positive', text: 'text-status-positive-fg', soft: 'border-status-positive/25 bg-status-positive/10' },
  YELLOW: { label: 'Con problemas', dot: 'bg-status-attention', text: 'text-status-attention-fg', soft: 'border-status-attention/35 bg-status-attention/15' },
  RED: { label: 'Caído', dot: 'bg-destructive', text: 'text-destructive', soft: 'border-destructive/30 bg-destructive/10' },
  GRAY: { label: 'Sin configurar', dot: 'bg-zinc-300 dark:bg-zinc-600', text: 'text-zinc-500 dark:text-zinc-400', soft: 'border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-white/5' }
};

const HISTORY_TONES = {
  OK: 'bg-status-positive',
  WARN: 'bg-status-attention',
  FAIL: 'bg-destructive',
  NOT_CONFIGURED: 'bg-zinc-300 dark:bg-zinc-600'
};

const OVERALL_TEXT = {
  GREEN: 'Todos los servicios funcionan',
  YELLOW: 'Hay servicios con problemas',
  RED: 'Hay servicios caídos',
  GRAY: 'Todavía no hay comprobaciones'
};

const LIGHT_ORDER = { RED: 0, YELLOW: 1, GREEN: 2, GRAY: 3 };

const authHeaders = () => ({ Authorization: `Bearer ${localStorage.getItem('authToken')}` });

const timeFormatter = new Intl.DateTimeFormat('es-CO', { hour: 'numeric', minute: '2-digit', timeZone: 'America/Bogota' });

const relativeTime = (value, nowMs) => {
  if (!value) return 'nunca';
  const minutes = Math.round((nowMs - new Date(value).getTime()) / 60000);
  if (minutes < 1) return 'hace un momento';
  if (minutes < 60) return `hace ${minutes} min`;
  return `a las ${timeFormatter.format(new Date(value))}`;
};

const HistoryStrip = ({ history }) => (
  <div className="mt-3 flex h-2 gap-px" aria-hidden="true">
    {history.map((bucket) => (
      <span
        key={bucket.start}
        className={cn('flex-1 rounded-[1px]', bucket.status ? HISTORY_TONES[bucket.status] : 'bg-zinc-100 dark:bg-zinc-800')}
      />
    ))}
  </div>
);

const ServiceCard = ({ service, nowMs }) => {
  const tone = LIGHT_TONES[service.light] || LIGHT_TONES.GRAY;
  const troubled = service.light === 'RED' || service.light === 'YELLOW';
  return (
    <article
      className={cn('min-w-0 rounded-lg border p-4', troubled ? tone.soft : 'border-zinc-200/80 bg-white dark:border-zinc-800 dark:bg-zinc-900')}
      aria-label={`${service.label}: ${tone.label}`}
      data-service-light={service.light}
    >
      <div className="flex min-w-0 items-start gap-3">
        <span className={cn('mt-1 h-3 w-3 shrink-0 rounded-full', tone.dot)} />
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-baseline justify-between gap-2">
            <h3 className="truncate text-sm font-semibold text-zinc-900 dark:text-zinc-50" title={service.purpose}>{service.label}</h3>
            <span className={cn('shrink-0 text-xs font-semibold', tone.text)}>{tone.label}</span>
          </div>
          <p className="mt-1 text-xs leading-5 text-zinc-600 dark:text-zinc-300">{service.reason}</p>
          {troubled && <p className="mt-1 text-xs leading-5 text-zinc-500 dark:text-zinc-400">{service.impact}</p>}
        </div>
      </div>
      <HistoryStrip history={service.history} />
      <div className="mt-2 flex items-center justify-between gap-2 text-[11px] text-zinc-500 dark:text-zinc-400">
        <span>Últimas 24 h{service.uptime24h !== null ? ` · ${service.uptime24h}% disponible` : ''}</span>
        <span>Comprobado {relativeTime(service.lastCheck?.checkedAt, nowMs)}</span>
      </div>
    </article>
  );
};

const ServiceHealthPanel = () => {
  const { currentUser } = useAuth();
  const isAdmin = currentUser?.role === 'ADMIN';
  const queryClient = useQueryClient();
  const [running, setRunning] = useState(false);
  const [showAll, setShowAll] = useState(false);

  const { data, isLoading, error, dataUpdatedAt } = useQuery({
    queryKey: ['service-health'],
    queryFn: async () => {
      const response = await fetch(`${getApiBaseUrl()}/api/service-health`, { headers: authHeaders(), cache: 'no-store' });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        console.error('[ServiceHealth] Error al leer el estado:', payload);
        throw new Error(payload.error || 'No fue posible leer el estado de los servicios.');
      }
      return payload;
    },
    enabled: isAdmin,
    refetchInterval: 60_000,
    staleTime: 30_000
  });

  const runNow = async () => {
    setRunning(true);
    try {
      const response = await fetch(`${getApiBaseUrl()}/api/service-health/run`, { method: 'POST', headers: authHeaders() });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        console.error('[ServiceHealth] Error al comprobar:', payload);
        toast.error(payload.error || 'No fue posible comprobar los servicios.');
        return;
      }
      queryClient.setQueryData(['service-health'], payload);
      toast.success('Servicios comprobados.');
    } catch (requestError) {
      console.error('[ServiceHealth] Error al comprobar:', requestError);
      toast.error('No fue posible comprobar los servicios.');
    } finally {
      setRunning(false);
    }
  };

  if (!isAdmin) return null;

  const nowMs = dataUpdatedAt || 0;
  const services = [...(data?.services || [])].sort((a, b) => LIGHT_ORDER[a.light] - LIGHT_ORDER[b.light]);
  const troubled = services.filter((service) => service.light === 'RED' || service.light === 'YELLOW');
  // Con todo en verde no hace falta ver doce tarjetas: se muestran solo si se piden.
  const visible = showAll || troubled.length === 0 ? services : troubled;
  const overall = LIGHT_TONES[data?.overall] || LIGHT_TONES.GRAY;
  const allGood = data && troubled.length === 0;

  return (
    <section className={cn(panelClass, 'mb-4 p-5 sm:p-6')} aria-labelledby="service-health-title">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-center gap-3">
          <span className={cn('h-4 w-4 shrink-0 rounded-full', overall.dot)} aria-hidden="true" />
          <div className="min-w-0">
            <h2 id="service-health-title" className="text-lg font-semibold text-zinc-950 dark:text-white">Estado de los servicios</h2>
            <p className="text-sm text-zinc-500 dark:text-zinc-400">
              {isLoading ? 'Leyendo el estado…' : error ? error.message : (
                <>
                  {OVERALL_TEXT[data.overall]}
                  {data.lastCheckedAt && ` · última comprobación ${relativeTime(data.lastCheckedAt, nowMs)}`}
                </>
              )}
            </p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {data && (troubled.length > 0 || showAll) && (
            <button
              type="button"
              onClick={() => setShowAll((value) => !value)}
              className="inline-flex h-10 items-center gap-1 rounded-lg px-3 text-xs font-semibold text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800"
              aria-expanded={showAll}
            >
              {!showAll ? `Ver los ${services.length}` : allGood ? 'Ocultar detalle' : 'Ver solo los que fallan'}
            </button>
          )}
          <button
            type="button"
            onClick={runNow}
            disabled={running}
            className="inline-flex h-10 items-center gap-2 rounded-lg border border-zinc-200 bg-white px-3 text-xs font-semibold text-zinc-700 hover:border-brand-cyan/50 hover:text-brand-cyan-deep disabled:opacity-50 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:text-brand-cyan"
          >
            {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            Comprobar ahora
          </button>
        </div>
      </div>

      {isLoading && (
        <div className="mt-5 flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-zinc-400" /></div>
      )}

      {data && allGood && !showAll ? (
        <button
          type="button"
          onClick={() => setShowAll(true)}
          className="mt-4 flex w-full items-center justify-between gap-3 rounded-lg border border-status-positive/25 bg-status-positive/10 px-4 py-3 text-left text-sm text-zinc-700 hover:bg-status-positive/15 dark:text-zinc-200"
        >
          <span className="flex flex-wrap gap-x-3 gap-y-1">
            {services.map((service) => (
              <span key={service.id} className="inline-flex items-center gap-1.5 text-xs" aria-label={`${service.label}: ${(LIGHT_TONES[service.light] || LIGHT_TONES.GRAY).label}`}>
                <span className={cn('h-2 w-2 rounded-full', (LIGHT_TONES[service.light] || LIGHT_TONES.GRAY).dot)} />
                {service.label}
              </span>
            ))}
          </span>
          <ChevronDown className="h-4 w-4 shrink-0" />
        </button>
      ) : data && (
        <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          {visible.map((service) => <ServiceCard key={service.id} service={service} nowMs={nowMs} />)}
        </div>
      )}
    </section>
  );
};

export default ServiceHealthPanel;
