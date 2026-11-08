import React, { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import RichCommentContent from '@/components/ui/RichCommentContent';
import { announcementRequest } from '@/lib/announcementApi';

// Vive fuera de la tarjeta: confirmar la apertura retira la banda, nunca esta ventana.
export default function AnnouncementPreview() {
  const queryClient = useQueryClient();
  const [id, setId] = useState(null);
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const origin = useRef(null);
  useEffect(() => {
    const open = event => {
      if (typeof event.detail?.id !== 'string') return;
      origin.current = document.activeElement;
      setData(null); setError(''); setId(event.detail.id); setAttempt(value => value + 1);
    };
    window.addEventListener('brain:announcement-preview', open);
    return () => window.removeEventListener('brain:announcement-preview', open);
  }, []);
  useEffect(() => {
    if (!id) return undefined;
    let active = true;
    setData(null); setError('');
    announcementRequest(id, 'preview').then(value => { if (active) setData(value); }).catch(e => { if (active) setError(e.message); });
    return () => { active = false; };
  }, [id, attempt]);
  useEffect(() => {
    if (!data || data.archivedAt) return undefined;
    let active = true;
    // La solicitud se emite tras montar el contenido, no al descargarlo ni pulsar el botón.
    const frame = requestAnimationFrame(() => {
      announcementRequest(data.id, 'response', { action: 'open', expectedRevision: data.revision }).then(() => {
        queryClient.invalidateQueries({ queryKey: ['important-notice'] });
        queryClient.invalidateQueries({ queryKey: ['personal-dashboard'] });
      }).catch(e => { if (active) setError(`${e.message} La apertura no quedó registrada.`); });
    });
    return () => { active = false; cancelAnimationFrame(frame); };
  }, [data, queryClient]);
  return <Dialog open={Boolean(id)} onOpenChange={open => { if (!open) setId(null); }}>
    <DialogContent className="z-[141] max-w-[720px] rounded-2xl bg-white p-6 sm:p-8 dark:bg-zinc-950" overlayClassName="z-[140] bg-black/20 backdrop-blur-sm"
      onCloseAutoFocus={event => {
        event.preventDefault();
        if (origin.current?.isConnected) origin.current.focus({ preventScroll: true });
        else { const main = document.querySelector('main'); if (main) { main.setAttribute('tabindex', '-1'); main.focus({ preventScroll: true }); } }
      }}>
      <DialogHeader className="pr-10 text-left">
        <DialogTitle>Anuncio general</DialogTitle>
        <DialogDescription>{data ? `${data.author} · ${new Date(data.createdAt).toLocaleDateString('es-CO', { timeZone: 'America/Bogota', day: 'numeric', month: 'long', year: 'numeric' })}${data.archivedAt ? ' · Archivado' : ''}` : 'Cargando anuncio…'}</DialogDescription>
      </DialogHeader>
      {data && <div className="break-words text-base leading-7 [&_a]:underline" data-announcement-content><RichCommentContent content={data.content} /></div>}
      {error && <div role="alert" className="text-sm text-destructive brain-destructive-text">{error}
        <button type="button" className="ml-2 min-h-11 underline" onClick={() => setAttempt(value => value + 1)}>Volver a intentar</button>
      </div>}
      <p className="border-t border-zinc-200 pt-4 text-xs leading-5 text-zinc-500 dark:border-zinc-800">Disponible también en el historial de anuncios del Dashboard. Abrirlo no confirma la realización de lo solicitado.</p>
    </DialogContent>
  </Dialog>;
}
