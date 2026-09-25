import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useParams } from 'react-router-dom';
import axios from 'axios';
import { getApiBaseUrl } from '@/lib/apiBaseUrl';
import { formatContentPlanDate, getContentPlanMonthName } from '@/lib/contentPlanPeriod';
import {
  CheckCircle2, Clock, AlertCircle, Loader2, Calendar,
  Video, Image as ImageIcon, MessageSquare, Check, X, Send,
  ExternalLink, ChevronLeft, ChevronRight
} from '@/components/ui/icons';
import { toast } from 'react-hot-toast';
import ClientAvatar from '@/components/ui/ClientAvatar';

/**
 * Portal del cliente (rediseño de Rodny, 24 de septiembre de 2026).
 *
 * Dos pantallas en vez de una lista infinita: el **mes en mosaico**, donde se ve de un vistazo cuántas
 * piezas hay y cuáles faltan por revisar, y el **detalle de una pieza**, donde manda la pieza —que es
 * lo único que el cliente aprueba— y a su lado el texto que se va a publicar.
 *
 * El guion no está aquí ni llega en la respuesta: se quitó en `publicController.js`.
 */

const getPublicAssetUrl = (asset) => {
  if (!asset?.url) return null;
  const baseUrl = asset.url.startsWith('http') ? asset.url : `${getApiBaseUrl()}${asset.url}`;
  if (!asset.version) return baseUrl;

  const [path, query = ''] = baseUrl.split('?');
  const params = new URLSearchParams(query);
  params.set('v', asset.version);
  return `${path}?${params.toString()}`;
};

const APPROVED_STATUSES = ['APROBADO', 'REALIZADO', 'PUBLICADO'];
const isApproved = (item) => APPROVED_STATUSES.includes(item?.status);

const assetsOf = (item) => (item?.finalAssets?.length ? item.finalAssets : (item?.finalAsset ? [item.finalAsset] : []));

/**
 * Separa las etiquetas del final del texto para poder pintarlas aparte, sin tocar lo que escribió el
 * equipo: solo se separan si las últimas líneas son **solo** etiquetas. Si no, el texto se muestra tal cual.
 */
export const splitCaption = (text) => {
  const value = String(text || '').trimEnd();
  if (!value) return { body: '', tags: [] };

  const lines = value.split('\n');
  const tags = [];
  let cut = lines.length;

  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const line = lines[index].trim();
    if (!line) { cut = index; continue; }
    if (!/^#[^\s#]+(\s+#[^\s#]+)*$/.test(line)) break;
    tags.unshift(...line.split(/\s+/));
    cut = index;
  }

  return tags.length ? { body: lines.slice(0, cut).join('\n').trimEnd(), tags } : { body: value, tags: [] };
};

const FormatIcon = ({ format, className }) => (
  format === 'Reel' || format === 'Video'
    ? <Video className={className} />
    : <ImageIcon className={className} />
);

const StatusChip = ({ item }) => (
  isApproved(item) ? (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-green-soft px-3 py-1.5 text-[11px] font-bold text-brand-green-deep dark:bg-brand-green/15 dark:text-brand-green">
      <CheckCircle2 className="h-3.5 w-3.5" /> Aprobada
    </span>
  ) : (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-yellow-soft px-3 py-1.5 text-[11px] font-bold text-brand-yellow-deep dark:bg-brand-yellow/15 dark:text-brand-yellow">
      <Clock className="h-3.5 w-3.5" /> Por revisar
    </span>
  )
);

/** La miniatura del mosaico: la primera lámina de la pieza, o un hueco si todavía no hay nada. */
const FinalAssetThumb = ({ item }) => {
  const asset = assetsOf(item)[0];
  const base = 'h-full w-full object-cover';

  if (!asset) {
    return (
      <div className="flex h-full w-full flex-col items-center justify-center gap-2 bg-zinc-100 dark:bg-white/5">
        <FormatIcon format={item.format} className="h-7 w-7 text-zinc-300 dark:text-zinc-600" />
        <span className="text-[11px] font-medium text-zinc-400">Pieza en preparación</span>
      </div>
    );
  }

  if (asset.thumbnailUrl) return <img src={asset.thumbnailUrl} alt="" className={base} />;

  const src = getPublicAssetUrl(asset);
  if ((asset.mimeType || '').startsWith('video/')) {
    return <video src={src} className={`${base} bg-black`} preload="metadata" muted playsInline />;
  }
  return <img src={src} alt="" className={base} />;
};

