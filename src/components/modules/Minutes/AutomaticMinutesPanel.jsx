import React, { useCallback, useEffect, useState } from 'react';
import {
  AlertCircle, CheckCircle, ChevronDown, Clock, FileText, Loader2,
  RefreshCcw, RotateCcw, Trash2
} from '@/components/ui/icons';
import { useConfirmDialog } from '@/components/ui/ConfirmDialog';
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
  const confirm = useConfirmDialog();
  const [minutes, setMinutes] = useState([]);
  const [open, setOpen] = useState(false);
  const [trashView, setTrashView] = useState(false);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [busyId, setBusyId] = useState(null);
  const [error, setError] = useState(null);
  const [expandedId, setExpandedId] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await frontendApiService.getAutomatedMinutes(50, { trash: trashView });
      setMinutes(data.minutes || []);
    } catch (requestError) {
      console.error('[AutomaticMinutesPanel] Error cargando minutas:', requestError);
      setError(requestError.message);
    } finally {
      setLoading(false);
    }
  }, [trashView]);

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

  const moveToTrash = async (minute) => {
    const accepted = await confirm({
      title: 'Enviar minuta a la Papelera',
      description: `“${minute.title}” dejará de formar parte del contexto de Bria. Podrás restaurarla después.`,
      confirmLabel: 'Enviar a Papelera'
    });
    if (!accepted) return;
    setBusyId(minute.id);
    try {
      await frontendApiService.trashAutomatedMinute(minute.id);
      await load();
      toast.success('Minuta enviada a la Papelera y excluida de Bria.');
    } catch (requestError) {
      console.error('[AutomaticMinutesPanel] Error enviando minuta a papelera:', requestError);
      toast.error(requestError.message);
    } finally {
      setBusyId(null);
    }
  };

  const restoreMinute = async (minute) => {
    setBusyId(minute.id);
    try {
      await frontendApiService.restoreAutomatedMinute(minute.id);
      await load();
      toast.success('Minuta restaurada y disponible para Bria.');
    } catch (requestError) {
      console.error('[AutomaticMinutesPanel] Error restaurando minuta:', requestError);
      toast.error(requestError.message);
    } finally {
      setBusyId(null);
    }
  };

  const deletePermanently = async (minute) => {
    const accepted = await confirm({
      title: 'Eliminar minuta permanentemente',
      description: `Se borrarán del bucket la minuta y la transcripción de “${minute.title}”. Fireflies no volverá a importarla y esta acción no se puede deshacer.`,
      confirmLabel: 'Eliminar permanentemente'
    });
    if (!accepted) return;
    setBusyId(minute.id);
    try {
      await frontendApiService.permanentlyDeleteAutomatedMinute(minute.id);
      await load();
      toast.success('Minuta y transcripción eliminadas permanentemente.');
    } catch (requestError) {
      console.error('[AutomaticMinutesPanel] Error eliminando minuta permanentemente:', requestError);
      toast.error(requestError.message);
    } finally {
      setBusyId(null);
    }
  };

  return (
    <section className="mb-6 overflow-hidden rounded-2xl border border-border bg-card shadow-sm" aria-labelledby="automatic-minutes-title">
      <div className="flex items-center gap-3 p-4 sm:p-5">
        <div className="rounded-xl bg-violet-500/10 p-2.5 text-violet-700 dark:text-violet-300">
          <FileText className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <h2 id="automatic-minutes-title" className="font-semibold text-zinc-900 dark:text-zinc-50">Archivo automático de Bria</h2>
          <p className="mt-0.5 truncate text-sm text-zinc-500 dark:text-zinc-400">
            Sincronización automática cada 10 minutos{!loading ? ` · ${minutes.length} elemento(s)` : ''}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setOpen(value => !value)}
          aria-expanded={open}
          aria-controls="automatic-minutes-content"
          className="inline-flex h-10 shrink-0 items-center gap-2 rounded-lg border border-zinc-200 bg-white px-3 text-sm font-medium text-zinc-700 transition hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
        >
          {open ? 'Ocultar archivo' : 'Mostrar archivo'}
          <ChevronDown className={`h-4 w-4 transition-transform ${open ? 'rotate-180' : ''}`} />
        </button>
      </div>

      {open && (
        <div id="automatic-minutes-content" className="border-t border-border p-4 sm:p-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="inline-flex w-fit rounded-lg bg-zinc-100 p-1 dark:bg-zinc-800">
              <button type="button" onClick={() => { setTrashView(false); setExpandedId(null); }} className={`rounded-md px-3 py-1.5 text-xs font-medium ${!trashView ? 'bg-white text-zinc-900 shadow-sm dark:bg-zinc-950 dark:text-white' : 'text-zinc-500 dark:text-zinc-400'}`}>Minutas</button>
              <button type="button" onClick={() => { setTrashView(true); setExpandedId(null); }} className={`rounded-md px-3 py-1.5 text-xs font-medium ${trashView ? 'bg-white text-zinc-900 shadow-sm dark:bg-zinc-950 dark:text-white' : 'text-zinc-500 dark:text-zinc-400'}`}>Papelera</button>
            </div>
            {!trashView && (
              <Button onClick={syncNow} disabled={syncing} variant="outline" className="shrink-0">
                {syncing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCcw className="mr-2 h-4 w-4" />}
                Sincronizar ahora
              </Button>
            )}
          </div>

          {trashView && (
            <p className="mt-3 text-xs leading-5 text-zinc-500 dark:text-zinc-400">
              Las minutas de la Papelera no forman parte del contexto de Bria. Puedes restaurarlas o eliminarlas del bucket permanentemente.
            </p>
          )}

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
                {trashView ? 'La Papelera está vacía.' : 'Aún no hay reuniones procesadas. Bria las incorporará cuando Fireflies publique la transcripción.'}
              </p>
            )}
            {minutes.map(minute => {
              const meta = statusMeta[minute.status] || statusMeta.DISCOVERED;
              const StatusIcon = meta.icon;
              const expanded = expandedId === minute.id;
              const busy = busyId === minute.id;
              return (
                <article key={minute.id} className="rounded-xl border border-border bg-white p-4 dark:bg-zinc-900">
                  <div className="flex items-start gap-3">
                    <button type="button" onClick={() => setExpandedId(expanded ? null : minute.id)} className="flex min-w-0 flex-1 items-start justify-between gap-4 text-left">
                      <div className="min-w-0">
                        <h3 className="truncate text-sm font-semibold text-zinc-900 dark:text-zinc-50">{minute.title}</h3>
                        <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">{formatDate(minute.meetingAt)}</p>
                      </div>
                      {!trashView && (
                        <span className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${meta.classes}`}>
                          <StatusIcon className={`h-3.5 w-3.5 ${minute.status === 'PROCESSING' ? 'animate-spin' : ''}`} />
                          {meta.label}
                        </span>
                      )}
                    </button>
                    {!trashView && (
                      <button type="button" disabled={busy} onClick={() => moveToTrash(minute)} className="rounded-lg p-2 text-zinc-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-50 dark:hover:bg-red-950/30 dark:hover:text-red-300" aria-label={`Enviar ${minute.title} a la Papelera`}>
                        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                      </button>
                    )}
                  </div>

                  {trashView && (
                    <div className="mt-3 flex flex-wrap justify-end gap-2 border-t border-border pt-3">
                      <button type="button" disabled={busy} onClick={() => restoreMinute(minute)} className="inline-flex h-9 items-center gap-2 rounded-lg border border-zinc-200 px-3 text-xs font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-800">
                        <RotateCcw className="h-3.5 w-3.5" /> Restaurar
                      </button>
                      <button type="button" disabled={busy} onClick={() => deletePermanently(minute)} className="inline-flex h-9 items-center gap-2 rounded-lg bg-red-600 px-3 text-xs font-medium text-white hover:bg-red-700 disabled:opacity-50">
                        {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />} Eliminar permanentemente
                      </button>
                    </div>
                  )}

                  {expanded && !trashView && (
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
        </div>
      )}
    </section>
  );
};

export default AutomaticMinutesPanel;
