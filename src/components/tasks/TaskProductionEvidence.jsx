import React, { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'react-hot-toast';
import { ExternalLink, Loader2 } from '@/components/ui/icons';
import { getApiBaseUrl } from '@/lib/apiBaseUrl';
import { cn } from '@/lib/utils';
import { bogotaDate } from '@/lib/colombiaBusinessDays';
import { PRODUCTION_DAY_STATES, evidenceProblem } from '@/lib/productionDays';

// El pendiente de una jornada de producción (Rodny, 11 de noviembre de 2026): se cierra con su entrega. Los archivos van
// en «Entregas», como en cualquier pendiente; aquí va la otra forma, el enlace de la carpeta de Drive con las evidencias.
// En cualquier otro pendiente este bloque no aparece.

const headers = () => ({ Authorization: `Bearer ${localStorage.getItem('authToken')}`, 'Content-Type': 'application/json' });
const FIELD = 'w-full rounded-xl border border-zinc-200 bg-white px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-brand-cyan/30 dark:border-white/10 dark:bg-white/5 dark:text-zinc-100';
const STATE_TONE = {
  AGENDADA: 'border-zinc-200 bg-zinc-50 text-zinc-600 dark:border-white/10 dark:bg-white/5 dark:text-zinc-300',
  SIN_EVIDENCIA: 'border-brand-yellow/50 bg-brand-yellow/10 text-zinc-800 dark:text-zinc-100',
  REALIZADA: 'border-brand-green/40 bg-brand-green/10 text-brand-green-deep dark:text-brand-green',
};

const request = async (path, options = {}) => {
  const res = await fetch(`${getApiBaseUrl()}/api/production-days/by-task${path}`, { ...options, headers: headers() });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    console.error('[TaskProductionEvidence] Error del servidor:', body);
    throw new Error(body.error || 'No se pudo guardar. Inténtalo de nuevo.');
  }
  return body;
};

export default function TaskProductionEvidence({ taskId }) {
  const queryClient = useQueryClient();
  const key = ['production-task', taskId];
  const { data } = useQuery({ queryKey: key, queryFn: () => request(`/${encodeURIComponent(taskId)}`), enabled: Boolean(taskId), refetchInterval: 15_000 });
  const [editing, setEditing] = useState(false);
  const [url, setUrl] = useState('');
  const [note, setNote] = useState('');
  const [problem, setProblem] = useState('');
  const save = useMutation({
    mutationFn: () => request(`/${encodeURIComponent(taskId)}/evidence`, { method: 'PUT', body: JSON.stringify({ url, note }) }),
    onSuccess: (result) => {
      queryClient.setQueryData(key, result);
      queryClient.invalidateQueries({ queryKey: ['client-operations'] });
      setEditing(false); setProblem('');
      toast.success('Enlace guardado: jornada realizada');
    },
    onError: (error) => setProblem(error.message),
  });

  const day = data?.productionDay;
  if (!day) return null;
  const state = PRODUCTION_DAY_STATES[day.state] || PRODUCTION_DAY_STATES.AGENDADA;
  const notYet = day.date > bogotaDate(Date.now());
  const submit = () => {
    const found = evidenceProblem({ url, note });
    if (found) { setProblem(found); return; }
    save.mutate();
  };
  const showForm = data.canEvidence && !notYet && (!day.evidenceUrl || editing);

  return (
    <section className="space-y-2.5 rounded-2xl border border-zinc-200 p-4 dark:border-white/10" aria-label="Jornada de producción" data-task-production>
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">Jornada de producción</p>
        <span className={cn('rounded-full border px-2 py-0.5 text-xs font-semibold', STATE_TONE[day.state])} title={state.hint} data-task-production-state={day.state}>{state.label}</span>
        <span className="text-xs text-zinc-500 dark:text-zinc-400">
          {day.date.split('-').reverse().join('/')}{data.schedule ? `, ${data.schedule}` : ''}{day.client ? ` · ${day.client.name}` : ''}
        </span>
      </div>
      <p className="text-xs text-zinc-500 dark:text-zinc-400">
        Se cierra con su entrega: sube los archivos en «Entregas» o pega aquí el enlace de la carpeta de Drive con las evidencias.
      </p>
      {day.evidenceUrl && !editing && (
        <div className="space-y-1 text-sm">
          <a href={day.evidenceUrl} target="_blank" rel="noreferrer noopener" className="inline-flex min-h-9 items-center gap-1.5 font-semibold text-brand-cyan-deep hover:underline dark:text-brand-cyan" data-task-production-link>
            Ver las evidencias en Drive<ExternalLink className="h-3.5 w-3.5" />
          </a>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">{day.evidenceBy ? `Las subió ${day.evidenceBy}` : 'Subidas'}{day.evidenceAt ? ` el ${day.evidenceAt.split('-').reverse().join('/')}` : ''}.{day.evidenceNote ? ` ${day.evidenceNote}` : ''}</p>
          {data.canEvidence && <button type="button" onClick={() => { setUrl(day.evidenceUrl); setNote(day.evidenceNote || ''); setEditing(true); }} className="min-h-9 px-1 text-xs font-semibold text-zinc-600 hover:text-zinc-900 dark:text-zinc-300 dark:hover:text-white">Cambiar el enlace</button>}
        </div>
      )}
      {notYet && !day.evidenceUrl && <p className="text-xs text-zinc-500 dark:text-zinc-400">La evidencia se sube desde el día de la jornada.</p>}
      {showForm && (
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start" data-task-production-form>
          <div className="min-w-0 flex-1 space-y-2">
            <label htmlFor={`task-production-url-${taskId}`} className="sr-only">Enlace de la carpeta de Drive con las evidencias</label>
            <input id={`task-production-url-${taskId}`} type="url" value={url} onChange={(e) => { setUrl(e.target.value); setProblem(''); }}
              placeholder="Enlace de Drive: https://drive.google.com/drive/folders/…" className={FIELD} aria-invalid={Boolean(problem)} />
            <input type="text" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Nota (opcional)" aria-label="Nota de la evidencia" className={FIELD} />
            {problem && <p role="alert" className="text-xs font-medium text-destructive">{problem}</p>}
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={submit} disabled={save.isPending}
              className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-60">
              {save.isPending && <Loader2 className="h-4 w-4 animate-spin" />}Guardar enlace
            </button>
            {editing && <button type="button" onClick={() => { setEditing(false); setProblem(''); }} className="min-h-11 rounded-xl px-3 text-sm font-semibold text-zinc-600 dark:text-zinc-300">Cancelar</button>}
          </div>
        </div>
      )}
    </section>
  );
}