const FinalAssetPreview = ({ assets = [] }) => {
  const [activeIndex, setActiveIndex] = useState(0);
  if (!assets.length) {
    return (
      <div className="flex min-h-[320px] items-center justify-center rounded-[2rem] border border-dashed border-zinc-200 bg-zinc-50 p-10 text-sm text-zinc-400 dark:border-white/10 dark:bg-white/5">
        La pieza final todavía está en preparación.
      </div>
    );
  }

  const asset = assets[Math.min(activeIndex, assets.length - 1)];

  const src = getPublicAssetUrl(asset);
  // Un video entregado como enlace de Drive lo sirve Google: llega con su marco, no con una URL nuestra.
  const isDrive = Boolean(asset.embedUrl);
  const isImage = !isDrive && (asset.mimeType || '').startsWith('image/');
  const isVideo = !isDrive && (asset.mimeType || '').startsWith('video/');

  return (
    <div className="space-y-3">
      <div className="overflow-hidden rounded-[2rem] border border-zinc-200 bg-zinc-900 dark:border-white/10">
        <div className="relative">
          {isDrive ? (
            <div className="relative w-full" style={{ aspectRatio: '16 / 9' }}>
              <iframe
                src={asset.embedUrl}
                title={asset.name || 'Pieza final en Drive'}
                className="absolute inset-0 h-full w-full border-0 bg-black"
                allow="autoplay; encrypted-media; fullscreen"
                allowFullScreen
              />
            </div>
          ) : isImage ? (
            <img src={src} alt={asset.name || 'Pieza final'} className="max-h-[620px] w-full object-contain" />
          ) : isVideo ? (
            <video src={src} className="max-h-[620px] w-full bg-black" controls preload="metadata" />
          ) : (
            <div className="p-6 text-sm text-zinc-300">Archivo final disponible para revisi&oacute;n.</div>
          )}

          {assets.length > 1 && (
            <>
              <button type="button" onClick={() => setActiveIndex(index => (index - 1 + assets.length) % assets.length)} className="absolute left-3 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 text-zinc-800 shadow-lg backdrop-blur transition hover:bg-white dark:bg-zinc-900/90 dark:text-white" aria-label="Ver lámina anterior"><ChevronLeft className="h-5 w-5" /></button>
              <button type="button" onClick={() => setActiveIndex(index => (index + 1) % assets.length)} className="absolute right-3 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 text-zinc-800 shadow-lg backdrop-blur transition hover:bg-white dark:bg-zinc-900/90 dark:text-white" aria-label="Ver lámina siguiente"><ChevronRight className="h-5 w-5" /></button>
              <span className="absolute right-4 top-4 rounded-full bg-black/55 px-2.5 py-1 text-[11px] font-bold text-white">{activeIndex + 1} / {assets.length}</span>
            </>
          )}
        </div>
      </div>

      {(asset.name || asset.openUrl) && (
        <div className="flex items-center justify-between gap-3 px-1">
          <span className="min-w-0 truncate text-xs font-medium text-zinc-500 dark:text-zinc-400">{asset.name}</span>
          {asset.openUrl && (
            <a href={asset.openUrl} target="_blank" rel="noopener noreferrer" className="flex shrink-0 items-center gap-1.5 text-xs font-bold text-brand-cyan-deep hover:underline dark:text-brand-cyan">
              Abrir en Drive <ExternalLink className="h-3.5 w-3.5" />
            </a>
          )}
        </div>
      )}

      {assets.length > 1 && (
        <div className="flex max-w-full gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" aria-label="Navegación del carrusel">
          {assets.map((entry, index) => (
            <button key={entry.id || entry.url || index} type="button" onClick={() => setActiveIndex(index)} aria-label={`Ver lámina ${index + 1}`} aria-current={index === activeIndex ? 'true' : undefined} className={`h-2.5 rounded-full transition-all ${index === activeIndex ? 'w-7 bg-brand-cyan' : 'w-2.5 bg-zinc-300 dark:bg-zinc-700'}`} />
          ))}
        </div>
      )}
    </div>
  );
};

