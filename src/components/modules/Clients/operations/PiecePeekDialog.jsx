import React, { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ExternalLink, Loader2 } from '@/components/ui/icons';
import { getApiBaseUrl } from '@/lib/apiBaseUrl';
import { MONTH_NAMES, shortDate } from '@/lib/clientOperations';
import { cn } from '@/lib/utils';
import { LongText, PieceCard } from '@/components/modules/ContentGrids/ExternalPlanView';
import { PIECE_STATUS } from './operationTones';
import { CoverField, FinalAssetGrid, MultiLinkInput } from '@/components/modules/ContentPlan/PieceMedia';
import PieceDeliveryForm from '@/components/modules/ContentGrids/PieceDeliveryForm';
import { approvalState } from '@/lib/contentApproval';
import DeliveryHistory from '@/components/tasks/DeliveryHistory';

// La vista rápida de una pieza desde Operación (Rodny, 30 de octubre de 2026: «debería poder dar click … o quizá
// debería abrírseme allí sin tener que cambiar de módulo»). Se mira la pieza sin salir de la página del cliente; editarla
// sigue siendo en la parrilla, a un botón. Desde una tarea también permite entregar por el servicio nativo.

const authHeaders = () => ({ Authorization: `Bearer ${localStorage.getItem('authToken')}` });
const LABEL = 'text-xs font-medium text-zinc-500 dark:text-zinc-400';
const OPEN_ACTION = 'inline-flex min-h-11 items-center gap-2 rounded-xl px-3 text-sm font-medium text-brand-cyan-deep hover:bg-brand-cyan/10 dark:text-brand-cyan';

/** El período del espejo de MIO en la dirección: «octubre-2026». */
export const sheetPeriod = (year, month) => `${MONTH_NAMES[month - 1].toLowerCase()}-${year}`;

async function loadNativePiecePlan(piece) {
  const getPlan = async id => (await axios.get(`${getApiBaseUrl()}/api/content/plans/${encodeURIComponent(id)}`, { headers: authHeaders() })).data;
  let plan;
  try { plan = await getPlan(piece.planId); }
  catch (error) { if (error.response?.status !== 404) throw error; }
  if (plan?.items?.some(item => item.id === piece.id)) return plan;
  // Una tarea abierta puede conservar el mes anterior. Resolver por identidad,
  // nunca por título: un homónimo no reemplaza una pieza eliminada.
  const { data: location } = await axios.get(`${getApiBaseUrl()}/api/content/items/${encodeURIComponent(piece.id)}/location`, { headers: authHeaders() });
  if (location.planId !== plan?.id) plan = await getPlan(location.planId);
  if (!plan?.items?.some(item => item.id === piece.id)) {
    throw Object.assign(new Error('La pieza ya no está disponible.'), { response: { status: 404 } });
  }
  return plan;
}

