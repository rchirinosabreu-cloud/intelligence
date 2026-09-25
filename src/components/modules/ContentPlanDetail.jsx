import Select from '@/components/ui/Select';
import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';
import { getApiBaseUrl } from '@/lib/apiBaseUrl';
import { getContentPlanMonthName } from '@/lib/contentPlanPeriod';
import { planFinalAssetUpload } from '@/lib/uploadLimits';
import { driveLinkProblem } from '@/lib/driveLinks';
import { driveAssetUrls, driveEmbedAspect } from '@/lib/finalAssetShape';
import { WEEKDAY_LABELS, buildMonthGrid, groupItemsByDay } from '@/lib/contentPlanCalendar';
import {
  ChevronLeft, Plus, Send, ExternalLink, Save, Trash2,
  MoreVertical, CheckCircle2, Circle, Clock, Loader2,
  Calendar, User, LayoutGrid, FileText, Instagram, Facebook, Video, Image as ImageIcon,
  Edit2, Check, AlertCircle, Sparkles, Users, UserCheck, StickyNote, ChevronUp, Share2,
  MessageSquare, Table2, UploadCloud, Link2, Lock, Eye
} from '@/components/ui/icons';
import PageHeader from '@/components/ui/PageHeader';
import { Button } from '@/components/ui/button';
import { toast } from 'react-hot-toast';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription
} from '@/components/ui/dialog';
import DatePicker from 'react-datepicker';
import { brainDatePickerProps } from '@/lib/brainDatePicker';
import { useConfirmDialog } from '@/components/ui/ConfirmDialog';
import BriaContentPlanReview from '@/components/modules/ContentPlan/BriaContentPlanReview';