/** Una pieza en el mosaico del mes. */
const PieceCard = ({ item, index, onOpen }) => (
  <button
    type="button"
    onClick={() => onOpen(item.id)}
    className="group flex flex-col overflow-hidden rounded-2xl border border-zinc-200 bg-white text-left transition-all hover:-translate-y-0.5 hover:border-brand-cyan/40 hover:shadow-lg dark:border-white/10 dark:bg-zinc-900"
  >
    <div className="relative aspect-[4/5] overflow-hidden bg-zinc-100 dark:bg-white/5">
      <FinalAssetThumb item={item} />
      <span className="absolute left-3 top-3 inline-flex items-center gap-1.5 rounded-lg bg-black/55 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-white backdrop-blur">
        <FormatIcon format={item.format} className="h-3 w-3" /> {item.format}
      </span>
      <span
        className={`absolute right-3 top-3 h-5 w-5 rounded-full border-2 border-black/25 ${isApproved(item) ? 'bg-brand-green' : 'bg-brand-yellow'}`}
        aria-hidden="true"
      />
    </div>
    <div className="flex flex-col gap-1.5 p-4">
      <span className="text-[11px] font-bold text-zinc-400">#{String(index + 1).padStart(2, '0')}</span>
      <h3 className="line-clamp-2 text-sm font-bold leading-snug text-zinc-900 dark:text-zinc-50">{item.objective}</h3>
      <div className="flex items-center gap-2 pt-0.5">
        <span className="text-xs text-zinc-500 dark:text-zinc-400">
          {item.publishDate ? formatContentPlanDate(item.publishDate) : 'Sin fecha'}
        </span>
        <span className="text-zinc-300 dark:text-zinc-600">·</span>
        <span className={`text-xs font-bold ${isApproved(item) ? 'text-brand-green-deep dark:text-brand-green' : 'text-brand-yellow-deep dark:text-brand-yellow'}`}>
          {isApproved(item) ? 'Aprobada' : 'Por revisar'}
        </span>
      </div>
    </div>
  </button>
);

