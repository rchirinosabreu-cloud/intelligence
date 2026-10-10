import BriaPortrait from '@/components/bria/BriaPortrait';
import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import { AlertCircle, ArrowRight, RefreshCw } from '@/components/ui/icons';
import { getApiBaseUrl } from '@/lib/apiBaseUrl';
import { askBria } from '@/lib/briaAsk';
import { cn } from '@/lib/utils';

// La lectura de la semana (Rodny, 10 de octubre de 2026, Fase A de Ritmo): Bria lee Ritmo y el mapa de carga y
// propone de 3 a 5 decisiones, cada una con su evidencia y una acción. Se genera sola los lunes a las 7 y se puede
// pedir en cualquier momento. Las acciones que abren una tarea llevan a Gestión; las que piden hablar o crear un
// pendiente dejan el mensaje listo en el chat de Bria, nunca lo mandan solas.

const URGENCY = {
  alta: { label: 'Urgente', className: 'bg-brand-coral-soft text-brand-coral-deep dark:bg-brand-coral/15 dark:text-brand-coral' },
  media: { label: 'Esta semana', className: 'bg-brand-yellow-soft text-brand-yellow-deep dark:bg-brand-yellow/15 dark:text-brand-yellow' },
  baja: { label: 'Cuando se pueda', className: 'bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300' }
};
const formatMoment = (value) => value ? new Intl.DateTimeFormat('es-CO', { dateStyle: 'long', timeStyle: 'short', timeZone: 'America/Bogota' }).format(new Date(value)) : '';
const headers = () => { const token = localStorage.getItem('authToken'); return { Authorization: token ? `Bearer ${token}` : '', 'Content-Type': 'application/json' }; };

function DecisionAction({ action }) {
  if (!action || action.kind === 'NINGUNA') return null;
  const label = action.label || 'Ver';
  const button = 'inline-flex min-h-11 items-center gap-1.5 rounded-xl border border-zinc-200 px-3 text-xs font-medium text-zinc-700 transition-colors hover:border-brand-cyan hover:text-brand-cyan-deep dark:border-zinc-700 dark:text-zinc-200 dark:hover:text-brand-cyan';
  if (['REVISAR_TAREA', 'REASIGNAR'].includes(action.kind) && action.taskId) {
    return <Link to={`/gestion?taskId=${encodeURIComponent(action.taskId)}`} className={button} data-reading-action={action.kind}>{label}<ArrowRight className="h-3.5 w-3.5" /></Link>;
  }
  if (action.suggestedMessage) {
    return <button type="button" onClick={() => askBria(action.suggestedMessage)} className={button} data-reading-action={action.kind} title="Deja el mensaje escrito en el chat de Bria para que lo revises y lo envíes"><BriaPortrait  alt="" className="h-4 w-4 object-contain" />{label}</button>;
  }
  return null;
}

