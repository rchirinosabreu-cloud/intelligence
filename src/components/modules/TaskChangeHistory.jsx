import { useEffect, useState } from 'react';
import { getApiBaseUrl } from '@/lib/apiBaseUrl';
import { describeTaskChange } from '@/lib/taskChanges';

// El historial de la tarea (Rodny, 19 de noviembre de 2026: «sobrio, delicado, discreto, como el historial de las
// sesiones»): una línea plegada con el último cambio y, al abrirla, quién cambió qué y cuándo. Sin colores ni iconos.
const formatMoment = (value) => new Intl.DateTimeFormat('es-CO', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));

export default function TaskChangeHistory({ taskId, refreshKey = null }) {
  const [history, setHistory] = useState(null);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    if (!taskId) return undefined;
    const controller = new AbortController();
    fetch(`${getApiBaseUrl()}/api/tasks/${taskId}/history`, {
      headers: { Authorization: `Bearer ${localStorage.getItem('authToken')}` },
      signal: controller.signal
    })
      .then(async (response) => {
        if (!response.ok) throw new Error((await response.json().catch(() => ({}))).error || 'No se pudo consultar el historial');
        return response.json();
      })
      .then(setHistory)
      .catch((error) => { if (error.name !== 'AbortError') console.error('[TaskChangeHistory] Fetch failed:', error); });
    return () => controller.abort();
  }, [taskId, refreshKey]);

  const events = history?.events || [];
  // Las tareas de antes del 19 de noviembre de 2026 no tienen historial: no se dibuja nada en vez de inventarlo.
  if (!events.length) return null;
  const names = history.names || {};

  return (
    <section className="border-b border-zinc-200/70 py-3 dark:border-zinc-800/70" data-task-change-history>
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0">
          <p className="text-xs font-medium text-zinc-400 dark:text-zinc-500">Historial</p>
          <p className="mt-0.5 truncate text-xs text-zinc-500 dark:text-zinc-400" title={describeTaskChange(events[0], names)}>
            {describeTaskChange(events[0], names)} · {formatMoment(events[0].occurredAt)}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setExpanded((value) => !value)}
          className="shrink-0 px-1 py-1 text-xs font-medium text-zinc-500 transition-colors hover:text-primary dark:text-zinc-400"
          aria-expanded={expanded}
        >
          {expanded ? 'Ocultar' : `Ver ${events.length === 1 ? 'el cambio' : `los ${events.length} cambios`}`}
        </button>
      </div>
      {expanded && (
        <ol className="mt-3 space-y-2 border-t border-zinc-200/70 pt-3 dark:border-zinc-800/70">
          {events.map((event) => (
            <li key={event.id} className="grid grid-cols-[1fr_auto] gap-3 text-xs" data-task-change={event.kind}>
              <span className="min-w-0 text-zinc-600 dark:text-zinc-300">{describeTaskChange(event, names)}</span>
              <time dateTime={event.occurredAt} className="whitespace-nowrap text-zinc-400 dark:text-zinc-500">{formatMoment(event.occurredAt)}</time>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
