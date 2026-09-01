import React, { useCallback, useEffect, useState } from 'react';
import { AlertCircle, CheckCircle, Clock, FileText, Loader2, RefreshCcw } from '@/components/ui/icons';
import frontendApiService from '../../../services/frontendApiService';
import { Button } from './ui/button';
import { toast } from 'react-hot-toast';

const statusMeta = {
  READY: { label: 'Lista', icon: CheckCircle, classes: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300' },
  PROCESSING: { label: 'Procesando', icon: Loader2, classes: 'bg-violet-500/10 text-violet-700 dark:text-violet-300' },
  FAILED: { label: 'Requiere revisión', icon: AlertCircle, classes: 'bg-red-500/10 text-red-700 dark:text-red-300' },
  DISCOVERED: { label: 'Detectada', icon: Clock, classes: 'bg-amber-500/10 text-amber-700 dark:text-amber-300' }
};

const formatDate = (value) => value
  ? new Intl.DateTimeFormat('es-CO', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))
  : 'Fecha no disponible';

const AutomaticMinutesPanel = () => {
  const [minutes, setMinutes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState(null);
  const [expandedId, setExpandedId] = useState(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const data = await frontendApiService.getAutomatedMinutes(50);
      setMinutes(data.minutes || []);
    } catch (requestError) {
      console.error('[AutomaticMinutesPanel] Error cargando minutas:', requestError);
      setError(requestError.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const syncNow = async () => {
    setSyncing(true);
    try {
      const result = await frontendApiService.syncAutomatedMinutes();
      await load();
      toast.success(`${result.processed || 0} minuta(s) nueva(s) procesada(s).`);
    } catch (requestError) {
      console.error('[AutomaticMinutesPanel] Error sincronizando:', requestError);
      toast.error(requestError.message || 'No fue posible sincronizar Fireflies.');
    } finally {
      setSyncing(false);
    }
  };

  return (
    <section className="mb-6 rounded-2xl border border-border bg-card p-5 shadow-sm" aria-labelledby="automatic-minutes-title">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <div className="rounded-xl bg-violet-500/10 p-2.5 text-violet-700 dark:text-violet-300">
            <FileText className="h-5 w-5" />
          </div>
          <div>
            <h2 id="automatic-minutes-title" className="font-semibold text-zinc-900 dark:text-zinc-50">Archivo automático de Bria</h2>
            <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
              Fireflies se revisa cada 10 minutos. Bria guarda la transcripción y deja propuestas de acción para revisión humana.
            </p>
          </div>
        </div>
        <Button onClick={syncNow} disabled={syncing} variant="outline" className="shrink-0">
          {syncing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCcw className="mr-2 h-4 w-4" />}
          Sincronizar ahora
        </Button>
      </div>

      {error && (
        <div className="mt-4 flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-300">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {error}
        </div>
      )}

      <div className="mt-4 grid gap-2">
        {loading && <p className="py-4 text-center text-sm text-zinc-500 dark:text-zinc-400">Cargando archivo de minutas...</p>}
        {!loading && !error && minutes.length === 0 && (
          <p className="rounded-xl border border-dashed border-border py-6 text-center text-sm text-zinc-500 dark:text-zinc-400">
            Aún no hay reuniones procesadas. Bria las incorporará automáticamente cuando Fireflies publique la transcripción.
          </p>
        )}
        {minutes.map(minute => {
          const meta = statusMeta[minute.status] || statusMeta.DISCOVERED;
          const StatusIcon = meta.icon;
          const expanded = expandedId === minute.id;
          return (
            <article key={minute.id} className="rounded-xl border border-border bg-white p-4 dark:bg-zinc-900">
              <button type="button" onClick={() => setExpandedId(expanded ? null : minute.id)} className="flex w-full items-start justify-between gap-4 text-left">
                <div className="min-w-0">
                  <h3 className="truncate text-sm font-semibold text-zinc-900 dark:text-zinc-50">{minute.title}</h3>
                  <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">{formatDate(minute.meetingAt)}</p>
                </div>
                <span className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${meta.classes}`}>
                  <StatusIcon className={`h-3.5 w-3.5 ${minute.status === 'PROCESSING' ? 'animate-spin' : ''}`} />
                  {meta.label}
                </span>
              </button>
              {expanded && (
                <div className="mt-4 border-t border-border pt-4 text-sm text-zinc-700 dark:text-zinc-300">
                  {minute.executiveSummary && <p>{minute.executiveSummary}</p>}
                  {minute.actionItems?.length > 0 && (
                    <div className="mt-4">
                      <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">Acciones propuestas</p>
                      <ul className="mt-2 space-y-2">
                        {minute.actionItems.map((item, index) => (
                          <li key={`${minute.id}-action-${index}`} className="rounded-lg bg-zinc-50 px-3 py-2 dark:bg-zinc-800/70">
                            {item.task}{item.owner ? ` · ${item.owner}` : ''}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {minute.errorMessage && <p className="mt-3 text-red-700 dark:text-red-300">{minute.errorMessage}</p>}
                </div>
              )}
            </article>
          );
        })}
      </div>
    </section>
  );
};

export default AutomaticMinutesPanel;
