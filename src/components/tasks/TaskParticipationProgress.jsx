import React, { useEffect, useRef, useState } from 'react';
import { Clock, Loader2, RotateCcw, Users } from '@/components/ui/icons';
import Select from '@/components/ui/Select';
import TeamAvatar from '@/components/ui/TeamAvatar';
import TaskLifecycleDialog from '@/components/modules/TaskLifecycleDialog';
import { getApiBaseUrl } from '@/lib/apiBaseUrl';
import { formatElapsedTime, REOPEN_REASONS, RETURN_REASONS } from '@/lib/taskTiming';
import { didCompleteParticipation, hasActiveTaskTeam, participationRequest } from '@/lib/taskParticipationBoard';
import { askDeclaredTimeIfNeeded } from '@/lib/declaredTime';
import { triggerConfetti } from '@/utils/confetti';
import { cn } from '@/lib/utils';

const labels = { PENDIENTE: 'Pendiente', EN_CURSO: 'En proceso', REALIZADA: 'Realizada', DEVUELTA: 'Devuelta' };
const authHeaders = () => ({ 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('authToken') || ''}` });
const actionClass = 'inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-zinc-200 px-3 text-xs font-semibold text-zinc-700 hover:bg-zinc-100 disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-100 dark:hover:bg-white/10';

export default function TaskParticipationProgress({ task, currentUserId, selectedMemberId, onSelectMember, onConfirmed }) {
  const [liveTask, setLiveTask] = useState(task);
  const [selected, setSelected] = useState(selectedMemberId || '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [dialog, setDialog] = useState(null);
  const [reason, setReason] = useState('');
  const [note, setNote] = useState('');
  const [tick, setTick] = useState(0);
  const pending = useRef(false);
  const celebrated = useRef(new Set());
  useEffect(() => { setLiveTask(task); }, [task]);
  useEffect(() => { setSelected(selectedMemberId || ''); setError(''); setDialog(null); }, [task.id, selectedMemberId]);
  const rows = liveTask.participants || [];
  const team = hasActiveTaskTeam(liveTask);
  const active = rows.find(row => row.memberId === selected) || rows.find(row => row.member?.userId === currentUserId) || rows[0];
  const anyWorking = rows.some(row => row.startedAt);
  useEffect(() => {
    if (!anyWorking) return undefined;
    const timer = window.setInterval(() => setTick(value => value + 1), 1000);
    return () => window.clearInterval(timer);
  }, [anyWorking]);
  void tick;

  const submit = async (row, changes) => {
    if (pending.current) return;
    pending.current = true; setBusy(true); setError('');
    try {
      const request = participationRequest({ ...liveTask, participation: row }, changes);
      const response = await fetch(`${getApiBaseUrl()}${request.path}`, { method: 'PATCH', headers: authHeaders(), body: JSON.stringify(request.body) });
      const saved = await response.json().catch(() => ({}));
      if (!response.ok) {
        if (response.status === 409) {
          const current = await fetch(`${getApiBaseUrl()}/api/tasks/${encodeURIComponent(liveTask.id)}`, { headers: authHeaders(), cache: 'no-store' });
          if (current.ok) {
            const refreshed = await current.json();
            setLiveTask(refreshed); onConfirmed?.(refreshed);
          }
          setDialog(null);
        }
        throw new Error(saved.error || 'No se pudo guardar tu participación.');
      }
      setLiveTask(saved); onConfirmed?.(saved); setDialog(null);
      const savedRow = saved.participants?.find(item => item.memberId === row.memberId);
      const completionKey = `${saved.id}:${row.memberId}:${savedRow?.revision}`;
      if (didCompleteParticipation(saved, row.memberId) && !celebrated.current.has(completionKey)) {
        celebrated.current.add(completionKey); triggerConfetti(); askDeclaredTimeIfNeeded(saved);
      }
    } catch (failure) {
      console.error('[TaskParticipationProgress] No se pudo guardar:', failure);
      setError(failure.message);
    } finally {
      pending.current = false; setBusy(false);
    }
  };
  const openDialog = kind => {
    setDialog({ kind, row: active }); setNote(''); setError('');
    setReason(kind === 'return' ? RETURN_REASONS[0].value : REOPEN_REASONS[0].value);
  };
  if (!active) return null;
  const mine = active.member?.userId === currentUserId;
  const ownerLabel = !team ? 'tarea' : mine ? 'mi parte' : `parte de ${active.member?.name || 'esta persona'}`;
  const completed = rows.filter(row => row.status === 'REALIZADA').length;
  const dialogLabels = team
    ? { return: 'Devolver participación', reopen: 'Reabrir participación', reintegrate: 'Reintegrar participación' }
    : { return: 'Devolver tarea', reopen: 'Reabrir tarea', reintegrate: 'Reintegrar tarea' };
  const submitDialog = () => {
    const { kind, row } = dialog;
    const changes = kind === 'return' ? { status: 'DEVUELTA', returnReason: reason, returnNote: note.trim() }
      : kind === 'reopen' ? { status: 'PENDIENTE', reopenReason: reason, reopenNote: note.trim() }
        : { status: 'PENDIENTE', reintegrateReason: note.trim() };
    submit(row, changes);
  };

  return <section data-task-participations={team ? '' : undefined} data-task-individual-progress={!team ? '' : undefined}
    className={team ? 'space-y-4 rounded-2xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900' : 'space-y-2'}>
    {team ? <><div>
      <h3 className="flex items-center gap-2 text-sm font-semibold text-zinc-900 dark:text-zinc-50"><Users className="h-4 w-4" />{mine ? 'Tu participación' : `Participación de ${active.member?.name}`}</h3>
      <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">{completed}/{rows.length} personas terminaron · Tarea completa: {labels[liveTask.status] || liveTask.status}</p>
    </div>
    <ul className="space-y-2">
      {rows.map(row => {
        const elapsed = Math.max(0, Number(row.accumulatedWorkMs || 0)) + (row.startedAt ? Math.max(0, Date.now() - new Date(row.startedAt).getTime()) : 0);
        return <li key={row.memberId} data-participant-row={row.memberId} data-participation-running={String(Boolean(row.startedAt))}>
          <button type="button" disabled={busy} onClick={() => { setSelected(row.memberId); onSelectMember?.(row.memberId); }} aria-pressed={active.memberId === row.memberId}
            className={cn('flex min-h-14 w-full flex-wrap items-center gap-3 rounded-xl border p-3 text-left', active.memberId === row.memberId ? 'border-brand-cyan/40 bg-brand-cyan/5' : 'border-zinc-200 dark:border-zinc-800')}>
            <TeamAvatar member={row.member} size={28} />
            <span className="min-w-0 flex-1"><span className="block text-sm font-semibold text-zinc-900 dark:text-zinc-100">{row.member?.name}{row.member?.userId === currentUserId ? ' · Tú' : ''}</span><span className="text-xs text-zinc-500 dark:text-zinc-400">{labels[row.status]}{row.status === 'REALIZADA' ? ' · Terminó su parte' : ''}</span></span>
            <span className={cn('inline-flex items-center gap-1 font-mono text-xs', row.startedAt ? 'text-brand-cyan-deep dark:text-brand-cyan' : 'text-zinc-500 dark:text-zinc-400')}><Clock className="h-3 w-3" />{formatElapsedTime(elapsed)}</span>
          </button>
        </li>;
      })}
    </ul></> : <>
      <Select aria-label="Estado actual" value={active.status} disabled={busy}
        className="h-12 w-full rounded-lg border border-zinc-200 bg-transparent text-sm dark:border-zinc-800 sm:h-[38px]"
        onChange={event => {
          const status = event.target.value;
          if (status === active.status) return;
          if (status === 'DEVUELTA') openDialog('return');
          else if (active.status === 'REALIZADA') openDialog('reopen');
          else if (active.status === 'DEVUELTA') openDialog('reintegrate');
          else submit(active, { status });
        }}>
        {Object.entries(labels).map(([status, label]) => <option key={status} value={status}
          disabled={status !== active.status && (status === 'DEVUELTA' ? !active.permissions?.canReturn
            : active.status === 'REALIZADA' ? status !== 'PENDIENTE' || !active.permissions?.canReopen
              : active.status === 'DEVUELTA' ? status !== 'PENDIENTE' || !active.permissions?.canReintegrate
                : !active.permissions?.canChangeStatus)}>{label}</option>)}
      </Select>
      <p className="flex items-center gap-1 text-xs text-zinc-500 dark:text-zinc-400"><Clock className="h-3 w-3" />
        {formatElapsedTime(Math.max(0, Number(active.accumulatedWorkMs || 0)) + (active.startedAt ? Math.max(0, Date.now() - new Date(active.startedAt).getTime()) : 0))}
      </p>
    </>}
    <div className="flex flex-wrap gap-2">
      {team && active.permissions?.canReopen && active.status === 'REALIZADA' && <button type="button" className={actionClass} disabled={busy} onClick={() => openDialog('reopen')}><RotateCcw className="h-4 w-4" />Reabrir {ownerLabel}</button>}
      {team && active.permissions?.canReintegrate && active.status === 'DEVUELTA' && <button type="button" className={actionClass} disabled={busy} onClick={() => openDialog('reintegrate')}>Reintegrar {ownerLabel}</button>}
      {busy && <span role="status" className="inline-flex items-center gap-2 text-xs text-zinc-500"><Loader2 className="h-4 w-4 animate-spin" />Guardando…</span>}
    </div>
    {error && !dialog && <p role="alert" className="text-sm text-destructive brain-destructive-text">{error}</p>}
    <TaskLifecycleDialog open={Boolean(dialog)} onOpenChange={open => { if (!open && !busy) setDialog(null); }}
      title={dialogLabels[dialog?.kind] || 'Participación'} description={dialog ? team ? `Parte de ${dialog.row.member?.name} en «${liveTask.title}». Las demás participaciones conservan su estado.` : `«${liveTask.title}» conservará sus tiempos e historial.` : ''}
      reasons={dialog?.kind === 'return' ? RETURN_REASONS : dialog?.kind === 'reopen' ? REOPEN_REASONS : []}
      reasonLabel="Motivo" reasonValue={reason} onReasonChange={setReason} noteLabel="Nota" noteValue={note} onNoteChange={setNote}
      submitLabel={dialogLabels[dialog?.kind] || 'Guardar'} onSubmit={submitDialog} isSubmitting={busy} error={error} />
  </section>;
}
