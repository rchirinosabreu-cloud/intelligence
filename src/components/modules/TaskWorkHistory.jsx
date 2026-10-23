import { useCallback, useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { getApiBaseUrl } from '@/lib/apiBaseUrl';
import { formatElapsedTime, getTaskElapsedMs, REOPEN_REASONS } from '@/lib/taskTiming';
import { correctionProblem, formatCorrectionSpan, sessionCurrentMs, TIME_CORRECTION_REASON_MAX, TIME_CORRECTION_REASONS, TIME_CORRECTION_OTHER } from '@/lib/taskWorkCorrection';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import Select from '@/components/ui/Select';

const cycleLabels = { INITIAL: 'Producción inicial', REWORK: 'Retrabajo' };
const closeLabels = {
  PAUSED: 'Pausada', COMPLETED: 'Realizada', RETURNED: 'Devuelta', REASSIGNED: 'Reasignada',
  DECLARED: 'Tiempo declarado', REMOVED: 'Colaborador retirado', CORRECTED: 'Detenida al corregir'
};
const reasonLabels = Object.fromEntries(REOPEN_REASONS.map(({ value, label }) => [value, label]));
reasonLabels.RETURNED = 'Trabajo devuelto';
const field = 'min-h-11 w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 dark:border-white/10 dark:bg-zinc-950 dark:text-white';

const formatMoment = (value) => value
  ? new Intl.DateTimeFormat('es-CO', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))
  : 'En curso';

const sessionElapsed = (session, now) => session.endedAt
  ? Number(session.durationMs || 0)
  : Math.max(0, now.getTime() - new Date(session.startedAt).getTime());