/** El detalle: la pieza en grande y, al lado, lo que se va a publicar. */
const PieceDetail = ({
  item, index, total, onBack, onPrev, onNext,
  onApprove, isCommenting, onStartComment, onCancelComment,
  clientComment, onCommentChange, onSubmitComment, isSubmitting,
  commentFormRef, commentTextareaRef
}) => {
  const { body, tags } = splitCaption(item.captionText);
  const approved = isApproved(item);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-2 rounded-xl border border-zinc-200 bg-white px-4 py-2.5 text-sm font-bold text-zinc-700 transition hover:bg-zinc-50 dark:border-white/10 dark:bg-zinc-900 dark:text-zinc-200"
        >
          <ChevronLeft className="h-4 w-4" /> Todas las piezas
        </button>
        <div className="flex-grow" />
        <span className="text-sm font-bold tabular-nums text-zinc-500 dark:text-zinc-400">Pieza {index + 1} de {total}</span>
        <div className="flex items-center gap-2">
          <button type="button" onClick={onPrev} disabled={index === 0} aria-label="Pieza anterior" className="flex h-10 w-10 items-center justify-center rounded-xl border border-zinc-200 bg-white text-zinc-600 transition hover:bg-zinc-50 disabled:opacity-40 dark:border-white/10 dark:bg-zinc-900 dark:text-zinc-300">
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button type="button" onClick={onNext} disabled={index === total - 1} aria-label="Pieza siguiente" className="flex h-10 w-10 items-center justify-center rounded-xl border border-zinc-200 bg-white text-zinc-600 transition hover:bg-zinc-50 disabled:opacity-40 dark:border-white/10 dark:bg-zinc-900 dark:text-zinc-300">
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>

      <article className="overflow-hidden rounded-[2rem] border border-zinc-200 bg-white dark:border-white/10 dark:bg-zinc-900">
        <div className="flex flex-wrap items-center gap-3 border-b border-zinc-100 px-6 py-4 dark:border-white/5">
          <span className="inline-flex items-center gap-2 rounded-lg bg-zinc-100 px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider text-zinc-600 dark:bg-white/5 dark:text-zinc-300">
            <FormatIcon format={item.format} className="h-3.5 w-3.5" /> {item.format}
          </span>
          <span className="inline-flex items-center gap-2 text-sm text-zinc-600 dark:text-zinc-400">
            <Calendar className="h-4 w-4 text-brand-cyan-deep dark:text-brand-cyan" />
            {item.publishDate ? formatContentPlanDate(item.publishDate) : 'Fecha por definir'}
          </span>
          <div className="flex-grow" />
          <StatusChip item={item} />
        </div>

        <div className="grid grid-cols-1 gap-0 lg:grid-cols-12">
          {/* La pieza manda: es lo que el cliente aprueba. */}
          {/* La pieza se centra en su panel: si es más corta que el texto, no deja un vacío arriba. */}
          <div className="flex items-center justify-center border-b border-zinc-100 bg-zinc-50 p-6 dark:border-white/5 dark:bg-white/5 lg:col-span-7 lg:border-b-0 lg:border-r">
            <div className="w-full">
              <FinalAssetPreview assets={assetsOf(item)} />
            </div>
          </div>

          <div className="flex flex-col gap-6 p-6 lg:col-span-5 lg:p-8">
            <div className="space-y-2">
              <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-zinc-400">Idea</p>
              <h2 className="text-xl font-bold leading-snug tracking-tight text-zinc-900 dark:text-zinc-50">{item.objective}</h2>
            </div>

            <div className="space-y-3">
              <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-zinc-400">Texto de la publicación</p>
              {body ? (
                <p className="whitespace-pre-wrap text-[15px] leading-relaxed text-zinc-700 dark:text-zinc-300">{body}</p>
              ) : (
                <p className="text-sm italic text-zinc-400">Todavía sin texto.</p>
              )}
              {tags.length > 0 && (
                <div className="flex flex-wrap gap-2 pt-1">
                  {tags.map((tag, i) => (
                    <span key={`${item.id}-tag-${i}`} className="rounded-lg bg-zinc-100 px-2.5 py-1 text-[13px] text-zinc-600 dark:bg-white/5 dark:text-zinc-400">{tag}</span>
                  ))}
                </div>
              )}
            </div>

            {item.mediaUrl?.length > 0 && (
              <div className="space-y-2">
                <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-zinc-400">Referencias</p>
                <div className="flex flex-col gap-2">
                  {item.mediaUrl.map((link, i) => (
                    <a key={i} href={link} target="_blank" rel="noopener noreferrer" className="flex w-fit items-center gap-2 text-sm font-bold text-zinc-600 transition-colors hover:text-brand-cyan-deep dark:text-zinc-400 dark:hover:text-brand-cyan">
                      <ExternalLink className="h-3.5 w-3.5" />
                      {item.mediaUrl.length > 1 ? `Referencia #${i + 1}` : 'Ver referencia'}
                    </a>
                  ))}
                </div>
              </div>
            )}

            <div className="flex-grow" />

            <div className="space-y-3 border-t border-zinc-100 pt-5 dark:border-white/5">
              {approved ? (
                <div className="flex items-center gap-3 rounded-2xl border border-brand-green/25 bg-brand-green-soft px-5 py-4 dark:bg-brand-green/10">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-green text-white">
                    <Check className="h-5 w-5" />
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-brand-green-deep dark:text-brand-green">Pieza aprobada</p>
                    <p className="text-xs text-zinc-600 dark:text-zinc-400">Ya pasó a producción.</p>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col gap-2.5 sm:flex-row">
                  <button
                    type="button"
                    onClick={() => onApprove(item.id)}
                    className="inline-flex flex-grow items-center justify-center gap-2 rounded-2xl bg-brand-cyan-deep px-6 py-4 text-sm font-bold text-white transition hover:brightness-110"
                  >
                    <Check className="h-4 w-4" />
                    {index === total - 1 ? 'Aprobar esta pieza' : 'Aprobar y ver la siguiente'}
                  </button>
                  <button
                    type="button"
                    onClick={() => onStartComment(item.id)}
                    className="inline-flex items-center justify-center gap-2 rounded-2xl border border-zinc-200 bg-white px-5 py-4 text-sm font-bold text-zinc-700 transition hover:bg-zinc-50 dark:border-white/10 dark:bg-zinc-900 dark:text-zinc-200"
                  >
                    <MessageSquare className="h-4 w-4" /> Pedir un cambio
                  </button>
                </div>
              )}
            </div>

            {isCommenting && (
              <div ref={commentFormRef} className="space-y-3 rounded-2xl border border-zinc-200 bg-zinc-50 p-5 dark:border-white/10 dark:bg-white/5">
                <div className="flex items-center justify-between">
                  <label htmlFor={`comment-${item.id}`} className="text-sm font-bold text-zinc-900 dark:text-zinc-50">Dinos qué debemos ajustar</label>
                  <button type="button" onClick={onCancelComment} aria-label="Cerrar" className="text-zinc-400 transition hover:text-zinc-600"><X className="h-4 w-4" /></button>
                </div>
                <textarea
                  id={`comment-${item.id}`}
                  ref={commentTextareaRef}
                  value={clientComment}
                  onChange={(event) => onCommentChange(event.target.value)}
                  placeholder="Escribe tus sugerencias de cambio aquí..."
                  className="min-h-[110px] w-full rounded-xl border border-zinc-200 bg-white p-4 text-sm outline-none transition-all focus:ring-4 focus:ring-brand-cyan/10 dark:border-white/10 dark:bg-zinc-900"
                />
                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={() => onSubmitComment(item.id)}
                    disabled={isSubmitting || !clientComment.trim()}
                    className="inline-flex items-center gap-2 rounded-xl bg-brand-cyan-deep px-6 py-3 text-sm font-bold text-white transition hover:brightness-110 disabled:opacity-50"
                  >
                    {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                    Enviar
                  </button>
                </div>
              </div>
            )}

            {item.comments && (
              <div className="space-y-2">
                <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-zinc-400">Lo que pediste antes</p>
                <div className="max-h-52 space-y-2 overflow-y-auto pr-1">
                  {item.comments.split('\n\n').filter(Boolean).map((comment, i) => (
                    <p key={`${item.id}-comment-${i}`} className="rounded-xl border border-zinc-100 bg-zinc-50 p-3 text-xs italic leading-relaxed text-zinc-500 dark:border-white/5 dark:bg-white/5 dark:text-zinc-400">
                      {comment}
                    </p>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </article>
    </div>
  );
};

const SharedContentPlan = () => {
  const { token } = useParams();
  const [plan, setPlan] = useState(null);
  const [loading, setLoading] = useState(true);
  const [openItemId, setOpenItemId] = useState(null);
  const [filter, setFilter] = useState('all');
  const [commentingItemId, setCommentingItemId] = useState(null);
  const [clientComment, setClientComment] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const commentFormRef = useRef(null);
  const commentTextareaRef = useRef(null);

  const fetchPlan = useCallback(async () => {
    try {
      const response = await axios.get(`${getApiBaseUrl()}/api/public/parrilla/${token}`);
      setPlan(response.data);
    } catch (error) {
      console.error('Error fetching shared plan:', error);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    fetchPlan();
  }, [fetchPlan]);

  useEffect(() => {
    if (!commentingItemId) return undefined;

    const frame = window.requestAnimationFrame(() => {
      commentFormRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      window.setTimeout(() => commentTextareaRef.current?.focus({ preventScroll: true }), 250);
    });

    return () => window.cancelAnimationFrame(frame);
  }, [commentingItemId]);

  const items = useMemo(() => plan?.items || [], [plan]);
  const approvedCount = useMemo(() => items.filter(isApproved).length, [items]);
  const pendingCount = items.length - approvedCount;
  const openIndex = items.findIndex(item => item.id === openItemId);
  const openItem = openIndex >= 0 ? items[openIndex] : null;

  const visibleItems = useMemo(() => {
    if (filter === 'approved') return items.filter(isApproved);
    if (filter === 'pending') return items.filter(item => !isApproved(item));
    return items;
  }, [items, filter]);

  const openPiece = (itemId) => {
    setCommentingItemId(null);
    setClientComment('');
    setOpenItemId(itemId);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const stepPiece = (delta) => {
    const next = items[openIndex + delta];
    if (next) openPiece(next.id);
  };

  const handleApprove = async (itemId) => {
    try {
      // La regla de la verdad: el aviso y el salto solo después de que el servidor confirme.
      await axios.post(`${getApiBaseUrl()}/api/public/parrilla/${token}/items/${itemId}/approve`);
      toast.success('Pieza aprobada correctamente');
      await fetchPlan();

      const current = items.findIndex(item => item.id === itemId);
      const next = items[current + 1];
      if (next) openPiece(next.id);
    } catch (error) {
      console.error('Approve error:', error.response?.data || error);
      toast.error('Error al aprobar la pieza');
    }
  };

  const handleSubmitComment = async (itemId) => {
    if (!clientComment.trim() || isSubmitting) return;
    setIsSubmitting(true);
    try {
      const response = await axios.post(`${getApiBaseUrl()}/api/public/parrilla/${token}/items/${itemId}/comment`, { comment: clientComment });

      // Primero solo el texto, para no mover el DOM mientras React procesa.
      setClientComment('');
      toast.success('Comentario enviado');

      // Las actualizaciones de estado esperan a que termine el ciclo de render en curso:
      // sin esto saltaba «Failed to execute 'insertBefore' on 'Node'».
      setTimeout(() => {
        try {
          if (response.data) {
            setPlan(prev => (prev ? {
              ...prev,
              items: prev.items.map(item => (item.id === itemId ? { ...item, ...response.data } : item))
            } : prev));
          } else {
            fetchPlan();
          }
          setCommentingItemId(null);
        } catch (innerError) {
          console.error('Error updating plan state:', innerError);
        }
      }, 0);
    } catch (error) {
      console.error('Comment error:', error.response?.data || error);
      toast.error('Error al enviar el comentario');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-zinc-50 dark:bg-zinc-950">
        <Loader2 className="mb-4 h-10 w-10 animate-spin text-brand-cyan" />
        <p className="font-medium text-zinc-500">Cargando parrilla de contenidos...</p>
      </div>
    );
  }

  if (!plan) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-zinc-50 p-6 text-center dark:bg-zinc-950">
        <div className="mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-destructive/10">
          <AlertCircle className="h-10 w-10 text-destructive" />
        </div>
        <h1 className="mb-2 text-2xl font-black text-zinc-900 dark:text-white">Parrilla no encontrada</h1>
        <p className="max-w-sm text-zinc-500">El enlace es inválido o ha expirado. Por favor, solicita uno nuevo a tu ejecutivo de cuenta.</p>
      </div>
    );
  }

  const progress = items.length ? Math.round((approvedCount / items.length) * 100) : 0;

  return (
    <div className="min-h-screen bg-zinc-50 pb-20 dark:bg-zinc-950">
      <header className="sticky top-0 z-10 border-b border-zinc-200 bg-white/95 backdrop-blur dark:border-white/5 dark:bg-zinc-900/95">
        <div className="mx-auto flex h-24 max-w-6xl flex-wrap items-center gap-4 px-6">
          <ClientAvatar client={plan.client} size={44} className="rounded-xl" />
          <div className="min-w-0">
            <h1 className="truncate text-lg font-bold tracking-tight text-zinc-900 dark:text-white">{plan.client.name}</h1>
            <p className="text-sm text-zinc-500 dark:text-zinc-400">
              Parrilla de {getContentPlanMonthName(plan.month)} {plan.year}
            </p>
          </div>
          <div className="flex-grow" />
          <div className="flex flex-col items-end gap-2">
            <p className="text-sm text-zinc-600 dark:text-zinc-400">
              <span className="font-bold text-brand-green-deep dark:text-brand-green">{approvedCount} aprobadas</span>
              {pendingCount > 0 && <> · {pendingCount} por revisar</>}
            </p>
            <div className="h-1.5 w-52 overflow-hidden rounded-full bg-zinc-200 dark:bg-white/10">
              <div className="h-full rounded-full bg-brand-green transition-all" style={{ width: `${progress}%` }} />
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto mt-10 max-w-6xl space-y-8 px-6">
        {openItem ? (
          <PieceDetail
            item={openItem}
            index={openIndex}
            total={items.length}
            onBack={() => setOpenItemId(null)}
            onPrev={() => stepPiece(-1)}
            onNext={() => stepPiece(1)}
            onApprove={handleApprove}
            isCommenting={commentingItemId === openItem.id}
            onStartComment={setCommentingItemId}
            onCancelComment={() => setCommentingItemId(null)}
            clientComment={clientComment}
            onCommentChange={setClientComment}
            onSubmitComment={handleSubmitComment}
            isSubmitting={isSubmitting}
            commentFormRef={commentFormRef}
            commentTextareaRef={commentTextareaRef}
          />
        ) : (
          <>
            <section className="rounded-[2rem] bg-brand-primary p-8 text-white lg:p-10">
              <div className="max-w-2xl space-y-3">
                <h2 className="text-3xl font-bold leading-tight tracking-tight lg:text-4xl">Revisión de contenidos</h2>
                <p className="text-base leading-relaxed text-white/90">
                  Hola 👋 Aquí tienes la propuesta de contenidos para este mes. Toca una pieza para verla completa, dejarnos tus comentarios o aprobarla.
                </p>
              </div>
            </section>

            {plan.strategicObjectives?.trim() && (
              <section className="rounded-[2rem] border border-zinc-200 bg-white p-7 dark:border-white/10 dark:bg-zinc-900 lg:p-8">
                <div className="max-w-3xl space-y-3">
                  <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-brand-cyan-deep dark:text-brand-cyan">
                    Objetivos estratégicos
                  </p>
                  <div className="whitespace-pre-wrap text-sm leading-relaxed text-zinc-700 dark:text-zinc-300 lg:text-base">
                    {plan.strategicObjectives}
                  </div>
                </div>
              </section>
            )}

            <div className="flex flex-wrap items-center gap-2.5">
              {[
                { key: 'all', label: `Todas · ${items.length}` },
                { key: 'pending', label: `Por revisar · ${pendingCount}` },
                { key: 'approved', label: `Aprobadas · ${approvedCount}` }
              ].map(option => (
                <button
                  key={option.key}
                  type="button"
                  onClick={() => setFilter(option.key)}
                  aria-pressed={filter === option.key}
                  className={`rounded-xl px-4 py-2.5 text-sm font-bold transition ${
                    filter === option.key
                      ? 'bg-zinc-900 text-white dark:bg-white dark:text-zinc-900'
                      : 'border border-zinc-200 bg-white text-zinc-600 hover:bg-zinc-50 dark:border-white/10 dark:bg-zinc-900 dark:text-zinc-300'
                  }`}
                >
                  {option.label}
                </button>
              ))}
              <div className="flex-grow" />
              <p className="text-sm text-zinc-500 dark:text-zinc-400">Toca una pieza para verla completa</p>
            </div>

            {visibleItems.length === 0 ? (
              <div className="rounded-[2rem] border border-dashed border-zinc-200 bg-white p-12 text-center dark:border-white/10 dark:bg-zinc-900">
                <p className="text-sm text-zinc-500 dark:text-zinc-400">No hay piezas en esta vista.</p>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-5 lg:grid-cols-4">
                {visibleItems.map((item) => (
                  <PieceCard
                    key={item.id}
                    item={item}
                    index={items.indexOf(item)}
                    onOpen={openPiece}
                  />
                ))}
              </div>
            )}
          </>
        )}
      </main>

      <footer className="mx-auto mt-20 max-w-6xl px-6 text-center">
        <p className="text-xs text-zinc-400">Portal de revisión · {plan.client.name}</p>
      </footer>
    </div>
  );
};

export default SharedContentPlan;
