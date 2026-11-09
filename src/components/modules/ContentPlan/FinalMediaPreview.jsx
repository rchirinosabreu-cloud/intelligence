import React, { useEffect, useRef, useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { Download, Loader2 } from '@/components/ui/icons';

// La tarjeta y el visor comparten bytes mientras la tarjeta existe. No se conserva una
// caché global de archivos privados ni se reutilizan bytes tras cambiar la entrega.
export default function FinalMediaPreview({ sourceUrl, name, isVideo, open, onOpenChange, triggerRef, onDownload, downloading, downloadError }) {
  const [attempt, setAttempt] = useState(0);
  const [preview, setPreview] = useState(null);
  const [decoded, setDecoded] = useState(null);
  const inlineVideo = useRef(null);
  const largeVideo = useRef(null);
  const position = useRef(0);
  const current = preview?.source === sourceUrl && preview.attempt === attempt ? preview : null;
  const url = current?.url;
  const error = current?.error || (decoded?.url === url && decoded?.error)
    || (!sourceUrl ? 'La vista previa no está disponible. Puedes descargar el archivo.' : null);
  const loading = !error && (!url || decoded?.url !== url);

  useEffect(() => {
    if (!sourceUrl) return undefined;
    const controller = new AbortController();
    let objectUrl;
    position.current = 0;
    fetch(sourceUrl, { signal: controller.signal, headers: { Authorization: `Bearer ${localStorage.getItem('authToken')}` } })
      .then(response => {
        if (!response.ok) throw Object.assign(new Error('No pudimos cargar la vista previa. Revisa tu conexión o tu acceso e inténtalo de nuevo.'), { status: response.status });
        return response.blob();
      })
      .then(blob => {
        if (controller.signal.aborted) return;
        objectUrl = URL.createObjectURL(blob);
        setPreview({ source: sourceUrl, attempt, url: objectUrl });
      })
      .catch(failure => {
        if (controller.signal.aborted) return;
        console.error('[Entregables] Falló la vista previa:', failure.status || failure.name);
        setPreview({ source: sourceUrl, attempt, error: 'No pudimos cargar la vista previa. Revisa tu conexión o tu acceso e inténtalo de nuevo.' });
      });
    return () => {
      controller.abort();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [sourceUrl, attempt]);

  useEffect(() => {
    if (open && inlineVideo.current) {
      position.current = inlineVideo.current.currentTime || 0;
      inlineVideo.current.pause();
    }
  }, [open]);

  const close = () => {
    if (largeVideo.current) {
      largeVideo.current.pause();
      const time = largeVideo.current.currentTime;
      if (inlineVideo.current && Number.isFinite(time) && Number.isFinite(inlineVideo.current.duration)) inlineVideo.current.currentTime = time;
    }
    onOpenChange(false);
  };
  const ready = () => setDecoded({ url });
  const failed = event => {
    console.error('[Entregables] No se pudo mostrar el archivo:', event.currentTarget.error?.code || 'MEDIA_ERROR');
    setDecoded({ url, error: isVideo
      ? 'El navegador no pudo reproducir este vídeo. Puedes reintentar o descargarlo para abrirlo en tu dispositivo.'
      : 'El navegador no pudo mostrar esta imagen. Puedes reintentar o descargarla.' });
  };
  const feedback = error ? <div role="alert" className="flex min-h-36 flex-col items-center justify-center gap-3 p-5 text-center text-sm text-zinc-700 dark:text-zinc-200">
    <p>{error}</p><button type="button" onClick={() => setAttempt(value => value + 1)} className="min-h-11 rounded-xl border border-zinc-300 px-3 font-medium hover:bg-zinc-200 dark:border-zinc-600 dark:hover:bg-zinc-800">Reintentar vista previa</button>
  </div> : loading ? <div role="status" className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-zinc-100 p-4 text-center text-sm text-zinc-600 dark:bg-zinc-950 dark:text-zinc-300">
    <Loader2 aria-hidden="true" className="h-5 w-5 animate-spin" />{isVideo ? 'Cargando vídeo…' : 'Cargando imagen…'}
  </div> : null;

  return <>
    <div className="relative flex h-full w-full items-center justify-center" aria-busy={loading}>
      {url && !error && (isVideo
        ? <video key={url} ref={inlineVideo} src={url} aria-label={name} className="h-full w-full object-contain" controls controlsList="nodownload" playsInline preload="metadata" onLoadedData={ready} onError={failed} />
        : <img key={url} src={url} alt={name} draggable={false} className="h-full w-full object-contain" onLoad={ready} onError={failed} />)}
      {feedback}
    </div>
    {open && <Dialog open onOpenChange={value => { if (!value) close(); }}>
      <DialogContent data-final-media-viewer closeLabel="Cerrar vista previa" overlayClassName="z-[120]" className="z-[121] flex max-w-5xl flex-col overflow-hidden rounded-xl p-4"
        onDragStart={event => event.stopPropagation()}
        onCloseAutoFocus={event => { event.preventDefault(); triggerRef.current?.focus(); }}>
        <DialogTitle className="pr-12 text-base leading-6 break-words">{name}</DialogTitle>
        <DialogDescription className="sr-only">Vista completa del archivo, conservando sus proporciones originales.</DialogDescription>
        <div className="relative flex min-h-36 min-w-0 items-center justify-center overflow-hidden rounded-lg bg-zinc-100 dark:bg-zinc-950" aria-busy={loading}>
          {url && !error && (isVideo
            ? <video key={url} ref={largeVideo} src={url} aria-label={name} className="h-auto max-h-[calc(100dvh-13rem)] w-auto max-w-full object-contain" controls controlsList="nodownload" playsInline preload="metadata" onLoadedData={ready} onError={failed}
              onLoadedMetadata={event => { const video = event.currentTarget; if (Number.isFinite(position.current) && position.current > 0 && Number.isFinite(video.duration)) video.currentTime = Math.min(position.current, video.duration); }} />
            : <img key={url} src={url} alt={name} draggable={false} className="h-auto max-h-[calc(100dvh-13rem)] w-auto max-w-full object-contain" onLoad={ready} onError={failed} />)}
          {feedback}
        </div>
        {onDownload && <button type="button" onClick={onDownload} disabled={downloading} aria-label={`Descargar ${name} desde el visor`} className="inline-flex min-h-11 items-center justify-center gap-2 self-start rounded-xl border border-zinc-200 px-3 text-sm font-medium hover:bg-zinc-100 disabled:opacity-50 dark:border-zinc-700 dark:hover:bg-zinc-800">
          {downloading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}Descargar
        </button>}
        {downloadError && <p role="alert" className="text-sm text-destructive">{downloadError}</p>}
      </DialogContent>
    </Dialog>}
  </>;
}
