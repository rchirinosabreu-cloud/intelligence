import React, { useState } from 'react';
import axios from 'axios';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2, RotateCcw } from '@/components/ui/icons';
import { getApiBaseUrl } from '@/lib/apiBaseUrl';
import { formatFileSize } from '@/lib/uploadLimits';

const authHeaders = () => ({ Authorization: `Bearer ${localStorage.getItem('authToken')}` });
const dayLabel = value => value && Number.isFinite(new Date(value).getTime())
  ? new Date(value).toLocaleDateString('es-CO', { timeZone: 'America/Bogota', day: 'numeric', month: 'short' }) : null;

/**
 * Papelera de una pieza (Rodny, 23 de noviembre de 2026): lo retirado se conserva 30 días y se puede
 * restaurar. `count` viene con la parrilla, así una pieza sin nada retirado no pinta ni consulta nada;
 * la lista se pide al abrir.
 */
export default function PieceTrash({ itemId, count = 0, defaultOpen = false }) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(defaultOpen);
  const [restoring, setRestoring] = useState(null);
  const key = ['content-delivery', itemId];
  const delivery = useQuery({ queryKey: key, enabled: Boolean(itemId && count > 0 && open), retry: false, staleTime: 30_000,
    queryFn: async () => (await axios.get(`${getApiBaseUrl()}/api/content/items/${encodeURIComponent(itemId)}/delivery`, { headers: authHeaders() })).data });
  const refresh = () => Promise.all([key, ['content-plan'], ['client-operations'], ['tasks']].map(queryKey => queryClient.invalidateQueries({ queryKey })));
  const restore = useMutation({
    mutationFn: async assetId => (await axios.post(`${getApiBaseUrl()}/api/content/items/${encodeURIComponent(itemId)}/delivery/restore`,
      { assetId, expectedRevision: delivery.data.revision }, { headers: authHeaders() })).data,
    onMutate: assetId => setRestoring(assetId),
    onSuccess: data => { queryClient.setQueryData(key, data); },
    onSettled: () => { setRestoring(null); return refresh(); },
  });
  if (!itemId || count <= 0) return null;
  const trash = Array.isArray(delivery.data?.trash) ? delivery.data.trash : [];
  // Con la lista ya leída manda ella: tras restaurar, el número baja sin esperar a la parrilla.
  const shown = delivery.data ? trash.length : count;
  return (
    <details data-piece-trash open={open} onToggle={event => setOpen(event.currentTarget.open)} className="rounded-xl border border-zinc-200 p-3 dark:border-white/10">
      <summary className="flex min-h-11 cursor-pointer items-center text-sm font-medium">Papelera · {shown} {shown === 1 ? 'archivo retirado' : 'archivos retirados'}</summary>
      {delivery.isLoading && <p role="status" className="mt-2 flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Cargando la papelera…</p>}
      {delivery.error && <div role="alert" className="mt-2 space-y-2 text-sm text-destructive">
        <p>{delivery.error.response?.data?.error || 'No pudimos consultar la papelera.'}</p>
        <button type="button" onClick={() => delivery.refetch()} className="min-h-11 rounded-lg border px-3">Reintentar</button>
      </div>}
      {delivery.data && <ul className="mt-2 space-y-2">
        {trash.map(file => <li key={file.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 border-l-2 border-zinc-200 pl-3 dark:border-white/10">
          <div className="min-w-0 flex-1 basis-40">
            <p className="text-sm [overflow-wrap:anywhere]">{file.name || 'Archivo'}</p>
            <p className="text-xs text-muted-foreground">{[file.size ? formatFileSize(file.size) : null, dayLabel(file.expiresAt) ? `Se borra el ${dayLabel(file.expiresAt)}` : null].filter(Boolean).join(' · ')}</p>
          </div>
          <button type="button" disabled={restore.isPending} onClick={() => restore.mutate(file.id)}
            className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-zinc-200 px-3 text-sm font-medium hover:bg-zinc-50 disabled:opacity-60 dark:border-white/10 dark:hover:bg-white/5">
            {restoring === file.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />}Restaurar
          </button>
        </li>)}
        {!trash.length && <li className="text-sm text-muted-foreground">La papelera está vacía.</li>}
      </ul>}
      {restore.isError && <p role="alert" className="mt-2 text-sm text-destructive">{restore.error?.response?.data?.error || 'No se pudo restaurar el archivo. Inténtalo de nuevo.'}</p>}
      <p className="mt-3 text-xs text-muted-foreground">Lo retirado se conserva 30 días. Al restaurarlo vuelve al final de la pieza.</p>
    </details>
  );
}
