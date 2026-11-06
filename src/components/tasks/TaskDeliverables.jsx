import React, { Suspense, useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';
import { Loader2, UploadCloud } from '@/components/ui/icons';
import { getApiBaseUrl } from '@/lib/apiBaseUrl';
import { lazyWithRecovery } from '@/pwa/preloadRecovery';
import { reorderTaskDeliverables, taskDeliverableUploadPlan, uploadTaskDeliverables } from '@/lib/taskDeliverableClient';
import { FinalAssetGrid } from '@/components/modules/ContentPlan/PieceMedia';
import DeliveryHistory from './DeliveryHistory';

const ChatFilePreview = lazyWithRecovery(() => import('@/components/chat/ChatFilePreview'));
const headers = () => ({ Authorization: `Bearer ${localStorage.getItem('authToken')}` });
const absoluteUrl = path => path?.startsWith('/') ? `${getApiBaseUrl()}${path}` : path;
const assetUrls = asset => ({ previewUrl: /^(image|video)\//.test(asset.mimeType || '') ? absoluteUrl(asset.fileUrl) : null, downloadUrl: absoluteUrl(asset.downloadUrl) });
const readableError = error => error?.response?.data?.message || error?.response?.data?.error || error?.message || 'No pudimos guardar la entrega.';
const reportFailure = (operation, failure) => console.error(`[Entregables] ${operation}:`, String(readableError(failure)).replace(/https?:\/\/\S+/g, '[enlace]'), failure.response?.status || failure.status || failure.code || 'UNKNOWN');

export default function TaskDeliverables({ taskId, onBusyChange }) {
  const queryClient = useQueryClient();
  const key = ['task-deliverables', taskId];
  const query = useQuery({ queryKey: key, enabled: Boolean(taskId), retry: false, staleTime: 30_000, refetchOnMount: 'always',
    queryFn: async () => (await axios.get(`${getApiBaseUrl()}/api/tasks/${encodeURIComponent(taskId)}/deliverables`, { headers: headers() })).data });
  const inputRef = useRef(null);
  const busyRef = useRef(false);
  const dragDepth = useRef(0);
  const previewRequest = useRef(0);
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [progress, setProgress] = useState(null);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [retryAttempt, setRetryAttempt] = useState(null);
  const [filePreview, setFilePreview] = useState(null);
  const [openingFile, setOpeningFile] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const snapshot = query.data;
  const validRevision = Number.isInteger(snapshot?.revision) && snapshot.revision >= 0;
  const locked = busy || !validRevision || Boolean(query.error);
  useEffect(() => () => { previewRequest.current++; onBusyChange?.(false); }, [onBusyChange]);

  async function perform(attempt) {
    if (busyRef.current) throw new Error('Espera a que termine el guardado actual.');
    busyRef.current = true; setBusy(true); onBusyChange?.(true);
    setError(''); setMessage(''); setRetryAttempt(null);
    try {
      const options = { expectedRevision: attempt.revision, requestId: attempt.requestId, limits: snapshot.limits, onProgress: setProgress };
      const saved = attempt.kind === 'order' ? await reorderTaskDeliverables(taskId, attempt.order, options) : await uploadTaskDeliverables(taskId, attempt.files, options);
      queryClient.setQueryData(key, saved);
      setMessage(attempt.kind === 'order' ? 'Orden guardado' : 'Entrega guardada');
    } catch (failure) {
      reportFailure('No se pudo guardar', failure);
      setError(readableError(failure));
      const status = failure?.response?.status;
      if (status === 409) await queryClient.invalidateQueries({ queryKey: key });
      else if (!status || status >= 500 || status === 408) setRetryAttempt(attempt);
      throw failure;
    } finally {
      busyRef.current = false; setBusy(false); setProgress(null); onBusyChange?.(false);
    }
  }

  function deliver(files) {
    if (locked || !snapshot?.canUpload || !files.length) return;
    const { problem } = taskDeliverableUploadPlan(files, snapshot.limits);
    if (problem) { setError(problem); setMessage(''); return; }
    void perform({ kind: 'upload', files, revision: snapshot.revision, requestId: crypto.randomUUID() }).catch(() => {});
  }

  async function openFile(file) {
    const request = ++previewRequest.current;
    setOpeningFile(true); setError('');
    try {
      const pdf = file.mimeType === 'application/pdf';
      const text = /\.(txt|md|csv|tsv|json|log|xml|yaml|yml)$/i.test(file.name);
      let data;
      if ((pdf || text) && file.size <= (pdf ? 25 : 2) * 1024 * 1024) {
        const response = await fetch(absoluteUrl(file.fileUrl), { headers: headers() });
        if (!response.ok) throw Object.assign(new Error('No pudimos abrir el archivo. Revisa tu acceso e intenta otra vez.'), { status: response.status });
        data = await response.arrayBuffer();
      }
      if (request === previewRequest.current) setFilePreview({ file, data });
    } catch (failure) { reportFailure('No se pudo abrir el archivo', failure); if (request === previewRequest.current) setError(failure.message); }
    finally { if (request === previewRequest.current) setOpeningFile(false); }
  }

  async function downloadPreview() {
    if (!filePreview || downloading) return;
    setDownloading(true);
    try {
      const response = await fetch(absoluteUrl(filePreview.file.downloadUrl), { headers: headers() });
      if (!response.ok) throw Object.assign(new Error('No pudimos descargar el archivo.'), { status: response.status });
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement('a'); link.href = url; link.download = filePreview.file.name;
      document.body.appendChild(link); link.click(); link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (failure) { reportFailure('No se pudo descargar el archivo', failure); setError(failure.message); }
    finally { setDownloading(false); }
  }

  const hasFiles = event => Array.from(event.dataTransfer?.types || []).includes('Files');
  return <section aria-label="Entregables de la tarea" aria-busy={busy} className="space-y-4 rounded-xl border border-zinc-200 p-4 dark:border-white/10">
    <div><h3 className="text-sm font-semibold">Entregables de la tarea</h3>
      <p className="mt-1 text-xs text-muted-foreground">El resultado de este encargo. La entrega es común a todas las personas de la tarea.</p></div>
    {query.isLoading ? <p role="status" className="text-sm text-muted-foreground">Cargando entregables…</p> : query.error || !snapshot ? <div role="alert" className="space-y-2 text-sm text-destructive">
      <p>{readableError(query.error)}</p><button type="button" onClick={() => query.refetch()} className="min-h-11 rounded-lg border px-3">Reintentar consulta</button>
    </div> : <>
      {snapshot.files?.length ? <FinalAssetGrid item={{ id: taskId }} finalAssets={snapshot.files} isEditing={false}
        reorderable={Boolean(snapshot.canReorder && !locked)} assetUrls={assetUrls} onOpenAsset={openFile}
        onReorder={(_id, order) => perform({ kind: 'order', order, revision: snapshot.revision, requestId: crypto.randomUUID() })} />
        : <p className="text-sm text-muted-foreground">Todavía no hay entregables.</p>}
      {snapshot.canReorder && snapshot.files?.length > 1 && <p className="text-xs text-muted-foreground">Arrastra para ordenar. También puedes usar las flechas del teclado desde el número de cada archivo.</p>}
      {snapshot.canUpload ? <div aria-label="Zona de entrega" className={`space-y-3 rounded-xl border border-dashed p-4 ${dragging && !locked ? 'border-brand-cyan bg-brand-cyan-soft dark:bg-brand-cyan/10' : 'border-zinc-300 dark:border-white/15'}`}
        onDragEnter={event => { if (!hasFiles(event)) return; event.preventDefault(); event.stopPropagation(); dragDepth.current++; if (!locked) setDragging(true); }}
        onDragOver={event => { if (!hasFiles(event)) return; event.preventDefault(); event.stopPropagation(); event.dataTransfer.dropEffect = locked ? 'none' : 'copy'; }}
        onDragLeave={event => { if (!hasFiles(event)) return; event.preventDefault(); event.stopPropagation(); dragDepth.current = Math.max(0, dragDepth.current - 1); if (!dragDepth.current) setDragging(false); }}
        onDrop={event => { if (!hasFiles(event)) return; event.preventDefault(); event.stopPropagation(); dragDepth.current = 0; setDragging(false); deliver(Array.from(event.dataTransfer.files || [])); }}>
        <button type="button" onClick={() => inputRef.current?.click()} disabled={locked} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-primary px-4 text-sm font-medium text-primary-foreground disabled:opacity-50">
          <UploadCloud className="h-4 w-4" />{snapshot.files?.length ? 'Actualizar entrega' : 'Entregar archivos'}
        </button>
        <input ref={inputRef} type="file" multiple hidden disabled={locked} aria-label="Archivos del entregable"
          onChange={event => { const files = Array.from(event.target.files || []); event.target.value = ''; deliver(files); }} />
        <p className="text-sm text-muted-foreground">Selecciona varios archivos o arrástralos aquí. Hasta {snapshot.limits?.maxFiles} archivos por entrega.</p>
        {snapshot.files?.length > 0 && <p className="text-xs text-muted-foreground">La nueva entrega sustituye todo el conjunto actual, aunque cambien los nombres. El historial conserva sus datos.</p>}
      </div> : snapshot.writeBlockedReason && <p className="text-sm text-muted-foreground">{snapshot.writeBlockedReason}</p>}
      <DeliveryHistory history={snapshot.history} />
    </>}
    {busy && <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Guardando entrega…{progress !== null && ` ${progress}%`}</p>}
    {openingFile && <p role="status" className="text-sm text-muted-foreground">Abriendo archivo…</p>}
    {message && <p role="status" className="text-sm text-muted-foreground">{message}</p>}
    {error && <div role="alert" className="space-y-2 text-sm text-destructive"><p>{error}</p>
      {retryAttempt && <button type="button" disabled={locked} onClick={() => void perform(retryAttempt).catch(() => {})} className="min-h-11 rounded-lg border px-3">Reintentar entrega</button>}
    </div>}
    {filePreview && <Suspense fallback={<p role="status">Abriendo archivo…</p>}><ChatFilePreview file={filePreview.file} data={filePreview.data}
      url={absoluteUrl(filePreview.file.fileUrl)} onClose={() => setFilePreview(null)} onDownload={downloadPreview} downloading={downloading} /></Suspense>}
  </section>;
}
