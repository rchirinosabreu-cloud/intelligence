import Select from '@/components/ui/Select';
import React, { useState, useEffect, useLayoutEffect, useRef } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { useNavigateFrom, usePageLabel } from '@/components/layout/BackToOrigin';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';
import { getApiBaseUrl } from '@/lib/apiBaseUrl';
import { getContentPlanMonthName } from '@/lib/contentPlanPeriod';
import { planFinalAssetUpload } from '@/lib/uploadLimits';
import { uploadFinalPiece } from '@/lib/contentFinalDelivery';
import { driveLinkProblem } from '@/lib/driveLinks';
import { MultiLinkInput, CoverField, FinalAssetGrid } from '@/components/modules/ContentPlan/PieceMedia';
import { WEEKDAY_LABELS, buildMonthGrid, groupItemsByDay } from '@/lib/contentPlanCalendar';
import { APPROVAL_STATES, approvalState, canRequestRevision, itemsNeedingRevisionRequest } from '@/lib/contentApproval';
import { describeMetaMedia, publishMomentLabel, queueOwnedStatusProblem } from '@/lib/socialPublishing';
import { kindAcceptsCover } from '@/lib/videoCover';
import {
  ChevronLeft, ChevronRight, Plus, Send, Save, Trash2,
  MoreVertical, CheckCircle2, Circle, Clock, Loader2,
  Calendar, User, LayoutGrid, Instagram, Facebook, Video,
  Edit2, Check, AlertCircle, Sparkles, StickyNote, ChevronUp, Share,
  MessageSquare, Table2, UploadCloud, Link2, Eye
} from '@/components/ui/icons';
import PageHeader from '@/components/ui/PageHeader';
import TeamAvatar from '@/components/ui/TeamAvatar';
import { Button } from '@/components/ui/button';
import { toast } from 'react-hot-toast';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription
} from '@/components/ui/dialog';
import DatePicker from 'react-datepicker';
import { brainDatePickerProps } from '@/lib/brainDatePicker';
import { BrainTimePicker } from '@/components/ui/BrainDatePicker';
import SocialPublishingPanel from '@/components/modules/ContentPlan/SocialPublishingPanel';
import { pieceAccountLabel } from '@/lib/socialPublishing';
import { useConfirmDialog } from '@/components/ui/ConfirmDialog';
import BriaContentPlanReview from '@/components/modules/ContentPlan/BriaContentPlanReview';
import PlanPeriodSelector from '@/components/modules/ContentPlan/PlanPeriodSelector';
import PieceStatusBadge from '@/components/modules/ContentPlan/PieceStatusBadge';
import { pieceStatusPresentation } from '@/components/modules/ContentPlan/pieceStatusPresentation';


// Helper for auto-resize textarea with internal state for performance (save on blur)
const AutoResizeTextarea = ({ id, defaultValue, onBlur, placeholder, disabled, className }) => {
  const [val, setVal] = useState(defaultValue || '');
  const textareaRef = useRef(null);

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = textareaRef.current.scrollHeight + 'px';
    }
  }, [val]);

  // Sync internal value if defaultValue changes (e.g. from server)
  useEffect(() => {
    setVal(defaultValue || '');
  }, [defaultValue]);

  return (
    <textarea
      id={id}
      ref={textareaRef}
      value={val}
      onChange={(e) => setVal(e.target.value)}
      onBlur={onBlur}
      placeholder={placeholder}
      disabled={disabled}
      wrap="soft"
      className={`${className || ''} min-w-0 max-w-full resize-y overflow-x-hidden whitespace-pre-wrap [overflow-wrap:anywhere]`}
      rows={1}
    />
  );
};

const parsePlanInternalNotes = (value) => {
  if (!value || typeof value !== 'string') return [];

  try {
    const parsed = JSON.parse(value);
    if (Array.isArray(parsed)) {
      return parsed.map(note => String(note || '').trim()).filter(Boolean);
    }
  } catch (error) {
    // Legacy plans stored one plain textarea. Show that as the first note.
  }

  const legacyNote = value.trim();
  return legacyNote ? [legacyNote] : [];
};

/**
 * Subida directa de una pieza final pesada (Rodny, 24 de septiembre de 2026).
 *
 * Tres pasos: el servidor firma un permiso por archivo, el navegador sube **al almacenamiento** sin
 * pasar por el servidor —por eso no hay tope de memoria ni de plazo— y al final el servidor confirma
 * lo que llegó de verdad. Hasta esa confirmación no existe nada en la parrilla, así que una subida
 * interrumpida no deja una pieza a medias.
 *
 * El interceptor de `main.jsx` solo adjunta el token a nuestra API, así que la entrega al
 * almacenamiento no lleva credenciales de la plataforma.
 */

/**
 * Entregar la pieza final como enlace de Drive.
 *
 * Se monta con `key={itemId}`, así que cada vez que se abre nace vacío: sin un `useEffect` que limpie
 * el formulario al cerrar. El aviso de permisos no es decorativo — es el único fallo que la plataforma
 * no puede ver: el video se abre perfecto para quien lo subió y el cliente se encuentra un muro.
 */
