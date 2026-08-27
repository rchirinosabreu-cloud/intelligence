import { useEffect, useMemo, useState } from 'react';
import { getApiBaseUrl } from '@/lib/apiBaseUrl';
import { formatElapsedTime, getTaskElapsedMs, REOPEN_REASONS } from '@/lib/taskTiming';

const cycleLabels = { INITIAL: 'Producción inicial', REWORK: 'Retrabajo' };
const closeLabels = {
  PAUSED: 'Pausada', COMPLETED: 'Realizada', RETURNED: 'Devuelta', REASSIGNED: 'Reasignada'
};
const reasonLabels = Object.fromEntries(REOPEN_REASONS.map(({ value, label }) => [value, label]));
reasonLabels.RETURNED = 'Trabajo devuelto';

const formatMoment = (value) => value
  ? new Intl.DateTimeFormat('es-CO', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))
  : 'En curso';

const sessionElapsed = (session, now) => session.endedAt
  ? Number(session.durationMs || 0)
  : Math.max(0, now.getTime() - new Date(session.startedAt).getTime());

export default function TaskWorkHistory({ taskId, status, startedAt, accumulatedWorkMs = 0 }) {
  const [history, setHistory] = useState(null);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(false);
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    if (status !== 'EN_CURSO') return undefined;
    const interval = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(interval);
  }, [status]);

  useEffect(() => {
    if (!taskId) return undefined;
    const controller = new AbortController();
    setLoading(true);
    fetch(`${getApiBaseUrl()}/api/tasks/${taskId}/work-history`, {
      headers: { Authorization: `Bearer ${localStorage.getItem('authToken')}` },
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) throw new Error((await response.json().catch(() => ({}))).error || 'No fue posible consultar el tiempo');
        return response.json();
      })
      .then(setHistory)
      .catch((error) => {
        if (error.name !== 'AbortError') console.error('[TaskWorkHistory] Fetch failed:', error);
      })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [taskId, status, startedAt, accumulatedWorkMs]);

  const timingTask = history?.task || { status, startedAt, accumulatedWorkMs };
  const totalMs = getTaskElapsedMs(timingTask, now);
  const cycles = history?.cycles || [];
  const sessionCount = useMemo(() => cycles.reduce((total, cycle) => total + cycle.sessions.length, 0), [cycles]);

  return (
    <section className="border-y border-zinc-200/70 py-3 dark:border-zinc-800/70" data-task-work-history>
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-[9px] font-semibold uppercase tracking-widest text-zinc-400 dark:text-zinc-500">Tiempo de trabajo</p>
          <p className="mt-0.5 font-mono text-base font-semibold tabular-nums text-zinc-800 dark:text-zinc-100">{formatElapsedTime(totalMs)}</p>
          <p className="mt-0.5 text-[11px] text-zinc-500 dark:text-zinc-400">
            {loading ? 'Consultando sesiones…' : `${sessionCount} ${sessionCount === 1 ? 'sesión registrada' : 'sesiones registradas'}`}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setExpanded((value) => !value)}
          className="px-1 py-1 text-[11px] font-medium text-zinc-500 transition-colors hover:text-[#009EB9] dark:text-zinc-400"
          aria-expanded={expanded}
        >
          {expanded ? 'Ocultar detalle' : 'Ver sesiones'}
        </button>
      </div>

      {expanded && (
        <div className="mt-3 space-y-2.5 border-t border-zinc-200/70 pt-3 dark:border-zinc-800/70">
          {Number(history?.historicalBaselineMs || 0) > 0 && (
            <div className="flex items-center justify-between rounded-lg bg-zinc-200/60 px-3 py-2 text-xs dark:bg-zinc-800/70">
              <span className="text-zinc-600 dark:text-zinc-300">Tiempo histórico sin desglose</span>
              <span className="font-mono font-semibold text-zinc-800 dark:text-zinc-100">{formatElapsedTime(history.historicalBaselineMs)}</span>
            </div>
          )}
          {cycles.length === 0 && !loading && (
            <p className="text-xs leading-5 text-zinc-500 dark:text-zinc-400">Las sesiones comenzarán a registrarse en el próximo inicio de trabajo. No se inventarán horarios anteriores.</p>
          )}
          {cycles.map((cycle) => (
            <div key={cycle.id} className="rounded-lg bg-zinc-100/60 p-3 dark:bg-zinc-900/60">
              <div className="flex items-center justify-between gap-3">
                <p className="text-xs font-semibold text-zinc-800 dark:text-zinc-100">Ciclo {cycle.sequence} · {cycleLabels[cycle.kind] || cycle.kind}</p>
                <span className="text-[10px] text-zinc-500 dark:text-zinc-400">{cycle.closedAt ? closeLabels[cycle.closeReason] || 'Cerrado' : 'Abierto'}</span>
              </div>
              {cycle.reason && <p className="mt-1 text-[11px] text-zinc-500 dark:text-zinc-400">{reasonLabels[cycle.reason] || cycle.reason}</p>}
              <div className="mt-2 space-y-2">
                {cycle.sessions.map((session, index) => (
                  <div key={session.id} className="grid grid-cols-[1fr_auto] gap-3 text-[11px]">
                    <div className="min-w-0 text-zinc-500 dark:text-zinc-400">
                      <p className="truncate">Sesión {index + 1} · {formatMoment(session.startedAt)} → {formatMoment(session.endedAt)}</p>
                      <p>{session.endedAt ? closeLabels[session.closeReason] || 'Cerrada' : 'Activa'}{session.isOverlapping ? ' · Simultánea' : ''}</p>
                    </div>
                    <span className="font-mono font-semibold tabular-nums text-zinc-800 dark:text-zinc-100">{formatElapsedTime(sessionElapsed(session, now))}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
