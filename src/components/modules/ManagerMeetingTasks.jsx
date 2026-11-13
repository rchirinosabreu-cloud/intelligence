import React, { useCallback, useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { AlertCircle, ArrowUpRight, CheckCircle2, ExternalLink, Loader2, RefreshCw, X } from '@/components/ui/icons';
import BriaPortrait from '@/components/bria/BriaPortrait';
import Select from '@/components/ui/Select';
import { BrainDatePicker } from '@/components/ui/BrainDatePicker';
import TaskCollaboratorsPicker from '@/components/tasks/TaskCollaboratorsPicker';
import { useNavigateFrom } from '@/components/layout/BackToOrigin';
import { getApiBaseUrl } from '@/lib/apiBaseUrl';
import { askBria } from '@/lib/briaAsk';
import { cn } from '@/lib/utils';
import { normalizeCollaboratorIds } from '@/lib/taskCollaborators';
import { approvalProblem, discardProblem, INBOX_DISCARD_REASONS, INBOX_PRIORITIES, INBOX_NOTE_MAX, INBOX_TITLE_MAX, INBOX_COMMENT_MAX } from '@/lib/meetingTaskInbox';
import { markSeen } from '@/lib/managerDecisionsSeen';
import { useAuth } from '@/context/AuthContext';

// La bandeja de pendientes de reuniones (Rodny, 13 de noviembre de 2026: «un lugar donde ya los tenga armados y yo los
// vea, confirme y apruebe o descarte»). Lo que Fireflies anotó en cada minuta llega armado como pendiente; aquí se
// corrige título, cliente, responsable, colaboradores, fecha, prioridad y contexto, y se aprueba o se descarta. Nada
// entra a Gestión sin una persona; el éxito se dice solo con la respuesta del servidor.

const plural = (count, one, many) => `${count} ${count === 1 ? one : many}`;
const FIELD = 'min-h-11 w-full rounded-lg border border-zinc-200 bg-white px-3 text-sm text-zinc-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-cyan dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50';
const outline = 'brain-button-quiet gap-1.5';
const chip = 'inline-flex min-h-11 items-center rounded-full border border-zinc-200 bg-white px-3.5 text-sm text-zinc-700 transition-colors hover:border-brand-cyan hover:bg-brand-cyan/10 hover:text-brand-cyan-deep focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-cyan disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:text-brand-cyan';
const primary = 'inline-flex min-h-11 shrink-0 items-center justify-center gap-1.5 rounded-xl bg-brand-cyan-deep px-3.5 text-sm font-semibold text-white transition-transform active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-cyan focus-visible:ring-offset-2 disabled:opacity-60 dark:focus-visible:ring-offset-zinc-950';
const link = 'inline-flex min-h-11 items-center gap-1 rounded-lg px-2 text-sm font-medium text-brand-cyan-deep hover:bg-brand-cyan/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-cyan dark:text-brand-cyan';

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

// El borrador editable de cada compromiso nace de lo que Bria propuso; solo lo que tiene responsable viene marcado.
const draftOf = (item, clientId) => ({
  included: Boolean(item.assigneeId), title: item.title, clientId: clientId || '', assigneeId: item.assigneeId || '', collaboratorIds: [],
  dueDay: item.dueDay || '', priority: item.priority, comment: ''
});

function ItemRow({ item, draft, team, clients, busy, onChange, onDiscard, minuteTitle, minuteId }) {
  const [mode, setMode] = useState(null); // null | 'discard' | 'other'
  const [nota, setNota] = useState('');
  const [error, setError] = useState('');
  const set = (patch) => onChange({ ...draft, ...patch });
  const back = () => { setMode(null); setNota(''); setError(''); };
  const discard = async (motivo) => {
    const body = { minuteId, n: item.n, motivo, nota };
    const problem = discardProblem(body);
    if (problem) { setError(problem); return; }
    setError('');
    const failure = await onDiscard(body);
    if (failure) setError(failure);
  };
  const ask = () => askBria(`Ajusta el compromiso ${item.n} de la reunión «${minuteTitle}» (id ${minuteId}), «${item.title}»: `);

  return (
    <li data-meeting-task-item={item.key} className={cn('rounded-xl border p-3 sm:p-4', draft.included ? 'border-zinc-200 dark:border-zinc-800' : 'border-dashed border-zinc-200 opacity-80 dark:border-zinc-800')}>
      <div className="flex items-start gap-3">
        <label className="flex min-h-11 shrink-0 items-center">
          <input type="checkbox" data-meeting-task-include checked={draft.included} onChange={(event) => set({ included: event.target.checked })} disabled={busy} aria-label={`Crear «${draft.title || item.title}»`} className="h-5 w-5 rounded border-zinc-300 text-brand-cyan-deep focus:ring-brand-cyan dark:border-zinc-600" />
        </label>
        <div className="min-w-0 flex-1 space-y-3">
          <div>
            <label className="brain-type-label block" htmlFor={`${item.key}-title`}>Pendiente {item.n}</label>
            <input id={`${item.key}-title`} data-meeting-task-title value={draft.title} maxLength={INBOX_TITLE_MAX} onChange={(event) => set({ title: event.target.value })} disabled={busy} className={cn(FIELD, 'mt-1 font-medium')} />
            <p className="brain-type-help mt-1">{item.context}</p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <div className="sm:col-span-2 xl:col-span-2">
              <label className="brain-type-label block" htmlFor={`${item.key}-assignee`}>Responsable</label>
              <div className="mt-1">
                <TaskCollaboratorsPicker members={team} assigneeId={draft.assigneeId} value={draft.collaboratorIds} disabled={busy} onChange={(ids) => set({ collaboratorIds: normalizeCollaboratorIds(ids, draft.assigneeId) })}>
                  <Select id={`${item.key}-assignee`} data-meeting-task-assignee value={draft.assigneeId} disabled={busy} className={FIELD} onChange={(event) => set({ assigneeId: event.target.value, collaboratorIds: normalizeCollaboratorIds(draft.collaboratorIds, event.target.value) })}>
                    <option value="">Elige responsable</option>
                    {team.map((member) => <option key={member.id} value={member.id}>{member.name}</option>)}
                  </Select>
                </TaskCollaboratorsPicker>
              </div>
              {item.assigneeNote && <p data-meeting-task-note className="brain-type-help mt-1">{item.assigneeNote}.</p>}
            </div>
            <div>
              <span className="brain-type-label block">Fecha</span>
              <div className="mt-1"><BrainDatePicker className={FIELD} value={draft.dueDay} onChange={(day) => set({ dueDay: day || '' })} disabled={busy} isClearable ariaLabel={`Fecha del pendiente ${item.n}`} placeholder="Sin fecha" /></div>
            </div>
            <div>
              <label className="brain-type-label block" htmlFor={`${item.key}-priority`}>Prioridad</label>
              <Select id={`${item.key}-priority`} value={draft.priority} disabled={busy} className={cn(FIELD, 'mt-1')} onChange={(event) => set({ priority: event.target.value })}>
                {INBOX_PRIORITIES.map((priority) => <option key={priority.value} value={priority.value}>{priority.label}</option>)}
              </Select>
            </div>
            <div className="sm:col-span-2 xl:col-span-4">
              <label className="brain-type-label block" htmlFor={`${item.key}-client`}>Cliente</label>
              <Select id={`${item.key}-client`} data-meeting-task-client value={draft.clientId} disabled={busy} className={cn(FIELD, 'mt-1')} onChange={(event) => set({ clientId: event.target.value })}>
                <option value="">Sin cliente</option>
                {clients.map((client) => <option key={client.id} value={client.id}>{client.name}</option>)}
              </Select>
            </div>
            <div className="sm:col-span-2 xl:col-span-4">
              <label className="brain-type-label block" htmlFor={`${item.key}-comment`}>Contexto para quien lo hace</label>
              <textarea id={`${item.key}-comment`} value={draft.comment} maxLength={INBOX_COMMENT_MAX} rows={2} disabled={busy} onChange={(event) => set({ comment: event.target.value })} placeholder="Opcional: lo que la reunión no dejó escrito." className={cn(FIELD, 'mt-1 min-h-[4.5rem] py-2')} />
            </div>
          </div>
          {mode === null ? (
            <div className="flex flex-wrap items-center gap-2">
              <button type="button" onClick={() => setMode('discard')} disabled={busy} className={outline}>Descartar</button>
              <button type="button" onClick={ask} disabled={busy} className={link}>Pedir a Bria que lo ajuste<ArrowUpRight className="h-3.5 w-3.5" /></button>
            </div>
          ) : (
            <div className="space-y-2 rounded-lg bg-zinc-50 p-3 dark:bg-white/5">
              <p className="brain-type-body">¿Por qué no entra?</p>
              <div className="flex flex-wrap gap-2">
                {INBOX_DISCARD_REASONS.map((reason) => (
                  <button key={reason.value} type="button" disabled={busy} onClick={() => (reason.value === 'OTRO' ? setMode('other') : discard(reason.value))} className={cn(chip, mode === 'other' && reason.value === 'OTRO' && 'border-brand-cyan bg-brain-cyan/10')}>{reason.label}</button>
                ))}
                <button type="button" onClick={back} disabled={busy} aria-label="Cancelar" className="inline-flex h-11 w-11 items-center justify-center rounded-lg text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800"><X className="h-4 w-4" /></button>
              </div>
              {mode === 'other' && (
                <div className="flex flex-wrap gap-2">
                  <input value={nota} maxLength={INBOX_NOTE_MAX} onChange={(event) => setNota(event.target.value)} placeholder="Cuéntame cuál en una línea" aria-label="Motivo" className={cn(FIELD, 'flex-1')} />
                  <button type="button" disabled={busy} onClick={() => discard('OTRO')} className={primary}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Descartar'}</button>
                </div>
              )}
              {error && <p role="alert" className="flex items-center gap-1.5 text-sm text-destructive"><AlertCircle className="h-4 w-4" />{error}</p>}
            </div>
          )}
        </div>
      </div>
    </li>
  );
}

function MinuteCard({ minute, team, clients, drafts, setDrafts, onApprove, onDiscard, busy }) {
  const navigateFrom = useNavigateFrom();
  const [error, setError] = useState('');
  const [failed, setFailed] = useState([]);
  const marked = minute.items.filter((item) => drafts[item.key]?.included);
  const approve = async () => {
    const body = { minuteId: minute.minuteId, items: marked.map((item) => {
      const draft = drafts[item.key];
      return { n: item.n, title: draft.title, clientId: draft.clientId || null, assigneeId: draft.assigneeId || null, collaboratorIds: draft.collaboratorIds, dueDay: draft.dueDay || null, priority: draft.priority, comment: draft.comment };
    }) };
    const problem = approvalProblem(body, { members: team, clients });
    if (problem) { setError(problem); return; }
    setError(''); setFailed([]);
    const outcome = await onApprove(minute, body);
    if (outcome?.error) setError(outcome.error);
    if (outcome?.failed?.length) setFailed(outcome.failed);
  };
  return (
    <section data-meeting-minute={minute.minuteId} className="rounded-2xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="brain-type-section">{minute.label}</h3>
          <p className="brain-type-help mt-0.5">
            {plural(minute.pending, 'compromiso por decidir', 'compromisos por decidir')}
            {minute.clientName ? ` · Cliente propuesto: ${minute.clientName} (${minute.clientNote})` : ' · La reunión no nombra a un cliente'}
            {minute.created ? ` · ${plural(minute.created, 'ya es pendiente', 'ya son pendientes')}` : ''}
          </p>
        </div>
        <button type="button" onClick={() => navigateFrom(`/minutas?minute=${encodeURIComponent(minute.minuteId)}`)} className={link}>Abrir la minuta<ExternalLink className="h-3.5 w-3.5" /></button>
      </div>
      <ul className="mt-4 space-y-3">
        {minute.items.map((item) => (
          <ItemRow key={item.key} item={item} draft={drafts[item.key] || draftOf(item, minute.clientId)} team={team} clients={clients} busy={busy} minuteTitle={minute.title} minuteId={minute.minuteId}
            onChange={(next) => setDrafts((current) => ({ ...current, [item.key]: next }))} onDiscard={onDiscard} />
        ))}
      </ul>
      {failed.length > 0 && (
        <div role="alert" className="brain-alert-surface mt-4 rounded-xl p-3 text-sm">
          <p className="font-medium">No se crearon {plural(failed.length, 'pendiente', 'pendientes')}:</p>
          <ul className="mt-1 list-disc pl-5">{failed.map((row) => <li key={row.n}>Compromiso {row.n}: {row.reason}</li>)}</ul>
        </div>
      )}
      {error && <p role="alert" className="mt-3 flex items-center gap-1.5 text-sm text-destructive"><AlertCircle className="h-4 w-4" />{error}</p>}
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button type="button" data-meeting-task-approve onClick={approve} disabled={busy || !marked.length} className={primary}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
          {marked.length ? `Crear ${plural(marked.length, 'pendiente marcado', 'pendientes marcados')}` : 'Marca los que entran'}
        </button>
        <p className="brain-type-help">Entran a Gestión a nombre de cada responsable. Lo que no marques se queda aquí.</p>
      </div>
    </section>
  );
}

export default function ManagerMeetingTasks() {
  const { currentUser } = useAuth();
  const request = useRequest();
  const [inbox, setInbox] = useState(null);
  const [drafts, setDrafts] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busyMinute, setBusyMinute] = useState('');

  // Los borradores se rearman con cada lectura solo para lo que todavía no se había tocado: una corrección en curso no se pierde.
  const absorb = useCallback((next) => {
    setInbox(next);
    setDrafts((current) => {
      const merged = {};
      for (const minute of next.minutes) for (const item of minute.items) merged[item.key] = current[item.key] || draftOf(item, minute.clientId);
      return merged;
    });
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try { absorb(await request('/api/manager/meeting-tasks')); }
    catch (requestError) {
      console.error('[ManagerMeetingTasks] Error cargando la bandeja:', requestError.response?.data || requestError.message);
      setError(requestError.message);
    } finally { setLoading(false); }
  }, [request, absorb]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    if (inbox?.minutes) markSeen(currentUser?.id, inbox.minutes.flatMap((minute) => minute.items.map((item) => item.key)));
  }, [inbox, currentUser?.id]);

  const approve = useCallback(async (minute, body) => {
    setBusyMinute(minute.minuteId);
    try {
      const result = await request('/api/manager/meeting-tasks/approve', { method: 'POST', body: JSON.stringify(body) });
      absorb(result.inbox);
      if (result.created.length) toast.success(`Creé ${plural(result.created.length, 'pendiente', 'pendientes')} de la reunión`);
      else if (result.already.length && !result.failed.length) toast(`${plural(result.already.length, 'Ya era pendiente', 'Ya eran pendientes')}`);
      return { failed: result.failed };
    } catch (requestError) {
      console.error('[ManagerMeetingTasks] Error creando pendientes:', requestError.response?.data || requestError.message);
      return { error: requestError.message };
    } finally { setBusyMinute(''); }
  }, [request, absorb]);

  const discard = useCallback(async (body) => {
    setBusyMinute(body.minuteId);
    try {
      const result = await request('/api/manager/meeting-tasks/discard', { method: 'POST', body: JSON.stringify(body) });
      absorb(result.inbox);
      toast.success('Descartado. Queda anotado en la minuta');
      return null;
    } catch (requestError) {
      console.error('[ManagerMeetingTasks] Error descartando:', requestError.response?.data || requestError.message);
      return requestError.message;
    } finally { setBusyMinute(''); }
  }, [request, absorb]);

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
    <div data-manager-meeting-tasks className="space-y-6">
      <section className="overflow-hidden rounded-3xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
        <div className="brain-ai-header flex items-center gap-4 px-5 py-5 text-white sm:px-7">
          <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-white/95"><BriaPortrait className="h-12 w-12 object-contain" /></span>
          <div className="min-w-0">
            <h2 className="text-lg font-semibold sm:text-xl">
              {totals.pending ? `Armé ${plural(totals.pending, 'pendiente', 'pendientes')} de ${plural(totals.minutes, 'reunión', 'reuniones')}. Tú decides cuáles entran.` : 'No hay compromisos de reuniones esperando tu decisión'}
            </h2>
            <p className="mt-0.5 text-sm text-white/90">Salen de lo que Fireflies anotó en cada minuta. Corrige lo que haga falta, marca los que entran a Gestión y descarta el resto.</p>
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
        <MinuteCard key={minute.minuteId} minute={minute} team={inbox.team} clients={inbox.clients} drafts={drafts} setDrafts={setDrafts} onApprove={approve} onDiscard={discard} busy={busyMinute === minute.minuteId} />
      ))}
    </div>
  );
}
