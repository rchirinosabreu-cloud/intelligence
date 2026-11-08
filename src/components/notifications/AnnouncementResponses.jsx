import React, { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import RichCommentContent from '@/components/ui/RichCommentContent';
import { announcementRequest } from '@/lib/announcementApi';

const date = value => value ? new Date(value).toLocaleString('es-CO', { timeZone: 'America/Bogota', dateStyle: 'short', timeStyle: 'short' }) : '';
const actions = { PUBLISHED: 'Publicó el anuncio', EDITED: 'Corrigió el anuncio · contenido anterior', ARCHIVED: 'Archivó el anuncio', OPENED: 'Abrió el anuncio', DISMISSED: 'Cerró el aviso' };
export default function AnnouncementResponses({ id, onClose }) {
  const [data, setData] = useState(null), [error, setError] = useState('');
  useEffect(() => {
    let active = true; setData(null); setError('');
    if (id) announcementRequest(id, 'history').then(value => { if (active) setData(value); }).catch(e => { if (active) setError(e.message); });
    return () => { active = false; };
  }, [id]);
  return <Dialog open={Boolean(id)} onOpenChange={open => { if (!open) onClose(); }}>
    <DialogContent overlayClassName="z-[130]" className="z-[131] max-w-2xl rounded-2xl bg-white dark:bg-zinc-950">
      <DialogHeader className="pr-10 text-left"><DialogTitle>Respuestas del anuncio</DialogTitle><DialogDescription>La apertura y el cierre del aviso son personales; no acreditan cumplimiento.</DialogDescription></DialogHeader>
      {error && <p role="alert" className="text-sm text-destructive brain-destructive-text">{error}</p>}
      {!data && !error && <p>Cargando respuestas…</p>}
      {data && <div className="space-y-4">
        {!data.deliveries.length && <p className="text-sm text-zinc-500">Este anuncio no tiene respuestas registradas. Los anuncios anteriores conservan su historial sin lecturas inferidas.</p>}
        {data.deliveries.map(row => <div key={row.id} className="rounded-xl border border-zinc-200 p-4 text-sm dark:border-zinc-800">
          <p className="font-semibold">{row.user.name}</p>
          <p className="mt-1 text-zinc-600 dark:text-zinc-300">{row.openedAt ? `Abrió el anuncio · ${date(row.openedAt)}${row.openedRevision !== data.announcement.revision && !data.announcement.archivedAt ? ' · Versión anterior' : ''}` : row.dismissedAt ? 'Cerró el aviso sin abrirlo' : 'Sin apertura ni cierre registrados'}</p>
          {row.dismissedAt && <p className="mt-1 text-xs text-zinc-500">Cierre del aviso · {date(row.dismissedAt)}</p>}
        </div>)}
        {data.events.length > 0 && <details className="rounded-xl border border-zinc-200 p-4 dark:border-zinc-800"><summary className="cursor-pointer text-sm font-semibold">Historial de cambios y respuestas</summary>
          <div className="mt-4 space-y-4">{data.events.map(event => <div key={event.id} className="border-t border-zinc-100 pt-3 text-sm dark:border-zinc-800">
            <p>{actions[event.action] || event.action} · {event.actor?.name || 'Autor histórico'}</p><p className="text-xs text-zinc-500">{date(event.createdAt)} · Versión {event.revision}</p>
            {event.content && <div className="mt-2"><RichCommentContent content={event.content} /></div>}
          </div>)}</div>
        </details>}
      </div>}
    </DialogContent>
  </Dialog>;
}
