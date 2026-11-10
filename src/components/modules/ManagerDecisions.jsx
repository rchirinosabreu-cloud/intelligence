import React, { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import {
  AlertCircle, ArrowUpRight, CheckCircle2, ChevronDown, Clock, ExternalLink, Lightbulb, Loader2, RefreshCw, X
} from '@/components/ui/icons';
import BriaPortrait from '@/components/bria/BriaPortrait';
import { useNavigateFrom } from '@/components/layout/BackToOrigin';
import { getApiBaseUrl } from '@/lib/apiBaseUrl';
import { askBria } from '@/lib/briaAsk';
import { cn } from '@/lib/utils';
import { LATER_OPTIONS, NOT_APPLICABLE_REASONS, NOTE_MAX, responseProblem } from '@/lib/managerDecisions';

// Las decisiones de Manager (Rodny, 10 de noviembre de 2026): una sola lista con lo que Bria propone y lo que el
// Observer detectó, y tres respuestas que llegan al libro de decisiones o a la señal. Lo primero son las tres más
// urgentes; el resto, al desplegar.
const TOP = 3;

const LEVEL = {
  alta: { label: 'Urgente', dot: 'bg-brand-coral', chip: 'bg-brand-coral/10 text-brand-coral-deep dark:text-brand-coral' },
  media: { label: 'Esta semana', dot: 'bg-brand-yellow', chip: 'bg-brand-yellow/15 text-zinc-800 dark:text-brand-yellow' },
  baja: { label: 'Para tener en cuenta', dot: 'bg-zinc-300 dark:bg-zinc-600', chip: 'bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300' }
};

const DAY = new Intl.DateTimeFormat('es-CO', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' });
const dayWords = (day) => (day ? DAY.format(new Date(`${day}T12:00:00Z`)).replace(',', '') : '');
const plural = (count, one, many) => `${count} ${count === 1 ? one : many}`;

const outline = 'inline-flex min-h-11 items-center justify-center gap-1.5 rounded-xl border border-zinc-200 bg-white px-3.5 text-sm font-medium text-zinc-700 transition-colors hover:border-zinc-300 hover:bg-zinc-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-cyan disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800';
const chip = (active) => cn('inline-flex min-h-11 items-center rounded-full border px-3.5 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-cyan',
  active ? 'border-brand-cyan bg-brand-cyan/10 font-medium text-brand-cyan-deep dark:text-brand-cyan' : 'border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800');
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

function DecisionCard({ card, onRespond, busy, featured }) {
  const navigateFrom = useNavigateFrom();
  const [mode, setMode] = useState(null); // null | 'no' | 'later'
  const [motivo, setMotivo] = useState('');
  const [nota, setNota] = useState('');
  const [error, setError] = useState('');
  const level = LEVEL[card.level] || LEVEL.baja;
  const tag = [card.sourceLabel, card.kindLabel || card.categoryLabel].filter(Boolean).join(' · ');

  const send = async (payload) => {
    const body = { source: card.source, id: card.ref, ...payload };
    const problem = responseProblem(body);
    if (problem) { setError(problem); return; }
    setError('');
    const failure = await onRespond(card, body);
    if (failure) setError(failure);
  };

  return (
    <article data-decision-card={card.key} className={cn('rounded-2xl border bg-white p-4 dark:bg-zinc-950 sm:p-5', featured ? 'border-zinc-200 dark:border-zinc-800' : 'border-zinc-200/80 dark:border-zinc-800/80')}>
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className={cn('inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 font-semibold', level.chip)}>
          <span className={cn('h-2 w-2 rounded-full', level.dot)} aria-hidden="true" />{level.label}
        </span>
        {card.subjectName && <span className="rounded-full bg-zinc-100 px-2.5 py-1 font-medium text-zinc-700 dark:bg-zinc-800 dark:text-zinc-200">{card.subjectName}</span>}
        {tag && <span className="text-zinc-500 dark:text-zinc-400">{tag}</span>}
      </div>
      {card.owner && <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">Quedó a cargo de <span className="font-medium text-zinc-700 dark:text-zinc-200">{card.owner}</span></p>}
      <h3 className={cn('mt-3 font-semibold text-zinc-950 dark:text-zinc-50', featured ? 'text-base sm:text-lg' : 'text-sm sm:text-base')}>{card.title}</h3>
      {card.why && <p className="mt-1.5 text-sm leading-6 text-zinc-600 dark:text-zinc-300">{card.why}</p>}
      {card.quote && (
        <details className="group mt-2">
          <summary className="inline-flex min-h-9 cursor-pointer list-none items-center gap-1 text-xs font-medium text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200">
            <ChevronDown className="h-3.5 w-3.5 transition-transform group-open:rotate-180" />{card.source === 'OBSERVER' ? '¿Qué se dijo en la reunión?' : 'Por qué lo propongo'}
          </summary>
          <blockquote className="mt-1 rounded-xl bg-zinc-50 px-3 py-2 text-sm leading-6 text-zinc-700 [overflow-wrap:anywhere] dark:bg-zinc-900 dark:text-zinc-300">{card.source === 'OBSERVER' ? `«${card.quote}»` : card.quote}</blockquote>
        </details>
      )}
      {card.needsContextReview && <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">El contexto de esta cuenta cambió desde la lectura: revísalo antes de actuar.</p>}

      {!mode && (
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <button type="button" disabled={busy} onClick={() => send({ respuesta: 'HACER' })}
            className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-xl bg-brand-cyan-deep px-4 text-sm font-semibold text-white transition-transform active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-cyan focus-visible:ring-offset-2 disabled:opacity-60 dark:focus-visible:ring-offset-zinc-950">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}Me encargo
          </button>
          <button type="button" disabled={busy} onClick={() => setMode('no')} className={outline}>No aplica</button>
          <button type="button" disabled={busy} onClick={() => setMode('later')} className={outline}><Clock className="h-4 w-4" />Más tarde</button>
          <span className="flex-1" />
          {card.url && <button type="button" onClick={() => navigateFrom(card.url, { label: 'Manager' })} className={link}>Abrir<ExternalLink className="h-3.5 w-3.5" /></button>}
          <button type="button" onClick={() => askBria(card.ask || `Ayúdame con esto: ${card.title}${card.subjectName ? ` (${card.subjectName})` : ''}`)} className={link}>Pedírselo a Bria<ArrowUpRight className="h-3.5 w-3.5" /></button>
        </div>
      )}

      {mode === 'no' && (
        <div className="mt-4 rounded-xl border border-zinc-200 p-3 dark:border-zinc-800">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-medium text-zinc-800 dark:text-zinc-100">¿Por qué no aplica?</p>
            <button type="button" aria-label="Volver" onClick={() => { setMode(null); setError(''); }} className="inline-flex h-11 w-11 items-center justify-center rounded-lg text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800"><X className="h-4 w-4" /></button>
          </div>
          <div className="mt-2 flex flex-wrap gap-2" role="radiogroup" aria-label="Motivo">
            {NOT_APPLICABLE_REASONS.map((reason) => (
              <button key={reason.value} type="button" role="radio" aria-checked={motivo === reason.value} onClick={() => setMotivo(reason.value)} className={chip(motivo === reason.value)}>{reason.label}</button>
            ))}
          </div>
          <label className="mt-3 block text-xs font-medium text-zinc-600 dark:text-zinc-300" htmlFor={`nota-${card.key}`}>{motivo === 'OTRO' ? 'Cuéntame por qué' : 'Nota (opcional)'}</label>
          <textarea id={`nota-${card.key}`} value={nota} maxLength={NOTE_MAX} rows={2} onChange={(event) => setNota(event.target.value)}
            className="mt-1 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 focus:border-brand-cyan focus:outline-none focus:ring-2 focus:ring-brand-cyan/30 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100" />
          <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">Con tu motivo, Bria aprende: si algo así no te sirve tres veces, deja de proponértelo.</p>
          <div className="mt-3 flex justify-end">
            <button type="button" disabled={busy || !motivo} onClick={() => send({ respuesta: 'NO_APLICA', motivo, nota })}
              className="inline-flex min-h-11 items-center gap-1.5 rounded-xl bg-zinc-900 px-4 text-sm font-semibold text-white disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900">
              {busy && <Loader2 className="h-4 w-4 animate-spin" />}Guardar
            </button>
          </div>
        </div>
      )}

      {mode === 'later' && (
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <span className="text-sm font-medium text-zinc-700 dark:text-zinc-200">¿Cuándo te lo muestro?</span>
          {LATER_OPTIONS.map((option) => (
            <button key={option.value} type="button" disabled={busy} onClick={() => send({ respuesta: 'MAS_TARDE', hasta: option.value })} className={chip(false)}>{option.label}</button>
          ))}
          <button type="button" aria-label="Volver" onClick={() => { setMode(null); setError(''); }} className="inline-flex h-11 w-11 items-center justify-center rounded-lg text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800"><X className="h-4 w-4" /></button>
        </div>
      )}

      {error && <p role="alert" className="mt-3 flex items-start gap-1.5 text-sm text-destructive"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />{error}</p>}
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

export default function ManagerDecisions({ onOpenHistory } = {}) {
  const request = useRequest();
  const [board, setBoard] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busyKey, setBusyKey] = useState('');
  const [showAll, setShowAll] = useState(false);

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

  const respond = useCallback(async (card, body) => {
    setBusyKey(card.key);
    try {
      const next = await request('/api/manager/decisions/respond', { method: 'POST', body: JSON.stringify(body) });
      setBoard(next);
      toast.success(body.respuesta === 'HACER' ? 'Anotado: te encargas tú' : body.respuesta === 'NO_APLICA' ? 'Anotado: no aplica' : 'Te lo vuelvo a mostrar más adelante');
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

  const { pending = [], older = [], taken = [], answered = [], avoid = [], learned = [], counts = {}, scorecard, readingDay } = board || {};
  const top = pending.slice(0, TOP);
  const rest = pending.slice(TOP);
  const inCourse = [...answered.filter((card) => card.answer?.respuesta === 'HACER'), ...taken];
  const closedToday = answered.filter((card) => card.answer?.respuesta !== 'HACER');

  return (
    <div data-manager-decisions className="space-y-6">
      <section className="overflow-hidden rounded-3xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
        <div className="brain-ai-header flex items-center gap-4 px-5 py-5 text-white sm:px-7">
          <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-white/95"><BriaPortrait className="h-12 w-12 object-contain" /></span>
          <div className="min-w-0">
            <h2 className="text-lg font-semibold sm:text-xl">
              {pending.length ? `Hoy necesito tu decisión en ${plural(pending.length, 'cosa', 'cosas')}` : 'Hoy no hay nada esperando tu decisión'}
            </h2>
            <p className="mt-0.5 text-sm text-white/90">
              {readingDay ? `Junté la lectura del ${dayWords(readingDay)} con lo que vi en reuniones y tareas.` : 'Todavía no hay lectura de la mañana; te muestro lo que vi en reuniones y tareas.'}
            </p>
          </div>
          <button type="button" onClick={load} disabled={loading} aria-label="Actualizar" className="ml-auto inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white/15 text-white hover:bg-white/25 disabled:opacity-60">
            <RefreshCw className={cn('h-4 w-4', loading && 'animate-spin')} />
          </button>
        </div>
        <div className="grid grid-cols-2 gap-3 p-4 sm:grid-cols-4 sm:p-5">
          <Stat value={counts.pending || 0} label="Esperan tu decisión" />
          <Stat value={counts.high || 0} label="Urgentes" tone={counts.high ? 'text-brand-coral-deep dark:text-brand-coral' : undefined} />
          <Stat value={counts.taken || 0} label="Te encargas tú" tone="text-brand-cyan-deep dark:text-brand-cyan" />
          <Stat value={counts.later || 0} label="Para más tarde" />
        </div>
      </section>

      {pending.length === 0 ? (
        <div className="flex flex-col items-center rounded-2xl border border-dashed border-zinc-200 px-6 py-10 text-center dark:border-zinc-800">
          <CheckCircle2 className="h-8 w-8 text-brand-green" />
          <p className="mt-3 text-sm font-medium text-zinc-800 dark:text-zinc-100">Todo respondido por ahora.</p>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">Mañana a las 7:30 te traigo la lectura nueva.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {top.map((card) => <DecisionCard key={card.key} card={card} featured busy={busyKey === card.key} onRespond={respond} />)}
          {rest.length > 0 && (
            <>
              <button type="button" aria-expanded={showAll} onClick={() => setShowAll((value) => !value)} className={cn(outline, 'w-full')}>
                <ChevronDown className={cn('h-4 w-4 transition-transform', showAll && 'rotate-180')} />
                {showAll ? 'Ocultar las demás' : `Ver las demás (${rest.length})`}
              </button>
              {showAll && rest.map((card) => <DecisionCard key={card.key} card={card} busy={busyKey === card.key} onRespond={respond} />)}
            </>
          )}
        </div>
      )}

      {older.length > 0 && (
        <Section title="De reuniones de hace más de dos semanas" count={older.length} testId="older">
          <p className="mb-3 text-xs leading-5 text-zinc-500 dark:text-zinc-400">Siguen abiertas, pero no compiten con lo de hoy. Si ya no aplican, dímelo y dejo de mostrarlas.</p>
          <div className="space-y-3">
            {older.map((card) => <DecisionCard key={card.key} card={card} busy={busyKey === card.key} onRespond={respond} />)}
          </div>
        </Section>
      )}

      <div className="grid gap-3 lg:grid-cols-2">
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

      {scorecard?.lectura && (
        <div className="flex items-start gap-3 rounded-2xl border border-brand-cyan/20 bg-brand-cyan/[0.04] px-4 py-3 dark:border-brand-cyan/25 dark:bg-brand-cyan/[0.07]">
          <Lightbulb className="mt-0.5 h-4 w-4 shrink-0 text-brand-cyan-deep dark:text-brand-cyan" />
          <p className="text-sm leading-6 text-zinc-700 dark:text-zinc-300"><strong className="font-semibold text-zinc-900 dark:text-zinc-100">Cómo me va contigo:</strong> {scorecard.lectura}</p>
        </div>
      )}

      {onOpenHistory && (
        <div className="flex justify-center">
          <button type="button" onClick={onOpenHistory} className={link}>Ver todo lo que detectó el Observer, con su historial</button>
        </div>
      )}
    </div>
  );
}
