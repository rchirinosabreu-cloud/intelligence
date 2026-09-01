import React, { useCallback, useEffect, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Clock,
  ExternalLink,
  RefreshCw
} from '@/components/ui/icons';
import { getApiBaseUrl } from '@/lib/apiBaseUrl';
import { cn } from '@/lib/utils';

const FILTERS = [
  { value: 'ACTIVE', label: 'Activas' },
  { value: 'REVIEWED', label: 'Revisadas' },
  { value: 'SNOOZED', label: 'Aplazadas' },
  { value: 'DISMISSED', label: 'Descartadas' },
  { value: 'RESOLVED', label: 'Resueltas' }
];

const SEVERITY = {
  critical: { label: 'Crítica', className: 'bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300' },
  warning: { label: 'Advertencia', className: 'bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300' },
  attention: { label: 'Atención', className: 'bg-violet-50 text-violet-700 dark:bg-violet-950/40 dark:text-violet-300' },
  info: { label: 'Informativa', className: 'bg-sky-50 text-sky-700 dark:bg-sky-950/40 dark:text-sky-300' }
};

const formatDate = (value) => value
  ? new Intl.DateTimeFormat('es-CO', { day: '2-digit', month: 'short', hour: 'numeric', minute: '2-digit' }).format(new Date(value))
  : 'Aún sin escaneo';

