import React, { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import axios from 'axios';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ExternalLink, FileText, Loader2 } from '@/components/ui/icons';
import { getApiBaseUrl } from '@/lib/apiBaseUrl';
import { driveAssetUrls } from '@/lib/finalAssetShape';
import { MONTH_NAMES, shortDate } from '@/lib/clientOperations';
import { cn } from '@/lib/utils';
import { LongText, PieceCard } from '@/components/modules/ContentGrids/ExternalPlanView';
import { PIECE_STATUS } from './operationTones';

// La vista rápida de una pieza desde Operación (Rodny, 30 de octubre de 2026: «debería poder dar click … o quizá
// debería abrírseme allí sin tener que cambiar de módulo»). Se mira la pieza sin salir de la página del cliente; editarla
// sigue siendo en la parrilla, a un botón. Una ventana centrada, como todas las de la plataforma, y de solo lectura.

const authHeaders = () => ({ Authorization: `Bearer ${localStorage.getItem('authToken')}` });
const LABEL = 'text-xs font-medium text-zinc-500 dark:text-zinc-400';
const OPEN_ACTION = 'inline-flex min-h-11 items-center gap-2 rounded-xl px-3 text-sm font-medium text-brand-cyan-deep hover:bg-brand-cyan/10 dark:text-brand-cyan';

/** El período del espejo de MIO en la dirección: «octubre-2026». */
export const sheetPeriod = (year, month) => `${MONTH_NAMES[month - 1].toLowerCase()}-${year}`;

