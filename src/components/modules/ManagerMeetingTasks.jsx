import React, { useCallback, useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { AlertCircle, CalendarDays, CheckCircle2, ExternalLink, Loader2, RefreshCw, User, X } from '@/components/ui/icons';
import BriaPortrait from '@/components/bria/BriaPortrait';
import TeamAvatar from '@/components/ui/TeamAvatar';
import TaskSidePanel from '@/components/modules/TaskSidePanel';
import { useNavigateFrom } from '@/components/layout/BackToOrigin';
import { getApiBaseUrl } from '@/lib/apiBaseUrl';
import { cn } from '@/lib/utils';
import { discardProblem, INBOX_DISCARD_REASONS, INBOX_NOTE_MAX, INBOX_PRIORITIES, taskPrefillOf } from '@/lib/meetingTaskInbox';
import { markSeen } from '@/lib/managerDecisionsSeen';
import { useAuth } from '@/context/AuthContext';

// La bandeja de pendientes de reuniones (Rodny, 13 de noviembre de 2026: «un lugar donde ya los tenga armados y yo los
// vea, confirme y apruebe o descarte» y, al ver la primera versión, «pueden ser cards pequeñas y al abrirlas es el
// mismo card del pendiente cuando uno lo crea solo que con los datos ya montados y el botón de "guardar" en este caso,
// sería "Despachar a Kanban"»). Cada compromiso que Fireflies anotó es una tarjeta pequeña; abrirla abre el único
// creador de pendientes de la plataforma, `TaskSidePanel`, con todo montado, y «Despachar a Kanban» lo crea por el
// camino de siempre con la marca de dónde sale. Descartar pide el motivo de un toque. Nada entra sin una persona.

const plural = (count, one, many) => `${count} ${count === 1 ? one : many}`;
const FIELD = 'min-h-11 w-full rounded-lg border border-zinc-200 bg-white px-3 text-sm text-zinc-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-cyan dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50';
const outline = 'brain-button-quiet gap-1.5';
const chip = 'inline-flex min-h-11 items-center rounded-full border border-zinc-200 bg-white px-3.5 text-sm text-zinc-700 transition-colors hover:border-brand-cyan hover:bg-brand-cyan/10 hover:text-brand-cyan-deep focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-cyan disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:text-brand-cyan';
// Descartar es destructivo: el token global, como «Descartar borrador» del panel de tareas.
const danger = 'brain-danger-button-outline inline-flex min-h-11 items-center justify-center rounded-lg px-3.5 text-sm font-medium disabled:opacity-60';
const link = 'inline-flex min-h-11 items-center gap-1 rounded-lg px-2 text-sm font-medium text-brand-cyan-deep hover:bg-brand-cyan/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-cyan dark:text-brand-cyan';
// Los colores de prioridad son los de las tarjetas del tablero (urgente destructivo, alta ámbar) y no se cambian.
const PRIORITY_CHIP = { URGENTE: 'bg-destructive/10 text-destructive', ALTA: 'bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300' };

const useRequest = () => useCallback(async (path, options = {}) => {
  const token = localStorage.getItem('authToken');
  const response = await fetch(`${getApiBaseUrl()}${path}`, {
    ...options,
    headers: { Authorization: token ? `Bearer ${token}` : '', 'Content-Type': 'application/json', ...(options.headers || {}) }
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data.message || 'La solicitud no pudo completarse.');
    error.response = { data, status: response.status };
    throw error;
  }
  return data;
}, []);

const dayLabel = (day) => (day ? new Date(`${day}T12:00:00Z`).toLocaleDateString('es-CO', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' }) : 'Sin fecha');

function ItemCard({ item, minute, member, busy, onOpen, onDiscard }) {
  const [mode, setMode] = useState(null); // null | 'discard' | 'other'
  const [nota, setNota] = useState('');
  const [error, setError] = useState('');
  const back = () => { setMode(null); setNota(''); setError(''); };
  const discard = async (motivo) => {
    const body = { minuteId: minute.minuteId, n: item.n, motivo, nota };
    const problem = discardProblem(body);
    if (problem) { setError(problem); return; }
    setError('');
    const failure = await onDiscard(body);
    if (failure) setError(failure);
  };
  const priority = INBOX_PRIORITIES.find((row) => row.value === item.priority && row.value !== 'NORMAL');

  return (
    <li data-meeting-task-item={item.key} className="flex min-w-0 flex-col rounded-2xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
      <button type="button" data-meeting-task-open onClick={() => onOpen(item)} disabled={busy} className="flex min-w-0 flex-1 flex-col gap-3 rounded-t-2xl p-5 text-left transition-colors hover:bg-zinc-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-cyan disabled:opacity-60 dark:hover:bg-white/5">
        <div className="flex flex-wrap items-center gap-2">
          <span className="brain-type-help inline-flex items-center gap-1"><CalendarDays className="h-3.5 w-3.5" />{dayLabel(item.dueDay)}</span>
          {priority && <span className={cn('rounded-full px-2 py-0.5 text-xs font-medium', PRIORITY_CHIP[priority.value])}>{priority.label}</span>}
        </div>
        <span data-meeting-task-title className="brain-type-value line-clamp-2">{item.title}</span>
        <span className="flex min-w-0 items-center gap-2">
          {member
            ? <TeamAvatar member={member} size={24} className="h-6 w-6" showTitle={false} />
            : <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-dashed border-zinc-300 text-zinc-400 dark:border-zinc-600"><User className="h-3.5 w-3.5" /></span>}
          <span className="brain-type-body min-w-0 truncate">{member ? member.name : 'Sin responsable'}</span>
        </span>
        {item.assigneeNote && <span data-meeting-task-note className="brain-type-help">{item.assigneeNote}.</span>}
      </button>
      <div className="border-t border-zinc-100 px-5 py-3 dark:border-zinc-800">
        {mode === null ? (
          <div className="flex items-center justify-between gap-2">
            <button type="button" onClick={() => setMode('discard')} disabled={busy} className={danger}>Descartar</button>
            <button type="button" onClick={() => onOpen(item)} disabled={busy} className={link}>Abrir</button>
          </div>
        ) : (
          <div className="space-y-2 py-1">
            <p className="brain-type-body">¿Por qué no entra?</p>
            <div className="flex flex-wrap gap-2">
              {INBOX_DISCARD_REASONS.map((reason) => (
                <button key={reason.value} type="button" disabled={busy} onClick={() => (reason.value === 'OTRO' ? setMode('other') : discard(reason.value))} className={cn(chip, mode === 'other' && reason.value === 'OTRO' && 'border-brand-cyan bg-brand-cyan/10')}>{reason.label}</button>
              ))}
              <button type="button" onClick={back} disabled={busy} aria-label="Cancelar" className="inline-flex h-11 w-11 items-center justify-center rounded-lg text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800"><X className="h-4 w-4" /></button>
            </div>
            {mode === 'other' && (
              <div className="flex flex-wrap gap-2">
                <input value={nota} maxLength={INBOX_NOTE_MAX} onChange={(event) => setNota(event.target.value)} placeholder="Cuéntame cuál en una línea" aria-label="Motivo" className={cn(FIELD, 'flex-1')} />
                <button type="button" disabled={busy} onClick={() => discard('OTRO')} className={danger}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Descartar'}</button>
              </div>
            )}
            {error && <p role="alert" className="flex items-center gap-1.5 text-sm text-destructive"><AlertCircle className="h-4 w-4" />{error}</p>}
          </div>
        )}
      </div>
    </li>
  );
}

function MinuteSection({ minute, members, busy, onOpen, onDiscard }) {
  const navigateFrom = useNavigateFrom();
  return (
    <section data-meeting-minute={minute.minuteId} className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="brain-type-section">{minute.label}</h3>
          <p className="brain-type-help mt-1">
            {plural(minute.pending, 'compromiso por decidir', 'compromisos por decidir')}
            {minute.clientName ? ` · Cliente propuesto: ${minute.clientName} (${minute.clientNote})` : ' · La reunión no nombra a un cliente'}
            {minute.created ? ` · ${plural(minute.created, 'ya es pendiente', 'ya son pendientes')}` : ''}
          </p>
        </div>
        <button type="button" onClick={() => navigateFrom(`/minutas?minute=${encodeURIComponent(minute.minuteId)}`)} className={link}>Abrir la minuta<ExternalLink className="h-3.5 w-3.5" /></button>
      </div>
      <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {minute.items.map((item) => (
          <ItemCard key={item.key} item={item} minute={minute} member={item.assigneeId ? members.get(String(item.assigneeId)) : null} busy={busy} onOpen={(row) => onOpen(minute, row)} onDiscard={onDiscard} />
        ))}
      </ul>
    </section>
  );
}

export default function ManagerMeetingTasks() {
  const { currentUser } = useAuth();
  const request = useRequest();
  const [inbox, setInbox] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busyMinute, setBusyMinute] = useState('');
  const [open, setOpen] = useState(null); // { minute, item }

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try { setInbox(await request('/api/manager/meeting-tasks')); }
    catch (requestError) {
      console.error('[ManagerMeetingTasks] Error cargando la bandeja:', requestError.response?.data || requestError.message);
      setError(requestError.message);
    } finally { setLoading(false); }
  }, [request]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    if (inbox?.minutes) markSeen(currentUser?.id, inbox.minutes.flatMap((minute) => minute.items.map((item) => item.key)));
  }, [inbox, currentUser?.id]);

  const discard = useCallback(async (body) => {
    setBusyMinute(body.minuteId);
    try {
      const result = await request('/api/manager/meeting-tasks/discard', { method: 'POST', body: JSON.stringify(body) });
      setInbox(result.inbox);
      toast.success('Descartado. Queda anotado en la minuta');
      return null;
    } catch (requestError) {
      console.error('[ManagerMeetingTasks] Error descartando:', requestError.response?.data || requestError.message);
      return requestError.message;
    } finally { setBusyMinute(''); }
  }, [request]);

  // El panel crea el pendiente y el servidor enlaza el compromiso; aquí solo se relee la bandeja, que ya no lo trae.
  const afterDispatch = useCallback((saved) => {
    if (saved?.meeting?.linked === false) toast.error('Se creó el pendiente, pero la minuta no quedó enlazada');
    load();
  }, [load]);

  const members = useMemo(() => new Map((inbox?.team || []).map((member) => [String(member.id), member])), [inbox]);
  const clientsList = useMemo(() => inbox?.clients || [], [inbox]);
  // Memorizado a propósito: el panel reinicia el formulario cuando cambia el objeto (ver `prefill` en TaskSidePanel).
  const prefill = useMemo(() => (open ? taskPrefillOf(open.minute, open.item) : null), [open]);
  const totals = useMemo(() => ({ pending: inbox?.pending || 0, minutes: inbox?.minutes?.length || 0 }), [inbox]);

  if (loading && !inbox) {
    return <div className="space-y-4" aria-busy="true">{[0, 1].map((item) => <div key={item} className="h-40 animate-pulse rounded-2xl bg-zinc-200/70 dark:bg-zinc-900" />)}</div>;
  }
  if (error && !inbox) {
    return (
      <div className="brain-alert-surface rounded-2xl p-4 text-sm">
        <div className="flex items-center gap-2 font-medium"><AlertCircle className="h-4 w-4 text-destructive" />No pude cargar los pendientes de las reuniones</div>
        <p className="mt-1 pl-6">{error}</p>
        <button type="button" onClick={load} className={cn(outline, 'ml-6 mt-3')}><RefreshCw className="h-4 w-4" />Reintentar</button>
      </div>
    );
  }

  return (
    <div data-manager-meeting-tasks className="space-y-10">
      <section className="overflow-hidden rounded-3xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
        <div className="brain-ai-header flex items-center gap-4 px-5 py-5 text-white sm:px-7">
          <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-white/95"><BriaPortrait className="h-12 w-12 object-contain" /></span>
          <div className="min-w-0">
            <h2 className="text-lg font-semibold sm:text-xl">
              {totals.pending ? `Armé ${plural(totals.pending, 'pendiente', 'pendientes')} de ${plural(totals.minutes, 'reunión', 'reuniones')}. Tú decides cuáles entran.` : 'No hay compromisos de reuniones esperando tu decisión'}
            </h2>
            <p className="mt-0.5 text-sm text-white/90">Salen de lo que Fireflies anotó en cada minuta. Abre uno para revisarlo y despacharlo a Kanban, o descártalo.</p>
          </div>
          <button type="button" onClick={load} disabled={loading} aria-label="Actualizar" className="ml-auto inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white/15 text-white hover:bg-white/25 disabled:opacity-60">
            <RefreshCw className={cn('h-4 w-4', loading && 'animate-spin')} />
          </button>
        </div>
      </section>
      {!inbox.minutes.length ? (
        <div className="flex flex-col items-center rounded-2xl border border-dashed border-zinc-200 px-6 py-10 text-center dark:border-zinc-800">
          <CheckCircle2 className="h-8 w-8 text-brand-green" />
          <p className="mt-3 text-sm font-medium text-zinc-800 dark:text-zinc-100">Todo decidido por ahora.</p>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">Cuando Fireflies analice otra reunión, sus compromisos aparecen aquí armados.</p>
        </div>
      ) : inbox.minutes.map((minute) => (
        <MinuteSection key={minute.minuteId} minute={minute} members={members} busy={busyMinute === minute.minuteId} onOpen={(row, item) => setOpen({ minute: row, item })} onDiscard={discard} />
      ))}
      <TaskSidePanel
        isOpen={Boolean(open)}
        onClose={() => setOpen(null)}
        onSuccess={afterDispatch}
        clientsList={clientsList}
        defaultClientId={open?.minute?.clientId || null}
        prefill={prefill}
        submitLabel="Despachar a Kanban"
      />
    </div>
  );
}
