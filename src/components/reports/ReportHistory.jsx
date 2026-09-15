import React, { useEffect, useId, useRef, useState } from 'react';
import axios from 'axios';
import Select from '@/components/ui/Select';

const initialState = (clientId = '') => ({ clientId, reports: [], nextCursor: null, loading: false, opening: false, loaded: false, error: '' });
const dateOf = value => {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};
const statusNames = { DRAFT: 'Borrador', PROCESSING: 'Procesando', REVIEW: 'En revisión', PUBLISHED: 'Publicado', FAILED: 'Lectura pendiente', ERROR: 'Lectura pendiente' };

export const formatReportHistoryLabel = report => {
  const start = dateOf(report.startDate), end = dateOf(report.endDate);
  const month = new Intl.DateTimeFormat('es-CO', { month: 'long', year: 'numeric', timeZone: 'UTC' });
  const short = new Intl.DateTimeFormat('es-CO', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
  let period = 'Período sin fecha';
  if (start && end) period = start.getUTCFullYear() === end.getUTCFullYear() && start.getUTCMonth() === end.getUTCMonth()
    ? `${start.getUTCDate()}-${end.getUTCDate()} de ${month.format(start)}`
    : `${short.format(start)} - ${short.format(end)}`;
  const created = dateOf(report.createdAt);
  const createdLabel = created ? new Intl.DateTimeFormat('es-CO', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'America/Bogota' }).format(created) : '';
  return [period, statusNames[report.status] || report.status || 'Estado sin identificar', createdLabel ? `Guardado ${createdLabel}` : ''].filter(Boolean).join(' · ');
};

const serverError = (error, fallback) => {
  const data = error?.response?.data;
  return typeof data?.message === 'string' ? data.message : typeof data?.error === 'string' ? data.error : error?.message || fallback;
};
const requireOK = response => {
  if (response?.status !== 200) { const error = new Error('No se pudo consultar el reporte.'); error.response = response; throw error; }
};

// Context and request identities protect both paginated reads and report opening
// when the selected client changes while a response is in flight.
export const createReportHistoryLoader = ({ request = axios.get, getToken = () => typeof window !== 'undefined' ? window.localStorage.getItem('authToken') : '', onChange = () => {}, onOpen = () => {}, canOpen = () => true, logError = console.error } = {}) => {
  let state = initialState(), context = { clientId: '', apiBaseUrl: '' }, epoch = 0, openEpoch = 0, disposed = false;
  let listAbort, openAbort, refreshQueued = false;
  const publish = patch => { if (!disposed) { state = { ...state, ...patch }; onChange(state); } };
  const headers = () => { const token = getToken(); return token ? { Authorization: `Bearer ${token}` } : {}; };
  const endpoint = () => `${String(context.apiBaseUrl || '').replace(/\/$/, '')}/api/reports`;
  const current = version => !disposed && version === epoch;
  const fetchPage = async (cursor = null, preserveLoaded = false) => {
    if (!context.clientId || state.loading || disposed) return;
    const version = epoch;
    listAbort?.abort(); listAbort = new AbortController();
    publish({ loading: true, error: '' });
    try {
      const response = await request(endpoint(), { headers: headers(), params: { clientId: context.clientId, ...(cursor ? { cursor } : {}) }, signal: listAbort.signal });
      if (!current(version)) return;
      requireOK(response);
      if (!Array.isArray(response.data?.reports) || response.data.reports.some(item => !item || typeof item.id !== 'string')) throw new Error('El historial devolvió datos incompletos. Intenta cargarlo de nuevo.');
      const nextCursor = response.data.nextCursor ?? null;
      if (nextCursor !== null && typeof nextCursor !== 'string') throw new Error('No se pudo interpretar la siguiente página del historial.');
      if (cursor && nextCursor === cursor) throw new Error('No se pudo avanzar a la siguiente página del historial.');
      const previousRows = preserveLoaded ? [...response.data.reports, ...state.reports] : cursor ? state.reports : [];
      const byId = new Map(previousRows.map(item => [item.id, item]));
      for (const item of response.data.reports) byId.set(item.id, item);
      publish({ reports: [...byId.values()], nextCursor, loaded: true });
    } catch (error) {
      if (!current(version) || error?.code === 'ERR_CANCELED' || error?.name === 'AbortError') return;
      logError('[Reports] No se pudo cargar el historial:', error?.response?.data || error);
      publish({ error: serverError(error, 'No se pudo cargar el historial. Intenta de nuevo.') });
    } finally {
      if (current(version)) {
        publish({ loading: false });
        if (refreshQueued) { refreshQueued = false; await fetchPage(null, true); }
      }
    }
  };
  return {
    async setContext(next) {
      listAbort?.abort(); openAbort?.abort(); epoch += 1; openEpoch += 1; refreshQueued = false;
      context = { clientId: next.clientId || '', apiBaseUrl: next.apiBaseUrl || '' };
      state = initialState(context.clientId); publish({});
      await fetchPage();
    },
    loadMore: () => state.nextCursor ? fetchPage(state.nextCursor) : Promise.resolve(),
    reload: () => { if (state.loading) { refreshQueued = true; return Promise.resolve(); } return fetchPage(null, true); },
    async open(id) {
      if (!canOpen() || disposed || !id || !state.reports.some(item => item.id === id)) return;
      const version = epoch, requestVersion = ++openEpoch;
      openAbort?.abort(); openAbort = new AbortController();
      publish({ opening: true, error: '' });
      try {
        const response = await request(`${endpoint()}/${encodeURIComponent(id)}`, { headers: headers(), signal: openAbort.signal });
        if (!current(version) || requestVersion !== openEpoch || !canOpen()) return;
        requireOK(response);
        const report = response.data?.report;
        if (!report || report.id !== id || (report.clientId && report.clientId !== context.clientId)) throw new Error('El reporte recibido no corresponde a la selección actual.');
        onOpen(report);
      } catch (error) {
        if (!current(version) || requestVersion !== openEpoch || error?.code === 'ERR_CANCELED' || error?.name === 'AbortError') return;
        logError('[Reports] No se pudo abrir el reporte:', error?.response?.data || error);
        publish({ error: serverError(error, 'No se pudo abrir el reporte. Intenta de nuevo.') });
      } finally { if (current(version) && requestVersion === openEpoch) publish({ opening: false }); }
    },
    dispose() { disposed = true; epoch += 1; openEpoch += 1; listAbort?.abort(); openAbort?.abort(); }
  };
};

