import React, { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import {
  AlertCircle, ArrowUpRight, CheckCircle2, ChevronDown, ExternalLink, Loader2, RefreshCw, X
} from '@/components/ui/icons';
import BriaPortrait from '@/components/bria/BriaPortrait';
import { useNavigateFrom } from '@/components/layout/BackToOrigin';
import { getApiBaseUrl } from '@/lib/apiBaseUrl';
import { askBria } from '@/lib/briaAsk';
import { cn } from '@/lib/utils';
import { LATER_OPTIONS, DISCARD_REASONS, MAX_DECISIONS_PER_WEEK, NOTE_MAX, openLabel, responseProblem } from '@/lib/managerDecisions';
import { decisionFingerprint, markSeen } from '@/lib/managerDecisionsSeen';
import { useAuth } from '@/context/AuthContext';

// Las decisiones de Manager (Rodny, 10 de noviembre de 2026): una sola lista con lo que Bria propone y lo que el
// Observer detectó esta semana, agrupado y repartido por dueño. Siempre las seis primeras: al responder una, entra la
// siguiente. No hay «ver las demás».
const TOP = MAX_DECISIONS_PER_WEEK;

const LEVEL = {
  alta: { label: 'Urgente', dot: 'bg-brand-coral', chip: 'bg-brand-coral/10 text-brand-coral-deep dark:text-brand-coral' },
  media: { label: 'Esta semana', dot: 'bg-brand-yellow', chip: 'bg-brand-yellow/15 text-zinc-800 dark:text-brand-yellow' },
  baja: { label: 'Para tener en cuenta', dot: 'bg-zinc-300 dark:bg-zinc-600', chip: 'bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300' }
};

const DAY = new Intl.DateTimeFormat('es-CO', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' });
const dayWords = (day) => (day ? DAY.format(new Date(`${day}T12:00:00Z`)).replace(',', '') : '');
const plural = (count, one, many) => `${count} ${count === 1 ? one : many}`;

const outline = 'inline-flex min-h-11 items-center justify-center gap-1.5 rounded-xl border border-zinc-200 bg-white px-3 text-sm font-medium text-zinc-700 transition-colors hover:border-zinc-300 hover:bg-zinc-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-cyan disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800';
const chip = 'inline-flex min-h-11 items-center rounded-full border border-zinc-200 bg-white px-3.5 text-sm text-zinc-700 transition-colors hover:border-brand-cyan hover:bg-brand-cyan/10 hover:text-brand-cyan-deep focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-cyan disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:text-brand-cyan';
const primary = 'inline-flex min-h-11 shrink-0 items-center justify-center gap-1.5 rounded-xl bg-brand-cyan-deep px-3.5 text-sm font-semibold text-white transition-transform active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-cyan focus-visible:ring-offset-2 disabled:opacity-60 dark:focus-visible:ring-offset-zinc-950';
const iconButton = 'inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800';
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

function DecisionCard({ card, onRespond, busy }) {
  const navigateFrom = useNavigateFrom();
  const [mode, setMode] = useState(null); // null | 'discard' | 'other' | 'later'
  const [nota, setNota] = useState('');
  const [error, setError] = useState('');
  const level = LEVEL[card.level] || LEVEL.baja;
  const tag = [card.sourceLabel, card.kindLabel || card.categoryLabel].filter(Boolean).join(' · ');
  const back = () => { setMode(null); setError(''); };

  const send = async (payload) => {
    const body = { source: card.source, id: card.ref, ...(card.refs?.length > 1 ? { ids: card.refs } : {}), ...payload };
    const problem = responseProblem(body);
    if (problem) { setError(problem); return false; }
    setError('');
    const failure = await onRespond(card, body);
    if (failure) setError(failure);
    return !failure;
  };
  // «Pedir a Bria»: se anota primero; con la respuesta guardada, Bria abre con el pedido escrito para que lo envíes.
  const delegateToBria = async () => { if (await send({ respuesta: 'HACER' })) askBria(card.ask); };

  return (
    <article data-decision-card={card.key} className="flex h-full flex-col rounded-2xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950 sm:p-5">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className={cn('inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 font-semibold', level.chip)}>
          <span className={cn('h-2 w-2 rounded-full', level.dot)} aria-hidden="true" />{level.label}
        </span>
        {card.subjectName && <span className="rounded-full bg-zinc-100 px-2.5 py-1 font-medium text-zinc-700 dark:bg-zinc-800 dark:text-zinc-200">{card.subjectName}</span>}
      </div>
      {tag && <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">{tag}</p>}
      <h3 title={card.title} className="mt-2 line-clamp-3 text-base font-semibold leading-6 text-zinc-950 dark:text-zinc-50">{card.title}</h3>
      {card.why && <p className="mt-1.5 line-clamp-3 text-sm leading-6 text-zinc-600 dark:text-zinc-300">{card.why}</p>}
      {card.items?.length > 0 && (
        <details className="group mt-2">
          <summary className="inline-flex min-h-9 cursor-pointer list-none items-center gap-1 text-xs font-medium text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200">
            <ChevronDown className="h-3.5 w-3.5 transition-transform group-open:rotate-180" />Ver el detalle de cada una
          </summary>
          <ul className="mt-1 space-y-1.5 rounded-xl bg-zinc-50 px-3 py-2 text-sm leading-5 text-zinc-700 dark:bg-zinc-900 dark:text-zinc-300">
            {card.items.map((item) => <li key={item.name}><span className="font-medium text-zinc-900 dark:text-zinc-100">{item.name}</span>{item.text ? `: ${item.text}` : ''}</li>)}
          </ul>
        </details>
      )}
      {card.owner && <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">Quedó a cargo de <span className="font-medium text-zinc-700 dark:text-zinc-200">{card.owner}</span></p>}
      {card.quote && (
        <details className="group mt-2">
          <summary className="inline-flex min-h-9 cursor-pointer list-none items-center gap-1 text-xs font-medium text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200">
            <ChevronDown className="h-3.5 w-3.5 transition-transform group-open:rotate-180" />{card.source === 'OBSERVER' ? '¿Qué se dijo en la reunión?' : 'Por qué lo propongo'}
          </summary>
          <blockquote className="mt-1 rounded-xl bg-zinc-50 px-3 py-2 text-sm leading-6 text-zinc-700 [overflow-wrap:anywhere] dark:bg-zinc-900 dark:text-zinc-300">{card.source === 'OBSERVER' ? `«${card.quote}»` : card.quote}</blockquote>
        </details>
      )}

      <div className="mt-auto pt-4">
        {!mode && (
          <>
            <div className="flex flex-wrap gap-1.5">
              <button type="button" disabled={busy} onClick={card.ask ? delegateToBria : () => send({ respuesta: 'HACER' })} className={primary}>
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : !card.ask && <CheckCircle2 className="h-4 w-4" />}{card.ask ? 'Pedir a Bria' : 'Me encargo'}
              </button>
              <button type="button" disabled={busy} onClick={() => setMode('discard')} className={cn(outline, 'hover:border-destructive/40 hover:text-destructive dark:hover:text-destructive')}>Descartar</button>
              <button type="button" disabled={busy} onClick={() => setMode('later')} className={outline}>Más tarde</button>
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-x-1">
              {card.url && <button type="button" onClick={() => navigateFrom(card.url, { label: 'Manager' })} className={link}>{openLabel(card.url)}<ExternalLink className="h-3.5 w-3.5" /></button>}
              {card.ask && <button type="button" disabled={busy} onClick={() => send({ respuesta: 'HACER' })} className={link}>Lo hago yo</button>}
            </div>
          </>
        )}

        {mode === 'discard' && (
          <div>
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-medium text-zinc-800 dark:text-zinc-100">¿Por qué la descartas?</p>
              <button type="button" aria-label="Volver" onClick={back} className={iconButton}><X className="h-4 w-4" /></button>
            </div>
            <div className="mt-2 flex flex-wrap gap-2" aria-label="Motivo">
              {DISCARD_REASONS.map((reason) => (
                <button key={reason.value} type="button" disabled={busy}
                  onClick={() => (reason.value === 'OTRO' ? setMode('other') : send({ respuesta: 'DESCARTAR', motivo: reason.value }))}
                  className={chip}>{reason.label}</button>
              ))}
            </div>
          </div>
        )}

        {mode === 'other' && (
          <div>
            <div className="flex items-center justify-between gap-2">
              <label className="text-sm font-medium text-zinc-800 dark:text-zinc-100" htmlFor={`motivo-${card.key}`}>¿Por qué la descartas?</label>
              <button type="button" aria-label="Volver" onClick={() => { setMode('discard'); setError(''); }} className={iconButton}><X className="h-4 w-4" /></button>
            </div>
            <div className="mt-2 flex gap-2">
              <input id={`motivo-${card.key}`} value={nota} maxLength={NOTE_MAX} autoFocus onChange={(event) => setNota(event.target.value)}
                onKeyDown={(event) => { if (event.key === 'Enter') send({ respuesta: 'DESCARTAR', motivo: 'OTRO', nota }); }}
                className="min-h-11 min-w-0 flex-1 rounded-xl border border-zinc-200 bg-white px-3 text-sm text-zinc-900 focus:border-brand-cyan focus:outline-none focus:ring-2 focus:ring-brand-cyan/30 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100" />
              <button type="button" disabled={busy || !nota.trim()} onClick={() => send({ respuesta: 'DESCARTAR', motivo: 'OTRO', nota })} className={primary}>
                {busy && <Loader2 className="h-4 w-4 animate-spin" />}Guardar
              </button>
            </div>
          </div>
        )}

        {mode === 'later' && (
          <div>
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-medium text-zinc-800 dark:text-zinc-100">¿Cuándo te la muestro?</p>
              <button type="button" aria-label="Volver" onClick={back} className={iconButton}><X className="h-4 w-4" /></button>
            </div>
            <div className="mt-2 flex flex-wrap gap-2">
              {LATER_OPTIONS.map((option) => (
                <button key={option.value} type="button" disabled={busy} onClick={() => send({ respuesta: 'MAS_TARDE', hasta: option.value })} className={chip}>{option.label}</button>
              ))}
            </div>
          </div>
        )}

        {error && <p role="alert" className="mt-3 flex items-start gap-1.5 text-sm text-destructive"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />{error}</p>}
      </div>
    </article>
  );
}
const Stat = ({ value, label, tone }) => (
  <div className="rounded-2xl border border-zinc-200 bg-white px-4 py-3 dark:border-zinc-800 dark:bg-zinc-950">
    <p className={cn('text-2xl font-semibold tabular-nums', tone || 'text-zinc-950 dark:text-zinc-50')}>{value}</p>
    <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">{label}</p>
  </div>
);

const Section = ({ title, count, children, defaultOpen = false, testId }) => (
  <details data-decision-section={testId} open={defaultOpen} className="group rounded-2xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
    <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-sm font-semibold text-zinc-900 dark:text-zinc-100">
      <span>{title}{count != null && <span className="ml-2 font-normal text-zinc-500 dark:text-zinc-400">{count}</span>}</span>
      <ChevronDown className="h-4 w-4 text-zinc-500 transition-transform group-open:rotate-180" />
    </summary>
    <div className="border-t border-zinc-100 px-4 py-3 dark:border-zinc-900">{children}</div>
  </details>
);

const answerLine = (card) => [card.answer?.label, card.answer?.note].filter(Boolean).join(' · ');

export default function ManagerDecisions() {
  const request = useRequest();
  const { currentUser } = useAuth();
  const [board, setBoard] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busyKey, setBusyKey] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setBoard(await request('/api/manager/decisions'));
    } catch (requestError) {
      console.error('[ManagerDecisions] Error cargando decisiones:', requestError.response?.data || requestError.message);
      setError(requestError.message);
    } finally {
      setLoading(false);
    }
  }, [request]);

  useEffect(() => { load(); }, [load]);
  // Lo que está a la vista deja de ser «nuevo» para el punto del menú.
  useEffect(() => {
    if (board?.pending) markSeen(currentUser?.id, board.pending.slice(0, TOP).map(decisionFingerprint));
  }, [board, currentUser?.id]);

  const respond = useCallback(async (card, body) => {
    setBusyKey(card.key);
    try {
      const next = await request('/api/manager/decisions/respond', { method: 'POST', body: JSON.stringify(body) });
      setBoard(next);
      toast.success(body.respuesta === 'HACER' ? 'Anotado: te encargas tú' : body.respuesta === 'DESCARTAR' ? 'Descartada. Lo tendré en cuenta' : 'Te lo vuelvo a mostrar más adelante');
      return null;
    } catch (requestError) {
      console.error('[ManagerDecisions] Error guardando respuesta:', requestError.response?.data || requestError.message);
      return requestError.message;
    } finally {
      setBusyKey('');
    }
  }, [request]);

  if (loading && !board) {
    return <div className="space-y-4" aria-busy="true">{[0, 1, 2].map((item) => <div key={item} className="h-40 animate-pulse rounded-2xl bg-zinc-200/70 dark:bg-zinc-900" />)}</div>;
  }
  if (error && !board) {
    return (
      <div className="brain-alert-surface rounded-2xl p-4 text-sm">
        <div className="flex items-center gap-2 font-medium"><AlertCircle className="h-4 w-4 text-destructive" />No pude cargar las decisiones de hoy</div>
        <p className="mt-1 pl-6">{error}</p>
        <button type="button" onClick={load} className={cn(outline, 'ml-6 mt-3')}><RefreshCw className="h-4 w-4" />Reintentar</button>
      </div>
    );
  }

  const { pending = [], taken = [], answered = [], avoid = [], delegated = [], learned = [], counts = {}, readingDay } = board || {};
  const top = pending.slice(0, TOP);
  const waiting = pending.length - top.length;
  const inCourse = [...answered.filter((card) => card.answer?.respuesta === 'HACER'), ...taken];
  const closedToday = answered.filter((card) => card.answer?.respuesta !== 'HACER');

  return (
    <div data-manager-decisions className="space-y-6">
      <section className="overflow-hidden rounded-3xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
        <div className="brain-ai-header flex items-center gap-4 px-5 py-5 text-white sm:px-7">
          <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-white/95"><BriaPortrait className="h-12 w-12 object-contain" /></span>
          <div className="min-w-0">
            <h2 className="text-lg font-semibold sm:text-xl">
              {pending.length ? `Esta semana necesito tu decisión en ${plural(pending.length, 'cosa', 'cosas')}` : 'Esta semana no hay nada esperando tu decisión'}
            </h2>
            <p className="mt-0.5 text-sm text-white/90">
              {readingDay ? `Junté la lectura del ${dayWords(readingDay)} con lo que vi esta semana en reuniones y tareas.` : 'Todavía no hay lectura de la mañana; te muestro lo que vi esta semana en reuniones y tareas.'}
            </p>
          </div>
          <button type="button" onClick={load} disabled={loading} aria-label="Actualizar" className="ml-auto inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white/15 text-white hover:bg-white/25 disabled:opacity-60">
            <RefreshCw className={cn('h-4 w-4', loading && 'animate-spin')} />
          </button>
        </div>
        <div className="grid grid-cols-2 gap-3 p-4 sm:grid-cols-4 sm:p-5">
          <Stat value={counts.pending || 0} label="Para decidir" />
          <Stat value={counts.high || 0} label="Urgentes" tone={counts.high ? 'text-brand-coral-deep dark:text-brand-coral' : undefined} />
          <Stat value={counts.taken || 0} label="En marcha" tone="text-brand-cyan-deep dark:text-brand-cyan" />
          <Stat value={counts.delegated || 0} label="Son de otras personas" />
        </div>
      </section>

      {pending.length === 0 ? (
        <div className="flex flex-col items-center rounded-2xl border border-dashed border-zinc-200 px-6 py-10 text-center dark:border-zinc-800">
          <CheckCircle2 className="h-8 w-8 text-brand-green" />
          <p className="mt-3 text-sm font-medium text-zinc-800 dark:text-zinc-100">Todo respondido por ahora.</p>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">Mañana a las 7:30 te traigo la lectura nueva.</p>
        </div>
      ) : (
        <div className="space-y-2">
          <div className="grid items-stretch gap-3 md:grid-cols-2 xl:grid-cols-3">
            {top.map((card) => <DecisionCard key={card.key} card={card} busy={busyKey === card.key} onRespond={respond} />)}
          </div>
          {waiting > 0 && <p className="text-center text-xs text-zinc-500 dark:text-zinc-400">Hay {plural(waiting, 'otra', 'otras')} en espera: entran a medida que respondes.</p>}
        </div>
      )}
      {delegated.length > 0 && (
        <section data-decision-section="delegated" className="rounded-2xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950 sm:p-5">
          <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Quedó a cargo de otras personas</h3>
          <p className="mt-0.5 text-xs leading-5 text-zinc-500 dark:text-zinc-400">Salió en las reuniones de esta semana. No es para que lo decidas tú: si quieres, Bria se lo prepara como pendiente a cada quien.</p>
          <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {delegated.map((person) => (
              <div key={person.name} className="flex flex-col rounded-xl border border-zinc-200 p-3 dark:border-zinc-800">
                <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">{person.name} <span className="font-normal text-zinc-500 dark:text-zinc-400">· {person.count}</span></p>
                <ul className="mt-1.5 space-y-1 text-sm leading-5 text-zinc-600 dark:text-zinc-300">
                  {person.cards.map((card) => <li key={card.key} className="line-clamp-2">{card.title}</li>)}
                </ul>
                <button type="button" onClick={() => askBria(person.ask)} className={cn(link, 'mt-auto self-start')}>Que Bria se lo prepare<ArrowUpRight className="h-3.5 w-3.5" /></button>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* items-start: abrir una sección no estira a la de al lado. */}
      <div className="grid items-start gap-3 lg:grid-cols-2">
        {inCourse.length > 0 && (
          <Section title="Te encargas tú" count={inCourse.length} testId="taken">
            <ul className="divide-y divide-zinc-100 dark:divide-zinc-900">
              {inCourse.map((card) => (
                <li key={card.key} className="py-2.5">
                  <p className="text-sm font-medium text-zinc-800 dark:text-zinc-100">{card.title}</p>
                  <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">{[card.subjectName, card.answer?.outcome || (card.source === 'OBSERVER' ? 'Se cierra sola cuando deje de aparecer en la fuente.' : 'Mañana miro si cambió.')].filter(Boolean).join(' · ')}</p>
                </li>
              ))}
            </ul>
          </Section>
        )}
        {closedToday.length > 0 && (
          <Section title="Ya respondiste hoy" count={closedToday.length} testId="answered">
            <ul className="divide-y divide-zinc-100 dark:divide-zinc-900">
              {closedToday.map((card) => (
                <li key={card.key} className="py-2.5">
                  <p className="text-sm font-medium text-zinc-800 dark:text-zinc-100">{card.title}</p>
                  <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">{answerLine(card)}</p>
                </li>
              ))}
            </ul>
          </Section>
        )}
        {avoid.length > 0 && (
          <Section title="Lo que yo no haría" count={avoid.length} testId="avoid">
            <ul className="divide-y divide-zinc-100 dark:divide-zinc-900">
              {avoid.map((card) => (
                <li key={card.key} className="py-2.5">
                  <p className="text-sm font-medium text-zinc-800 dark:text-zinc-100">{card.title}</p>
                  {card.why && <p className="mt-0.5 text-xs leading-5 text-zinc-500 dark:text-zinc-400">{card.why}</p>}
                </li>
              ))}
            </ul>
          </Section>
        )}
        {learned.length > 0 && (
          <Section title="Lo que aprendí a no mostrarte" count={learned.reduce((sum, group) => sum + group.count, 0)} testId="learned">
            <p className="text-xs leading-5 text-zinc-500 dark:text-zinc-400">Me dijiste tres veces en el último mes que esto no aplica, así que lo dejo aquí. Si algo se vuelve crítico, vuelve arriba.</p>
            <ul className="mt-2 space-y-1">
              {learned.map((group) => <li key={group.key} className="text-sm text-zinc-700 dark:text-zinc-200">{group.label} <span className="text-zinc-500 dark:text-zinc-400">· {group.count}</span></li>)}
            </ul>
          </Section>
        )}
      </div>
    </div>
  );
}