// Corregir el tiempo de una sesión (Rodny, 23 de octubre de 2026): solo administradores, con motivo, solo para
// acortar. La regla es la misma del servidor (`correctionProblem`); el aviso de éxito sale después de su respuesta.
function TimeCorrectionDialog({ taskId, session, user, onClose, onCorrected }) {
  const [hours, setHours] = useState('');
  const [minutes, setMinutes] = useState('');
  const [choice, setChoice] = useState(TIME_CORRECTION_REASONS[0]);
  const [otherReason, setOtherReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const current = sessionCurrentMs(session);
  const durationMs = (Number(hours || 0) * 60 + Number(minutes || 0)) * 60_000;
  const reason = choice === TIME_CORRECTION_OTHER ? otherReason : choice;
  const submit = async (event) => {
    event.preventDefault();
    const problem = correctionProblem({ user, session, durationMs, reason });
    if (problem) { setError(problem); return; }
    setSaving(true); setError('');
    try {
      const response = await fetch(`${getApiBaseUrl()}/api/tasks/${taskId}/work-sessions/${session.id}/correction`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${localStorage.getItem('authToken')}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ durationMinutes: durationMs / 60_000, reason: reason.trim() })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) { console.error('[TaskWorkHistory] Corrección rechazada:', data); setError(data.error || 'No se pudo corregir el tiempo.'); return; }
      toast.success(data.label || 'Tiempo corregido');
      onCorrected(data);
    } catch (failure) {
      console.error('[TaskWorkHistory] Corrección fallida:', failure);
      setError('No se pudo corregir el tiempo. Intenta de nuevo.');
    } finally { setSaving(false); }
  };
  return (
    <Dialog open onOpenChange={(open) => !open && !saving && onClose()}>
      {/* Se abre desde el panel de la tarea (z-[100]/z-[111]): con el z-index por defecto quedaría detrás. */}
      <DialogContent className="z-[131] sm:max-w-md dark:bg-zinc-900" overlayClassName="z-[130]" data-time-correction-dialog>
        <form onSubmit={submit} className="space-y-4">
          <DialogHeader>
            <DialogTitle>Corregir el tiempo de la sesión</DialogTitle>
            <DialogDescription>
              Marca {formatCorrectionSpan(current)}{session.endedAt ? '' : ' y sigue corriendo'}. Escribe cuánto duró de verdad: la corrección solo acorta, queda en la tarea con tu nombre y el motivo, y se guarda el tiempo original.
              {!session.endedAt && !session.isCollaborator ? ' El reloj se detiene; en una tarea de una sola persona, la tarea vuelve a Pendiente.' : ''}
            </DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <label className="space-y-1.5 text-sm text-zinc-700 dark:text-zinc-200"><span className="block">Horas</span>
              <input type="number" min="0" max="12" step="1" inputMode="numeric" className={field} value={hours} onChange={(event) => { setHours(event.target.value); setError(''); }} />
            </label>
            <label className="space-y-1.5 text-sm text-zinc-700 dark:text-zinc-200"><span className="block">Minutos</span>
              <input type="number" min="0" max="59" step="1" inputMode="numeric" className={field} value={minutes} onChange={(event) => { setMinutes(event.target.value); setError(''); }} />
            </label>
          </div>
          <label htmlFor="time-correction-reason" className="block space-y-1.5 text-sm text-zinc-700 dark:text-zinc-200"><span className="block">Motivo</span>
            <Select id="time-correction-reason" aria-label="Motivo" className={field} value={choice} onChange={(event) => { setChoice(event.target.value); setError(''); }}>
              {TIME_CORRECTION_REASONS.map((option) => <option key={option} value={option}>{option}</option>)}
              <option value={TIME_CORRECTION_OTHER}>Otro motivo</option>
            </Select>
          </label>
          {choice === TIME_CORRECTION_OTHER && (
            <label className="block space-y-1.5 text-sm text-zinc-700 dark:text-zinc-200"><span className="block">¿Cuál?</span>
              <textarea required rows={2} maxLength={TIME_CORRECTION_REASON_MAX} className={field} value={otherReason} onChange={(event) => { setOtherReason(event.target.value); setError(''); }} aria-describedby={error ? 'time-correction-error' : undefined} autoFocus />
            </label>
          )}
          {error && <p id="time-correction-error" role="alert" className="text-sm text-destructive brain-destructive-text">{error}</p>}
          <DialogFooter>
            <button type="button" className="min-h-11 rounded-lg px-4 text-sm text-zinc-700 dark:text-zinc-200" onClick={onClose} disabled={saving}>Cancelar</button>
            <button type="submit" className="min-h-11 rounded-lg bg-primary px-4 text-sm font-semibold text-white disabled:opacity-50" disabled={saving}>{saving ? 'Guardando…' : 'Corregir tiempo'}</button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export default function TaskWorkHistory({ taskId, status, startedAt, accumulatedWorkMs = 0, currentUser = null, onCorrected = null }) {
  const [history, setHistory] = useState(null);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(false);
  const [now, setNow] = useState(() => new Date());
  const [correcting, setCorrecting] = useState(null);
  const [reloadKey, setReloadKey] = useState(0);
  const canCorrect = String(currentUser?.role || '').toUpperCase() === 'ADMIN';

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
  }, [taskId, status, startedAt, accumulatedWorkMs, reloadKey]);

  const corrected = useCallback((result) => {
    setCorrecting(null);
    setReloadKey((key) => key + 1);
    onCorrected?.(result);
  }, [onCorrected]);

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
                  <div key={session.id} className="grid grid-cols-[1fr_auto] gap-3 text-[11px]" data-work-session={session.id}>
                    <div className="min-w-0 text-zinc-500 dark:text-zinc-400">
                      <p className="truncate">Sesión {index + 1} · {formatMoment(session.startedAt)} → {formatMoment(session.endedAt)}</p>
                      <p>{session.endedAt ? closeLabels[session.closeReason] || 'Cerrada' : 'Activa'}{session.isOverlapping ? ' · Simultánea' : ''}{session.isCollaborator ? ' · Colaborador' : ''}</p>
                      {session.correctedAt && (
                        <p className="text-zinc-600 dark:text-zinc-300" data-work-session-corrected>
                          Corregida: marcaba {formatCorrectionSpan(Number(session.originalDurationMs || 0))}{session.correctionReason ? ` · ${session.correctionReason}` : ''}
                        </p>
                      )}
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <span className="font-mono font-semibold tabular-nums text-zinc-800 dark:text-zinc-100">{formatElapsedTime(sessionElapsed(session, now))}</span>
                      {canCorrect && (
                        <button type="button" className="min-h-8 px-1 text-[11px] font-medium text-brand-cyan-deep hover:underline dark:text-brand-cyan" onClick={() => setCorrecting(session)} data-work-session-correct>
                          Corregir
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
      {correcting && <TimeCorrectionDialog taskId={taskId} session={correcting} user={currentUser} onClose={() => setCorrecting(null)} onCorrected={corrected} />}
    </section>
  );
}