function AssetThumb({ itemId, asset }) {
  const [url, setUrl] = useState(null);
  const drive = driveAssetUrls(asset);
  const source = drive ? null : `${getApiBaseUrl()}/api/content/items/${itemId}/final-assets/${asset.id}?v=${encodeURIComponent(asset.storageKey || '')}`;
  const isImage = !drive && (asset.mimeType || '').startsWith('image/');
  const isVideo = !drive && (asset.mimeType || '').startsWith('video/');
  useEffect(() => {
    if (!source || !(isImage || isVideo)) return undefined;
    let objectUrl;
    let cancelled = false;
    fetch(source, { headers: authHeaders() })
      .then((response) => { if (!response.ok) throw new Error(`status ${response.status}`); return response.blob(); })
      .then((blob) => { if (!cancelled) { objectUrl = URL.createObjectURL(blob); setUrl(objectUrl); } })
      .catch((error) => console.error('[Operación] No se pudo cargar la miniatura de la pieza:', error.message));
    return () => { cancelled = true; if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [source, isImage, isVideo]);
  if (drive) {
    return (
      <a href={drive.openUrl} target="_blank" rel="noreferrer" title={asset.name || 'Pieza final en Drive'}
        className="flex aspect-square items-center justify-center rounded-xl border border-zinc-200 bg-zinc-50 p-2 text-center text-xs font-medium text-brand-cyan-deep hover:bg-brand-cyan/10 dark:border-white/10 dark:bg-white/5 dark:text-brand-cyan">
        Ver en Drive
      </a>
    );
  }
  return (
    <div className="aspect-square overflow-hidden rounded-xl border border-zinc-200 bg-zinc-100 dark:border-white/10 dark:bg-zinc-950" title={asset.name || undefined}>
      {isImage && url ? <img src={url} alt={asset.name || 'Pieza final'} className="h-full w-full object-cover" />
        : isVideo && url ? <video src={url} className="h-full w-full object-cover" controls preload="metadata" />
          : <FileText className="m-auto mt-[40%] h-6 w-6 text-zinc-300" />}
    </div>
  );
}

function NativePiece({ piece }) {
  const { data: plan, isLoading, error } = useQuery({
    queryKey: ['content-plan', piece.planId],
    staleTime: 30_000,
    queryFn: async () => (await axios.get(`${getApiBaseUrl()}/api/content/plans/${piece.planId}`, { headers: authHeaders() })).data,
  });
  if (isLoading) return <p className="flex items-center gap-2 py-6 text-sm text-zinc-500"><Loader2 className="h-4 w-4 animate-spin" />Cargando la pieza…</p>;
  const item = plan?.items?.find((row) => row.id === piece.id);
  if (error || !item) return <p className="py-6 text-sm text-zinc-600 dark:text-zinc-300">No pudimos cargar esta pieza. Ábrela en la parrilla.</p>;
  const assets = item.finalAssets || [];
  return (
    <div className="space-y-5" data-piece-peek-native>
      {item.objective && <p className="text-xs uppercase tracking-wide text-zinc-400">{item.objective}</p>}
      <div className="grid gap-4 md:grid-cols-2">
        <LongText label="Guion · lo ve el cliente" text={item.copyText} />
        <LongText label="Texto de la publicación · lo ve el cliente" text={item.captionText} />
      </div>
      {!item.copyText && !item.captionText && <p className="text-sm text-zinc-500">Todavía no tiene guion ni texto de publicación.</p>}
      <div>
        <p className={LABEL}>Pieza final{assets.length > 1 ? ` · ${assets.length} archivos` : ''}</p>
        {assets.length
          ? <div className="mt-2 grid grid-cols-3 gap-2 sm:grid-cols-4">{assets.map((asset) => <AssetThumb key={asset.id} itemId={item.id} asset={asset} />)}</div>
          : <p className="mt-1 text-sm text-zinc-500">Sin pieza final todavía.</p>}
      </div>
      {item.comments && (
        <div>
          <p className={LABEL}>Feedback del cliente</p>
          <p className="mt-1 whitespace-pre-wrap rounded-xl bg-zinc-50 p-3 text-sm text-zinc-800 [overflow-wrap:anywhere] dark:bg-white/5 dark:text-zinc-100">{item.comments}</p>
        </div>
      )}
      {item.internalNotes && (
        <div className="rounded-xl border-l-[3px] border-brand-yellow bg-brand-yellow/[0.08] px-3 py-2">
          <p className={LABEL}>Nota interna</p>
          <p className="mt-0.5 whitespace-pre-wrap text-sm text-zinc-800 [overflow-wrap:anywhere] dark:text-zinc-100">{item.internalNotes}</p>
        </div>
      )}
    </div>
  );
}

function SheetPiece({ piece, clientSlug, period }) {
  const { data: plan, isLoading, error } = useQuery({
    queryKey: ['external-plan', clientSlug, period],
    staleTime: 30_000,
    queryFn: async () => (await axios.get(`${getApiBaseUrl()}/api/content/external-plans/${encodeURIComponent(clientSlug)}/${encodeURIComponent(period)}`, { headers: authHeaders() })).data,
  });
  if (isLoading) return <p className="flex items-center gap-2 py-6 text-sm text-zinc-500"><Loader2 className="h-4 w-4 animate-spin" />Cargando la pieza…</p>;
  const sheetPiece = plan?.pieces?.find((row) => row.row === piece.row);
  if (error || !sheetPiece) return <p className="py-6 text-sm text-zinc-600 dark:text-zinc-300">No pudimos cargar esta pieza de la hoja. Ábrela en Parrillas.</p>;
  return <PieceCard piece={sheetPiece} editable={false} className="border-0 bg-transparent p-0 dark:bg-transparent" />;
}

/**
 * `piece` es la fila de Operación; `cycle` su mes. `onOpenFull` lleva a la parrilla (o al espejo de la hoja) anotando
 * de dónde se sale, para que allá se ofrezca volver.
 */
export default function PiecePeekDialog({ piece, cycle, clientSlug, onClose, onOpenFull }) {
  const status = PIECE_STATUS[piece.status] || PIECE_STATUS.BORRADOR;
  const fromSheet = Boolean(piece.external);
  const period = sheetPeriod(cycle.year, cycle.month);
  const fullPath = fromSheet ? `/parrillas/hoja/${clientSlug}/${period}` : `/parrillas/${piece.planId}?item=${piece.id}`;
  return (
    <Dialog open onOpenChange={(next) => { if (!next) onClose(); }}>
      <DialogContent data-piece-peek className="max-h-[min(88vh,52rem)] overflow-y-auto sm:max-w-3xl dark:bg-zinc-900">
        <DialogHeader>
          <DialogTitle className="flex flex-wrap items-center gap-x-3 gap-y-1 pr-8">
            <span>{piece.format}{fromSheet ? '' : ` · ${piece.title}`}</span>
            <span className={cn('inline-flex rounded-md px-2 py-0.5 text-xs font-semibold', status.chip)}>{status.label}</span>
          </DialogTitle>
          <DialogDescription>{piece.date ? `Sale el ${shortDate(piece.date)}` : 'Sin fecha'}{fromSheet ? ' · de la hoja de MIO' : ''}</DialogDescription>
        </DialogHeader>
        {fromSheet && piece.row ? <SheetPiece piece={piece} clientSlug={clientSlug} period={period} /> : piece.planId ? <NativePiece piece={piece} /> : null}
        <div className="-mb-2 mt-2 flex justify-end border-t border-zinc-100 pt-2 dark:border-white/5">
          <button type="button" onClick={() => onOpenFull(fullPath)} className={OPEN_ACTION} data-piece-peek-open>
            {fromSheet ? 'Abrir en Parrillas' : 'Abrir en la parrilla'}<ExternalLink className="h-4 w-4" />
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
