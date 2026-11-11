import React, { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'react-hot-toast';
import Select from '@/components/ui/Select';
import { ExternalLink, Loader2 } from '@/components/ui/icons';
import { getApiBaseUrl } from '@/lib/apiBaseUrl';
import { cn } from '@/lib/utils';
import { PRODUCTION_DAY_STATES, evidenceProblem } from '@/lib/productionDays';
import { bogotaDate } from '@/lib/colombiaBusinessDays';

// La jornada de producción de un evento del calendario (reunión de Rodny con su jefe, 10 de noviembre de 2026): a qué
// cliente es y el enlace del Drive con sus evidencias, que es lo único que la da por realizada. Se guarda aparte del
// formulario del evento: no toca el evento ni su copia en Google.

const headers = () => ({ Authorization: `Bearer ${localStorage.getItem('authToken')}`, 'Content-Type': 'application/json' });
const FIELD = 'w-full rounded-xl border border-zinc-200 bg-white px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-brand-cyan/30 dark:border-white/10 dark:bg-white/5 dark:text-zinc-100';
const STATE_TONE = {
  AGENDADA: 'border-zinc-200 bg-zinc-50 text-zinc-600 dark:border-white/10 dark:bg-white/5 dark:text-zinc-300',
  SIN_EVIDENCIA: 'border-brand-yellow/50 bg-brand-yellow/10 text-zinc-800 dark:text-zinc-100',
  REALIZADA: 'border-brand-green/40 bg-brand-green/10 text-brand-green-deep dark:text-brand-green',
};

const request = async (path, options = {}) => {
  const res = await fetch(`${getApiBaseUrl()}/api/production-days${path}`, { ...options, headers: headers() });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    console.error('[ProductionDayPanel] Error del servidor:', body);
    throw new Error(body.error || 'No se pudo guardar. Inténtalo de nuevo.');
  }
  return body;
};

