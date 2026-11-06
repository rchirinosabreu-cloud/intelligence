import React, { useRef, useState } from 'react';
import axios from 'axios';
import toast from 'react-hot-toast';
import { UploadCloud, Loader2 } from '@/components/ui/icons';
import { getApiBaseUrl } from '@/lib/apiBaseUrl';
import { uploadFinalPiece } from '@/lib/contentFinalDelivery';
import { driveLinkProblem } from '@/lib/driveLinks';

const FIELD = 'w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 dark:border-white/10 dark:bg-zinc-900 dark:text-zinc-50';

export default function PieceDeliveryForm({ itemId, onStored, onConflict, onBusyChange, disabled = false, existingCount = 0, expectedRevision }) {
  const inputRef = useRef(null);
  const busyRef = useRef(false);
  const dragDepth = useRef(0);
  const [dragging, setDragging] = useState(false);
  const [drive, setDrive] = useState(false);
  const [url, setUrl] = useState('');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(null);
  const [error, setError] = useState('');
  const [retryAttempt, setRetryAttempt] = useState(null);
  const locked = busy || disabled;
  const hasFiles = event => Array.from(event.dataTransfer?.types || []).includes('Files');

  async function deliver(send, attempt = null) {
    if (busyRef.current || disabled) return;
    busyRef.current = true;
    setBusy(true); onBusyChange?.(true); setError(''); setRetryAttempt(null);
    try {
      await send();
      await onStored();
      setUrl(''); setName(''); setDrive(false);
      toast.success('Entrega guardada');
    } catch (failure) {
      console.error('[Pieza final] No se pudo guardar:', failure.response?.data?.error || failure.message, failure.response?.status || failure.code || 'UNKNOWN');
      setError(failure.response?.data?.error || failure.message || 'No se pudo guardar la entrega.');
      const status = failure.response?.status;
      if (status === 409) await onConflict?.();
      else if (attempt && ((!status && failure.isAxiosError) || status >= 500 || status === 408)) setRetryAttempt(attempt);
    } finally {
      busyRef.current = false;
      setBusy(false); onBusyChange?.(false); setProgress(null);
    }
  }

  function deliverFiles(files) {
    if (!files.length) return;
    sendFileAttempt({ files, revision: expectedRevision, requestId: crypto.randomUUID() });
  }

  function sendFileAttempt(attempt) {
    void deliver(() => uploadFinalPiece(itemId, attempt.files, {
      onProgress: setProgress, replace: true, expectedRevision: attempt.revision, requestId: attempt.requestId,
    }), attempt);
  }

  return <section aria-label="Entregar pieza final" aria-busy={busy}
    className={`space-y-3 rounded-xl border border-dashed p-4 ${dragging && !locked ? 'border-brand-cyan bg-brand-cyan-soft dark:bg-brand-cyan/10' : 'border-zinc-300 dark:border-white/15'}`}
    onDragEnter={event => {
      if (!hasFiles(event)) return;
      event.preventDefault(); event.stopPropagation();
      dragDepth.current += 1;
      if (!locked) setDragging(true);
    }}
    onDragOver={event => {
      if (!hasFiles(event)) return;
      event.preventDefault(); event.stopPropagation();
      event.dataTransfer.dropEffect = locked ? 'none' : 'copy';
    }}
    onDragLeave={event => {
      if (!hasFiles(event)) return;
      event.preventDefault(); event.stopPropagation();
      dragDepth.current = Math.max(0, dragDepth.current - 1);
      if (!dragDepth.current) setDragging(false);
    }}
    onDrop={event => {
      if (!hasFiles(event)) return;
      event.preventDefault(); event.stopPropagation();
      dragDepth.current = 0; setDragging(false);
      if (!locked) deliverFiles(Array.from(event.dataTransfer.files || []));
    }}>
    <div className="flex flex-wrap items-center gap-2">
    <button type="button" onClick={() => inputRef.current?.click()} disabled={locked}
      className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-primary px-4 text-sm font-medium text-primary-foreground disabled:opacity-50">
      <UploadCloud className="h-4 w-4" />{existingCount ? 'Actualizar entrega' : 'Entregar pieza'}
    </button>
    <input ref={inputRef} type="file" aria-label="Archivos de la pieza final" accept="image/*,video/*" multiple disabled={locked} hidden
      onChange={event => {
        const files = Array.from(event.target.files || []);
        event.target.value = '';
        deliverFiles(files);
      }} />
    <button type="button" disabled={locked} onClick={() => setDrive(value => !value)} aria-expanded={drive}
      className="min-h-11 rounded-xl px-3 text-sm font-medium text-brand-cyan-deep hover:bg-brand-cyan/10 disabled:opacity-50 dark:text-brand-cyan">Añadir enlace de Drive</button>
    </div>
    <p className="text-sm text-muted-foreground">{dragging && !locked ? 'Suelta aquí las imágenes o videos.' : 'También puedes arrastrar aquí varias imágenes o videos.'}</p>
    <p className="text-xs text-muted-foreground">{existingCount
      ? 'Actualizar reemplaza todos los archivos de la entrega actual. El cambio queda en el historial.'
      : 'La entrega se guarda en esta parrilla. Después puedes terminar tu parte desde la tarea.'}</p>
      {drive && <form className="space-y-3" onSubmit={event => {
        event.preventDefault();
        const problem = driveLinkProblem(url);
        if (problem) { setError(problem); return; }
        void deliver(() => axios.post(`${getApiBaseUrl()}/api/content/items/${encodeURIComponent(itemId)}/final-assets/drive`,
          { url: url.trim(), name: name.trim(), expectedRevision }, { headers: { Authorization: `Bearer ${localStorage.getItem('authToken')}` } }));
      }}>
        <label className="block space-y-1 text-sm"><span className="block">Enlace del archivo</span>
          <input type="url" required value={url} disabled={locked} onChange={event => setUrl(event.target.value)} className={FIELD} /></label>
        <label className="block space-y-1 text-sm"><span className="block">Nombre (opcional)</span>
          <input value={name} maxLength={120} disabled={locked} onChange={event => setName(event.target.value)} className={FIELD} /></label>
        <p className="text-sm text-muted-foreground">Revisa los permisos en Drive: el archivo debe estar compartido como «Cualquier persona con el enlace» para que el cliente pueda verlo.</p>
        <button type="submit" disabled={locked} className="min-h-11 rounded-xl border px-4 text-sm font-medium">Añadir enlace</button>
      </form>}
      {busy && <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Guardando entrega…{progress !== null && ` ${progress}%`}</p>}
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      {retryAttempt && <button type="button" disabled={locked} onClick={() => sendFileAttempt(retryAttempt)} className="min-h-11 rounded-lg border px-3 text-sm font-medium disabled:opacity-50">Reintentar entrega</button>}
  </section>;
}
