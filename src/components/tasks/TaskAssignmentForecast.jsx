import React, { useEffect, useState } from 'react';
import { getApiBaseUrl } from '@/lib/apiBaseUrl';
import { cn } from '@/lib/utils';

const duration = ms => { const m = Math.round(Number(ms || 0) / 60000); return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h${m % 60 ? ` ${m % 60} min` : ''}`; };
const moment = value => value ? new Intl.DateTimeFormat('es-CO', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'America/Bogota' }).format(new Date(value)) : 'el vencimiento';
const BASIS = { persona_cliente_complejidad: 'Misma persona, cliente y complejidad', persona_complejidad: 'Su historial con esta complejidad, en varios clientes', equipo_cliente_complejidad: 'Historial del equipo para este cliente y complejidad', equipo_complejidad: 'Historial del equipo con esta complejidad', persona_tipo: 'Su historial general de este trabajo', equipo_tipo: 'Historial general del equipo', persona: 'Su historial general', equipo: 'Historial del equipo', supuesto: 'Sin historial: una hora supuesta' };

/** Lectura de un escenario elegido en Ritmo. No crea, reasigna ni envía una acción a Bria. */
export default function TaskAssignmentForecast({ enabled = true, taskId, title, clientId, assigneeId, dueDay, focusDeadlineAt }) {
  const key = JSON.stringify({ taskId: taskId || undefined, title: (title || '').trim(), clientId, assigneeId, dueDay, focusDeadlineAt: focusDeadlineAt || null });
  const valid = enabled && title?.trim() && clientId && assigneeId && /^\d{4}-\d{2}-\d{2}$/.test(dueDay || '');
  const [state, setState] = useState(null);
  useEffect(() => {
    if (!valid) { setState(null); return; }
    const controller = new AbortController();
    setState({ key, loading: true });
    const timer = setTimeout(async () => {
      try {
        const token = localStorage.getItem('authToken');
        const response = await fetch(`${getApiBaseUrl()}/api/manager/rhythm/assignment-preview`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: token ? `Bearer ${token}` : '' }, body: key, signal: controller.signal });
        const result = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(result.error || 'No pudimos prever esta entrega.');
        if (!controller.signal.aborted) setState({ key, result });
      } catch (error) {
        if (controller.signal.aborted) return;
        console.error('[TaskAssignmentForecast] No se pudo prever la entrega:', error.message || error);
        setState({ key, error: error.message });
      }
    }, 500);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [key, valid]);
  if (!valid) return null;
  const current = state?.key === key ? state : null, result = current?.result;
  const warning = ['riesgo', 'vencida'].includes(result?.risk);
  const uncertain = result?.confidence !== 'suficiente' || result?.incomplete || !result?.risk;
  return <section aria-label="Previsión de entrega" aria-live="polite" data-assignment-prediction={result?.risk || 'loading'} className="rounded-xl border border-zinc-200 bg-white p-4 text-sm dark:border-zinc-800 dark:bg-zinc-950">
    {!current || current.loading ? <p role="status" className="text-xs text-zinc-500 dark:text-zinc-400">Revisando el margen de esta entrega…</p> : current.error ? <p className="text-xs text-zinc-600 dark:text-zinc-400">{current.error} Puedes continuar y revisar Ritmo.</p> : <>
      <p className={cn('font-semibold', warning ? 'text-brand-coral-deep dark:text-brand-coral' : uncertain || result.risk === 'ajustada' ? 'text-brand-yellow-deep dark:text-brand-yellow' : 'text-brand-green-deep dark:text-brand-green')}>{warning ? 'Conviene revisar este compromiso' : uncertain ? 'Estimación orientativa: falta historial comparable' : result.risk === 'ajustada' ? 'La entrega tiene poco margen' : 'La entrega tiene margen estimado'}</p>
      <p className="mt-1 text-xs leading-5 text-zinc-700 dark:text-zinc-300">{result.personName}: {duration(result.remainingMs)}{result.upperMs !== result.remainingMs ? ` a ${duration(result.upperMs)}` : ''} estimadas por hacer{result.capacityToDeadlineMs === undefined ? ' · La fecha queda fuera de los próximos 15 días hábiles de análisis.' : ` · ${duration(result.capacityToDeadlineMs)} nominales disponibles hasta ${moment(result.deadlineAt)}.`}</p>
      {result.committedToDeadlineMs > result.remainingMs && <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-400">Tiene además {duration(result.committedToDeadlineMs - result.remainingMs)} comprometidas antes de esa hora.</p>}
      <details className="mt-2 text-xs text-zinc-600 dark:text-zinc-400"><summary className="cursor-pointer w-fit">En qué se basa</summary><p className="mt-1 leading-5">{BASIS[result.basis] || BASIS[result.source] || 'Historial disponible'} · {result.sample || 0} mediciones · {result.workType} · Complejidad {result.complexity?.toLowerCase() || 'sin clasificar'} · {result.clientName}. La complejidad es orientativa. {result.deadlineSource === 'publicacion_fecha' && 'La pieza tiene fecha de publicación, pero falta su hora. '}No descuenta reuniones ni ausencias; considera margen adicional para revisión y aprobación{result.deadlineSource === 'publicacion' ? ' antes de publicar' : ''}. No es una garantía de cumplimiento.</p></details>
    </>}
  </section>;
}