export default function ProductionDayPanel({ eventId }) {
  const queryClient = useQueryClient();
  const key = ['production-day', eventId];
  const { data, isLoading, isError } = useQuery({ queryKey: key, queryFn: () => request(`/by-event/${encodeURIComponent(eventId)}`), enabled: Boolean(eventId) });
  const [editing, setEditing] = useState(false);
  const [url, setUrl] = useState('');
  const [note, setNote] = useState('');
  const [problem, setProblem] = useState('');

  const save = (path, body) => request(`/by-event/${encodeURIComponent(eventId)}${path}`, { method: 'PUT', body: JSON.stringify(body) });
  const link = useMutation({
    mutationFn: (clientId) => save('/client', { clientId }),
    onSuccess: (result) => { queryClient.setQueryData(key, result); queryClient.invalidateQueries({ queryKey: ['client-operations'] }); toast.success(result.productionDay ? `Jornada ligada a ${result.productionDay.client?.name}` : 'Jornada sin cliente'); },
    onError: (error) => toast.error(error.message),
  });
  const evidence = useMutation({
    mutationFn: () => save('/evidence', { url, note }),
    onSuccess: (result) => { queryClient.setQueryData(key, result); queryClient.invalidateQueries({ queryKey: ['client-operations'] }); setEditing(false); setProblem(''); toast.success('Evidencia guardada: jornada realizada'); },
    onError: (error) => setProblem(error.message),
  });

  if (isLoading) return <div className="flex items-center gap-2 rounded-2xl border border-zinc-200 p-4 text-sm text-zinc-500 dark:border-white/10"><Loader2 className="h-4 w-4 animate-spin" />Cargando la jornada…</div>;
  if (isError || !data) return null;
  const day = data.productionDay;
  const state = day ? PRODUCTION_DAY_STATES[day.state] : null;
  const notYet = data.date > bogotaDate(Date.now());
  const submit = () => {
    const found = evidenceProblem({ url, note });
    if (found) { setProblem(found); return; }
    evidence.mutate();
  };

  return (
    <section className="space-y-3 rounded-2xl border border-zinc-200 bg-zinc-50/60 p-4 dark:border-white/10 dark:bg-white/[0.03]" aria-label="Jornada de producción" data-production-day-panel>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">Jornada de producción</p>
        {state && <span className={cn('rounded-full border px-2 py-0.5 text-xs font-semibold', STATE_TONE[day.state])} title={state.hint} data-production-day-state={day.state}>{state.label}</span>}
      </div>

      <div className="space-y-1.5">
        <label htmlFor={`production-client-${eventId}`} className="text-xs font-bold text-zinc-500">Cliente</label>
        {data.canLink ? (
          <Select id={`production-client-${eventId}`} value={day?.client?.id || ''} disabled={link.isPending}
            onChange={(e) => link.mutate(e.target.value || null)} className={FIELD}>
            <option value="">Sin cliente</option>
            {data.clients.map((client) => <option key={client.id} value={client.id}>{client.suggested ? `${client.name} · sugerido` : client.name}</option>)}
          </Select>
        ) : (
          <p id={`production-client-${eventId}`} className="text-sm text-zinc-800 dark:text-zinc-100">{day?.client?.name || 'Sin cliente todavía: lo liga un project manager.'}</p>
        )}
      </div>

      {day && (day.evidenceUrl && !editing ? (
        <div className="space-y-1 text-sm">
          <a href={day.evidenceUrl} target="_blank" rel="noreferrer noopener" className="inline-flex min-h-9 items-center gap-1.5 font-semibold text-brand-cyan-deep hover:underline dark:text-brand-cyan" data-production-evidence-link>
            Ver las evidencias<ExternalLink className="h-3.5 w-3.5" />
          </a>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">Subidas{day.evidenceBy ? ` por ${day.evidenceBy}` : ''}{day.evidenceAt ? ` el ${day.evidenceAt.split('-').reverse().join('/')}` : ''}.</p>
          {day.evidenceNote && <p className="text-xs text-zinc-600 dark:text-zinc-300">{day.evidenceNote}</p>}
          {data.canEvidence && <button type="button" onClick={() => { setUrl(day.evidenceUrl); setNote(day.evidenceNote || ''); setEditing(true); }} className="min-h-9 rounded-lg px-1 text-xs font-semibold text-zinc-600 hover:text-zinc-900 dark:text-zinc-300 dark:hover:text-white">Cambiar el enlace</button>}
        </div>
      ) : notYet ? (
        <p className="text-xs text-zinc-500 dark:text-zinc-400">La evidencia se sube desde el día de la jornada.</p>
      ) : data.canEvidence ? (
        <div className="space-y-2" data-production-evidence-form>
          <label htmlFor={`production-evidence-${eventId}`} className="text-xs font-bold text-zinc-500">Enlace de la carpeta de Drive con las evidencias</label>
          <input id={`production-evidence-${eventId}`} type="url" value={url} onChange={(e) => { setUrl(e.target.value); setProblem(''); }}
            placeholder="https://drive.google.com/drive/folders/…" className={FIELD} aria-invalid={Boolean(problem)} aria-describedby={problem ? `production-evidence-problem-${eventId}` : undefined} />
          <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} placeholder="Nota (opcional): qué se grabó, qué faltó…" aria-label="Nota de la evidencia" className={cn(FIELD, 'resize-y')} />
          {problem && <p id={`production-evidence-problem-${eventId}`} role="alert" className="text-xs font-medium text-destructive">{problem}</p>}
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={submit} disabled={evidence.isPending}
              className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-60">
              {evidence.isPending && <Loader2 className="h-4 w-4 animate-spin" />}Guardar evidencia
            </button>
            {editing && <button type="button" onClick={() => { setEditing(false); setProblem(''); }} className="min-h-10 rounded-xl px-3 text-sm font-semibold text-zinc-600 dark:text-zinc-300">Cancelar</button>}
          </div>
        </div>
      ) : (
        <p className="text-xs text-zinc-500 dark:text-zinc-400">Falta que quien estuvo en la jornada suba el enlace del Drive con las evidencias.</p>
      ))}
      {!day && <p className="text-xs text-zinc-500 dark:text-zinc-400">Para contarla como jornada de un cliente y subir sus evidencias, primero hay que ligarla a ese cliente.</p>}
    </section>
  );
}
