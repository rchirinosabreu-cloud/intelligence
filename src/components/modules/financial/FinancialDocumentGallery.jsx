import React, { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Download, Eye, FileText, StopCircle } from '@/components/ui/icons';
import { cn } from '@/lib/utils';

// Supporting documents of a movement, shown as cards. Image thumbnails are fetched through the
// authenticated API (never a public URL); PDFs show an icon. The same card serves the gallery
// dialog ("N más" from the ledger row) and the movement form.

export const ROW_DOCUMENT_LIMIT = 3;

export const formatDocumentBytes = (bytes) => (bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`);

export function DocumentThumbnail({ item, fetchBlob, className }) {
    const [src, setSrc] = useState(null);
    const isImage = String(item.mimeType || '').startsWith('image/');
    useEffect(() => {
        if (!isImage || !fetchBlob) return undefined;
        let active = true;
        let objectUrl;
        fetchBlob(item).then((blob) => {
            if (!active) return;
            objectUrl = URL.createObjectURL(blob);
            setSrc(objectUrl);
        }).catch((error) => console.error('Error loading document thumbnail:', error.response?.data || error.message));
        return () => {
            active = false;
            if (objectUrl) URL.revokeObjectURL(objectUrl);
        };
    }, [item.id, isImage, fetchBlob, item]);
    return (
        <div className={cn('grid place-items-center overflow-hidden bg-zinc-100 dark:bg-zinc-800', className)}>
            {isImage && src
                ? <img src={src} alt="" className="h-full w-full object-cover" />
                : <FileText className="h-8 w-8 text-zinc-400" aria-hidden="true" />}
        </div>
    );
}

export function DocumentCard({ item, fetchBlob, onOpen, onDownload, onVoid }) {
    const voided = Boolean(item.voidedAt);
    return (
        <div className={cn('group relative overflow-hidden rounded-lg border border-zinc-200 bg-white text-left dark:border-white/10 dark:bg-zinc-900', voided && 'opacity-60')}>
            <button type="button" onClick={onOpen} disabled={voided} title={voided ? `Anulado: ${item.voidReason}` : `Ver ${item.name}`} className="block w-full text-left disabled:cursor-not-allowed">
                <DocumentThumbnail item={item} fetchBlob={voided ? null : fetchBlob} className="aspect-[4/3] w-full" />
                <div className="px-2 py-1.5">
                    <p className={cn('truncate text-xs font-medium', voided ? 'text-zinc-400 line-through' : 'text-zinc-800 dark:text-zinc-100')}>{item.name}</p>
                    <p className="text-[11px] text-zinc-400">{voided ? 'Anulado' : formatDocumentBytes(Number(item.size))}</p>
                </div>
            </button>
            {!voided && (
                <div className="absolute right-1 top-1 flex gap-1 rounded-md bg-white/90 p-0.5 opacity-0 shadow-sm transition group-hover:opacity-100 group-focus-within:opacity-100 dark:bg-zinc-900/90">
                    <button type="button" title="Ver documento" aria-label={`Ver ${item.name}`} onClick={onOpen} className="grid h-7 w-7 place-items-center rounded text-zinc-600 hover:bg-zinc-100 dark:text-zinc-200 dark:hover:bg-white/10"><Eye className="h-3.5 w-3.5" /></button>
                    <button type="button" title="Descargar documento" aria-label={`Descargar ${item.name}`} onClick={onDownload} className="grid h-7 w-7 place-items-center rounded text-zinc-600 hover:bg-zinc-100 dark:text-zinc-200 dark:hover:bg-white/10"><Download className="h-3.5 w-3.5" /></button>
                    {onVoid && <button type="button" title="Anular documento" aria-label={`Anular ${item.name}`} onClick={onVoid} className="grid h-7 w-7 place-items-center rounded text-destructive hover:bg-destructive/10"><StopCircle className="h-3.5 w-3.5" /></button>}
                </div>
            )}
        </div>
    );
}

export default function FinancialDocumentGallery({ record, documents, fetchBlob, onOpen, onDownload, onClose }) {
    return (
        <Dialog open onOpenChange={(open) => !open && onClose()}>
            <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-3xl dark:bg-zinc-900" closeLabel="Cerrar evidencias">
                <DialogHeader>
                    <DialogTitle>{documents.length} {documents.length === 1 ? 'evidencia' : 'evidencias'}</DialogTitle>
                    <DialogDescription className="break-words">{record.description || record.sourceLabel || 'Movimiento'}. Toca una para verla; desde el visor puedes pasar a la siguiente.</DialogDescription>
                </DialogHeader>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
                    {documents.map((item, index) => (
                        <DocumentCard key={item.id} item={item} fetchBlob={fetchBlob} onOpen={() => onOpen(index)} onDownload={() => onDownload(item)} />
                    ))}
                </div>
            </DialogContent>
        </Dialog>
    );
}