const DriveLinkDialog = ({ itemId, onClose, onSubmit, isPending }) => {
  const [url, setUrl] = useState('');
  const [name, setName] = useState('');
  const problem = url.trim() ? driveLinkProblem(url) : null;

  const submit = (event) => {
    event.preventDefault();
    const blocking = driveLinkProblem(url);
    if (blocking) {
      toast.error(blocking);
      return;
    }
    onSubmit({ itemId, url: url.trim(), name: name.trim() });
  };

  return (
    <Dialog open={Boolean(itemId)} onOpenChange={(next) => { if (!next) onClose(); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Entregar por enlace de Drive</DialogTitle>
          <DialogDescription>
            Para un video que pesa demasiado para subirlo. La parrilla muestra el reproductor de Drive, igual que si estuviera cargado.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-1.5">
            <span className="block text-xs font-bold text-zinc-600 dark:text-zinc-300">Enlace del archivo</span>
            <input
              type="url"
              value={url}
              onChange={(event) => setUrl(event.target.value)}
              placeholder="https://drive.google.com/file/d/…/view"
              autoFocus
              required
              aria-invalid={problem ? 'true' : undefined}
              className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 outline-none focus:border-brand-cyan dark:border-white/10 dark:bg-zinc-900 dark:text-zinc-50"
            />
            {problem && <p className="text-xs font-semibold text-destructive">{problem}</p>}
          </div>

          <div className="space-y-1.5">
            <span className="block text-xs font-bold text-zinc-600 dark:text-zinc-300">Nombre <span className="font-normal text-zinc-400">(opcional)</span></span>
            <input
              type="text"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Video en Drive"
              maxLength={120}
              className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 outline-none focus:border-brand-cyan dark:border-white/10 dark:bg-zinc-900 dark:text-zinc-50"
            />
          </div>

          <p className="rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2.5 text-xs leading-relaxed text-zinc-600 dark:border-white/10 dark:bg-white/5 dark:text-zinc-300">
            <strong className="font-bold">Revisa los permisos en Drive.</strong> El cliente solo podrá verlo si el archivo
            está compartido como «Cualquier persona con el enlace». A ti se te abrirá bien de todas formas, así que esto
            no se nota desde aquí.
          </p>

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose} disabled={isPending}>Cancelar</Button>
            <Button type="submit" disabled={isPending || Boolean(problem)}>
              {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Añadir enlace'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};

const shortPieceDate = (value) => (value
  ? new Date(value).toLocaleDateString('es-CO', { day: '2-digit', month: 'short', timeZone: 'UTC' })
  : 'Sin fecha');

/**
 * El mes entero, siempre a la vista (Rodny, 24 de septiembre de 2026).
 *
 * Antes la parrilla era una pila de tarjetas enormes: doce piezas eran un scroll interminable y no
 * había forma de ver el mes como mes. Ahora el mes vive aquí y a la derecha se edita una sola pieza.
 * El punto magenta marca lo que todavía no tiene pieza final, que es lo que suele frenar una entrega.
 */
const PlanPieceRail = ({ items, selectedId, onSelect, onAdd, accounts = [] }) => (
  /* El tope de alto va **aquí**, no en el contenedor: un `h-full` no resuelve contra un `max-height`
     del padre, así que el carril crecía a su tamaño natural, la lista nunca activaba su scroll y
     «Nueva pieza» quedaba cortado abajo en pantallas bajas (Rodny, 29 de septiembre de 2026). */
  <nav aria-label="Piezas de la parrilla" className="flex max-h-[calc(100vh-7rem)] flex-col overflow-hidden rounded-3xl border border-zinc-200 bg-white dark:border-white/10 dark:bg-zinc-900">
    <div className="flex items-baseline gap-2 border-b border-zinc-100 px-4 py-3.5 dark:border-white/5">
      <span className="text-sm font-bold text-zinc-900 dark:text-zinc-50">Piezas</span>
      <span className="text-xs text-zinc-400">{items.length}</span>
    </div>

    {/* `min-h-0`: sin él un hijo flexible no se encoge por debajo de su contenido y no hay scroll. */}
    <div className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto p-2">
      {items.map((item, index) => {
        const isSelected = item.id === selectedId;
        // Con varias cuentas en el cliente (PromoGroup y Endova en una misma parrilla), cada pieza dice
        // a cuál va: así se ve cómo se reparte el mes. Con una sola cuenta no hay nada que decir.
        const accountLabel = pieceAccountLabel(item, accounts);
        return (
          <button
            key={item.id}
            type="button"
            onClick={() => onSelect(item.id)}
            aria-current={isSelected ? 'true' : undefined}
            className={`flex items-center gap-2.5 rounded-xl px-2.5 py-2.5 text-left transition-colors ${
              isSelected ? 'bg-zinc-100 dark:bg-white/10' : 'hover:bg-zinc-50 dark:hover:bg-white/5'
            }`}
          >
            <span aria-hidden="true" className={`h-9 w-1 shrink-0 rounded-full ${pieceStatusPresentation(item).dot}`} />
            <span className="min-w-0 flex-grow">
              <span className={`block truncate text-sm leading-tight ${isSelected ? 'font-bold text-zinc-900 dark:text-zinc-50' : 'font-medium text-zinc-700 dark:text-zinc-300'}`}>
                {item.objective || `Pieza ${index + 1}`}
              </span>
              <span className="mt-0.5 block truncate text-xs text-zinc-500 dark:text-zinc-400">
                {accountLabel && <><span data-piece-account className="font-bold text-zinc-600 dark:text-zinc-300">{accountLabel}</span> · </>}
                {item.format} · {shortPieceDate(item.publishDate)}
              </span>
              <PieceStatusBadge item={item} className="mt-1" />
            </span>
          </button>
        );
      })}
    </div>

    <div className="mt-auto border-t border-zinc-100 p-2.5 dark:border-white/5">
      <button
        type="button"
        onClick={onAdd}
        className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-zinc-300 px-3 py-2.5 text-xs font-bold text-zinc-600 transition-colors hover:bg-zinc-50 dark:border-white/15 dark:text-zinc-300 dark:hover:bg-white/5"
      >
        <Plus className="h-4 w-4" /> Nueva pieza
      </button>
    </div>
  </nav>
);

/**
 * El mes como mes (Rodny, 24 de septiembre de 2026).
 *
 * El carril dice qué piezas hay; el calendario dice **cuándo**, que es lo único que una lista no puede
 * enseñar: los días vacíos y los días con tres piezas encima. Tocar una pieza la abre en el editor —son
 * dos formas de mirar el mismo mes, no dos sitios distintos.
 */
const PlanCalendar = ({ items, year, month, onOpenPiece, onAdd, accounts = [] }) => {
  const weeks = buildMonthGrid(year, month);
  const { byDay, undated } = groupItemsByDay(items);

  return (
    <div className="space-y-4">
      <div className="overflow-hidden rounded-3xl border border-zinc-200 bg-white p-4 dark:border-white/10 dark:bg-zinc-900">
        <div className="mb-2 grid grid-cols-7 gap-2">
          {WEEKDAY_LABELS.map(label => (
            <div key={label} className="px-1 text-xs font-semibold tracking-[0.08em] text-zinc-400">{label}</div>
          ))}
        </div>

        <div className="grid grid-cols-7 gap-2">
          {weeks.flat().map(cell => {
            const pieces = byDay.get(cell.key) || [];
            return (
              <div
                key={cell.key}
                className={`flex min-h-[112px] flex-col gap-1.5 rounded-xl border p-2 ${
                  cell.inMonth
                    ? 'border-zinc-200 bg-white dark:border-white/10 dark:bg-zinc-900'
                    : 'border-zinc-100 bg-zinc-50 dark:border-white/5 dark:bg-white/5'
                }`}
              >
                <span className={`text-xs font-bold tabular-nums ${cell.inMonth ? 'text-zinc-500 dark:text-zinc-400' : 'text-zinc-300 dark:text-zinc-600'}`}>
                  {cell.day}
                </span>

                {pieces.slice(0, 2).map(piece => (
                  <button
                    key={piece.id}
                    type="button"
                    onClick={() => onOpenPiece(piece.id)}
                    className={`flex flex-col gap-0.5 rounded-lg px-2 py-1.5 text-left transition-opacity hover:opacity-80 ${pieceStatusPresentation(piece).chip}`}
                  >
                    <span className="truncate text-xs font-medium opacity-80">
                      {piece.format}
                      {pieceAccountLabel(piece, accounts) && <span data-piece-account> · {pieceAccountLabel(piece, accounts)}</span>}
                    </span>
                    <span className="line-clamp-2 text-xs font-medium leading-tight text-zinc-700 dark:text-zinc-200">
                      {piece.objective}
                    </span>
                    <PieceStatusBadge item={piece} className="max-w-full px-0 text-xs" />
                  </button>
                ))}

                {pieces.length > 2 && (
                  <button
                    type="button"
                    onClick={() => onOpenPiece(pieces[2].id)}
                    className="px-1 text-left text-xs font-bold text-zinc-500 hover:underline dark:text-zinc-400"
                  >
                    +{pieces.length - 2} más
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-dashed border-zinc-300 bg-white p-4 dark:border-white/15 dark:bg-zinc-900">
        <div className="flex shrink-0 flex-col">
          <span className="text-sm font-bold text-zinc-900 dark:text-zinc-50">Sin fecha todavía</span>
          <span className="text-xs text-zinc-500 dark:text-zinc-400">
            {undated.length ? 'Ábrelas y ponles día de publicación' : 'Todas las piezas tienen día'}
          </span>
        </div>

        {undated.map(piece => (
          <button
            key={piece.id}
            type="button"
            onClick={() => onOpenPiece(piece.id)}
            className="flex max-w-[260px] flex-col gap-0.5 rounded-lg bg-zinc-100 px-3 py-2 text-left transition-opacity hover:opacity-80 dark:bg-white/10"
          >
            <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400">{piece.format}</span>
            <span className="truncate text-xs font-medium text-zinc-700 dark:text-zinc-200">{piece.objective}</span>
          </button>
        ))}

        <div className="flex-grow" />
        <button
          type="button"
          onClick={onAdd}
          className="shrink-0 rounded-xl bg-brand-cyan-deep px-4 py-2.5 text-xs font-bold text-white transition hover:brightness-110"
        >
          Nueva pieza
        </button>
      </div>
    </div>
  );
};

const serializePlanInternalNotes = (notes) => JSON.stringify(
  notes.map(note => String(note || '').trim()).filter(Boolean)
);

const FeedbackHistory = ({ comments }) => {
  if (!comments) return null;

  return (
    <div className="space-y-3 animate-in fade-in slide-in-from-top-2 duration-500 overflow-hidden">
      <div className="flex items-center gap-2">
        <div className="p-1.5 bg-slate-100 dark:bg-white/5 text-slate-500 rounded-xl">
          <MessageSquare className="w-3.5 h-3.5" />
        </div>
        <label className="text-xs font-medium text-slate-500 dark:text-slate-400">
          Feedback del cliente
        </label>
      </div>

      <div className="bg-slate-50 dark:bg-white/5 border border-slate-100 dark:border-white/5 p-5 rounded-[2rem] text-sm text-slate-700 dark:text-zinc-300 whitespace-pre-wrap leading-relaxed not-italic">
        {comments}
      </div>
    </div>
  );
};

/**
 * La tarjeta de crear contenido (rediseño de Rodny, 25 de septiembre de 2026, propuesta B).
 *
 * La ficha queda arriba y los textos comparten el ancho. Distribución por etapas elegida por Rodny
 * el 18 de octubre de 2026: escritura, referencias/insumos, nota interna y entrega final. La pieza
 * final y su portada opcional comparten fila; en móvil se apilan en ese mismo orden.
 *
 * Fuera: el icono de formato —un cuadro de color enorme al lado de la palabra «Reel», que no añadía
 * nada—, los iconos decorativos de cada etiqueta, el «(Links)» de los rótulos y el verde del botón
 * Guardar, que en el resto de la plataforma significa «aprobado» y aquí decía otra cosa.
 */
/**
 * Un solo alto para todos los campos de la ficha. El `Select` compartido trae `min-h-11` de fábrica,
 * así que darle `h-9` no servía de nada: los desplegables medían 44 px y el campo de fecha 36, y la
 * fila salía descuadrada (Rodny, 25 de septiembre de 2026). Aquí todos valen 44.
 */
const FIELD_CLASS = 'h-11 w-full rounded-xl border border-zinc-200 bg-white px-3 text-sm text-zinc-900 outline-none transition focus:border-brand-cyan dark:border-white/10 dark:bg-zinc-900 dark:text-zinc-50';
/** Alto fijo también en la etiqueta: si una ocupa dos líneas, su campo baja y rompe la fila. */
const FIELD_LABEL = 'flex h-5 items-center text-xs font-medium text-zinc-500 dark:text-zinc-400';

const ContentItemCard = ({
  item,
  shareToken: _shareToken,
  index,
  isEditing,
  onEditToggle,
  onUpdate,
  onDelete,
  onDispatch,
  navigate,
  itemRef,
  onFinalAssetUpload,
  onFinalAssetDelete,
  isFinalAssetUploading,
  isFinalAssetDeleting,
  onFinalAssetReorder,
  onCoverUpload,
  onCoverRemove,
  isCoverBusy = false,
  onDriveLink,
  directUploadPercent,
  socialAccounts = [],
  onSchedulePublication,
  onCancelPublication,
  onRetryPublication,
  onReopenPublication,
  onChangeSocialPages,
  isPublicationBusy = false,
  publicationProblems = [],
  onRequestRevision
}) => {
  const finalAssets = item.finalAssets || [];
  const pieceApproval = approvalState(item);
  const isRealizado = item.status === 'REALIZADO' || item.status === 'PROGRAMADO' || item.status === 'PUBLICADO';
  const isDevuelto = item.status === 'DEVUELTO';
  // Programada y esperando su hora: el estado lo lleva la cola, no el desplegable.
  const queueStatusReason = queueOwnedStatusProblem({ item, publications: item.publications || [] });
  const queueOwnsStatus = Boolean(queueStatusReason);
  // Reel/Video ofrecen la portada desde el inicio; otros formatos pueden resolver a reel por su archivo.
  const acceptsCover = ['reel', 'video'].includes(String(item.format || '').trim().toLowerCase())
    || kindAcceptsCover(describeMetaMedia({ format: item.format, assets: finalAssets }).kind);
  const latestTask = item.tasks?.[0];

  return (
    <div
      ref={itemRef}
      id={`item-${item.id}`}
      className={`group relative overflow-hidden rounded-3xl border bg-white transition-all dark:bg-zinc-900 ${
        isEditing
          ? 'min-h-[520px] overflow-visible border-brand-cyan/30'
          : isDevuelto
          ? 'border-destructive/30'
          : 'border-zinc-200 dark:border-white/10'
      }`}
    >
      {/* La ficha, en una franja: se lee de un vistazo y deja de robar una columna */}
      <div className="flex flex-col gap-4 border-b border-zinc-100 px-6 py-5 dark:border-white/5">
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-sm font-bold tabular-nums text-zinc-400">#{String(index + 1).padStart(2, '0')}</span>

          {isEditing ? (
            <input
              type="text"
              defaultValue={item.objective}
              aria-label="Objetivo de la pieza"
              onBlur={(e) => {
                if (e.target.value !== item.objective) onUpdate({ id: item.id, objective: e.target.value });
              }}
              className="min-w-0 flex-grow rounded-xl border border-transparent bg-transparent px-2 py-1.5 text-xl font-bold tracking-tight text-zinc-900 outline-none transition focus:border-zinc-200 dark:text-zinc-50 dark:focus:border-white/10"
            />
          ) : (
            <h3 className="min-w-0 flex-grow truncate px-2 text-xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">{item.objective}</h3>
          )}

          <button
            type="button"
            onClick={onEditToggle}
            className="inline-flex h-9 items-center gap-2 rounded-xl border border-zinc-200 bg-white px-4 text-sm font-bold text-zinc-700 transition hover:bg-zinc-50 dark:border-white/10 dark:bg-zinc-900 dark:text-zinc-200"
          >
            {isEditing ? <Check className="h-3.5 w-3.5" /> : <Edit2 className="h-3.5 w-3.5" />}
            {isEditing ? 'Guardar' : 'Editar'}
          </button>

          {latestTask ? (
            <button
              type="button"
              onClick={() => navigate(`/gestion?taskId=${latestTask.id}`)}
              className={`inline-flex h-9 items-center gap-2 rounded-xl px-3 text-[13px] font-bold transition ${
                isRealizado
                  ? 'bg-brand-green-soft text-brand-green-deep dark:bg-brand-green/15 dark:text-brand-green'
                  : isDevuelto
                  ? 'bg-destructive/10 text-destructive'
                  : 'bg-brand-cyan-soft text-brand-cyan-deep dark:bg-brand-cyan/15 dark:text-brand-cyan'
              }`}
            >
              {isRealizado ? <CheckCircle2 className="h-3.5 w-3.5" /> : isDevuelto ? <AlertCircle className="h-3.5 w-3.5" /> : <Clock className="h-3.5 w-3.5" />}
              {isRealizado ? 'Realizado' : isDevuelto ? 'Devuelto' : 'En producción'}
            </button>
          ) : (
            <button
              type="button"
              onClick={onDispatch}
              className="inline-flex h-9 items-center gap-2 rounded-xl bg-brand-cyan-deep px-4 text-sm font-bold text-white transition hover:brightness-110"
            >
              <Send className="h-3.5 w-3.5" /> Despachar a Kanban
            </button>
          )}

          <button
            type="button"
            onClick={() => onDelete(item.id)}
            aria-label="Eliminar esta pieza"
            className="brain-danger-button-icon flex h-9 w-9 items-center justify-center rounded-xl"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>

        <div className="flex flex-wrap items-start gap-4">
          <div className="flex w-36 flex-col gap-1.5">
            <span className={FIELD_LABEL}>Formato</span>
            <Select
              value={item.format}
              onChange={(e) => onUpdate({ id: item.id, format: e.target.value })}
              aria-label="Formato de la pieza"
              className={FIELD_CLASS}
            >
              <option value="Reel">Reel</option>
              <option value="Carrusel">Carrusel</option>
              <option value="Post">Post</option>
              <option value="Otro">Otro</option>
            </Select>
          </div>

          <div className="flex w-40 flex-col gap-1.5">
            <span className={FIELD_LABEL}>Publicación</span>
            <DatePicker
              {...brainDatePickerProps}
              key={`${item.id}-${item.publishDate}`}
              selected={item.publishDate ? new Date(`${new Date(item.publishDate).toISOString().split('T')[0]}T12:00:00.000Z`) : null}
              onChange={(date) => {
                if (!date) return;
                const dateStr = date.toISOString().split('T')[0];
                const current = item.publishDate ? new Date(item.publishDate).toISOString().split('T')[0] : '';
                if (dateStr !== current) onUpdate({ id: item.id, publishDate: dateStr });
              }}
              dateFormat="dd/MM/yyyy"
              className={FIELD_CLASS}
              wrapperClassName="w-full"
              placeholderText="Elegir fecha"
            />
          </div>

          {/* La hora en reloj de Bogotá: de ella depende cuándo sale la pieza en redes. Mismo reloj que el
              compromiso de una tarea (Rodny, 29 de septiembre de 2026); nunca un campo nativo de hora. */}
          <div className="flex flex-col gap-1.5">
            <span className={FIELD_LABEL}>Hora</span>
            <BrainTimePicker
              id={`publish-time-${item.id}`}
              value={item.publishTime || ''}
              onChange={(time) => { if ((time || '') !== (item.publishTime || '')) onUpdate({ id: item.id, publishTime: time || null }); }}
              ariaLabel="Hora de publicación"
              title="Hora de publicación en redes (Bogotá)"
              className="h-11"
            />
          </div>

          <div className="flex w-44 flex-col gap-1.5">
            <span className={`flex items-center justify-between gap-2 ${FIELD_LABEL}`}>Estado <PieceStatusBadge item={item} /></span>
            {/* Con una publicación esperando salir el estado es de la cola: el desplegable explica en vez
                de escribir, porque ponerla en «Publicado» a mano mataba la publicación (15 de octubre de
                2026). No lleva `disabled`: sí hace algo, y apagarlo lo esconde del teclado y del lector
                de pantalla justo cuando más falta hace la explicación. */}
            <Select
              value={item.status}
              onChange={(e) => {
                if (queueOwnsStatus) return toast.error('El estado lo lleva la publicación programada. Cancélala primero.');
                onUpdate({ id: item.id, status: e.target.value });
              }}
              aria-label="Estado de la pieza"
              title={queueOwnsStatus ? queueStatusReason || undefined : undefined}
              className={FIELD_CLASS}
            >
              <option value="BORRADOR">Borrador</option>
              <option value="EN_REVISION">En Revisión</option>
              <option value="APROBADO">Aprobado</option>
              <option value="EN_PRODUCCION">En Producción</option>
              <option value="DEVUELTO">Devuelto</option>
              <option value="REALIZADO">Realizado</option>
              {/* Lo pone y lo quita la cola de Meta: se ve cuando es el estado, pero no se elige. */}
              <option value="PROGRAMADO" disabled>Programado</option>
              <option value="PUBLICADO">Publicado</option>
            </Select>
            {/* Una línea, no el párrafo entero: la columna mide 176 px y el motivo completo ocupaba seis
                renglones. Lo que hace falta aquí es el hecho —sale sola, y cuándo—; el resto está en el
                `title` y lo repite el servidor si alguien lo intenta igual. */}
            {queueStatusReason && (
              <p
                className="text-xs leading-snug text-zinc-500 dark:text-zinc-400"
                data-piece-queue-owns-status
                title={queueStatusReason}
              >
                Sale sola {publishMomentLabel(item) || 'a su hora'}: el pendiente «Publicar» se cierra solo.
              </p>
            )}
            {/* El cliente aprobó lo que tenía delante. Si lo que hay ahora es otra cosa, aquí se le
                devuelve la palabra sin fingir que nunca aprobó (Rodny, 5 de octubre de 2026). */}
            {pieceApproval === APPROVAL_STATES.APROBADA && canRequestRevision(item) && (
              <button
                type="button"
                onClick={() => onRequestRevision(item.id)}
                className="flex items-center gap-1.5 text-left text-xs font-semibold text-zinc-500 underline-offset-2 transition-colors hover:text-brand-magenta-deep hover:underline dark:text-zinc-400 dark:hover:text-brand-magenta"
                title="El cliente la ve otra vez en el portal, con lo que haya ahora"
              >
                <Sparkles className="h-3 w-3 shrink-0" /> Pedir nueva revisión
              </button>
            )}
            {pieceApproval === APPROVAL_STATES.MATERIAL_NUEVO && (
              <span className="flex items-center gap-1.5 text-xs font-semibold text-brand-magenta-deep dark:text-brand-magenta">
                <Sparkles className="h-3 w-3 shrink-0" /> El cliente la tiene por revisar
              </span>
            )}
          </div>

        </div>
      </div>

      {/* Escribir se queda con el ancho entero; el material baja (Rodny, 25 de septiembre de 2026) */}
      <div>
        <div className="grid min-w-0 grid-cols-1 gap-5 p-6 xl:grid-cols-2">
          <div className="flex min-w-0 flex-col gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <label htmlFor={`guion-${item.id}`} className={FIELD_LABEL}>Guion</label>
              {/* El cliente ve el guion en el portal desde el 30 de octubre de 2026: se escribe sabiendo que lo lee. */}
              <span className="inline-flex items-center gap-1.5 rounded-md bg-brand-cyan-soft px-2 py-0.5 text-xs font-bold text-brand-cyan-deep dark:bg-brand-cyan/15 dark:text-brand-cyan">
                <Eye className="h-3 w-3" /> Lo ve el cliente
              </span>
            </div>
            {isEditing ? (
              <AutoResizeTextarea
                id={`guion-${item.id}`}
                defaultValue={item.copyText}
                onBlur={(e) => {
                  if (e.target.value !== item.copyText) onUpdate({ id: item.id, copyText: e.target.value });
                }}
                placeholder="Escribe el guion aquí…"
                className="min-h-[260px] max-h-[320px] overflow-y-auto w-full rounded-xl border border-zinc-200 bg-white p-4 text-sm leading-relaxed outline-none transition focus:border-brand-cyan dark:border-white/10 dark:bg-zinc-900"
              />
            ) : (
              <div id={`guion-${item.id}`} className="min-h-[260px] max-h-[320px] min-w-0 overflow-x-hidden overflow-y-auto whitespace-pre-wrap [overflow-wrap:anywhere] rounded-xl bg-zinc-50 p-4 text-sm leading-relaxed text-zinc-700 dark:bg-white/5 dark:text-zinc-300">
                {item.copyText || <span className="italic text-zinc-400">Sin guion…</span>}
              </div>
            )}
          </div>

          <div className="flex min-w-0 flex-col gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <label htmlFor={`texto-${item.id}`} className={FIELD_LABEL}>Texto de la publicación</label>
              <span className="inline-flex items-center gap-1.5 rounded-md bg-brand-cyan-soft px-2 py-0.5 text-xs font-bold text-brand-cyan-deep dark:bg-brand-cyan/15 dark:text-brand-cyan">
                <Eye className="h-3 w-3" /> Lo ve el cliente
              </span>
            </div>
            {isEditing ? (
              <AutoResizeTextarea
                id={`texto-${item.id}`}
                defaultValue={item.captionText}
                onBlur={(e) => {
                  if (e.target.value !== item.captionText) onUpdate({ id: item.id, captionText: e.target.value });
                }}
                placeholder="Escribe el texto que se va a publicar…"
                className="min-h-[260px] max-h-[320px] overflow-y-auto w-full rounded-xl border-[1.5px] border-brand-cyan/30 bg-brand-cyan-soft/30 p-4 text-sm leading-relaxed outline-none transition focus:border-brand-cyan dark:bg-brand-cyan/5"
              />
            ) : (
              <div id={`texto-${item.id}`} className="min-h-[260px] max-h-[320px] min-w-0 overflow-x-hidden overflow-y-auto whitespace-pre-wrap [overflow-wrap:anywhere] rounded-xl border-[1.5px] border-brand-cyan/20 bg-brand-cyan-soft/30 p-4 text-sm leading-relaxed text-zinc-700 dark:bg-brand-cyan/5 dark:text-zinc-300">
                {item.captionText || <span className="italic text-zinc-400">Sin texto de publicación…</span>}
              </div>
            )}
          </div>
        </div>

        <section aria-label="Recursos de producción" className="grid min-w-0 grid-cols-1 items-start gap-5 border-t border-zinc-100 px-6 py-5 dark:border-white/5 md:grid-cols-2">
          <div className="flex min-w-0 flex-col gap-2">
            <span className={FIELD_LABEL}>Referencias</span>
            <MultiLinkInput
              values={item.mediaUrl}
              isEditing={isEditing}
              placeholder="Enlace de Drive o Pinterest"
              onChange={(links) => onUpdate({ id: item.id, mediaUrl: links })}
            />
          </div>

          <div className="flex min-w-0 flex-col gap-2">
            <span className={FIELD_LABEL}>Insumos</span>
            <MultiLinkInput
              values={item.assetsLinks}
              isEditing={isEditing}
              placeholder="Enlace de fotos, logos, etc."
              onChange={(links) => onUpdate({ id: item.id, assetsLinks: links })}
            />
          </div>
        </section>

        {/* La nota interna tiene su propia banda, a todo el ancho (Rodny, 25 de septiembre de 2026).
            Estaba metida en la franja de la ficha con alto fijo, así que una nota larga se salía por
            encima del resto de la tarjeta. Aquí crece hacia abajo y no empuja a nadie. */}
        <div className="border-t border-zinc-100 px-6 py-5 dark:border-white/5">
          <div className="rounded-r-xl border-l-[3px] border-brand-yellow bg-brand-yellow/[0.08] p-4 dark:bg-brand-yellow/[0.08]">
            <label htmlFor={`nota-${item.id}`} className="mb-2 block text-sm font-semibold text-zinc-700 dark:text-zinc-200">
              Nota interna
            </label>
            {isEditing ? (
              <AutoResizeTextarea
                id={`nota-${item.id}`}
                defaultValue={item.internalNotes}
                onBlur={(e) => {
                  if (e.target.value !== item.internalNotes) onUpdate({ id: item.id, internalNotes: e.target.value });
                }}
                placeholder="Instrucciones para el equipo…"
                className="min-h-[72px] max-h-[132px] w-full overflow-y-auto rounded-xl border border-zinc-200 bg-white p-3.5 text-sm leading-relaxed outline-none transition focus:border-brand-cyan dark:border-white/10 dark:bg-zinc-900"
              />
            ) : (
              <p className="max-h-[132px] overflow-y-auto whitespace-pre-wrap break-words text-sm leading-relaxed text-zinc-700 dark:text-zinc-300">
                {item.internalNotes || <span className="text-zinc-400">Sin notas internas.</span>}
              </p>
            )}
          </div>
        </div>

        <section aria-label="Entrega final" className={`grid min-w-0 grid-cols-1 items-start gap-6 border-t border-zinc-100 px-6 py-5 dark:border-white/5 ${acceptsCover ? 'md:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]' : ''}`}>
          <div className="flex min-w-0 flex-col gap-2.5">
            <span className={FIELD_LABEL}>Pieza final</span>

            {finalAssets.length > 0 && (
              <FinalAssetGrid
                item={item}
                finalAssets={finalAssets}
                isEditing={isEditing}
                onDelete={onFinalAssetDelete}
                isDeleting={isFinalAssetDeleting}
                onReorder={onFinalAssetReorder}
              />
            )}

            {/* La zona grande es el estado vacío. Con material ya cargado se encoge a una línea: un
                rectángulo enorme pesaba más que la propia pieza (Rodny, 25 de septiembre de 2026). */}
            {isEditing ? (
              <div className={`rounded-xl border border-dashed border-zinc-300 bg-white dark:border-white/15 dark:bg-zinc-900 ${
                finalAssets.length
                  ? 'flex flex-wrap items-center gap-x-3 gap-y-1.5 px-3 py-2.5'
                  : 'flex min-h-[144px] flex-col items-center justify-center gap-2.5 p-5 text-center'
              }`}>
                {isFinalAssetUploading
                  ? <Loader2 className="h-4 w-4 animate-spin text-zinc-400" />
                  : <UploadCloud className={finalAssets.length ? 'h-4 w-4 text-zinc-400' : 'h-5 w-5 text-zinc-400'} />}
                {/* Con material ya cargado no hace falta anunciar «añadir más»: el propio botón
                    dice «Añadir archivos» (Rodny, 25 de septiembre de 2026). */}
                {finalAssets.length === 0 && (
                  <span className="text-sm text-zinc-500 dark:text-zinc-400">Arrastra la pieza aquí</span>
                )}
                <div className={finalAssets.length ? 'flex items-center gap-2.5' : 'flex flex-col items-center gap-1'}>
                  <label className="cursor-pointer text-sm font-bold text-brand-cyan-deep hover:underline dark:text-brand-cyan">
                    Añadir archivos
                    <input
                      type="file"
                      multiple
                      accept="image/*,video/*"
                      className="hidden"
                      disabled={isFinalAssetUploading}
                      onChange={(event) => {
                        const files = Array.from(event.target.files || []);
                        if (files.length) onFinalAssetUpload(item.id, files);
                        event.target.value = '';
                      }}
                    />
                  </label>
                  {finalAssets.length > 0 && <span className="text-zinc-300 dark:text-zinc-600">·</span>}
                  <button
                    type="button"
                    onClick={() => onDriveLink(item.id)}
                    className="text-sm font-bold text-brand-cyan-deep hover:underline dark:text-brand-cyan"
                    title="Para un video que pesa demasiado para subirlo"
                  >
                    Enlace de Drive
                  </button>
                </div>
              </div>
            ) : finalAssets.length === 0 && (
              <p className="flex min-h-[144px] items-center justify-center rounded-xl border border-dashed border-zinc-200 p-4 text-sm text-zinc-400 dark:border-white/10">
                Sin pieza final cargada.
              </p>
            )}

            {directUploadPercent !== null && (
              <div className="space-y-1.5 pt-1" role="status" aria-live="polite">
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-zinc-200 dark:bg-white/10">
                  <div className="h-full rounded-full bg-brand-cyan transition-all" style={{ width: `${directUploadPercent}%` }} />
                </div>
                <p className="text-xs font-bold text-zinc-500 dark:text-zinc-400">
                  Subiendo al almacenamiento… {directUploadPercent}%
                </p>
              </div>
            )}
          </div>

          {/* La portada se prepara en cualquier orden y sigue siendo opcional al programar. */}
          {acceptsCover && (
            <CoverField
              item={item}
              isEditing={isEditing}
              onUpload={onCoverUpload}
              onRemove={onCoverRemove}
              isBusy={isCoverBusy}
            />
          )}
        </section>
      </div>

      <SocialPublishingPanel
        key={`${item.id}-${item.publishTime || ''}-${(item.socialPageIds || []).join('+')}-${(item.publications || []).map((row) => `${row.socialAccountId || row.platform}:${row.status}`).join(',')}`}
        item={item}
        accounts={socialAccounts}
        onSchedule={onSchedulePublication}
        onCancel={onCancelPublication}
        onRetry={onRetryPublication}
        onReopen={onReopenPublication}
        onChangePages={onChangeSocialPages}
        isBusy={isPublicationBusy}
        serverProblems={publicationProblems}
      />

      {item.comments && (
        <div className="border-t border-zinc-100 px-6 py-5 dark:border-white/5">
          <FeedbackHistory comments={item.comments} />
        </div>
      )}
    </div>
  );
};

const DispatchModal = ({ isOpen, onClose, onConfirm, isPending }) => {
  const [data, setData] = useState({
    assigneeId: '',
    dueDate: new Date().toISOString().split('T')[0],
    isPriority: false,
    isSpecial: false
  });

  const { data: team } = useQuery({
    queryKey: ['team-list'],
    queryFn: async () => {
      const response = await axios.get(`${getApiBaseUrl()}/api/team`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('authToken')}` }
      });
      return response.data;
    }
  });

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[425px] bg-white dark:bg-zinc-900 border-zinc-200 dark:border-white/10 shadow-2xl">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold flex items-center gap-2">
            <Send className="w-5 h-5 text-brand-cyan-deep dark:text-brand-cyan" />
            Despachar a Kanban
          </DialogTitle>
          <DialogDescription>
            Configura los detalles de ejecución para esta pieza.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <label className="text-xs font-medium text-zinc-500">Responsable</label>
            <Select
              value={data.assigneeId}
              onChange={(e) => setData({ ...data, assigneeId: e.target.value })}
              className="w-full h-11 px-4 rounded-xl bg-zinc-50 dark:bg-white/5 border border-zinc-200 dark:border-white/10 focus:ring-2 focus:ring-brand-cyan/20 outline-none transition-all text-sm"
            >
              <option value="">Sin asignar (Pendiente)</option>
              {team?.map(member => (
                <option key={member.id} value={member.id}>{member.name}</option>
              ))}
            </Select>
          </div>

          <div className="space-y-2">
            <label className="text-xs font-medium text-zinc-500">Fecha Límite</label>
            <DatePicker
              {...brainDatePickerProps}
              selected={data.dueDate ? new Date(`${data.dueDate}T12:00:00.000Z`) : null}
              onChange={(date) => setData({ ...data, dueDate: date ? date.toISOString().split('T')[0] : '' })}
              dateFormat="dd/MM/yyyy"
              className="w-full h-11 px-4 rounded-xl bg-zinc-50 dark:bg-white/5 border border-zinc-200 dark:border-white/10 focus:ring-2 focus:ring-brand-cyan/20 outline-none transition-all text-sm"
              wrapperClassName="w-full"
              placeholderText="Elegir fecha"
              isClearable
            />
          </div>

          <div className="flex items-center gap-6 pt-2">
            <label className="flex items-center gap-2 cursor-pointer group">
              <input
                type="checkbox"
                checked={data.isPriority}
                onChange={(e) => setData({ ...data, isPriority: e.target.checked })}
                className="w-4 h-4 rounded border-zinc-300 text-brand-cyan-deep dark:text-brand-cyan focus:ring-brand-cyan"
              />
              <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300 group-hover:text-brand-cyan-deep dark:group-hover:text-brand-cyan transition-colors">Prioridad</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer group">
              <input
                type="checkbox"
                checked={data.isSpecial}
                onChange={(e) => setData({ ...data, isSpecial: e.target.checked })}
                className="w-4 h-4 rounded border-zinc-300 text-brand-cyan-deep dark:text-brand-cyan focus:ring-brand-cyan"
              />
              <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300 group-hover:text-brand-cyan-deep dark:group-hover:text-brand-cyan transition-colors">Especial</span>
            </label>
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button
            variant="ghost"
            onClick={onClose}
          >
            Cancelar
          </Button>
          <Button
            onClick={() => onConfirm(data)}
            disabled={isPending}
            className="px-8"
          >
            {isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Check className="w-4 h-4 mr-2" />}
            Confirmar Despacho
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

const ContentPlanDetail = () => {
  const confirm = useConfirmDialog();
  const { planId, clientSlug, period } = useParams();
  const navigate = useNavigate();
  const navigateFrom = useNavigateFrom();
  const location = useLocation();
  const queryClient = useQueryClient();

  /**
   * Qué pieza está abierta lo dice **la URL**, y solo la URL (Rodny, 25 de septiembre de 2026).
   *
   * Antes convivían dos fuentes: un estado local y el `?item=` del enlace, y el estado ganaba. Al
   * abrir una parrilla desde Gestión por segunda vez —con otra pieza— seguía viéndose la que se había
   * elegido a mano, porque React Router no vuelve a montar la pantalla si solo cambia la consulta.
   * Con una sola fuente eso no puede pasar, y de paso el botón «atrás» del navegador funciona.
   */
  const linkedItemId = new URLSearchParams(location.search).get('item')
    || new URLSearchParams(location.search).get('itemId');

  // Abrir una parrilla desde Gestión tiene que **dejar la pieza delante**, no solo abrirla: encima de
  // ella van los objetivos, el panel de Bria y las notas, así que sin esto aterrizas arriba del todo y
  // hay que bajar a buscarla (Rodny, 25 de septiembre de 2026).
  const scrolledForRef = useRef(null);

  /**
   * Elegir en el carril **no mueve la página** (Rodny, 29 de septiembre de 2026: «quiero estabilidad,
   * que aparezca en el mismo lugar siempre»). Se marca la navegación como venida del carril para que
   * el desplazamiento de abajo la ignore: ese solo es para quien llega de fuera por un enlace.
   */
  const anclaRef = useRef(null);
  const reservaRef = useRef(null);

  const selectPiece = (itemId, { view } = {}) => {
    // Dónde está ahora la tarjeta en pantalla: ahí mismo tiene que aparecer la siguiente.
    const actual = document.querySelector('[id^="item-"]');
    anclaRef.current = actual ? actual.getBoundingClientRect().top : null;

    const params = new URLSearchParams(location.search);
    params.delete('itemId');
    if (itemId) params.set('item', itemId); else params.delete('item');
    if (view === 'editor') params.delete('view');
    navigate(
      { pathname: location.pathname, search: params.toString() },
      { replace: true, state: { ...location.state, desdeElCarril: true } }
    );
  };

  /**
   * La tarjeta aparece **en el mismo sitio**, mida lo que mida la pieza.
   *
   * Dos piezas pueden diferir mucho de alto (en pruebas, de 714 a 982 px). Devolverla a su sitio no
   * basta: si la pieza nueva es más corta, la página se acorta, el navegador recorta el scroll al
   * nuevo máximo y **ya no hay a dónde desplazarse**. Por eso se hacen las dos cosas y en este orden:
   *
   * 1. Se **reserva** el alto mayor visto en esta sesión, para que la página no encoja nunca.
   * 2. Se devuelve la tarjeta a los píxeles exactos donde estaba.
   *
   * `useLayoutEffect` corre antes de pintar, así que nada de esto se ve.
   */
  useLayoutEffect(() => {
    const node = document.querySelector('[id^="item-"]');
    const caja = reservaRef.current;

    if (node && caja) {
      const alto = Math.ceil(node.getBoundingClientRect().height);
      if (alto > (parseFloat(caja.style.minHeight) || 0)) caja.style.minHeight = `${alto}px`;
    }

    const objetivo = anclaRef.current;
    if (objetivo === null || !node) return;
    anclaRef.current = null;

    const delta = node.getBoundingClientRect().top - objetivo;
    if (Math.abs(delta) > 1) window.scrollBy(0, delta);
  });
  const [editingItemId, setEditingItemId] = useState(null);
  const [dispatchItemId, setDispatchItemId] = useState(null);
  const [showInternalNotes, setShowInternalNotes] = useState(false);
  const [newPlanInternalNote, setNewPlanInternalNote] = useState('');
  const [newlyCreatedItemId, setNewlyCreatedItemId] = useState(null);
  // `null` mientras no haya una subida directa en curso; un número entre 0 y 99 mientras la hay.
  const [directUploadPercent, setDirectUploadPercent] = useState(null);
  const [driveLinkItemId, setDriveLinkItemId] = useState(null);
  const planView = new URLSearchParams(location.search).get('view') === 'calendar' ? 'calendar' : 'editor';
  const setPlanView = view => {
    const params = new URLSearchParams(location.search);
    if (view === 'calendar') params.set('view', view); else params.delete('view');
    navigate({ pathname: location.pathname, search: params.toString() }, { replace: true, state: location.state });
  };

  // Parse period (month-year)
  const [monthName, year] = (period || '').split('-');

  const getMonthNumber = (name) => {
    const months = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
    const idx = months.indexOf(name.toLowerCase());
    return idx !== -1 ? idx + 1 : null;
  };

  const month = getMonthNumber(monthName);

  const { data: linkedLocation } = useQuery({
    queryKey: ['content-item-location', linkedItemId],
    enabled: Boolean(linkedItemId),
    retry: false,
    queryFn: async () => (await axios.get(`${getApiBaseUrl()}/api/content/items/${linkedItemId}/location`, {
      headers: { Authorization: `Bearer ${localStorage.getItem('authToken')}` }
    })).data
  });
  useEffect(() => {
    if (!linkedLocation) return;
    const same = planId ? linkedLocation.planId === planId : linkedLocation.plan.month === month
      && linkedLocation.plan.year === Number(year) && linkedLocation.plan.client.slug === clientSlug;
    if (same) return;
    const search = new URLSearchParams(location.search);
    search.set('item', linkedLocation.id); search.delete('itemId');
    navigate(`/parrillas/${linkedLocation.planId}?${search}`, { replace: true, state: location.state });
  }, [linkedLocation, planId, month, year, clientSlug, location.search, location.state, navigate]);

  // Queries
  const { data: plan, isLoading: planLoading } = useQuery({
    queryKey: ['content-plan', planId || `${clientSlug}-${period}`],
    queryFn: async () => {
      let url = `${getApiBaseUrl()}/api/content/plans/${planId}`;
      if (clientSlug && month && year) {
        url = `${getApiBaseUrl()}/api/content/plans/${clientSlug}/${month}-${year}`;
      }

      const response = await axios.get(url, {
        headers: { Authorization: `Bearer ${localStorage.getItem('authToken')}` }
      });
      return response.data;
    }
  });

  const { data: team } = useQuery({
    queryKey: ['team-list'],
    queryFn: async () => {
      const response = await axios.get(`${getApiBaseUrl()}/api/team`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('authToken')}` }
      });
      return response.data;
    }
  });

  // El resaltado por enlace directo ya no necesita efecto: `?item=` elige esa pieza al entrar y el
  // editor la abre. Antes esto buscaba el nodo con un `setTimeout`, le añadía clases al DOM a mano y
  // las quitaba tres segundos después; con una pieza a la vez no hay a dónde desplazarse.

  const currentPlanId = plan?.id || planId;
  usePageLabel(plan ? `Parrilla · ${plan.client?.name || 'Cliente'} · ${getContentPlanMonthName(plan.month)} ${plan.year}` : null);
  const planInternalNotes = parsePlanInternalNotes(plan?.internalNotes);

  // Mutations
  const updatePlanMutation = useMutation({
    mutationFn: async (data) => {
      await axios.patch(`${getApiBaseUrl()}/api/content/plans/${currentPlanId}`, data, {
        headers: { Authorization: `Bearer ${localStorage.getItem('authToken')}` }
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries(['content-plan', planId || `${clientSlug}-${period}`]);
      toast.success('Estado del plan actualizado');
    }
  });

  const generateShareTokenMutation = useMutation({
    mutationFn: async ({ rotate = false } = {}) => {
      const response = await axios.post(`${getApiBaseUrl()}/api/content/plans/${currentPlanId}/share-token`, { rotate }, {
        headers: { Authorization: `Bearer ${localStorage.getItem('authToken')}` }
      });
      return response.data;
    },
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries(['content-plan', planId || `${clientSlug}-${period}`]);
      const url = `${window.location.origin}/compartir/${data.shareToken}`;
      navigator.clipboard.writeText(url);
      toast.success(variables?.rotate ? 'Enlace nuevo copiado. El anterior ya no funciona.' : 'Enlace copiado');
    },
    onError: (error) => {
      console.error('Error sharing the plan:', error.response?.data || error);
      toast.error(error.response?.data?.error || 'No se pudo obtener el enlace');
    }
  });

  // Pedir el enlace **no** lo cambia: el cliente puede tenerlo guardado. El botón que lo rotaba se
  // quitó por decisión de Rodny (25 de septiembre de 2026); `rotate` sigue existiendo en el servicio
  // y en la ruta como salida de emergencia, pero ninguna pantalla lo ofrece.

  // El cliente aprobó el texto; el material llegó después. Una pieza a la que le cargamos la pieza
  // final ya se marca sola, pero esto cubre el resto: las que aprobó antes de que existiera la regla
  // y las que cambiaron por otro motivo (Rodny, 5 de octubre de 2026).
  const requestRevisionMutation = useMutation({
    mutationFn: async () => {
      const response = await axios.post(`${getApiBaseUrl()}/api/content/plans/${currentPlanId}/request-revision`, {}, {
        headers: { Authorization: `Bearer ${localStorage.getItem('authToken')}` }
      });
      return response.data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries(['content-plan', planId || `${clientSlug}-${period}`]);
      toast.success(data?.requested === 1
        ? 'Una pieza vuelve a quedar por revisar para el cliente'
        : `${data?.requested || 0} piezas vuelven a quedar por revisar para el cliente`);
    },
    onError: (error) => {
      console.error('Error requesting a new revision:', error.response?.data || error);
      toast.error(error.response?.data?.error || 'No se pudo pedir la revisión');
    }
  });

  const requestItemRevisionMutation = useMutation({
    mutationFn: async (itemId) => {
      const response = await axios.post(`${getApiBaseUrl()}/api/content/items/${itemId}/request-revision`, {}, {
        headers: { Authorization: `Bearer ${localStorage.getItem('authToken')}` }
      });
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries(['content-plan', planId || `${clientSlug}-${period}`]);
      toast.success('El cliente la verá otra vez en el portal');
    },
    onError: (error) => {
      console.error('Error requesting a new revision:', error.response?.data || error);
      toast.error(error.response?.data?.error || 'No se pudo pedir la revisión');
    }
  });

  const createItemMutation = useMutation({
    mutationFn: async (data) => {
      const response = await axios.post(`${getApiBaseUrl()}/api/content/items`, { ...data, planId: currentPlanId }, {
        headers: { Authorization: `Bearer ${localStorage.getItem('authToken')}` }
      });
      return response.data;
    },
    onSuccess: (newItem) => {
      queryClient.invalidateQueries(['content-plan', planId || `${clientSlug}-${period}`]);
      setNewlyCreatedItemId(newItem.id);
      setEditingItemId(newItem.id);
      if (newItem.periodTransfer) {
        queryClient.invalidateQueries({ queryKey: ['content-plans'] });
        navigate(`/parrillas/${newItem.planId}?item=${newItem.id}`, { replace: true, state: location.state });
        toast.success('Pieza creada en la parrilla de su fecha de publicación');
        return;
      }
      selectPiece(newItem.id);
      toast.success('Nueva pieza añadida');
    }
  });

  const updateItemMutation = useMutation({
    mutationFn: async ({ id, ...data }) => {
      const response = await axios.patch(`${getApiBaseUrl()}/api/content/items/${id}`, { ...data, expectedPlanId: currentPlanId }, {
        headers: { Authorization: `Bearer ${localStorage.getItem('authToken')}` }
      });
      return response.data;
    },
    onSuccess: (item, variables) => {
      if (variables?.id === newlyCreatedItemId && Object.prototype.hasOwnProperty.call(variables, 'publishDate')) {
        setNewlyCreatedItemId(null);
      }
      queryClient.invalidateQueries(['content-plan', planId || `${clientSlug}-${period}`]);
      if (item?.periodTransfer) {
        queryClient.setQueryData(['content-item-location', item.id], { id: item.id, planId: item.planId,
          plan: { ...item.periodTransfer.toPlan, client: { slug: plan?.client?.slug || clientSlug } } });
        for (const key of ['content-plan', 'content-plans', 'nativeTasks', 'task', 'dashboardMetrics', 'client-operations']) {
          queryClient.invalidateQueries({ queryKey: [key] });
        }
        const target = item.periodTransfer.toPlan;
        toast.success(
          `Pieza trasladada a ${getContentPlanMonthName(target.month)} de ${target.year}. ${item.periodTransfer.destinationCreated ? 'Se creó una nueva parrilla para este período.' : 'Se utilizó la parrilla existente de este período.'}`,
          { duration: 8000, style: { whiteSpace: 'normal' } }
        );
        const search = new URLSearchParams(location.search);
        search.set('item', item.id); search.delete('itemId');
        navigate(`/parrillas/${target.id}?${search}`, { replace: true, state: location.state });
      }
    },
    onError: (error) => {
      toast.error(error.response?.data?.error || 'No se pudo actualizar la pieza. Se conserva su ubicación anterior.');
      queryClient.invalidateQueries({ queryKey: ['content-item-location'] });
      queryClient.invalidateQueries({ queryKey: ['content-plan'] });
    }
  });

  const finalAssetUploadMutation = useMutation({
    mutationFn: ({ itemId, files }) => uploadFinalPiece(itemId, files, { onProgress: setDirectUploadPercent }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['content-plan'] });
      toast.success('Archivos finales cargados');
    },
    onError: (error) => {
      console.error('Error uploading final content asset:', error.response?.data || error);
      toast.error(error.response?.data?.error || 'Error al cargar la pieza final');
    },
    onSettled: () => setDirectUploadPercent(null)
  });

  const driveAssetMutation = useMutation({
    mutationFn: async ({ itemId, url, name }) => {
      const response = await axios.post(
        `${getApiBaseUrl()}/api/content/items/${itemId}/final-assets/drive`,
        { url, name }
      );
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries(['content-plan', planId || `${clientSlug}-${period}`]);
      setDriveLinkItemId(null);
      toast.success('Enlace de Drive añadido');
    },
    onError: (error) => {
      console.error('Error adding a Drive final asset:', error.response?.data || error);
      toast.error(error.response?.data?.error || 'No se pudo añadir el enlace');
    }
  });

  // La portada de un reel. El aviso de éxito va después de la respuesta del servidor, como todo aquí.
  const coverMutation = useMutation({
    mutationFn: async ({ itemId, file }) => {
      const data = new FormData();
      data.append('file', file);
      return (await axios.post(`${getApiBaseUrl()}/api/content/items/${itemId}/cover`, data, {
        headers: { Authorization: `Bearer ${localStorage.getItem('authToken')}`, 'Content-Type': 'multipart/form-data' }
      })).data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries(['content-plan', planId || `${clientSlug}-${period}`]);
      toast.success('Portada guardada');
    },
    onError: (error) => {
      console.error('Error uploading the cover:', error.response?.data || error);
      toast.error(error.response?.data?.error || 'No se pudo guardar la portada');
    }
  });

  const coverRemoveMutation = useMutation({
    mutationFn: async (itemId) => (await axios.delete(`${getApiBaseUrl()}/api/content/items/${itemId}/cover`, {
      headers: { Authorization: `Bearer ${localStorage.getItem('authToken')}` }
    })).data,
    onSuccess: () => {
      queryClient.invalidateQueries(['content-plan', planId || `${clientSlug}-${period}`]);
      toast.success('Portada quitada');
    },
    onError: (error) => {
      console.error('Error removing the cover:', error.response?.data || error);
      toast.error(error.response?.data?.error || 'No se pudo quitar la portada');
    }
  });

  const finalAssetDeleteMutation = useMutation({
    mutationFn: async ({ itemId, assetId }) => {
      const response = await axios.delete(`${getApiBaseUrl()}/api/content/items/${itemId}/final-assets/${assetId}`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('authToken')}` }
      });
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries(['content-plan', planId || `${clientSlug}-${period}`]);
      toast.success('Pieza final eliminada');
    },
    onError: (error) => {
      console.error('Error deleting final content asset:', error.response?.data || error);
      toast.error(error.response?.data?.error || 'Error al eliminar la pieza final');
    }
  });

  // La miniatura soltada se queda en su sitio nuevo, atenuada, mientras esto guarda. Se devuelve la
  // promesa de la recarga para que la espera dure hasta que la parrilla trae el orden del servidor:
  // si terminara antes, las miniaturas saltarían un instante a su sitio viejo.
  const finalAssetOrderMutation = useMutation({
    mutationFn: async ({ itemId, order }) => (await axios.put(`${getApiBaseUrl()}/api/content/items/${itemId}/final-assets/order`, { order }, {
      headers: { Authorization: `Bearer ${localStorage.getItem('authToken')}` }
    })).data,
    onSuccess: () => queryClient.invalidateQueries(['content-plan', planId || `${clientSlug}-${period}`]),
    onError: (error) => {
      console.error('Error reordering final assets:', error.response?.data || error);
      toast.error(error.response?.data?.error || 'No se pudo guardar el orden');
    }
  });

  const deleteItemMutation = useMutation({
    mutationFn: async (id) => {
      await axios.delete(`${getApiBaseUrl()}/api/content/items/${id}`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('authToken')}` }
      });
    },
    onSuccess: () => {
      for (const key of ['content-plan', 'nativeTasks', 'dashboardMetrics', 'client-operations', 'drive']) queryClient.invalidateQueries({ queryKey: [key] });
      toast.success('Pieza eliminada');
    },
    onError: error => {
      console.error('[Parrilla] No se pudo eliminar la pieza:', error.response?.data || error.message);
      toast.error(error.response?.data?.error || 'No pudimos eliminar la pieza.');
    },
  });

  const sendToKanbanMutation = useMutation({
    mutationFn: async ({ id, executionData }) => {
      const response = await axios.post(`${getApiBaseUrl()}/api/content/items/${id}/send-to-kanban`, executionData, {
        headers: { Authorization: `Bearer ${localStorage.getItem('authToken')}` }
      });
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries(['content-plan', planId || `${clientSlug}-${period}`]);
      setDispatchItemId(null);
      toast.success('¡Enviado a producción con éxito!');
    },
    onError: (error) => {
      toast.error(error.response?.data?.error || 'Error al despachar');
    }
  });

  // Publicación en redes: el servidor vuelve a comprobar todo y, si algo impide programar, contesta 422
  // con la lista de motivos, que se enseña bajo el panel en vez de un código (Rodny, 29 de septiembre de 2026).
  const [publicationProblems, setPublicationProblems] = useState([]);
  const invalidatePlan = () => queryClient.invalidateQueries(['content-plan', planId || `${clientSlug}-${period}`]);
  const publicationError = (error, fallback) => {
    console.error('[SocialPublishing]', error.response?.data || error.message || error);
    const data = error.response?.data || {};
    if (Array.isArray(data.problems) && data.problems.length) setPublicationProblems(data.problems);
    toast.error(data.error || fallback);
  };
  // Se programa por cuenta, no por red: un cliente puede tener varias cuentas (Rodny, 2 de octubre de 2026).
  const schedulePublicationMutation = useMutation({
    mutationFn: async ({ itemId, accountIds }) => (await axios.post(`${getApiBaseUrl()}/api/social/publications`, { itemId, accountIds }, {
      headers: { Authorization: `Bearer ${localStorage.getItem('authToken')}` }
    })).data,
    onSuccess: (rows) => {
      setPublicationProblems([]);
      invalidatePlan();
      // «Perfiles» y no «cuentas»: una cuenta es una página con su Instagram, y aquí se cuentan los dos.
      toast.success(rows.length > 1 ? `Publicación programada en ${rows.length} perfiles` : 'Publicación programada');
    },
    onError: (error) => publicationError(error, 'No se pudo programar la publicación')
  });
  // A qué cuentas va la pieza. El servidor cancela lo programado en las que deja; la banda lo muestra
  // cuando la parrilla se recarga, no antes.
  const socialPagesMutation = useMutation({
    mutationFn: async ({ itemId, pageIds }) => (await axios.put(`${getApiBaseUrl()}/api/social/items/${itemId}/pages`, { pageIds }, {
      headers: { Authorization: `Bearer ${localStorage.getItem('authToken')}` }
    })).data,
    onSuccess: () => { setPublicationProblems([]); invalidatePlan(); },
    onError: (error) => publicationError(error, 'No se pudo cambiar la cuenta de la pieza')
  });
  const cancelPublicationMutation = useMutation({
    mutationFn: async (publicationId) => (await axios.delete(`${getApiBaseUrl()}/api/social/publications/${publicationId}`, {
      headers: { Authorization: `Bearer ${localStorage.getItem('authToken')}` }
    })).data,
    onSuccess: () => { invalidatePlan(); toast.success('Publicación cancelada'); },
    onError: (error) => publicationError(error, 'No se pudo cancelar la publicación')
  });
  const retryPublicationMutation = useMutation({
    mutationFn: async (publicationId) => (await axios.post(`${getApiBaseUrl()}/api/social/publications/${publicationId}/retry`, {}, {
      headers: { Authorization: `Bearer ${localStorage.getItem('authToken')}` }
    })).data,
    onSuccess: () => { invalidatePlan(); toast.success('Se volverá a intentar en un momento'); },
    onError: (error) => publicationError(error, 'No se pudo reintentar la publicación')
  });
  const reopenPublicationMutation = useMutation({
    mutationFn: async (publicationId) => (await axios.post(`${getApiBaseUrl()}/api/social/publications/${publicationId}/reopen`, {}, {
      headers: { Authorization: `Bearer ${localStorage.getItem('authToken')}` }
    })).data,
    onSuccess: () => { setPublicationProblems([]); invalidatePlan(); toast.success('Lista para programar de nuevo'); },
    onError: (error) => publicationError(error, 'No se pudo reabrir la publicación')
  });
  // La plataforma no sabe si la publicación anterior sigue en la red: si sigue, volver a publicar la
  // duplica. Se dice antes, y reabrir no manda nada: solo deja la red lista para «Programar».
  const handleReopenPublication = async (publicationId, platform) => {
    const network = platform === 'FACEBOOK' ? 'Facebook' : 'Instagram';
    const accepted = await confirm({
      title: `Publicar de nuevo en ${network}`,
      description: `Esta pieza ya salió en ${network}. Si la publicación anterior sigue en la cuenta, quedará duplicada: bórrala primero en ${network}. Al continuar no se publica nada todavía; la red queda lista para que elijas la hora y pulses «Programar».`,
      confirmLabel: 'Continuar'
    });
    if (accepted) reopenPublicationMutation.mutate(publicationId);
  };

  const handleAddItem = () => {
    createItemMutation.mutate({
      objective: 'Nuevo Objetivo',
      format: 'Reel',
      copyText: '',
      captionText: '',
      publishDate: new Date(),
      status: 'BORRADOR'
    });
  };

  const handleAddPlanInternalNote = () => {
    const note = newPlanInternalNote.trim();
    if (!note) return;

    updatePlanMutation.mutate({
      internalNotes: serializePlanInternalNotes([...planInternalNotes, note])
    });
    setNewPlanInternalNote('');
  };

  const handleFinalAssetUpload = (itemId, files) => {
    // Avisar antes de gastar la subida: el servidor vuelve a comprobarlo, pero el peso ya se sabe aquí.
    // Y el peso decide el camino: lo que cabe por el servidor sigue yendo por donde siempre funcionó.
    const { problem, mode } = planFinalAssetUpload(files);
    if (problem) {
      toast.error(problem);
      return;
    }
    if (mode === 'direct') setDirectUploadPercent(0);
    finalAssetUploadMutation.mutate({ itemId, files, mode });
  };

  const handleFinalAssetDelete = (itemId, assetId) => {
    finalAssetDeleteMutation.mutate({ itemId, assetId });
  };

  const handleDeleteItem = async (itemId) => {
    const accepted = await confirm({
      title: 'Eliminar pieza',
      description: 'La pieza se eliminará permanentemente de esta parrilla.',
      confirmLabel: 'Eliminar'
    });
    if (accepted) deleteItemMutation.mutate(itemId);
  };

  const handleRemovePlanInternalNote = (indexToRemove) => {
    updatePlanMutation.mutate({
      internalNotes: serializePlanInternalNotes(planInternalNotes.filter((_, index) => index !== indexToRemove))
    });
  };

  /**
   * Deja la pieza del enlace delante de quien llega.
   *
   * Va aquí, antes de los returns tempranos, porque un hook no puede vivir detrás de un `return`
   * condicional; busca la tarjeta por su `id` en vez de depender de `selectedItem`, que se calcula
   * más abajo. Una vez por pieza (`scrolledForRef`): si no, cada refetch volvería a mover la página
   * bajo los pies de quien está escribiendo. Y si la tarjeta ya se ve, no se toca el scroll.
   */
  useEffect(() => {
    if (!linkedItemId || !plan) return undefined;
    if (scrolledForRef.current === linkedItemId) return undefined;

    const node = document.getElementById(`item-${linkedItemId}`);
    if (!node) return undefined; // todavía no está pintada; al siguiente render sí

    scrolledForRef.current = linkedItemId;
    // Cambiar de pieza en el carril no es «llegar»: la página se queda donde está.
    if (location.state?.desdeElCarril) return undefined;
    const { top } = node.getBoundingClientRect();
    if (top >= 0 && top < window.innerHeight * 0.6) return undefined; // ya se ve: no se toca nada

    // El header de la aplicación es fijo y translúcido (`h-16 fixed`), así que alinear la tarjeta con
    // el borde de la ventana la mete **debajo** de él: se resta su alto, medido en vivo.
    const header = document.querySelector('header');
    const margen = (header && getComputedStyle(header).position === 'fixed'
      ? header.getBoundingClientRect().height
      : 0) + 24;

    const alinear = () => {
      const delta = node.getBoundingClientRect().top - margen;
      if (Math.abs(delta) > 4) window.scrollBy(0, delta);
    };

    let raf = 0;
    let cancelado = false;
    const soltar = () => { cancelado = true; };

    alinear();

    /**
     * Un solo salto no basta: lo que hay **encima** —el panel de Bria, los textos que se auto-ajustan—
     * termina de asentarse después, cambia de alto y se lleva la tarjeta consigo; por eso aterrizaba
     * cortada por arriba (Rodny, 25 de septiembre de 2026: «me deja muy abajo»). Se recoloca durante
     * un segundo y medio, y se suelta en cuanto la persona interactúa: mandar ella, no nosotros.
     */
    const hasta = Date.now() + 1500;
    const seguir = () => {
      if (cancelado || Date.now() > hasta) return;
      alinear();
      raf = requestAnimationFrame(seguir);
    };
    raf = requestAnimationFrame(seguir);

    window.addEventListener('wheel', soltar, { passive: true, once: true });
    window.addEventListener('touchstart', soltar, { passive: true, once: true });
    window.addEventListener('keydown', soltar, { once: true });
    // Un clic puede volver a la cabecera y abrir un menú. No arrastrarlo fuera de la pantalla.
    window.addEventListener('pointerdown', soltar, { passive: true, once: true, capture: true });

    return () => {
      cancelado = true;
      cancelAnimationFrame(raf);
      window.removeEventListener('wheel', soltar);
      window.removeEventListener('touchstart', soltar);
      window.removeEventListener('keydown', soltar);
      window.removeEventListener('pointerdown', soltar, true);
    };
  }, [linkedItemId, plan, planView, location.state?.desdeElCarril]);

  if (planLoading) {
    return (
      <div className="flex flex-col items-center justify-center p-20 gap-4">
        <Loader2 className="w-10 h-10 text-brand-cyan-deep dark:text-brand-cyan animate-spin" />
        <p className="text-zinc-500">Cargando detalles de la parrilla...</p>
      </div>
    );
  }

  if (!plan) return <div className="p-20 text-center">Plan no encontrado.</div>;

  const orderedPlanItems = newlyCreatedItemId
    ? [
        ...(plan.items || []).filter(item => item.id === newlyCreatedItemId),
        ...(plan.items || []).filter(item => item.id !== newlyCreatedItemId)
      ]
    : (plan.items || []);

  // Si el enlace no nombra ninguna pieza, o nombra una que ya no está, se abre la primera.
  const selectedItem = orderedPlanItems.find(item => item.id === linkedItemId)
    || orderedPlanItems[0]
    || null;

  // Las que el cliente ya aprobó y todavía no le hemos devuelto para que mire el material.
  const piecesToReview = itemsNeedingRevisionRequest(plan.items || []);

  return (
    <div className="space-y-8 pb-20 animate-in fade-in duration-500">
      <PageHeader
        title={`${getContentPlanMonthName(plan.month)} ${plan.year}`}
        subtitle="Planificación estratégica de contenidos digitales."

        breadcrumbs={[
          { label: 'Parrillas', href: '/parrillas' },
          { label: plan.client?.name || 'Cliente' },
        ]}
      >
        <div className="flex flex-wrap items-start gap-3 w-full sm:w-auto">
          <PlanPeriodSelector plan={plan} disabled={Boolean(editingItemId || finalAssetUploadMutation.isPending || driveAssetMutation.isPending)} />
            <Select
              aria-label="Estado de la parrilla"
              value={plan.status}
              onChange={(e) => updatePlanMutation.mutate({ status: e.target.value })}
              className="h-11 w-auto min-w-40 rounded-xl border border-zinc-200 bg-white px-3 text-sm font-semibold text-zinc-900 dark:border-white/5 dark:bg-zinc-900 dark:text-zinc-100"
            >
              <option value="PLANIFICACION">Planificación</option>
              <option value="EN_APROBACION">En Aprobación</option>
              <option value="ACTIVO">Activo</option>
              <option value="FINALIZADO">Finalizado</option>
            </Select>

            <button
              type="button"
              aria-label="Compartir parrilla"
              onClick={() => generateShareTokenMutation.mutate({ rotate: false })}
              disabled={generateShareTokenMutation.isPending}
              className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-zinc-200 bg-white text-zinc-500 transition-colors hover:text-brand-cyan-deep focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-cyan/30 disabled:opacity-50 dark:border-white/5 dark:bg-zinc-900 dark:hover:text-brand-cyan"
              title={plan.shareToken ? 'Copiar el enlace de esta parrilla' : 'Crear el enlace para el cliente'}
            >
              {generateShareTokenMutation.isPending ? <Loader2 className="w-5 h-5 animate-spin" /> : <Share className="w-5 h-5" />}
            </button>

            {/* Solo aparece si hay algo que pedir: con todas las piezas ya en manos del cliente, un
                botón que no hace nada sobra. */}
            {piecesToReview.length > 0 && (
                <button
                  onClick={() => requestRevisionMutation.mutate()}
                  disabled={requestRevisionMutation.isPending}
                  className="inline-flex h-11 items-center justify-center gap-2 whitespace-nowrap rounded-xl border border-zinc-200 bg-white px-3 text-sm font-semibold text-zinc-500 transition-colors hover:text-brand-magenta-deep dark:border-white/5 dark:bg-zinc-900 dark:hover:text-brand-magenta"
                  title={`Devolver al cliente ${piecesToReview.length} pieza(s) que ya había aprobado, para que revise el material`}
                >
                  {requestRevisionMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
                  Pedir revisión ({piecesToReview.length})
                </button>
            )}

          <Button
            size="lg"
            onClick={handleAddItem}
            className="w-full sm:w-auto"
          >
            <Plus className="w-4 h-4 mr-2" />
            Añadir Contenido
          </Button>
        </div>
      </PageHeader>

      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 px-1">
          <div className="flex min-w-0 items-center gap-2" data-plan-owner>
            <TeamAvatar member={team?.find(member => member.id === plan.ownerId) || plan.owner || null} size={28} className="h-7 w-7" />
            <Select
              aria-label="Responsable de la parrilla"
              value={plan.ownerId || ''}
              onChange={(e) => updatePlanMutation.mutate({ ownerId: e.target.value || null })}
              className="cursor-pointer border-none bg-transparent pl-0 pr-7 text-sm font-medium text-zinc-500 transition-colors hover:text-brand-cyan-deep focus:ring-0 dark:text-zinc-400 dark:hover:text-brand-cyan"
            >
              <option value="">Sin responsable (CM)</option>
              {team?.map(member => (
                <option key={member.id} value={member.id}>{member.name}</option>
              ))}
            </Select>
          </div>
      </div>

      {/* Cliente suspendido por cartera (30 de octubre de 2026): se dice arriba, antes de que alguien escriba media
          parrilla, porque el servidor rechaza cada guardado con esta misma frase. */}
      {plan.suspendedReason && (
        <div role="alert" data-plan-suspended
          className="rounded-3xl border border-destructive/40 bg-destructive/10 p-4 text-sm text-zinc-800 dark:text-zinc-100">
          <p className="font-semibold">Esta parrilla está congelada</p>
          <p className="mt-1">{plan.suspendedReason}</p>
        </div>
      )}

      <div className="bg-white/60 dark:bg-zinc-900/40 border border-zinc-200/60 dark:border-white/5 rounded-3xl p-6">
        <div className="flex items-start gap-3 mb-5">
          <div className="p-2 bg-brand-cyan/10 dark:bg-brand-cyan/15 text-brand-cyan-deep dark:text-brand-cyan rounded-xl">
            <Table2 className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-zinc-900 dark:text-white">Objetivos estratégicos</h3>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">Visible para el cliente en el portal de revisión.</p>
          </div>
        </div>

        <AutoResizeTextarea
          defaultValue={plan.strategicObjectives}
          onBlur={(e) => {
            if (e.target.value !== (plan.strategicObjectives || '')) {
              updatePlanMutation.mutate({ strategicObjectives: e.target.value });
            }
          }}
          placeholder="Escribe los objetivos estratégicos del mes..."
          className="w-full min-h-[116px] bg-zinc-50/80 dark:bg-white/5 border border-zinc-200/70 dark:border-white/10 rounded-2xl p-4 text-sm text-zinc-800 dark:text-zinc-200 focus:ring-4 focus:ring-brand-cyan/10 outline-none transition-all"
        />
      </div>

      {/* Abrir una pieza desde un hallazgo es lo mismo que abrirla desde el
          calendario: seleccionarla y volver al editor. Se suelta `scrolledForRef`
          para que la página baje hasta ella aunque ya estuviera elegida. */}
      <BriaContentPlanReview
        planId={currentPlanId}
        planUpdatedAt={plan.updatedAt}
        onOpenItem={(id) => { scrolledForRef.current = null; selectPiece(id, { view: 'editor' }); }}
      />

      {/* Internal Notes Panel */}
      <div className="bg-white/40 dark:bg-zinc-900/30 border border-zinc-200/60 dark:border-white/5 rounded-3xl overflow-hidden">
        <button
          onClick={() => setShowInternalNotes(!showInternalNotes)}
          className="w-full flex items-center justify-between p-6 hover:bg-zinc-50 dark:hover:bg-white/5 transition-colors"
        >
          <div className="flex items-center gap-3">
            <div className="p-2 bg-brand-cyan/10 dark:bg-brand-cyan/15 text-brand-cyan-deep dark:text-brand-cyan rounded-xl">
              <StickyNote className="w-5 h-5" />
            </div>
            <div className="text-left">
              <h3 className="text-sm font-semibold text-zinc-900 dark:text-white">Notas internas</h3>
              <p className="text-xs text-zinc-500 font-medium">Solo visible para el equipo interno</p>
            </div>
          </div>
          {showInternalNotes ? <ChevronUp className="w-5 h-5 text-zinc-400" /> : <Plus className="w-5 h-5 text-zinc-400" />}
        </button>

        {showInternalNotes && (
          <div className="px-6 pb-6 space-y-4 animate-in slide-in-from-top-2 duration-300">
            {planInternalNotes.length > 0 && (
              <div className="space-y-2">
                {planInternalNotes.map((note, index) => (
                  <div
                    key={`${note}-${index}`}
                    className="group flex items-start gap-3 rounded-2xl border border-zinc-200/70 dark:border-white/10 bg-zinc-50/70 dark:bg-white/5 p-4"
                  >
                    <span className="mt-0.5 text-xs font-semibold text-brand-cyan-deep dark:text-brand-cyan">#{index + 1}</span>
                    <p className="flex-1 whitespace-pre-wrap text-sm leading-relaxed text-zinc-700 dark:text-zinc-300">{note}</p>
                    <button
                      type="button"
                      onClick={() => handleRemovePlanInternalNote(index)}
                      className="brain-danger-button-icon rounded-lg p-1.5 opacity-0 group-hover:opacity-100"
                      aria-label="Eliminar nota interna"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            <div className="flex flex-col sm:flex-row gap-3">
              <input
                value={newPlanInternalNote}
                onChange={(e) => setNewPlanInternalNote(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleAddPlanInternalNote();
                }}
                placeholder="Añade una nota interna..."
                className="flex-1 min-h-[46px] bg-zinc-50/80 dark:bg-white/5 border border-zinc-200/70 dark:border-white/10 rounded-2xl px-4 py-3 text-sm text-zinc-800 dark:text-zinc-200 focus:ring-4 focus:ring-brand-cyan/10 outline-none transition-all"
              />
              <Button type="button" onClick={handleAddPlanInternalNote} className="sm:w-auto">
                <Plus className="w-4 h-4 mr-2" />
                Añadir
              </Button>
            </div>

          </div>
        )}
      </div>

      {/* El mes a la izquierda, la pieza elegida a la derecha; o el mes como calendario. */}
      <div className="space-y-6">
        {orderedPlanItems.length > 0 && (
          <div className="flex items-center gap-1 rounded-xl border border-zinc-200 bg-white p-1 w-fit dark:border-white/10 dark:bg-zinc-900">
            {[
              { key: 'editor', label: 'Editor' },
              { key: 'calendar', label: 'Calendario' }
            ].map(option => (
              <button
                key={option.key}
                type="button"
                onClick={() => setPlanView(option.key)}
                aria-pressed={planView === option.key}
                className={`rounded-lg px-4 py-2 text-xs font-bold transition ${
                  planView === option.key
                    ? 'bg-brand-cyan/10 text-brand-cyan-deep dark:bg-brand-cyan/15 dark:text-brand-cyan'
                    : 'text-zinc-500 hover:bg-zinc-50 dark:text-zinc-400 dark:hover:bg-white/5'
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
        )}

        {orderedPlanItems.length > 0 && planView === 'calendar' ? (
          <PlanCalendar
            items={orderedPlanItems}
            year={Number(plan.year)}
            month={Number(plan.month)}
            onOpenPiece={(id) => selectPiece(id, { view: 'editor' })}
            onAdd={handleAddItem}
            accounts={plan?.client?.socialAccounts || []}
          />
        ) : orderedPlanItems.length > 0 ? (
          <div className="grid grid-cols-1 gap-5 lg:grid-cols-[312px_minmax(0,1fr)] lg:items-start">
            <div className="lg:sticky lg:top-24">
              <PlanPieceRail
                items={orderedPlanItems}
                selectedId={selectedItem?.id}
                onSelect={selectPiece}
                onAdd={handleAddItem}
                accounts={plan?.client?.socialAccounts || []}
              />
            </div>

            {/* Reserva el alto de la pieza más alta vista: así la página no encoge al cambiar. */}
            <div ref={reservaRef} className="min-w-0">
              {selectedItem && (
              <ContentItemCard
                key={selectedItem.id}
                item={selectedItem}
                shareToken={plan.shareToken}
                index={orderedPlanItems.indexOf(selectedItem)}
                isEditing={editingItemId === selectedItem.id}
                onEditToggle={() => setEditingItemId(editingItemId === selectedItem.id ? null : selectedItem.id)}
                onUpdate={updateItemMutation.mutate}
                onDelete={handleDeleteItem}
                onRequestRevision={(itemId) => requestItemRevisionMutation.mutate(itemId)}
                onDispatch={() => setDispatchItemId(selectedItem.id)}
                navigate={navigateFrom}
                onFinalAssetUpload={handleFinalAssetUpload}
                onFinalAssetDelete={handleFinalAssetDelete}
                isFinalAssetUploading={finalAssetUploadMutation.isPending}
                isFinalAssetDeleting={finalAssetDeleteMutation.isPending}
                onFinalAssetReorder={(itemId, order) => finalAssetOrderMutation.mutateAsync({ itemId, order })}
                onCoverUpload={(itemId, file) => coverMutation.mutate({ itemId, file })}
                onCoverRemove={(itemId) => coverRemoveMutation.mutate(itemId)}
                isCoverBusy={coverMutation.isPending || coverRemoveMutation.isPending}
                onDriveLink={setDriveLinkItemId}
                directUploadPercent={finalAssetUploadMutation.variables?.itemId === selectedItem.id ? directUploadPercent : null}
                socialAccounts={plan?.client?.socialAccounts || []}
                onSchedulePublication={(itemId, accountIds) => schedulePublicationMutation.mutate({ itemId, accountIds })}
                onChangeSocialPages={(itemId, pageIds) => socialPagesMutation.mutate({ itemId, pageIds })}
                onCancelPublication={(publicationId) => cancelPublicationMutation.mutate(publicationId)}
                onRetryPublication={(publicationId) => retryPublicationMutation.mutate(publicationId)}
                onReopenPublication={handleReopenPublication}
                isPublicationBusy={schedulePublicationMutation.isPending || cancelPublicationMutation.isPending || retryPublicationMutation.isPending || reopenPublicationMutation.isPending || socialPagesMutation.isPending}
                publicationProblems={publicationProblems}
              />
              )}
            </div>
          </div>
        ) : (
          <div className="p-20 text-center bg-zinc-50/50 dark:bg-white/5 border border-dashed border-zinc-200 dark:border-white/10 rounded-[3rem]">
            <div className="w-16 h-16 bg-zinc-100 dark:bg-white/5 rounded-full flex items-center justify-center mx-auto mb-4">
              <LayoutGrid className="w-8 h-8 text-zinc-300 dark:text-zinc-600" />
            </div>
            <h3 className="text-lg font-bold text-zinc-900 dark:text-white mb-2">Parrilla Vacía</h3>
            <p className="text-zinc-500 max-w-xs mx-auto text-sm leading-relaxed mb-6">
              Empieza a planificar tu contenido añadiendo la primera pieza.
            </p>
            <Button
              size="lg"
              onClick={handleAddItem}
              className="mx-auto"
            >
              <Plus className="w-5 h-5 mr-2" />
              Crear Pieza
            </Button>
          </div>
        )}
      </div>

      <DispatchModal
        isOpen={!!dispatchItemId}
        onClose={() => setDispatchItemId(null)}
        isPending={sendToKanbanMutation.isPending}
        onConfirm={(data) => {
          sendToKanbanMutation.mutate({ id: dispatchItemId, executionData: data });
        }}
      />

      {/* `key` por pieza: cada apertura nace con el formulario vacío, sin limpiarlo con un efecto. */}
      <DriveLinkDialog
        key={driveLinkItemId || 'drive-link'}
        itemId={driveLinkItemId}
        onClose={() => setDriveLinkItemId(null)}
        onSubmit={(payload) => driveAssetMutation.mutate(payload)}
        isPending={driveAssetMutation.isPending}
      />
    </div>
  );
};

export default ContentPlanDetail;
