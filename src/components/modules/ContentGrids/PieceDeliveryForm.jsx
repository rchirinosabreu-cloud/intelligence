import React, { useState } from 'react';
import axios from 'axios';
import toast from 'react-hot-toast';
import { UploadCloud, Loader2 } from '@/components/ui/icons';
import { getApiBaseUrl } from '@/lib/apiBaseUrl';
import { uploadFinalPiece } from '@/lib/contentFinalDelivery';
import { driveLinkProblem } from '@/lib/driveLinks';

const FIELD = 'w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 dark:border-white/10 dark:bg-zinc-900 dark:text-zinc-50';

export default function PieceDeliveryForm({ itemId, onStored, onBusyChange }) {
  const [expanded, setExpanded] = useState(false);
  const [drive, setDrive] = useState(false);
  const [url, setUrl] = useState('');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(null);
  const [error, setError] = useState('');

  async function deliver(send) {
    if (busy) return;
    setBusy(true); onBusyChange?.(true); setError('');
    try {
      await send();
      await onStored();
      setUrl(''); setName(''); setDrive(false);
      toast.success('Entrega guardada');
    } catch (failure) {
      console.error('[Pieza final] No se pudo guardar:', failure.response?.data || failure);
      setError(failure.response?.data?.error || failure.message || 'No se pudo guardar la entrega.');
    } finally {
      setBusy(false); onBusyChange?.(false); setProgress(null);
    }
  }

  return <section aria-label="Entregar pieza final" className="space-y-3 border-t border-zinc-200 pt-4 dark:border-white/10">
    <button type="button" aria-expanded={expanded} onClick={() => setExpanded(value => !value)} disabled={busy}
      className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-primary px-4 text-sm font-medium text-primary-foreground disabled:opacity-50">
      <UploadCloud className="h-4 w-4" />Entregar pieza
    </button>
    {expanded && <div className="space-y-3">
      <p className="text-sm text-muted-foreground">La entrega se guarda en la pieza de esta parrilla. Después puedes terminar tu parte desde la tarea.</p>
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-dashed border-zinc-300 p-4 dark:border-white/15">
        <label className="min-w-0 text-sm font-medium text-brand-cyan-deep dark:text-brand-cyan">
          Archivos de la pieza final
          <input type="file" accept="image/*,video/*" multiple disabled={busy} className="mt-2 block max-w-full text-sm"
            onChange={event => {
              const files = Array.from(event.target.files || []);
              event.target.value = '';
              if (files.length) void deliver(() => uploadFinalPiece(itemId, files, { onProgress: setProgress }));
            }} />
        </label>
        <button type="button" disabled={busy} onClick={() => setDrive(value => !value)} aria-expanded={drive}
          className="min-h-11 rounded-xl px-3 text-sm font-medium text-brand-cyan-deep hover:bg-brand-cyan/10 dark:text-brand-cyan">Enlace de Drive</button>
      </div>
      {drive && <form className="space-y-3" onSubmit={event => {
        event.preventDefault();
        const problem = driveLinkProblem(url);
        if (problem) { setError(problem); return; }
        void deliver(() => axios.post(`${getApiBaseUrl()}/api/content/items/${encodeURIComponent(itemId)}/final-assets/drive`,
          { url: url.trim(), name: name.trim() }, { headers: { Authorization: `Bearer ${localStorage.getItem('authToken')}` } }));
      }}>
        <label className="block space-y-1 text-sm"><span className="block">Enlace del archivo</span>
          <input type="url" required value={url} disabled={busy} onChange={event => setUrl(event.target.value)} className={FIELD} /></label>
        <label className="block space-y-1 text-sm"><span className="block">Nombre (opcional)</span>
          <input value={name} maxLength={120} disabled={busy} onChange={event => setName(event.target.value)} className={FIELD} /></label>
        <p className="text-sm text-muted-foreground">Revisa los permisos en Drive: el archivo debe estar compartido como «Cualquier persona con el enlace» para que el cliente pueda verlo.</p>
        <button type="submit" disabled={busy} className="min-h-11 rounded-xl border px-4 text-sm font-medium">Guardar enlace</button>
      </form>}
      {busy && <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Guardando entrega…{progress !== null && ` ${progress}%`}</p>}
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    </div>}
  </section>;
}
