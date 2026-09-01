import React, { useCallback, useEffect, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Clock,
  Database,
  ExternalLink,
  RefreshCw,
  Search
} from '@/components/ui/icons';
import { getApiBaseUrl } from '@/lib/apiBaseUrl';
import { cn } from '@/lib/utils';

const formatDate = (value) => {
  if (!value) return 'Aún no indexada';
  return new Intl.DateTimeFormat('es-CO', {
    day: '2-digit', month: 'short', hour: 'numeric', minute: '2-digit'
  }).format(new Date(value));
};

const Stat = ({ label, value, detail, icon: Icon }) => (
  <article className="rounded-2xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950 sm:p-5">
    <div className="flex items-start justify-between gap-3">
      <div>
        <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400">{label}</p>
        <p className="mt-2 text-2xl font-semibold tracking-tight text-zinc-950 dark:text-zinc-50">{value}</p>
      </div>
      <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#009EB9]/10 text-[#00839A] dark:text-[#74D9EA]">
        <Icon className="h-4 w-4" />
      </span>
    </div>
    <p className="mt-3 text-xs leading-5 text-zinc-500 dark:text-zinc-400">{detail}</p>
  </article>
);

export default function BriaMemoryPanel() {
  const [overview, setOverview] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);

  const request = useCallback(async (path, options = {}) => {
    const token = localStorage.getItem('authToken');
    const response = await fetch(`${getApiBaseUrl()}${path}`, {
      ...options,
      headers: { Authorization: token ? `Bearer ${token}` : '', ...(options.headers || {}) }
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const requestError = new Error(payload.message || payload.error || 'La solicitud no pudo completarse');
      requestError.response = { data: payload, status: response.status };
      throw requestError;
    }
    return payload;
  }, []);

  const loadOverview = useCallback(async () => {
    setIsLoading(true);
    setError('');
    try {
      setOverview(await request('/api/manager/bria-memory'));
    } catch (requestError) {
      console.error('[BriaMemoryPanel] Error cargando memoria:', requestError.response?.data || requestError.message || requestError);
      setError(requestError.message);
    } finally {
      setIsLoading(false);
    }
  }, [request]);

  useEffect(() => { loadOverview(); }, [loadOverview]);

  const syncNow = async () => {
    if (isSyncing) return;
    setIsSyncing(true);
    setError('');
    try {
      await request('/api/manager/bria-memory/sync', { method: 'POST' });
      await loadOverview();
    } catch (requestError) {
      console.error('[BriaMemoryPanel] Error sincronizando memoria:', requestError.response?.data || requestError.message || requestError);
      setError(requestError.message);
    } finally {
      setIsSyncing(false);
    }
  };

  const searchMemory = async (event) => {
    event.preventDefault();
    const normalizedQuery = query.trim();
    if (!normalizedQuery || isSearching) return;
    setIsSearching(true);
    setHasSearched(true);
    setError('');
    try {
      const payload = await request(`/api/manager/bria-memory/search?q=${encodeURIComponent(normalizedQuery)}`);
      setResults(payload.results || []);
    } catch (requestError) {
      console.error('[BriaMemoryPanel] Error probando recuperación:', requestError.response?.data || requestError.message || requestError);
      setResults([]);
      setError(requestError.message);
    } finally {
      setIsSearching(false);
    }
  };

  if (isLoading && !overview) {
    return <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{[0, 1, 2, 3].map((item) => <div key={item} className="h-36 animate-pulse rounded-2xl bg-zinc-200/70 dark:bg-zinc-900" />)}</div>;
  }

  const summary = overview?.summary || {};
  const coverage = overview?.coverage || [];
  const recentSources = overview?.recentSources || [];

  return (
    <div data-bria-memory-panel className="space-y-5">
      <section className="rounded-2xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950 sm:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <Database className="h-4 w-4 text-[#009EB9]" />
              <h2 className="text-sm font-semibold text-zinc-950 dark:text-zinc-50">Memoria utilizable</h2>
            </div>
            <p className="mt-1 max-w-2xl text-xs leading-5 text-zinc-500 dark:text-zinc-400">
              Conocimiento indexado con fuente y evidencia. Lo enviado a la Papelera se excluye de la recuperación de Bria.
            </p>
          </div>
          <button
            type="button"
            onClick={syncNow}
            disabled={isSyncing}
            className="inline-flex h-10 w-fit items-center gap-2 rounded-xl bg-[#009EB9] px-4 text-xs font-semibold text-white transition-transform active:scale-95 disabled:opacity-60"
          >
            <RefreshCw className={cn('h-4 w-4', isSyncing && 'animate-spin')} />
            {isSyncing ? 'Indexando…' : 'Sincronizar memoria'}
          </button>
        </div>
      </section>

      {error && (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-300">
          <div className="flex items-center gap-2 font-medium"><AlertCircle className="h-4 w-4" /> {error}</div>
        </div>
      )}

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat icon={Database} label="Fuentes activas" value={summary.sourceCount || 0} detail="Documentos disponibles para recuperación" />
        <Stat icon={Search} label="Fragmentos consultables" value={summary.chunkCount || 0} detail="Unidades pequeñas con evidencia citable" />
        <Stat icon={Clock} label="Última indexación" value={summary.lastIndexedAt ? formatDate(summary.lastIndexedAt) : 'Pendiente'} detail="La conciliación también corre cada 10 minutos" />
        <Stat icon={RefreshCw} label="Fuentes pendientes" value={summary.pendingSources || 0} detail="Incluye conectores aún no habilitados" />
      </section>

      <section className="grid gap-5 xl:grid-cols-[0.85fr_1.15fr]">
        <div className="rounded-2xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950">
          <h2 className="text-sm font-semibold text-zinc-950 dark:text-zinc-50">Cobertura de fuentes</h2>
          <p className="mt-1 text-xs leading-5 text-zinc-500 dark:text-zinc-400">La cobertura se habilita por fuente, con control explícito del alcance.</p>
          <div className="mt-4 divide-y divide-zinc-100 dark:divide-zinc-900">
            {coverage.map((item) => (
              <div key={item.key} className="flex items-center justify-between gap-4 py-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-zinc-800 dark:text-zinc-100">{item.label}</p>
                  <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">{item.indexed} de {item.available} indexadas</p>
                </div>
                <span className={cn(
                  'shrink-0 rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide',
                  item.status === 'CONNECTED'
                    ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300'
                    : item.status === 'INDEXING'
                      ? 'bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300'
                      : 'bg-zinc-100 text-zinc-500 dark:bg-zinc-900 dark:text-zinc-400'
                )}>
                  {item.status === 'CONNECTED' ? 'Conectada' : item.status === 'INDEXING' ? 'Indexando' : 'Siguiente fase'}
                </span>
              </div>
            ))}
          </div>
        </div>

        <details className="group rounded-2xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
          <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-4 px-5 py-4 text-sm font-semibold text-zinc-950 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-[#009EB9]/30 dark:text-zinc-50">
            <span>Auditoría de recuperación</span>
            <span className="text-xs font-normal text-zinc-500 dark:text-zinc-400">Herramienta técnica</span>
          </summary>
          <div className="border-t border-zinc-200 p-5 dark:border-zinc-800">
          <h2 className="text-sm font-semibold text-zinc-950 dark:text-zinc-50">Herramienta de auditoría</h2>
          <p className="mt-1 text-xs leading-5 text-zinc-500 dark:text-zinc-400">Comprueba manualmente qué evidencia recuperaría Bria. Esta herramienta no reemplaza la observación automática.</p>
          <form onSubmit={searchMemory} className="mt-4 flex flex-col gap-2 sm:flex-row">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Ej. ¿Qué aprobó Calzado Andino?"
                className="h-11 w-full rounded-xl border border-zinc-200 bg-white pl-10 pr-3 text-sm text-zinc-900 outline-none transition focus:border-[#009EB9] dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100"
              />
            </div>
            <button type="submit" disabled={!query.trim() || isSearching} className="h-11 rounded-xl border border-zinc-200 px-4 text-xs font-semibold text-zinc-800 hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-800 dark:text-zinc-100 dark:hover:bg-zinc-900">
              {isSearching ? 'Buscando…' : 'Buscar evidencia'}
            </button>
          </form>
          <div className="mt-4 max-h-96 space-y-3 overflow-y-auto">
            {results.map((result) => (
              <article key={result.id} className="rounded-xl border border-zinc-200 p-4 dark:border-zinc-800">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-zinc-900 dark:text-zinc-100">{result.title}</p>
                    <p className="mt-0.5 text-[11px] uppercase tracking-wide text-zinc-400">{result.section === 'TRANSCRIPT' ? 'Transcripción' : 'Resumen y análisis'} · {Math.min(100, Math.max(0, Math.round((result.score || 0) * 100)))}%</p>
                  </div>
                  {result.sourceUrl && <a href={result.sourceUrl} className="shrink-0 text-[#00839A] hover:text-[#006C7D] dark:text-[#74D9EA]" aria-label={`Abrir fuente ${result.title}`}><ExternalLink className="h-4 w-4" /></a>}
                </div>
                <p className="mt-3 line-clamp-4 text-xs leading-5 text-zinc-600 dark:text-zinc-300">{result.content}</p>
              </article>
            ))}
            {hasSearched && !isSearching && results.length === 0 && <p className="rounded-xl border border-dashed border-zinc-200 p-5 text-center text-xs text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">No encontramos evidencia utilizable para esa consulta.</p>}
          </div>
          </div>
        </details>
      </section>

      <section className="rounded-2xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950">
        <h2 className="text-sm font-semibold text-zinc-950 dark:text-zinc-50">Fuentes recientes</h2>
        <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">Cada recuerdo conserva su documento de origen para auditoría.</p>
        <div className="mt-4 divide-y divide-zinc-100 dark:divide-zinc-900">
          {recentSources.length === 0 ? (
            <div className="flex min-h-28 items-center justify-center text-sm text-zinc-500 dark:text-zinc-400">Sin fuentes indexadas todavía.</div>
          ) : recentSources.map((source) => (
            <div key={source.id} className="flex items-center justify-between gap-4 py-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 shrink-0 text-[#00AC8A]" />
                  <p className="truncate text-sm font-medium text-zinc-800 dark:text-zinc-100">{source.title}</p>
                </div>
                <p className="mt-1 truncate pl-6 text-xs text-zinc-500 dark:text-zinc-400">{source.chunkCount} fragmentos · {formatDate(source.indexedAt)}</p>
              </div>
              {source.sourceUrl && <a href={source.sourceUrl} className="inline-flex shrink-0 items-center gap-1.5 text-xs font-medium text-[#00839A] dark:text-[#74D9EA]">Ver fuente <ExternalLink className="h-3.5 w-3.5" /></a>}
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