export default function WeeklyReadingCard({ refreshKey = 0 }) {
  const [state, setState] = useState({ loading: true, error: '', weekKey: null, reading: null, isCurrentWeek: false });
  const [generating, setGenerating] = useState(false);

  const load = useCallback(async () => {
    setState((current) => ({ ...current, loading: true, error: '' }));
    try {
      const response = await fetch(`${getApiBaseUrl()}/api/manager/rhythm/reading`, { headers: headers() });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || 'No pudimos cargar la lectura de la semana.');
      setState({ loading: false, error: '', ...payload });
    } catch (error) {
      console.error('[WeeklyReadingCard] Error cargando la lectura:', error.message || error);
      setState((current) => ({ ...current, loading: false, error: error.message }));
    }
  }, []);
  useEffect(() => { load(); }, [load, refreshKey]);

  const generate = async () => {
    setGenerating(true);
    const pending = toast.loading('Bria está leyendo la semana…');
    try {
      const response = await fetch(`${getApiBaseUrl()}/api/manager/rhythm/reading`, { method: 'POST', headers: headers() });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || 'Bria no pudo escribir la lectura.');
      setState((current) => ({ ...current, reading: payload, isCurrentWeek: true }));
      toast.success('Lectura de la semana lista', { id: pending });
    } catch (error) {
      console.error('[WeeklyReadingCard] Error generando la lectura:', error.message || error);
      toast.error(error.message, { id: pending });
    } finally {
      setGenerating(false);
    }
  };

  const reading = state.reading;
  const decisions = reading?.reading?.decisions || [];
  return (
    <section className="overflow-hidden rounded-2xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950" aria-labelledby="weekly-reading-title" data-weekly-reading>
      <div className="brain-ai-header flex items-center gap-3 px-5 py-4 text-white">
        <BriaPortrait  alt="" className="h-9 w-9 shrink-0 object-contain" />
        <div className="min-w-0 flex-1">
          <h2 id="weekly-reading-title" className="text-sm font-semibold">Lectura de la semana</h2>
          <p className="truncate text-xs text-white/85">
            {reading ? `${reading.generatedBy === 'Bria' ? 'Bria la escribió sola' : `La pidió ${reading.generatedBy}`} · ${formatMoment(reading.generatedAt)}${state.isCurrentWeek ? '' : ' · de una semana anterior'}` : 'Bria lee el ritmo y la carga del equipo y propone qué decidir.'}
          </p>
        </div>
        <button type="button" onClick={generate} disabled={generating || state.loading} className="inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-xl bg-white/15 px-3 text-xs font-semibold text-white transition-colors hover:bg-white/25 disabled:opacity-60" data-weekly-reading-generate>
          <RefreshCw className={cn('h-3.5 w-3.5', generating && 'animate-spin')} />
          {generating ? 'Leyendo…' : reading ? 'Volver a leer' : 'Pedir la lectura'}
        </button>
      </div>

      <div className="p-5">
        {state.error && (
          <div className="brain-alert-surface rounded-2xl p-4 text-sm">
            <div className="flex items-center gap-2 font-medium"><AlertCircle className="h-4 w-4 text-destructive" /> No pudimos cargar la lectura</div>
            <p className="mt-1 pl-6">{state.error}</p>
          </div>
        )}
        {state.loading && !reading && !state.error && <div className="h-24 animate-pulse rounded-2xl bg-zinc-200/70 dark:bg-zinc-900" />}
        {!state.loading && !reading && !state.error && (
          <p className="text-sm leading-6 text-zinc-500 dark:text-zinc-400">Bria todavía no escribió la lectura de esta semana. Se escribe sola los lunes a las 7 de la mañana, o puedes pedirla ahora.</p>
        )}
        {reading && (
          <>
            <p className="text-sm leading-6 text-zinc-700 dark:text-zinc-200">{reading.reading.summary}</p>
            <ol className="mt-4 space-y-3" data-weekly-reading-decisions>
              {decisions.map((decision, index) => {
                const urgency = URGENCY[decision.urgency] || URGENCY.media;
                return (
                  <li key={`${index}-${decision.title}`} className="rounded-2xl border border-zinc-200 p-4 dark:border-zinc-800">
                    {/* En pantallas estrechas la acción va debajo: al lado le robaba el ancho al título. */}
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-x-4">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-zinc-100 text-[11px] font-semibold tabular-nums text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">{index + 1}</span>
                          <h3 className="text-sm font-semibold text-zinc-950 dark:text-zinc-50">{decision.title}</h3>
                          <span className={cn('rounded-full px-2 py-0.5 text-[11px] font-medium', urgency.className)}>{urgency.label}</span>
                        </div>
                        <p className="mt-2 text-sm leading-6 text-zinc-700 dark:text-zinc-200">{decision.why}</p>
                        {decision.evidence?.length > 0 && (
                          <ul className="mt-2 space-y-0.5 text-xs text-zinc-500 dark:text-zinc-400">
                            {decision.evidence.map((line, i) => <li key={i} className="flex gap-1.5"><span aria-hidden="true">·</span><span>{line}</span></li>)}
                          </ul>
                        )}
                      </div>
                      <DecisionAction action={decision.action} />
                    </div>
                  </li>
                );
              })}
            </ol>
          </>
        )}
      </div>
    </section>
  );
}