export default function ReportHistory({ clientId, apiBaseUrl, onOpen, disabled = false, refreshKey }) {
  const controlId = `report-history-${useId()}`;
  const [state, setState] = useState(() => initialState());
  const [selectedId, setSelectedId] = useState('');
  const loader = useRef(null), onOpenRef = useRef(onOpen), disabledRef = useRef(disabled);
  const lastRefreshKey = useRef(refreshKey);
  onOpenRef.current = onOpen; disabledRef.current = disabled;
  useEffect(() => {
    const current = createReportHistoryLoader({ onChange: setState, onOpen: report => onOpenRef.current?.(report), canOpen: () => !disabledRef.current });
    loader.current = current;
    setSelectedId('');
    current.setContext({ clientId, apiBaseUrl });
    return () => current.dispose();
  }, [clientId, apiBaseUrl]);
  useEffect(() => {
    if (lastRefreshKey.current === refreshKey) return;
    lastRefreshKey.current = refreshKey;
    loader.current?.reload();
  }, [refreshKey]);
  const sameClient = state.clientId === (clientId || '');
  const visible = sameClient ? state : { ...initialState(clientId), loading: Boolean(clientId) };
  const selectedExists = visible.reports.some(report => report.id === selectedId);
  const busy = disabled || visible.opening;
  const placeholder = !clientId ? 'Selecciona un cliente' : visible.loading && !visible.loaded ? 'Cargando reportes…' : !visible.reports.length ? 'Sin reportes cargados' : 'Selecciona un reporte guardado';
  return <section aria-labelledby={`${controlId}-title`} className="rounded-2xl border border-slate-200 bg-white p-4 text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-50">
    <h3 id={`${controlId}-title`} className="mb-1 text-sm font-semibold">Reportes guardados</h3>
    <p className="mb-3 text-xs text-slate-600 dark:text-slate-300">Retoma las cifras y correcciones guardadas de este cliente.</p>
    <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
      <div className="min-w-0 flex-1"><label htmlFor={controlId} className="mb-1 block text-xs font-medium">Reporte</label><Select id={controlId} className="min-h-11 w-full min-w-0 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-50" value={selectedExists ? selectedId : ''} onChange={event => setSelectedId(event.target.value)} disabled={busy || !clientId || !visible.reports.length}>
        <option value="">{placeholder}</option>{visible.reports.map(report => <option key={report.id} value={report.id}>{formatReportHistoryLabel(report)}</option>)}
      </Select></div>
      <button type="button" disabled={busy || !selectedExists || !sameClient} onClick={() => loader.current?.open(selectedId)} className="min-h-11 rounded-xl bg-violet-600 px-4 text-sm font-medium text-white outline-none hover:bg-violet-700 focus-visible:ring-2 focus-visible:ring-violet-500/50 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-violet-500 dark:hover:bg-violet-600">{visible.opening ? 'Abriendo…' : 'Abrir reporte'}</button>
    </div>
    {visible.loading && <p role="status" className="mt-3 text-xs text-slate-600 dark:text-slate-300">Cargando reportes guardados…</p>}
    {visible.loaded && !visible.reports.length && !visible.error && <p className="mt-3 text-xs text-slate-600 dark:text-slate-300">Este cliente todavía no tiene reportes guardados.</p>}
    {visible.nextCursor && <button type="button" disabled={busy || visible.loading} onClick={() => loader.current?.loadMore()} className="mt-2 min-h-11 text-sm font-medium text-violet-700 outline-none focus-visible:ring-2 focus-visible:ring-violet-500/40 disabled:opacity-50 dark:text-violet-300">Cargar más reportes</button>}
    {visible.error && <div className="mt-3 text-sm"><p role="alert" className="text-destructive">{visible.error}</p><button type="button" disabled={busy || visible.loading} onClick={() => loader.current?.reload()} className="min-h-11 text-sm font-medium text-slate-700 underline underline-offset-4 dark:text-slate-200">Volver a cargar el historial</button></div>}
  </section>;
}