const MultiLinkInput = ({ values = [], onChange, placeholder, isEditing }) => {
  const [links, setLinks] = useState(Array.isArray(values) ? values : (values ? [values] : []));

  useEffect(() => {
    setLinks(Array.isArray(values) ? values : (values ? [values] : []));
  }, [values]);

  const handleAddLink = () => {
    const newLinks = [...links, ''];
    setLinks(newLinks);
  };

  const handleUpdateLink = (index, value) => {
    const newLinks = [...links];
    newLinks[index] = value;
    setLinks(newLinks);
  };

  const handleBlur = () => {
    const filtered = links.filter(l => l.trim() !== '');
    onChange(filtered);
  };

  const handleRemoveLink = (index) => {
    const newLinks = links.filter((_, i) => i !== index);
    setLinks(newLinks);
    onChange(newLinks);
  };

  if (!isEditing) {
    if (links.length === 0) return <span className="text-[10px] text-zinc-400 italic">No asignado</span>;
    return (
      <div className="flex flex-wrap gap-2">
        {links.map((link, i) => (
          <a
            key={i}
            href={link}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 px-2 py-1 bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 hover:text-indigo-700 font-bold text-[10px] rounded-xl transition-colors max-w-full truncate"
          >
            <ExternalLink className="w-2.5 h-2.5" />
            {links.length > 1 ? `Link ${i + 1}` : 'Ver Link'}
          </a>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {links.map((link, i) => (
        <div key={i} className="flex gap-2">
          <input
            type="text"
            value={link}
            onChange={(e) => handleUpdateLink(i, e.target.value)}
            onBlur={handleBlur}
            placeholder={placeholder}
            className="flex-1 bg-zinc-50 dark:bg-white/5 border border-zinc-200 dark:border-white/10 rounded-xl px-3 py-2 text-xs focus:ring-2 focus:ring-indigo-600/20 outline-none transition-all"
          />
          <button
            onClick={() => handleRemoveLink(i)}
            className="brain-danger-button-icon p-2"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      ))}
      <button
        onClick={handleAddLink}
        className="flex items-center gap-1 text-[10px] font-bold text-indigo-600 hover:text-indigo-700 transition-colors px-1"
      >
        <Plus className="w-3 h-3" /> Añadir Link
      </button>
    </div>
  );
};

// Helper for auto-resize textarea with internal state for performance (save on blur)
const AutoResizeTextarea = ({ defaultValue, onBlur, placeholder, disabled, className }) => {
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
      ref={textareaRef}
      value={val}
      onChange={(e) => setVal(e.target.value)}
      onBlur={onBlur}
      placeholder={placeholder}
      disabled={disabled}
      className={className}
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
const uploadFinalAssetsDirect = async (itemId, files, onProgress) => {
  const base = `${getApiBaseUrl()}/api/content/items/${itemId}/final-assets`;
  const { data: tickets } = await axios.post(`${base}/direct-upload`, {
    files: files.map(file => ({ name: file.name, size: file.size, mimeType: file.type }))
  });

  const totalBytes = files.reduce((sum, file) => sum + (file.size || 0), 0) || 1;
  const sent = new Array(files.length).fill(0);

  await Promise.all(tickets.map((ticket, index) => axios.put(ticket.url, files[index], {
    headers: { 'Content-Type': ticket.mimeType },
    onUploadProgress: (event) => {
      sent[index] = event.loaded || 0;
      const done = sent.reduce((sum, value) => sum + value, 0);
      // Se reserva el 100 % para cuando el servidor confirme: si no, la barra se llena y sigue esperando.
      onProgress?.(Math.min(99, Math.round((done / totalBytes) * 100)));
    }
  })));

  const { data } = await axios.post(`${base}/confirm`, {
    uploads: tickets.map(ticket => ({ key: ticket.key, name: ticket.name }))
  });
  return data;
};

const FinalAssetTile = ({ item, asset, isEditing, onDelete, isDeleting }) => {
  const [previewUrl, setPreviewUrl] = useState(null);
  // Un enlace de Drive no tiene bytes nuestros: no se pide a la API, se muestra el reproductor de Google.
  const drive = driveAssetUrls(asset);
  const sourceUrl = drive
    ? null
    : `${getApiBaseUrl()}/api/content/items/${item.id}/final-assets/${asset.id}?v=${encodeURIComponent(asset.storageKey || '')}`;
  const isImage = !drive && (asset.mimeType || '').startsWith('image/');
  const isVideo = !drive && (asset.mimeType || '').startsWith('video/');

  useEffect(() => {
    if (!sourceUrl) return undefined;
    let objectUrl;
    let cancelled = false;
    fetch(sourceUrl, { headers: { Authorization: `Bearer ${localStorage.getItem('authToken')}` } })
      .then(response => {
        if (!response.ok) throw new Error(`Asset request failed with status ${response.status}`);
        return response.blob();
      })
      .then(blob => {
        if (cancelled) return;
        objectUrl = URL.createObjectURL(blob);
        setPreviewUrl(objectUrl);
      })
      .catch(error => console.error('Final carousel asset preview failed:', error));

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [sourceUrl]);

  return (
    <div className="group/asset relative overflow-hidden rounded-xl border border-zinc-200 bg-zinc-100 dark:border-white/10 dark:bg-zinc-950">
      {/* Un reel es vertical: el marco de Drive toma la forma del formato de la pieza, no la de fábrica. */}
      <div className={drive ? '' : 'aspect-square'} style={drive ? { aspectRatio: driveEmbedAspect(item.format) } : undefined}>
        {drive ? (
          <iframe
            src={drive.embedUrl}
            title={asset.name || 'Pieza final en Drive'}
            className="h-full w-full border-0 bg-black"
            allow="autoplay; encrypted-media; fullscreen"
            allowFullScreen
            loading="lazy"
          />
        ) : isImage ? <img src={previewUrl || undefined} alt={asset.name || 'Lámina del carrusel'} className="h-full w-full object-cover" /> : isVideo ? <video src={previewUrl || undefined} className="h-full w-full object-cover" controls preload="metadata" /> : <FileText className="m-auto h-8 w-8 text-zinc-300" />}
      </div>
      {/* Las acciones van sobre la miniatura, no en la línea del nombre: compitiendo por el ancho de
          una tarjeta pequeña, el nombre se recortaba hasta quedarse en una letra suelta
          (Rodny, 25 de septiembre de 2026). Así el nombre se queda con la línea entera. */}
      <div className="absolute right-1.5 top-1.5 flex items-center gap-1">
        {drive && (
          <a
            href={drive.openUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-lg bg-black/55 p-1.5 text-white backdrop-blur-sm transition hover:bg-black/75"
            aria-label={`Abrir ${asset.name || 'el archivo'} en Drive`}
            title="Abrir en Drive"
          >
            <ExternalLink className="h-3.5 w-3.5" />
          </a>
        )}
        {isEditing && (
          <button
            type="button"
            onClick={() => onDelete(item.id, asset.id)}
            disabled={isDeleting}
            className="rounded-lg bg-black/55 p-1.5 text-white backdrop-blur-sm transition hover:bg-destructive"
            aria-label={`Eliminar ${asset.name || 'archivo final'}`}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      <span className="block truncate px-2.5 py-2 text-[11px] font-medium text-zinc-600 dark:text-zinc-300">
        {asset.name || 'Archivo final'}
      </span>
    </div>
  );
};

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

const PIECE_STATUS_BAR = {
  APROBADO: 'bg-brand-green',
  REALIZADO: 'bg-brand-green',
  PUBLICADO: 'bg-brand-green',
  EN_REVISION: 'bg-brand-yellow',
  EN_PRODUCCION: 'bg-brand-cyan',
  DEVUELTO: 'bg-destructive'
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
const PlanPieceRail = ({ items, selectedId, onSelect, onAdd }) => (
  <nav aria-label="Piezas de la parrilla" className="flex h-full flex-col overflow-hidden rounded-3xl border border-zinc-200 bg-white dark:border-white/10 dark:bg-zinc-900">
    <div className="flex items-baseline gap-2 border-b border-zinc-100 px-4 py-3.5 dark:border-white/5">
      <span className="text-sm font-bold text-zinc-900 dark:text-zinc-50">Piezas</span>
      <span className="text-xs text-zinc-400">{items.length}</span>
    </div>

    <div className="flex flex-col gap-1 overflow-y-auto p-2">
      {items.map((item, index) => {
        const isSelected = item.id === selectedId;
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
            <span className={`h-9 w-1 shrink-0 rounded-full ${PIECE_STATUS_BAR[item.status] || 'bg-zinc-200 dark:bg-white/15'}`} />
            <span className="min-w-0 flex-grow">
              <span className={`block truncate text-[13px] leading-tight ${isSelected ? 'font-bold text-zinc-900 dark:text-zinc-50' : 'font-medium text-zinc-700 dark:text-zinc-300'}`}>
                {item.objective || `Pieza ${index + 1}`}
              </span>
              <span className="mt-0.5 block truncate text-[11px] text-zinc-500 dark:text-zinc-400">
                {item.format} · {shortPieceDate(item.publishDate)}
              </span>
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

const PIECE_CHIP = {
  APROBADO: 'bg-brand-green-soft text-brand-green-deep dark:bg-brand-green/15 dark:text-brand-green',
  REALIZADO: 'bg-brand-green-soft text-brand-green-deep dark:bg-brand-green/15 dark:text-brand-green',
  PUBLICADO: 'bg-brand-green-soft text-brand-green-deep dark:bg-brand-green/15 dark:text-brand-green',
  EN_REVISION: 'bg-brand-yellow-soft text-brand-yellow-deep dark:bg-brand-yellow/15 dark:text-brand-yellow',
  EN_PRODUCCION: 'bg-brand-cyan-soft text-brand-cyan-deep dark:bg-brand-cyan/15 dark:text-brand-cyan',
  DEVUELTO: 'bg-destructive/10 text-destructive'
};
const NEUTRAL_CHIP = 'bg-zinc-100 text-zinc-600 dark:bg-white/10 dark:text-zinc-300';

/**
 * El mes como mes (Rodny, 24 de septiembre de 2026).
 *
 * El carril dice qué piezas hay; el calendario dice **cuándo**, que es lo único que una lista no puede
 * enseñar: los días vacíos y los días con tres piezas encima. Tocar una pieza la abre en el editor —son
 * dos formas de mirar el mismo mes, no dos sitios distintos.
 */
const PlanCalendar = ({ items, year, month, onOpenPiece, onAdd }) => {
  const weeks = buildMonthGrid(year, month);
  const { byDay, undated } = groupItemsByDay(items);

  return (
    <div className="space-y-4">
      <div className="overflow-hidden rounded-3xl border border-zinc-200 bg-white p-4 dark:border-white/10 dark:bg-zinc-900">
        <div className="mb-2 grid grid-cols-7 gap-2">
          {WEEKDAY_LABELS.map(label => (
            <div key={label} className="px-1 text-[10px] font-black tracking-[0.08em] text-zinc-400">{label}</div>
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
                <span className={`text-[11px] font-bold tabular-nums ${cell.inMonth ? 'text-zinc-500 dark:text-zinc-400' : 'text-zinc-300 dark:text-zinc-600'}`}>
                  {cell.day}
                </span>

                {pieces.slice(0, 2).map(piece => (
                  <button
                    key={piece.id}
                    type="button"
                    onClick={() => onOpenPiece(piece.id)}
                    className={`flex flex-col gap-0.5 rounded-lg px-2 py-1.5 text-left transition-opacity hover:opacity-80 ${PIECE_CHIP[piece.status] || NEUTRAL_CHIP}`}
                  >
                    <span className="text-[9px] font-black uppercase tracking-wider opacity-80">{piece.format}</span>
                    <span className="line-clamp-2 text-[11px] font-medium leading-tight text-zinc-700 dark:text-zinc-200">
                      {piece.objective}
                    </span>
                  </button>
                ))}

                {pieces.length > 2 && (
                  <button
                    type="button"
                    onClick={() => onOpenPiece(pieces[2].id)}
                    className="px-1 text-left text-[10px] font-bold text-zinc-500 hover:underline dark:text-zinc-400"
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
            <span className="text-[9px] font-black uppercase tracking-wider text-zinc-500 dark:text-zinc-400">{piece.format}</span>
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

const FeedbackHistory = ({ comments, isOpen }) => {
  if (!isOpen || !comments) return null;

  return (
    <div className="space-y-3 animate-in fade-in slide-in-from-top-2 duration-500 overflow-hidden">
      <div className="flex items-center gap-2">
        <div className="p-1.5 bg-slate-100 dark:bg-white/5 text-slate-500 rounded-xl">
          <MessageSquare className="w-3.5 h-3.5" />
        </div>
        <label className="text-[10px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-[0.2em]">
          Feedback del Cliente
        </label>
      </div>

      <div className="bg-slate-50 dark:bg-white/5 border border-slate-100 dark:border-white/5 p-5 rounded-[2rem] text-sm text-slate-700 dark:text-zinc-300 whitespace-pre-wrap leading-relaxed italic">
        {comments}
      </div>
    </div>
  );
};

/**
 * La tarjeta de crear contenido (rediseño de Rodny, 25 de septiembre de 2026, propuesta B).
 *
 * La ficha entera —formato, fecha, estado, nota— vive en una franja arriba, y el ancho que antes
 * gastaba una columna de metadatos se lo queda lo que de verdad se hace aquí: escribir. Guion y texto
 * de publicación van lado a lado, y el material (pieza final y enlaces) en un carril estrecho.
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
const FIELD_CLASS = 'h-11 w-full rounded-xl border border-zinc-200 bg-white px-3 text-[13px] text-zinc-900 outline-none transition focus:border-brand-cyan dark:border-white/10 dark:bg-zinc-900 dark:text-zinc-50';
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
  onDriveLink,
  directUploadPercent
}) => {
  const [showFeedback, setShowFeedback] = useState(false);
  const finalAssets = item.finalAssets || [];
  const isRealizado = item.status === 'REALIZADO' || item.status === 'PUBLICADO';
  const isDevuelto = item.status === 'DEVUELTO';
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
          <span className="text-[13px] font-bold tabular-nums text-zinc-400">#{String(index + 1).padStart(2, '0')}</span>

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

          {!isEditing && item.comments && (
            <button
              type="button"
              onClick={() => setShowFeedback(!showFeedback)}
              className="inline-flex h-9 items-center gap-2 rounded-xl border border-zinc-200 bg-white px-3 text-[13px] font-bold text-zinc-600 transition hover:bg-zinc-50 dark:border-white/10 dark:bg-zinc-900 dark:text-zinc-300"
            >
              <MessageSquare className="h-3.5 w-3.5" />
              {showFeedback ? 'Ocultar feedback' : 'Feedback del cliente'}
            </button>
          )}

          <button
            type="button"
            onClick={onEditToggle}
            className="inline-flex h-9 items-center gap-2 rounded-xl border border-zinc-200 bg-white px-4 text-[13px] font-bold text-zinc-700 transition hover:bg-zinc-50 dark:border-white/10 dark:bg-zinc-900 dark:text-zinc-200"
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
              className="inline-flex h-9 items-center gap-2 rounded-xl bg-brand-cyan-deep px-4 text-[13px] font-bold text-white transition hover:brightness-110"
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

          <div className="flex w-44 flex-col gap-1.5">
            <span className={FIELD_LABEL}>Estado</span>
            <Select
              value={item.status}
              onChange={(e) => onUpdate({ id: item.id, status: e.target.value })}
              aria-label="Estado de la pieza"
              className={FIELD_CLASS}
            >
              <option value="BORRADOR">Borrador</option>
              <option value="EN_REVISION">En Revisión</option>
              <option value="APROBADO">Aprobado</option>
              <option value="EN_PRODUCCION">En Producción</option>
              <option value="DEVUELTO">Devuelto</option>
              <option value="REALIZADO">Realizado</option>
              <option value="PUBLICADO">Publicado</option>
            </Select>
          </div>

          <div className="flex min-w-[220px] flex-grow flex-col gap-1.5">
            <label htmlFor={`nota-${item.id}`} className={FIELD_LABEL}>
              Nota interna <span className="text-zinc-400">· solo el equipo</span>
            </label>
            {isEditing ? (
              <input
                id={`nota-${item.id}`}
                type="text"
                defaultValue={item.internalNotes || ''}
                onBlur={(e) => {
                  if (e.target.value !== item.internalNotes) onUpdate({ id: item.id, internalNotes: e.target.value });
                }}
                placeholder="Instrucciones para el equipo…"
                className={FIELD_CLASS}
              />
            ) : (
              <p className="flex h-11 items-center px-1 text-[13px] italic text-zinc-500 dark:text-zinc-400">
                {item.internalNotes || <span className="text-zinc-300 dark:text-zinc-600">Sin notas internas…</span>}
              </p>
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
              <span className="inline-flex items-center gap-1.5 rounded-md bg-zinc-100 px-2 py-0.5 text-[11px] font-bold text-zinc-600 dark:bg-white/10 dark:text-zinc-300">
                <Lock className="h-3 w-3" /> Solo el equipo
              </span>
            </div>
            {isEditing ? (
              <AutoResizeTextarea
                defaultValue={item.copyText}
                onBlur={(e) => {
                  if (e.target.value !== item.copyText) onUpdate({ id: item.id, copyText: e.target.value });
                }}
                placeholder="Escribe el guion aquí…"
                className="min-h-[260px] w-full rounded-xl border border-zinc-200 bg-white p-4 text-[13px] leading-relaxed outline-none transition focus:border-brand-cyan dark:border-white/10 dark:bg-zinc-900"
              />
            ) : (
              <div className="min-h-[260px] whitespace-pre-wrap rounded-xl bg-zinc-50 p-4 text-[13px] leading-relaxed text-zinc-700 dark:bg-white/5 dark:text-zinc-300">
                {item.copyText || <span className="italic text-zinc-400">Sin guion…</span>}
              </div>
            )}
          </div>

          <div className="flex min-w-0 flex-col gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <label htmlFor={`texto-${item.id}`} className={FIELD_LABEL}>Texto de la publicación</label>
              <span className="inline-flex items-center gap-1.5 rounded-md bg-brand-cyan-soft px-2 py-0.5 text-[11px] font-bold text-brand-cyan-deep dark:bg-brand-cyan/15 dark:text-brand-cyan">
                <Eye className="h-3 w-3" /> Lo ve el cliente
              </span>
            </div>
            {isEditing ? (
              <AutoResizeTextarea
                defaultValue={item.captionText}
                onBlur={(e) => {
                  if (e.target.value !== item.captionText) onUpdate({ id: item.id, captionText: e.target.value });
                }}
                placeholder="Escribe el texto que se va a publicar…"
                className="min-h-[260px] w-full rounded-xl border-[1.5px] border-brand-cyan/30 bg-brand-cyan-soft/30 p-4 text-[13px] leading-relaxed outline-none transition focus:border-brand-cyan dark:bg-brand-cyan/5"
              />
            ) : (
              <div className="min-h-[260px] whitespace-pre-wrap rounded-xl border-[1.5px] border-brand-cyan/20 bg-brand-cyan-soft/30 p-4 text-[13px] leading-relaxed text-zinc-700 dark:bg-brand-cyan/5 dark:text-zinc-300">
                {item.captionText || <span className="italic text-zinc-400">Sin texto de publicación…</span>}
              </div>
            )}
          </div>
        </div>

        {/* `items-start`: sin esto las tres columnas se estiran al alto de la más alta y Referencias
            e Insumos quedaban flotando sobre un vacío enorme. */}
        <div className="grid grid-cols-1 items-start gap-6 border-t border-zinc-100 bg-zinc-50/60 px-6 py-5 dark:border-white/5 dark:bg-white/5 md:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)_minmax(0,1fr)]">
          <div className="flex flex-col gap-2.5">
            <span className={FIELD_LABEL}>Pieza final</span>

            {finalAssets.length > 0 && (
              <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
                {finalAssets.map(asset => (
                  <FinalAssetTile key={asset.id} item={item} asset={asset} isEditing={isEditing} onDelete={onFinalAssetDelete} isDeleting={isFinalAssetDeleting} />
                ))}
              </div>
            )}

            {/* La zona grande es el estado vacío. Con material ya cargado se encoge a una línea: un
                rectángulo enorme pesaba más que la propia pieza (Rodny, 25 de septiembre de 2026). */}
            {isEditing ? (
              <div className={`rounded-xl border border-dashed border-zinc-300 bg-white dark:border-white/15 dark:bg-zinc-900 ${
                finalAssets.length
                  ? 'flex flex-wrap items-center gap-x-3 gap-y-1.5 px-3 py-2.5'
                  : 'flex flex-col items-center gap-2.5 p-5 text-center'
              }`}>
                {isFinalAssetUploading
                  ? <Loader2 className="h-4 w-4 animate-spin text-zinc-400" />
                  : <UploadCloud className={finalAssets.length ? 'h-4 w-4 text-zinc-400' : 'h-5 w-5 text-zinc-400'} />}
                {/* Con material ya cargado no hace falta anunciar «añadir más»: el propio botón
                    dice «Añadir archivos» (Rodny, 25 de septiembre de 2026). */}
                {finalAssets.length === 0 && (
                  <span className="text-[13px] text-zinc-500 dark:text-zinc-400">Arrastra la pieza aquí</span>
                )}
                <div className={finalAssets.length ? 'flex items-center gap-2.5' : 'flex flex-col items-center gap-1'}>
                  <label className="cursor-pointer text-[13px] font-bold text-brand-cyan-deep hover:underline dark:text-brand-cyan">
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
                    className="text-[13px] font-bold text-brand-cyan-deep hover:underline dark:text-brand-cyan"
                    title="Para un video que pesa demasiado para subirlo"
                  >
                    Enlace de Drive
                  </button>
                </div>
              </div>
            ) : finalAssets.length === 0 && (
              <p className="rounded-xl border border-dashed border-zinc-200 p-4 text-[13px] text-zinc-400 dark:border-white/10">
                Sin pieza final cargada.
              </p>
            )}

            {directUploadPercent !== null && (
              <div className="space-y-1.5 pt-1" role="status" aria-live="polite">
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-zinc-200 dark:bg-white/10">
                  <div className="h-full rounded-full bg-brand-cyan transition-all" style={{ width: `${directUploadPercent}%` }} />
                </div>
                <p className="text-[11px] font-bold text-zinc-500 dark:text-zinc-400">
                  Subiendo al almacenamiento… {directUploadPercent}%
                </p>
              </div>
            )}
          </div>

          <div className="flex flex-col gap-2">
            <span className={FIELD_LABEL}>Referencias</span>
            <MultiLinkInput
              values={item.mediaUrl}
              isEditing={isEditing}
              placeholder="Link de Drive/Pinterest"
              onChange={(links) => onUpdate({ id: item.id, mediaUrl: links })}
            />
          </div>

          <div className="flex flex-col gap-2">
            <span className={FIELD_LABEL}>Insumos</span>
            <MultiLinkInput
              values={item.assetsLinks}
              isEditing={isEditing}
              placeholder="Links de fotos, logos, etc."
              onChange={(links) => onUpdate({ id: item.id, assetsLinks: links })}
            />
          </div>
        </div>
      </div>

      {showFeedback && item.comments && (
        <div className="border-t border-zinc-100 px-6 py-5 dark:border-white/5">
          <FeedbackHistory comments={item.comments} isOpen={showFeedback} />
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
            <Send className="w-5 h-5 text-indigo-600" />
            Despachar a Kanban
          </DialogTitle>
          <DialogDescription>
            Configura los detalles de ejecución para esta pieza.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <label className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">Responsable</label>
            <Select
              value={data.assigneeId}
              onChange={(e) => setData({ ...data, assigneeId: e.target.value })}
              className="w-full h-11 px-4 rounded-xl bg-zinc-50 dark:bg-white/5 border border-zinc-200 dark:border-white/10 focus:ring-2 focus:ring-indigo-600/20 outline-none transition-all text-sm"
            >
              <option value="">Sin asignar (Pendiente)</option>
              {team?.map(member => (
                <option key={member.id} value={member.id}>{member.name}</option>
              ))}
            </Select>
          </div>

          <div className="space-y-2">
            <label className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">Fecha Límite</label>
            <DatePicker
              {...brainDatePickerProps}
              selected={data.dueDate ? new Date(`${data.dueDate}T12:00:00.000Z`) : null}
              onChange={(date) => setData({ ...data, dueDate: date ? date.toISOString().split('T')[0] : '' })}
              dateFormat="dd/MM/yyyy"
              className="w-full h-11 px-4 rounded-xl bg-zinc-50 dark:bg-white/5 border border-zinc-200 dark:border-white/10 focus:ring-2 focus:ring-indigo-600/20 outline-none transition-all text-sm"
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
                className="w-4 h-4 rounded border-zinc-300 text-indigo-600 focus:ring-indigo-600"
              />
              <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300 group-hover:text-indigo-600 transition-colors">Prioridad</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer group">
              <input
                type="checkbox"
                checked={data.isSpecial}
                onChange={(e) => setData({ ...data, isSpecial: e.target.checked })}
                className="w-4 h-4 rounded border-zinc-300 text-indigo-600 focus:ring-indigo-600"
              />
              <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300 group-hover:text-indigo-600 transition-colors">Especial</span>
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

  const selectPiece = (itemId) => {
    const params = new URLSearchParams(location.search);
    params.delete('itemId');
    if (itemId) params.set('item', itemId); else params.delete('item');
    navigate({ pathname: location.pathname, search: params.toString() }, { replace: true });
  };
  const [editingItemId, setEditingItemId] = useState(null);
  const [dispatchItemId, setDispatchItemId] = useState(null);
  const [showInternalNotes, setShowInternalNotes] = useState(false);
  const [newPlanInternalNote, setNewPlanInternalNote] = useState('');
  const [newlyCreatedItemId, setNewlyCreatedItemId] = useState(null);
  // `null` mientras no haya una subida directa en curso; un número entre 0 y 99 mientras la hay.
  const [directUploadPercent, setDirectUploadPercent] = useState(null);
  const [driveLinkItemId, setDriveLinkItemId] = useState(null);
  const [planView, setPlanView] = useState('editor');

  // Parse period (month-year)
  const [monthName, year] = (period || '').split('-');

  const getMonthNumber = (name) => {
    const months = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
    const idx = months.indexOf(name.toLowerCase());
    return idx !== -1 ? idx + 1 : null;
  };

  const month = getMonthNumber(monthName);

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

  const { data: clients } = useQuery({
    queryKey: ['clients-list'],
    queryFn: async () => {
      const response = await axios.get(`${getApiBaseUrl()}/api/db/clients`, {
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
      selectPiece(newItem.id);
      toast.success('Nueva pieza añadida');
    }
  });

  const updateItemMutation = useMutation({
    mutationFn: async ({ id, ...data }) => {
      await axios.patch(`${getApiBaseUrl()}/api/content/items/${id}`, data, {
        headers: { Authorization: `Bearer ${localStorage.getItem('authToken')}` }
      });
    },
    onSuccess: (_, variables) => {
      if (variables?.id === newlyCreatedItemId && Object.prototype.hasOwnProperty.call(variables, 'publishDate')) {
        setNewlyCreatedItemId(null);
      }
      queryClient.invalidateQueries(['content-plan', planId || `${clientSlug}-${period}`]);
    }
  });

  const finalAssetUploadMutation = useMutation({
    mutationFn: async ({ itemId, files, mode }) => {
      if (mode === 'direct') return uploadFinalAssetsDirect(itemId, files, setDirectUploadPercent);

      const uploadData = new FormData();
      files.forEach(file => uploadData.append('files', file));
      const response = await axios.post(`${getApiBaseUrl()}/api/content/items/${itemId}/final-assets`, uploadData, {
        headers: {
          Authorization: `Bearer ${localStorage.getItem('authToken')}`,
          'Content-Type': 'multipart/form-data'
        }
      });
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries(['content-plan', planId || `${clientSlug}-${period}`]);
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

  const deleteItemMutation = useMutation({
    mutationFn: async (id) => {
      await axios.delete(`${getApiBaseUrl()}/api/content/items/${id}`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('authToken')}` }
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries(['content-plan', planId || `${clientSlug}-${period}`]);
      toast.success('Pieza eliminada');
    }
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
     * un segundo y medio, y se suelta en cuanto la persona toca el scroll: mandar ella, no nosotros.
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

    return () => {
      cancelado = true;
      cancelAnimationFrame(raf);
      window.removeEventListener('wheel', soltar);
      window.removeEventListener('touchstart', soltar);
      window.removeEventListener('keydown', soltar);
    };
  }, [linkedItemId, plan, planView]);

  if (planLoading) {
    return (
      <div className="flex flex-col items-center justify-center p-20 gap-4">
        <Loader2 className="w-10 h-10 text-indigo-600 animate-spin" />
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
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 w-full sm:w-auto">
          <div className="flex items-center gap-3 bg-white dark:bg-zinc-900 p-1 rounded-xl border border-zinc-200 dark:border-white/5">
            <Select
              value={plan.status}
              onChange={(e) => updatePlanMutation.mutate({ status: e.target.value })}
              className="bg-transparent border-none text-[10px] font-black uppercase tracking-widest focus:ring-0 cursor-pointer px-3 py-1.5"
            >
              <option value="PLANIFICACION">Planificación</option>
              <option value="EN_APROBACION">En Aprobación</option>
              <option value="ACTIVO">Activo</option>
              <option value="FINALIZADO">Finalizado</option>
            </Select>

            <div className="w-px h-4 bg-zinc-200 dark:bg-white/10" />

            <button
              onClick={() => generateShareTokenMutation.mutate({ rotate: false })}
              disabled={generateShareTokenMutation.isPending}
              className="flex items-center gap-1.5 whitespace-nowrap px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest text-zinc-500 transition-all hover:text-brand-cyan-deep dark:hover:text-brand-cyan"
              title={plan.shareToken ? 'Copiar el enlace de esta parrilla' : 'Crear el enlace para el cliente'}
            >
              {generateShareTokenMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Share2 className="w-3 h-3" />}
              {plan.shareToken ? 'Copiar link' : 'Compartir'}
            </button>
          </div>

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
          <div className="flex items-center gap-2">
            <Users className="w-3.5 h-3.5 text-zinc-400" />
            <Select
              value={plan.clientId}
              onChange={(e) => updatePlanMutation.mutate({ clientId: e.target.value })}
              className="cursor-pointer border-none bg-transparent pl-0 pr-7 text-sm font-medium text-zinc-500 transition-colors hover:text-brand-cyan-deep focus:ring-0 dark:text-zinc-400 dark:hover:text-brand-cyan"
            >
              {clients?.map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </Select>
          </div>

          <div className="flex items-center gap-2">
            <UserCheck className="w-3.5 h-3.5 text-zinc-400" />
            <Select
              value={plan.ownerId || ''}
              onChange={(e) => updatePlanMutation.mutate({ ownerId: e.target.value || null })}
              className="cursor-pointer border-none bg-transparent pl-0 pr-7 text-sm font-medium text-zinc-500 transition-colors hover:text-brand-cyan-deep focus:ring-0 dark:text-zinc-400 dark:hover:text-brand-cyan"
            >
              <option value="">Sin Responsable (CM)</option>
              {team?.map(member => (
                <option key={member.id} value={member.id}>{member.name}</option>
              ))}
            </Select>
          </div>
      </div>

      <div className="bg-white/60 dark:bg-zinc-900/40 border border-zinc-200/60 dark:border-white/5 rounded-3xl p-6">
        <div className="flex items-start gap-3 mb-5">
          <div className="p-2 bg-indigo-600/10 text-indigo-600 rounded-xl">
            <Table2 className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-zinc-900 dark:text-white">Objetivos estratégicos</h3>
            <p className="text-[11px] text-zinc-500 dark:text-zinc-400">Visible para el cliente en el portal de revisión.</p>
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
          className="w-full min-h-[116px] bg-zinc-50/80 dark:bg-white/5 border border-zinc-200/70 dark:border-white/10 rounded-2xl p-4 text-sm text-zinc-800 dark:text-zinc-200 focus:ring-4 focus:ring-indigo-600/10 outline-none transition-all"
        />
      </div>

      <BriaContentPlanReview planId={currentPlanId} planUpdatedAt={plan.updatedAt} />

      {/* Internal Notes Panel */}
      <div className="bg-white/40 dark:bg-zinc-900/30 border border-zinc-200/60 dark:border-white/5 rounded-3xl overflow-hidden">
        <button
          onClick={() => setShowInternalNotes(!showInternalNotes)}
          className="w-full flex items-center justify-between p-6 hover:bg-zinc-50 dark:hover:bg-white/5 transition-colors"
        >
          <div className="flex items-center gap-3">
            <div className="p-2 bg-indigo-600/10 text-indigo-600 rounded-xl">
              <StickyNote className="w-5 h-5" />
            </div>
            <div className="text-left">
              <h3 className="text-sm font-semibold text-zinc-900 dark:text-white">Notas internas</h3>
              <p className="text-[10px] text-zinc-500 font-medium">Solo visible para el equipo interno</p>
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
                    <span className="mt-0.5 text-[11px] font-semibold text-indigo-600">#{index + 1}</span>
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
                className="flex-1 min-h-[46px] bg-zinc-50/80 dark:bg-white/5 border border-zinc-200/70 dark:border-white/10 rounded-2xl px-4 py-3 text-sm text-zinc-800 dark:text-zinc-200 focus:ring-4 focus:ring-indigo-600/10 outline-none transition-all"
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
                    ? 'bg-zinc-900 text-white dark:bg-white dark:text-zinc-900'
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
            onOpenPiece={(id) => { selectPiece(id); setPlanView('editor'); }}
            onAdd={handleAddItem}
          />
        ) : orderedPlanItems.length > 0 ? (
          <div className="grid grid-cols-1 gap-5 lg:grid-cols-[312px_minmax(0,1fr)] lg:items-start">
            <div className="lg:sticky lg:top-24 lg:max-h-[calc(100vh-8rem)]">
              <PlanPieceRail
                items={orderedPlanItems}
                selectedId={selectedItem?.id}
                onSelect={selectPiece}
                onAdd={handleAddItem}
              />
            </div>

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
                onDispatch={() => setDispatchItemId(selectedItem.id)}
                navigate={navigate}
                onFinalAssetUpload={handleFinalAssetUpload}
                onFinalAssetDelete={handleFinalAssetDelete}
                isFinalAssetUploading={finalAssetUploadMutation.isPending}
                isFinalAssetDeleting={finalAssetDeleteMutation.isPending}
                onDriveLink={setDriveLinkItemId}
                directUploadPercent={finalAssetUploadMutation.variables?.itemId === selectedItem.id ? directUploadPercent : null}
              />
            )}
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
