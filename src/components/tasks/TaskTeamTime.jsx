import React, { useCallback, useEffect, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { cn } from '@/lib/utils';
import TeamAvatar from '@/components/ui/TeamAvatar';
import { Loader2, Pause, PlayCircle, Users } from '@/components/ui/icons';
import { getApiBaseUrl } from '@/lib/apiBaseUrl';
import { formatElapsedTime } from '@/lib/taskTiming';

/**
 * «Equipo de la tarea» (Rodny, 5 de octubre de 2026): el tiempo del responsable y el de cada
 * colaborador, por separado. Cada colaborador empieza y pausa **su** reloj desde su propia fila;
 * el del responsable corre con la columna «En proceso», como siempre. Solo se dibuja si la tarea
 * tiene colaboradores: una tarea de una sola persona se ve igual que antes.
 */

const authHeaders = () => {
  const token = localStorage.getItem('authToken');
  return token ? { Authorization: `Bearer ${token}` } : {};
};

export default function TaskTeamTime({ taskId, currentUserId, hasCollaborators, status, onChange }) {
  const closed = ['REALIZADA', 'DEVUELTA'].includes(String(status));
  const inProgress = String(status) === 'EN_CURSO';
  const [rows, setRows] = useState([]);
  const [loadedAt, setLoadedAt] = useState(0);
  const [tick, setTick] = useState(0);
  const [busy, setBusy] = useState(false);
  const mounted = useRef(true);

  const apply = useCallback((data) => {
    if (!mounted.current || !Array.isArray(data)) return;
    setRows(data);
    setLoadedAt(Date.now());
  }, []);

  const load = useCallback(async () => {
    try {
      const response = await fetch(`${getApiBaseUrl()}/api/tasks/${taskId}/work/team`, { headers: authHeaders(), cache: 'no-store' });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        console.error('[TaskTeamTime] No se pudo leer el tiempo del equipo:', payload);
        return;
      }
      apply(payload);
    } catch (error) {
      console.error('[TaskTeamTime] No se pudo leer el tiempo del equipo:', error);
    }
  }, [taskId, apply]);

  useEffect(() => {
    mounted.current = true;
    if (taskId && hasCollaborators) load();
    return () => { mounted.current = false; };
  }, [taskId, hasCollaborators, load]);

  // Un solo latido para toda la lista: los relojes que corren avanzan juntos.
  const anyWorking = rows.some((row) => row.working);
  useEffect(() => {
    if (!anyWorking) return undefined;
    const id = window.setInterval(() => setTick((value) => value + 1), 1000);
    return () => window.clearInterval(id);
  }, [anyWorking]);

  const toggle = async (row) => {
    setBusy(true);
    try {
      const action = row.working ? 'pause' : 'start';
      const response = await fetch(`${getApiBaseUrl()}/api/tasks/${taskId}/work/${action}`, { method: 'POST', headers: authHeaders() });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        console.error('[TaskTeamTime] No se pudo registrar el tiempo:', payload);
        toast.error(payload?.error || 'No se pudo registrar tu tiempo.');
        return;
      }
      apply(payload);
      toast.success(row.working ? 'Pausaste tu tiempo en esta tarea.' : 'Tu tiempo en esta tarea empezó a correr.');
      onChange?.();
    } catch (error) {
      console.error('[TaskTeamTime] No se pudo registrar el tiempo:', error);
      toast.error('No se pudo registrar tu tiempo.');
    } finally {
      setBusy(false);
    }
  };

  if (!hasCollaborators || rows.length === 0) return null;
  const elapsedFor = (row) => row.elapsedMs + (row.working && loadedAt ? Math.max(0, Date.now() - loadedAt) : 0);
  void tick;

  return (
    <section data-task-team-time className="rounded-2xl border border-zinc-200/80 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
      <h3 className="flex items-center gap-2 text-sm font-semibold text-zinc-900 dark:text-zinc-50">
        <Users className="h-4 w-4 text-zinc-400" aria-hidden="true" />
        Equipo de la tarea
      </h3>
      <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
        Cada colaborador registra su tiempo por separado. Solo el responsable cierra la tarea.
      </p>
      <ul className="mt-3 space-y-2">
        {rows.map((row) => {
          const mine = Boolean(currentUserId) && row.userId === currentUserId;
          // Una regla para todos: el responsable también pone en marcha su reloj con el botón, y los
          // relojes solo corren con la tarea en «En proceso».
          const canToggle = mine && !closed && (row.working || inProgress);
          return (
            <li
              key={row.memberId}
              data-team-row={row.role}
              className={cn(
                'flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border px-3 py-2.5',
                mine ? 'border-brand-cyan/40 bg-brand-cyan/5' : 'border-zinc-200/80 dark:border-zinc-800'
              )}
            >
              {/* Avatar y nombre van juntos: en el celular el reloj baja a otra línea, ellos no se separan. */}
              <div className="flex min-w-0 grow basis-52 items-center gap-3">
              <TeamAvatar
                member={{ name: row.name, avatarUrl: row.avatarUrl }}
                size={32}
                showTitle={false}
                className={cn('h-8 w-8 shrink-0', row.working && 'ring-2 ring-brand-cyan ring-offset-1 ring-offset-white dark:ring-offset-zinc-900')}
              />
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-2 text-sm font-medium text-zinc-900 dark:text-zinc-50">
                  <span className="truncate">{row.name}</span>
                  {row.role === 'ASSIGNEE' && (
                    <span className="shrink-0 rounded bg-zinc-100 px-1.5 py-0.5 text-[10px] font-semibold text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400">Responsable</span>
                  )}
                  {mine && <span className="shrink-0 text-[10px] font-semibold text-brand-cyan-deep dark:text-brand-cyan">Tú</span>}
                </p>
                <p className="truncate text-xs text-zinc-500 dark:text-zinc-400">
                  {row.working ? 'Trabajando ahora' : row.elapsedMs > 0 ? 'En pausa' : 'No ha empezado'}
                  {mine && !closed && !inProgress && !row.working && ' · pasa la tarea a «En proceso» para empezar'}
                </p>
              </div>
              </div>
              <div className="ml-auto flex shrink-0 items-center gap-3">
                <span className={cn(
                  'font-mono text-sm font-semibold tabular-nums',
                  row.working ? 'text-brand-cyan-deep dark:text-brand-cyan' : row.elapsedMs > 0 ? 'text-zinc-700 dark:text-zinc-200' : 'text-zinc-400'
                )}>
                  {formatElapsedTime(elapsedFor(row))}
                </span>
                {canToggle && (
                  <button
                    type="button"
                    onClick={() => toggle(row)}
                    disabled={busy}
                    className={cn(
                      'inline-flex min-h-11 items-center gap-1.5 rounded-lg px-3 text-xs font-semibold transition-colors disabled:opacity-60',
                      row.working
                        ? 'border border-zinc-200 text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-white/5'
                        : 'bg-brand-cyan text-white hover:bg-brand-cyan-deep'
                    )}
                  >
                    {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : row.working ? <Pause className="h-3.5 w-3.5" /> : <PlayCircle className="h-3.5 w-3.5" />}
                    {row.working ? 'Pausar' : 'Empezar'}
                  </button>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