function NativePiece({ piece, plan, isLoading, error, onRetry, allowDelivery, onBusyChange }) {
  const queryClient = useQueryClient();
  const [deliveryBusy, setDeliveryBusy] = useState(false);
  const item = plan?.items?.find((row) => row.id === piece.id);
  const deliveryKey = ['content-delivery', piece.id];
  const delivery = useQuery({ queryKey: deliveryKey, enabled: Boolean(allowDelivery && item && !error), retry: false, staleTime: 30_000, refetchOnMount: 'always',
    queryFn: async () => (await axios.get(`${getApiBaseUrl()}/api/content/items/${encodeURIComponent(piece.id)}/delivery`, { headers: authHeaders() })).data });
  const validDelivery = Number.isInteger(delivery.data?.revision) && Array.isArray(delivery.data?.files);
  const deliveryReady = validDelivery && !delivery.error && !delivery.isFetching;
  const refreshDelivery = () => Promise.all([
    queryClient.invalidateQueries({ queryKey: deliveryKey }),
    queryClient.invalidateQueries({ queryKey: ['content-plan'] }),
  ]);
  const orderMutation = useMutation({
    mutationFn: async ({ itemId, order, expectedRevision }) => (await axios.put(`${getApiBaseUrl()}/api/content/items/${encodeURIComponent(itemId)}/final-assets/order`,
      { order, expectedRevision }, { headers: authHeaders() })).data,
    onSuccess: async (finalAssets, { itemId }) => {
      // El recibo ya confirma el orden; las lecturas posteriores completan cualquier cambio de la pieza.
      queryClient.setQueriesData({ queryKey: ['content-plan'] }, (stored) => stored?.items ? {
        ...stored, items: stored.items.map(item => item.id === itemId ? { ...item, finalAssets } : item),
      } : stored);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: deliveryKey }),
        queryClient.invalidateQueries({ queryKey: ['content-plan'] }),
        queryClient.invalidateQueries({ queryKey: ['client-operations'] }),
      ]);
    },
    onError: (failure) => {
      console.error('[Pieza final] No se pudo ordenar:', failure.response?.data?.error || failure.message, failure.response?.status || failure.code || 'UNKNOWN');
      return refreshDelivery();
    },
  });
  useEffect(() => { onBusyChange?.(deliveryBusy || orderMutation.isPending); }, [deliveryBusy, orderMutation.isPending, onBusyChange]);
  useEffect(() => () => onBusyChange?.(false), [onBusyChange]);
  if (isLoading) return <p className="flex items-center gap-2 py-6 text-sm text-zinc-500"><Loader2 className="h-4 w-4 animate-spin" />Cargando la pieza…</p>;
  if (error || !item) return <div role="alert" className="space-y-2 py-6 text-sm">
    <p className="text-destructive">{error?.response?.status === 403 ? 'No tienes acceso a esta parrilla.' : 'No pudimos cargar esta pieza. Inténtalo de nuevo.'}</p>
    {error?.response?.status !== 403 && <button type="button" onClick={onRetry} className="min-h-11 rounded-lg border px-3">Reintentar consulta de pieza</button>}
  </div>;
  const assets = allowDelivery ? validDelivery && !delivery.error ? delivery.data.files : [] : item.finalAssets || [];
  return (
    <div className="space-y-5" data-piece-peek-native>
      <dl className="flex flex-wrap gap-x-6 gap-y-3 text-sm">
        <div><dt className={LABEL}>Cliente</dt><dd>{plan.client?.name || '—'}</dd></div>
        <div><dt className={LABEL}>Período</dt><dd>{MONTH_NAMES[plan.month - 1]} {plan.year}</dd></div>
        <div><dt className={LABEL}>Formato</dt><dd>{item.format || '—'}</dd></div>
        <div><dt className={LABEL}>Publicación</dt><dd>{item.publishDate ? shortDate(String(item.publishDate).slice(0, 10)) : 'Sin fecha'}{item.publishTime ? ` · ${item.publishTime} (Bogotá)` : ''}</dd></div>
        <div><dt className={LABEL}>Estado de la pieza</dt><dd>{PIECE_STATUS[item.status]?.label || item.status}</dd></div>
      </dl>
      {approvalState(item) === 'MATERIAL_NUEVO' && <p className="text-sm text-brand-magenta-deep dark:text-brand-magenta">El cliente tiene material nuevo por revisar.</p>}
      <div className="grid gap-4 md:grid-cols-2">
        <LongText label="Guion · lo ve el cliente" text={item.copyText} />
        <LongText label="Texto de la publicación · lo ve el cliente" text={item.captionText} />
      </div>
      {!item.copyText && !item.captionText && <p className="text-sm text-zinc-500">Todavía no tiene guion ni texto de publicación.</p>}
      <div className="grid gap-4 md:grid-cols-2">
        <div><p className={LABEL}>Referencias</p><MultiLinkInput values={item.mediaUrl || []} isEditing={false} /></div>
        <div><p className={LABEL}>Insumos</p><MultiLinkInput values={item.assetsLinks || []} isEditing={false} /></div>
      </div>
      <div>
        <p className={LABEL}>Pieza final{assets.length > 1 ? ` · ${assets.length} archivos` : ''}</p>
        {assets.length
          ? <div className="mt-2 [&_img]:object-contain [&_video]:object-contain"><FinalAssetGrid item={item} finalAssets={assets} isEditing={false}
            reorderable={allowDelivery && deliveryReady && !deliveryBusy} onReorder={(itemId, order) => orderMutation.mutateAsync({ itemId, order, expectedRevision: delivery.data.revision })} /></div>
          : allowDelivery && delivery.isLoading ? <p role="status" className="mt-1 text-sm text-muted-foreground">Cargando entrega…</p>
            : !allowDelivery || deliveryReady ? <p className="mt-1 text-sm text-zinc-500">Sin pieza final todavía.</p> : null}
        {allowDelivery && (delivery.error || delivery.data && !validDelivery) && <div role="alert" className="mt-2 space-y-2 text-sm text-destructive">
          <p>{delivery.error?.response?.data?.error || 'No pudimos consultar los archivos actuales de la entrega.'}</p>
          <button type="button" onClick={() => delivery.refetch()} className="min-h-11 rounded-lg border px-3">Reintentar consulta de entrega</button>
        </div>}
        {allowDelivery && assets.length > 1 && <p className="mt-2 text-xs text-muted-foreground">Arrastra las miniaturas para ordenar el carrusel. También puedes usar las flechas del teclado desde su número.</p>}
        {orderMutation.isPending && <p role="status" className="mt-2 flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Guardando orden…</p>}
        {orderMutation.isSuccess && <p role="status" className="mt-2 text-sm text-muted-foreground">Orden guardado</p>}
        {orderMutation.isError && <p role="alert" className="mt-2 text-sm text-destructive">{orderMutation.error?.response?.data?.error || 'No se pudo guardar el orden. Inténtalo de nuevo.'}</p>}
      </div>
      {item.cover && <CoverField item={item} isEditing={false} />}
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
      {allowDelivery && <DeliveryHistory history={deliveryReady ? delivery.data.history : []} />}
      {allowDelivery && <PieceDeliveryForm key={item.id} itemId={item.id} onBusyChange={setDeliveryBusy} disabled={orderMutation.isPending || !deliveryReady}
        existingCount={assets.length} expectedRevision={deliveryReady ? delivery.data.revision : undefined} onConflict={refreshDelivery}
        onStored={() => Promise.all([
          queryClient.invalidateQueries({ queryKey: deliveryKey }),
          queryClient.invalidateQueries({ queryKey: ['content-plan'] }),
          queryClient.invalidateQueries({ queryKey: ['tasks'] }),
          queryClient.invalidateQueries({ queryKey: ['client-operations'] }),
        ])} />}
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
export default function PiecePeekDialog({ piece, cycle, clientSlug, onClose, onOpenFull, onUnavailable, nested = false, allowDelivery = false, returnFocusRef }) {
  const [busy, setBusy] = useState(false);
  const queryClient = useQueryClient();
  const fromSheet = Boolean(piece.external);
  const nativeQuery = useQuery({
    // La resolución puede devolver otro mes: no guardar ese destino bajo la
    // clave de la parrilla anterior, que también usa el editor completo.
    queryKey: ['content-plan', 'piece-peek', piece.id, piece.planId],
    enabled: !fromSheet && Boolean(piece.planId),
    staleTime: 30_000,
    refetchOnMount: 'always',
    retry: false,
    queryFn: async () => {
      try { return await loadNativePiecePlan(piece); }
      catch (error) {
        console.error('[Ver pieza] No se pudo consultar:', error.response?.data?.error || error.message, error.response?.status || error.code || 'UNKNOWN');
        throw error;
      }
    },
  });
  const currentItem = !nativeQuery.error && nativeQuery.data?.items?.find(item => item.id === piece.id);
  const unavailable = !fromSheet && nativeQuery.error?.response?.status === 404;
  useEffect(() => {
    if (!unavailable) return;
    for (const key of ['nativeTasks', 'client-operations', 'content-plans']) queryClient.invalidateQueries({ queryKey: [key] });
    (onUnavailable || onClose)();
  }, [unavailable, queryClient, onUnavailable, onClose]);
  const currentPiece = fromSheet ? piece : currentItem ? {
    format: currentItem.format, title: currentItem.objective, status: currentItem.status, date: currentItem.publishDate,
  } : { format: piece.format, title: piece.title };
  const status = currentPiece.status ? PIECE_STATUS[currentPiece.status] || PIECE_STATUS.BORRADOR : null;
  const period = fromSheet ? sheetPeriod(cycle.year, cycle.month) : null;
  const fullPath = fromSheet ? `/parrillas/hoja/${clientSlug}/${period}` : `/parrillas/${encodeURIComponent(currentItem ? nativeQuery.data.id : piece.planId)}?item=${encodeURIComponent(piece.id)}`;
  if (unavailable) return null;
  return (
    <Dialog open onOpenChange={(next) => { if (!next && !busy) onClose(); }}>
      <DialogContent data-piece-peek closeLabel="Cerrar pieza" overlayClassName={nested ? 'z-[110]' : undefined}
        onCloseAutoFocus={returnFocusRef ? event => { event.preventDefault(); returnFocusRef.current?.focus(); } : undefined}
        className={cn('max-h-[min(78dvh,48rem)] overflow-y-auto rounded-xl border-zinc-200 sm:max-w-3xl dark:border-white/10 dark:bg-zinc-900', nested && 'z-[111]')}>
        <DialogHeader>
          <DialogTitle className="flex flex-wrap items-center gap-x-3 gap-y-1 pr-8">
            <span>{currentPiece.format}{fromSheet ? '' : ` · ${currentPiece.title}`}</span>
            {status && <span className={cn('inline-flex rounded-md px-2 py-0.5 text-xs font-semibold', status.chip)}>{status.label}</span>}
          </DialogTitle>
          <DialogDescription>{currentPiece.date ? `Sale el ${shortDate(String(currentPiece.date).slice(0, 10))}` : !fromSheet && !currentItem ? 'Consulta de la pieza vinculada' : 'Sin fecha'}{fromSheet ? ' · de la hoja de MIO' : ''}</DialogDescription>
        </DialogHeader>
        {fromSheet && piece.row ? <SheetPiece piece={piece} clientSlug={clientSlug} period={period} /> : piece.planId ? <NativePiece piece={piece} plan={nativeQuery.data} isLoading={nativeQuery.isLoading} error={nativeQuery.error} onRetry={() => nativeQuery.refetch()} allowDelivery={allowDelivery} onBusyChange={setBusy} /> : null}
        <div className="-mb-2 mt-2 flex justify-end border-t border-zinc-100 pt-2 dark:border-white/5">
          <button type="button" disabled={busy} onClick={() => onOpenFull(fullPath)} className={OPEN_ACTION} data-piece-peek-open>
            {fromSheet ? 'Abrir en Parrillas' : 'Abrir en la parrilla'}<ExternalLink className="h-4 w-4" />
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