export default function BriaObserverInbox() {
  const [filter, setFilter] = useState('ACTIVE');
  const [payload, setPayload] = useState({ summary: {}, signals: [] });
  const [isLoading, setIsLoading] = useState(true);
  const [isScanning, setIsScanning] = useState(false);
  const [busyId, setBusyId] = useState('');
  const [error, setError] = useState('');

  const request = useCallback(async (path, options = {}) => {
    const token = localStorage.getItem('authToken');
    const response = await fetch(`${getApiBaseUrl()}${path}`, {
      ...options,
      headers: {
        Authorization: token ? `Bearer ${token}` : '',
        'Content-Type': 'application/json',
        ...(options.headers || {})
      }
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const requestError = new Error(data.message || data.error || 'La solicitud no pudo completarse');
      requestError.response = { data, status: response.status };
      throw requestError;
    }
    return data;
  }, []);

  const loadSignals = useCallback(async ({ quiet = false } = {}) => {
    if (!quiet) setIsLoading(true);
    setError('');
    try {
      setPayload(await request(`/api/manager/observer-signals?status=${filter}`));
    } catch (requestError) {
      console.error('[BriaObserverInbox] Error cargando señales:', requestError.response?.data || requestError.message || requestError);
      setError(requestError.message);
    } finally {
      if (!quiet) setIsLoading(false);
    }
  }, [filter, request]);

  useEffect(() => { loadSignals(); }, [loadSignals]);

  const scanNow = async () => {
    if (isScanning) return;
    setIsScanning(true);
    setError('');
    try {
      await request('/api/manager/observer-signals/sync', { method: 'POST' });
      await loadSignals({ quiet: true });
    } catch (requestError) {
      console.error('[BriaObserverInbox] Error ejecutando escaneo:', requestError.response?.data || requestError.message || requestError);
      setError(requestError.message);
    } finally {
      setIsScanning(false);
    }
  };

  const transition = async (signal, action) => {
    if (busyId) return;
    setBusyId(signal.id);
    setError('');
    try {
      const body = { action };
      if (action === 'SNOOZE') body.snoozedUntil = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
      await request(`/api/manager/observer-signals/${signal.id}`, { method: 'PATCH', body: JSON.stringify(body) });
      await loadSignals({ quiet: true });
    } catch (requestError) {
      console.error('[BriaObserverInbox] Error actualizando señal:', requestError.response?.data || requestError.message || requestError);
      setError(requestError.message);
    } finally {
      setBusyId('');
    }
  };

  const summary = payload.summary || {};
  const signals = payload.signals || [];

  return (
    <section aria-labelledby="observer-inbox-title" className="rounded-2xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
      <div className="border-b border-zinc-200 p-5 dark:border-zinc-800 sm:p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-[#009EB9]/10 text-[#00839A] dark:text-[#74D9EA]"><AlertCircle className="h-4 w-4" /></span>
              <div>
                <h2 id="observer-inbox-title" className="text-base font-semibold text-zinc-950 dark:text-zinc-50">Bandeja del Observer</h2>
                <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">Bria revisa las fuentes automáticamente y conserva evidencia de cada hallazgo.</p>
              </div>
            </div>
            <p aria-live="polite" className="mt-3 text-xs text-zinc-500 dark:text-zinc-400">
              {summary.active || 0} activas · último escaneo {formatDate(summary.lastScannedAt)}
            </p>
          </div>
          <button type="button" onClick={scanNow} disabled={isScanning} className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-[#009EB9] px-4 text-xs font-semibold text-white transition-transform active:scale-95 disabled:opacity-60 sm:w-auto">
            <RefreshCw className={cn('h-4 w-4', isScanning && 'animate-spin')} />
            {isScanning ? 'Observando…' : 'Escanear ahora'}
          </button>
        </div>

        <div className="mt-5 flex flex-wrap gap-2" role="group" aria-label="Filtrar señales por estado">
          {FILTERS.map((item) => (
            <button key={item.value} type="button" onClick={() => setFilter(item.value)} aria-pressed={filter === item.value} className={cn('min-h-11 rounded-xl px-3 text-xs font-medium transition-colors', filter === item.value ? 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-950' : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800')}>
              {item.label}
            </button>
          ))}
        </div>
      </div>

      <div className="p-4 sm:p-6">
        {error && <div role="alert" className="mb-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-300">{error}</div>}
        {isLoading ? (
          <div className="space-y-3" aria-label="Cargando señales">{[0, 1].map((item) => <div key={item} className="h-40 animate-pulse rounded-xl bg-zinc-100 dark:bg-zinc-900" />)}</div>
        ) : signals.length === 0 ? (
          <div className="flex min-h-44 flex-col items-center justify-center rounded-xl border border-dashed border-zinc-200 px-5 text-center dark:border-zinc-800">
            <CheckCircle2 className="h-6 w-6 text-[#00AC8A]" />
            <p className="mt-3 text-sm font-medium text-zinc-800 dark:text-zinc-100">No hay señales en este estado</p>
            <p className="mt-1 max-w-md text-xs leading-5 text-zinc-500 dark:text-zinc-400">Observer seguirá revisando tareas, sesiones y minutas en segundo plano.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {signals.map((signal) => {
              const severity = SEVERITY[signal.severity] || SEVERITY.info;
              const isBusy = busyId === signal.id;
              const isClosed = ['DISMISSED', 'RESOLVED'].includes(signal.status);
              return (
                <article key={signal.id} className="rounded-xl border border-zinc-200 p-4 dark:border-zinc-800 sm:p-5">
                  <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={cn('rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide', severity.className)}>{severity.label}</span>
                        <span className="text-[10px] font-semibold uppercase tracking-wide text-zinc-400">{signal.category}</span>
                      </div>
                      <h3 className="mt-3 text-sm font-semibold text-zinc-950 dark:text-zinc-50">{signal.title}</h3>
                      <p className="mt-1.5 text-xs leading-5 text-zinc-600 dark:text-zinc-300">{signal.evidence}</p>
                      {signal.suggestedAction && <p className="mt-3 rounded-lg bg-zinc-50 px-3 py-2 text-xs leading-5 text-zinc-600 dark:bg-zinc-900 dark:text-zinc-300"><strong className="font-semibold text-zinc-800 dark:text-zinc-100">Siguiente paso:</strong> {signal.suggestedAction}</p>}
                      <div className="mt-3 flex flex-wrap items-center gap-3 text-[11px] text-zinc-400">
                        <span className="inline-flex items-center gap-1.5"><Clock className="h-3.5 w-3.5" /> {formatDate(signal.lastDetectedAt)}</span>
                        {signal.sourceUrl && <a href={signal.sourceUrl} className="inline-flex min-h-11 items-center gap-1.5 font-medium text-[#007F95] hover:underline dark:text-[#74D9EA]">Abrir evidencia <ExternalLink className="h-3.5 w-3.5" /></a>}
                      </div>
                    </div>
                  </div>
                  <div className="mt-4 flex flex-wrap gap-2 border-t border-zinc-100 pt-4 dark:border-zinc-900">
                    {isClosed ? (
                      <button type="button" disabled={isBusy} onClick={() => transition(signal, 'REOPEN')} className="min-h-11 rounded-xl border border-zinc-200 px-3 text-xs font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-900">Reabrir</button>
                    ) : <>
                      {signal.status !== 'REVIEWED' && <button type="button" disabled={isBusy} onClick={() => transition(signal, 'REVIEW')} className="min-h-11 rounded-xl border border-zinc-200 px-3 text-xs font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-900">Revisar</button>}
                      <button type="button" disabled={isBusy} onClick={() => transition(signal, 'SNOOZE')} className="min-h-11 rounded-xl border border-zinc-200 px-3 text-xs font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-900">Aplazar 7 días</button>
                      <button type="button" disabled={isBusy} onClick={() => transition(signal, 'DISMISS')} className="min-h-11 rounded-xl border border-zinc-200 px-3 text-xs font-medium text-zinc-500 hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-900">Descartar</button>
                      <button type="button" disabled={isBusy} onClick={() => transition(signal, 'RESOLVE')} className="min-h-11 rounded-xl bg-[#00AC8A] px-3 text-xs font-semibold text-white hover:bg-[#008F74] disabled:opacity-50">Resolver</button>
                    </>}
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}
