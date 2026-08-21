import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';
import { getApiBaseUrl } from '@/lib/apiBaseUrl';
import {
  ChevronLeft, Plus, Send, ExternalLink, Save, Trash2,
  MoreVertical, CheckCircle2, Circle, Clock, Loader2,
  Calendar, User, LayoutGrid, FileText, Instagram, Facebook, Video, Image as ImageIcon,
  Edit2, Check, AlertCircle, Sparkles, Users, UserCheck, StickyNote, ChevronUp, Share2,
  MessageSquare, Table2, UploadCloud
} from '@/components/ui/icons';
import PageHeader from '@/components/ui/PageHeader';
import { Button } from '@/components/ui/button';
import { toast } from 'react-hot-toast';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription
} from '@/components/ui/dialog';
import DatePicker from 'react-datepicker';
import "react-datepicker/dist/react-datepicker.css";
import { brainDatePickerProps } from '@/lib/brainDatePicker';
import { useConfirmDialog } from '@/components/ui/ConfirmDialog';

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
            className="p-2 text-zinc-400 hover:text-red-500 transition-colors"
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

const getFinalAssetUrl = (item, shareToken) => item.finalAssetKey
  ? shareToken
    ? `${getApiBaseUrl()}/api/public/parrilla/${encodeURIComponent(shareToken)}/items/${item.id}/final-asset?v=${encodeURIComponent(item.finalAssetKey)}`
    : `${getApiBaseUrl()}/api/content/items/${item.id}/final-asset?v=${encodeURIComponent(item.finalAssetKey)}`
  : null;
const isFinalAssetVideo = (item) => (item.finalAssetMimeType || '').startsWith('video/');
const isFinalAssetImage = (item) => (item.finalAssetMimeType || '').startsWith('image/');

const getFinalAssetEntryUrl = (item, asset, shareToken) => shareToken
  ? `${getApiBaseUrl()}/api/public/parrilla/${encodeURIComponent(shareToken)}/items/${item.id}/final-assets/${asset.id}?v=${encodeURIComponent(asset.storageKey || '')}`
  : `${getApiBaseUrl()}/api/content/items/${item.id}/final-assets/${asset.id}?v=${encodeURIComponent(asset.storageKey || '')}`;

const FinalAssetTile = ({ item, asset, shareToken, isEditing, onDelete, isDeleting }) => {
  const [previewUrl, setPreviewUrl] = useState(null);
  const sourceUrl = getFinalAssetEntryUrl(item, asset, shareToken);
  const isImage = (asset.mimeType || '').startsWith('image/');
  const isVideo = (asset.mimeType || '').startsWith('video/');

  useEffect(() => {
    if (shareToken) {
      setPreviewUrl(sourceUrl);
      return undefined;
    }
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
  }, [sourceUrl, shareToken]);

  return (
    <div className="group/asset relative overflow-hidden rounded-xl border border-zinc-200 bg-zinc-100 dark:border-white/10 dark:bg-zinc-950">
      <div className="aspect-square">
        {isImage ? <img src={previewUrl || undefined} alt={asset.name || 'Lámina del carrusel'} className="h-full w-full object-cover" /> : isVideo ? <video src={previewUrl || undefined} className="h-full w-full object-cover" controls preload="metadata" /> : <FileText className="m-auto h-8 w-8 text-zinc-300" />}
      </div>
      <div className="flex items-center justify-between gap-2 px-2.5 py-2">
        <span className="truncate text-[10px] font-bold text-zinc-600 dark:text-zinc-300">{asset.name || 'Archivo final'}</span>
        {isEditing && <button type="button" onClick={() => onDelete(item.id, asset.id)} disabled={isDeleting} className="brain-danger-button-icon shrink-0 rounded-lg p-1.5" aria-label={`Eliminar ${asset.name || 'archivo final'}`}><Trash2 className="h-3.5 w-3.5" /></button>}
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

      <div className="bg-slate-50 dark:bg-white/2 border border-slate-100 dark:border-white/5 p-5 rounded-[2rem] text-sm text-slate-700 dark:text-zinc-300 whitespace-pre-wrap leading-relaxed italic">
        {comments}
      </div>
    </div>
  );
};

const ContentItemCard = ({
  item,
  shareToken,
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
  isFinalAssetDeleting
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
      className={`group relative bg-white dark:bg-zinc-900 transition-all duration-300 rounded-3xl shadow-sm ${
        isEditing
          ? 'ring-4 ring-indigo-600/5 overflow-visible min-h-[520px] z-20'
          : isDevuelto
          ? 'border border-amber-500/30 overflow-hidden'
          : 'hover:shadow-md overflow-hidden'
      }`}
    >
      <div className="p-6 lg:p-8">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          {/* Column 1: Format & Status */}
          <div className="lg:col-span-3 space-y-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className="text-xs font-black text-indigo-600/40 font-mono tracking-tighter">
                  #{String(index + 1).padStart(2, '0')}
                </span>
                <div className={`p-2.5 rounded-xl ${isEditing ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/20' : 'bg-zinc-100 dark:bg-white/5 text-zinc-500'}`}>
                  {item.format === 'Reel' || item.format === 'Video' ? <Video className="w-5 h-5" /> : <ImageIcon className="w-5 h-5" />}
                </div>
                {isEditing ? (
                  <select
                    value={item.format}
                    onChange={(e) => onUpdate({ id: item.id, format: e.target.value })}
                    className="bg-transparent border-none p-0 text-sm font-bold text-zinc-900 dark:text-white focus:ring-0"
                  >
                    <option value="Reel">Reel</option>
                    <option value="Carrusel">Carrusel</option>
                    <option value="Post">Post</option>
                    <option value="Otro">Otro</option>
                  </select>
                ) : (
                  <span className="text-sm font-bold text-zinc-900 dark:text-zinc-100 uppercase tracking-tight">{item.format}</span>
                )}
              </div>
            </div>

            <div className="space-y-4">
              <div className="space-y-1">
                <label className="text-[10px] font-black text-zinc-400 uppercase tracking-[0.2em] block mb-1">Objetivo / Título</label>
                {isEditing ? (
                  <input
                    type="text"
                    defaultValue={item.objective}
                    onBlur={(e) => {
                      if (e.target.value !== item.objective) {
                        onUpdate({ id: item.id, objective: e.target.value });
                      }
                    }}
                    className="w-full bg-zinc-50 dark:bg-white/5 border border-zinc-200 dark:border-white/10 rounded-xl px-3 py-2 text-sm font-medium focus:ring-2 focus:ring-indigo-600/20 outline-none"
                  />
                ) : (
                  <p className="text-sm font-semibold text-zinc-800 dark:text-zinc-200 leading-tight">{item.objective}</p>
                )}
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-black text-zinc-400 uppercase tracking-[0.2em] block mb-1">Fecha Publicación</label>
                {isEditing ? (
                  <DatePicker
                    {...brainDatePickerProps}
                    key={`${item.id}-${item.publishDate}`}
                    selected={item.publishDate ? new Date(`${new Date(item.publishDate).toISOString().split('T')[0]}T12:00:00.000Z`) : null}
                    onChange={(date) => {
                      if (!date) return;
                      const dateStr = date.toISOString().split('T')[0];
                      const current = item.publishDate ? new Date(item.publishDate).toISOString().split('T')[0] : '';
                      if (dateStr !== current) {
                        onUpdate({ id: item.id, publishDate: dateStr });
                      }
                    }}
                    dateFormat="dd/MM/yyyy"
                    className="w-full bg-zinc-50 dark:bg-white/5 border border-zinc-200 dark:border-white/10 rounded-xl px-3 py-2 text-xs font-medium focus:ring-2 focus:ring-indigo-600/20 outline-none"
                    wrapperClassName="w-full"
                    placeholderText="Elegir fecha"
                  />
                ) : (
                  <div className="flex items-center gap-2 text-sm font-bold text-indigo-600 dark:text-indigo-400">
                    <Calendar className="w-4 h-4" />
                    {item.publishDate ? new Date(item.publishDate).toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'UTC' }) : 'Sin fecha'}
                  </div>
                )}
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-black text-zinc-400 uppercase tracking-[0.2em] block mb-1">Estado Pieza</label>
                <select
                  value={item.status}
                  onChange={(e) => onUpdate({ id: item.id, status: e.target.value })}
                  className={`text-[10px] font-bold uppercase tracking-widest px-3 py-1.5 rounded-full border transition-all outline-none ${
                    isRealizado
                      ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-600'
                      : isDevuelto
                      ? 'bg-red-500/10 border-red-500/30 text-red-600'
                      : 'bg-zinc-100 dark:bg-white/5 border-zinc-200 dark:border-white/10 text-zinc-500'
                  }`}
                >
                  <option value="BORRADOR">Borrador</option>
                  <option value="EN_REVISION">En Revisión</option>
                  <option value="APROBADO">Aprobado</option>
                  <option value="EN_PRODUCCION">En Producción</option>
                  <option value="DEVUELTO">Devuelto</option>
                  <option value="REALIZADO">Realizado</option>
                  <option value="PUBLICADO">Publicado</option>
                </select>
              </div>
            </div>

            <div className="pt-4 border-t border-zinc-100 dark:border-white/5">
              <label className="text-[10px] font-black text-zinc-400 uppercase tracking-[0.2em] flex items-center gap-1.5 mb-2">
                  <StickyNote className="w-3 h-3 text-indigo-600" /> Nota Interna
              </label>
              {isEditing ? (
                <AutoResizeTextarea
                  defaultValue={item.internalNotes}
                  onBlur={(e) => {
                    if (e.target.value !== item.internalNotes) {
                      onUpdate({ id: item.id, internalNotes: e.target.value });
                    }
                  }}
                  placeholder="Instrucciones para el equipo..."
                  className="w-full bg-zinc-50/50 dark:bg-white/2 border border-zinc-200/60 dark:border-white/5 rounded-xl p-3 text-[11px] font-medium focus:ring-2 focus:ring-indigo-600/10 outline-none transition-all"
                />
              ) : (
                <div className="bg-zinc-50/30 dark:bg-white/2 p-3 rounded-xl text-[11px] text-zinc-500 dark:text-zinc-400 italic leading-relaxed">
                  {item.internalNotes || <span className="text-zinc-300 dark:text-zinc-600">Sin notas internas...</span>}
                </div>
              )}
            </div>
          </div>

          {/* Column 2: Copy & Caption */}
          <div className="lg:col-span-6 space-y-6">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-[10px] font-black text-zinc-400 uppercase tracking-[0.2em] flex items-center gap-1.5">
                  <FileText className="w-3.5 h-3.5 text-indigo-600" /> Copy Visual / Guion
                </label>
              </div>
              {isEditing ? (
                <AutoResizeTextarea
                  defaultValue={item.copyText}
                  onBlur={(e) => {
                    if (e.target.value !== item.copyText) {
                      onUpdate({ id: item.id, copyText: e.target.value });
                    }
                  }}
                  placeholder="Escribe el copy visual o guion aquí..."
                  className="w-full min-h-[120px] bg-zinc-50 dark:bg-white/5 border border-zinc-200 dark:border-white/10 rounded-2xl p-4 text-sm font-medium focus:ring-4 focus:ring-indigo-600/10 focus:border-indigo-600/30 transition-all outline-none"
                />
              ) : (
                <div className="bg-zinc-50/50 dark:bg-white/2 p-4 rounded-2xl text-sm text-zinc-700 dark:text-zinc-300 whitespace-pre-wrap leading-relaxed min-h-[4rem]">
                  {item.copyText || <span className="italic text-zinc-400">Sin copy visual...</span>}
                </div>
              )}
            </div>

            <div className="space-y-2">
              <label className="text-[10px] font-black text-zinc-400 uppercase tracking-[0.2em] flex items-center gap-1.5">
                <Instagram className="w-3.5 h-3.5 text-indigo-600" /> Caption (Post)
              </label>
              {isEditing ? (
                <AutoResizeTextarea
                  defaultValue={item.captionText}
                  onBlur={(e) => {
                    if (e.target.value !== item.captionText) {
                      onUpdate({ id: item.id, captionText: e.target.value });
                    }
                  }}
                  placeholder="Escribe el pie de foto para redes..."
                  className="w-full min-h-[120px] bg-zinc-50 dark:bg-white/5 border border-zinc-200 dark:border-white/10 rounded-2xl p-4 text-sm font-medium focus:ring-4 focus:ring-indigo-600/10 focus:border-indigo-600/30 transition-all outline-none"
                />
              ) : (
                <div className="bg-zinc-50/50 dark:bg-white/2 p-4 rounded-2xl text-sm text-zinc-700 dark:text-zinc-300 whitespace-pre-wrap leading-relaxed min-h-[4rem]">
                  {item.captionText || <span className="italic text-zinc-400">Sin caption...</span>}
                </div>
              )}
            </div>

            <FeedbackHistory
              comments={item.comments}
              isOpen={showFeedback}
            />
          </div>

          {/* Column 3: Links & Production */}
          <div className="lg:col-span-3 flex flex-col justify-between gap-6">
            <div className="space-y-5">
              <div className="space-y-1.5">
                <label className="text-[10px] font-black text-zinc-400 uppercase tracking-[0.2em] flex items-center gap-1.5">
                  <UploadCloud className="w-3.5 h-3.5 text-indigo-600" /> Pieza final
                </label>
                {finalAssets.length > 0 ? (
                  <div className="grid grid-cols-2 gap-2" aria-label="Archivos finales del contenido">
                    {finalAssets.map(asset => <FinalAssetTile key={asset.id} item={item} asset={asset} shareToken={shareToken} isEditing={isEditing} onDelete={onFinalAssetDelete} isDeleting={isFinalAssetDeleting} />)}
                  </div>
                ) : (
                  <div className="rounded-2xl border border-dashed border-zinc-200 dark:border-white/10 bg-zinc-50/60 dark:bg-white/5 p-4 text-[10px] text-zinc-400">
                    Sin pieza final cargada.
                  </div>
                )}

                {isEditing && (
                  <label className="flex items-center justify-center gap-2 rounded-xl border border-indigo-100 dark:border-indigo-500/20 bg-indigo-50 dark:bg-indigo-500/10 px-3 py-2 text-[10px] font-black uppercase tracking-widest text-indigo-700 dark:text-indigo-300 cursor-pointer hover:bg-indigo-100 dark:hover:bg-indigo-500/20 transition-colors">
                    {isFinalAssetUploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <UploadCloud className="w-3.5 h-3.5" />}
                    {finalAssets.length ? 'AÃ±adir archivos' : 'Cargar archivos'}
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
                )}
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] font-black text-zinc-400 uppercase tracking-[0.2em] flex items-center gap-1.5">
                  <ExternalLink className="w-3.5 h-3.5 text-indigo-600" /> Referencias (Links)
                </label>
                <MultiLinkInput
                  values={item.mediaUrl}
                  isEditing={isEditing}
                  placeholder="Link de Drive/Pinterest"
                  onChange={(links) => onUpdate({ id: item.id, mediaUrl: links })}
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] font-black text-zinc-400 uppercase tracking-[0.2em] flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-indigo-600" /> Insumos (Links)
                </label>
                <MultiLinkInput
                  values={item.assetsLinks}
                  isEditing={isEditing}
                  placeholder="Links de fotos, logos, etc."
                  onChange={(links) => onUpdate({ id: item.id, assetsLinks: links })}
                />
              </div>

              {latestTask ? (
                <div className={`flex flex-col gap-2 p-4 rounded-2xl border transition-all ${
                  isRealizado
                    ? 'bg-emerald-500/5 border-emerald-500/20 text-emerald-600'
                    : isDevuelto
                    ? 'bg-red-500/5 border-red-500/20 text-red-600'
                    : 'bg-indigo-600/5 border-indigo-600/20 text-indigo-600'
                }`}>
                  <div className="flex items-center gap-2">
                    {isRealizado ? <CheckCircle2 className="w-4 h-4" /> : isDevuelto ? <AlertCircle className="w-4 h-4" /> : <Clock className="w-4 h-4 animate-pulse" />}
                    <span className="text-[10px] font-black uppercase tracking-widest">
                      {isRealizado ? 'Realizado' : isDevuelto ? 'Devuelto' : 'En Producción'}
                    </span>
                  </div>
                  <button
                    onClick={() => navigate(`/gestion?taskId=${latestTask.id}`)}
                    className="text-[9px] font-bold text-zinc-500 hover:text-indigo-600 flex items-center gap-1 transition-colors"
                  >
                    {latestTask.title.startsWith('[Publicar]') ? 'Ver Publicación' : 'Ver Producción'} <ExternalLink className="w-2 h-2" />
                  </button>
                  {item.tasks.length > 1 && (
                    <span className="text-[8px] text-zinc-400 font-medium">Historial: {item.tasks.length} tareas</span>
                  )}
                </div>
              ) : (
                <Button
                  onClick={onDispatch}
                  variant="default"
                  className="w-full py-6 font-black text-[10px] uppercase tracking-[0.1em]"
                >
                  <Send className="w-4 h-4 mr-2" />
                  Despachar a Kanban
                </Button>
              )}
            </div>

            <div className="flex flex-col gap-3 mt-4 pt-4 border-t border-zinc-200/50 dark:border-white/5">
              <div className="flex items-center justify-between">
                <button
                  onClick={onEditToggle}
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-xl text-[10px] font-bold uppercase transition-all ${
                    isEditing
                      ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/20'
                      : 'text-zinc-500 hover:text-indigo-600 hover:bg-indigo-600/5'
                  }`}
                >
                  {isEditing ? <Check className="w-3.5 h-3.5" /> : <Edit2 className="w-3.5 h-3.5" />}
                  {isEditing ? 'Guardar' : 'Editar'}
                </button>

                <button
                  onClick={() => onDelete(item.id)}
                  className="p-2 text-zinc-300 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/10 rounded-xl transition-all"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>

              {!isEditing && item.comments && (
                <button
                  onClick={() => setShowFeedback(!showFeedback)}
                  className={`w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${
                    showFeedback
                      ? 'bg-slate-200 text-slate-700'
                      : isDevuelto
                      ? 'bg-amber-100 text-amber-700 border border-amber-200'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  <MessageSquare className="w-3.5 h-3.5" />
                  {showFeedback ? 'Ocultar Feedback' : '💬 Feedback del Cliente'}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
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
            <select
              value={data.assigneeId}
              onChange={(e) => setData({ ...data, assigneeId: e.target.value })}
              className="w-full h-11 px-4 rounded-xl bg-zinc-50 dark:bg-white/5 border border-zinc-200 dark:border-white/10 focus:ring-2 focus:ring-indigo-600/20 outline-none transition-all text-sm"
            >
              <option value="">Sin asignar (Pendiente)</option>
              {team?.map(member => (
                <option key={member.id} value={member.id}>{member.name}</option>
              ))}
            </select>
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
  const [editingItemId, setEditingItemId] = useState(null);
  const [dispatchItemId, setDispatchItemId] = useState(null);
  const [showInternalNotes, setShowInternalNotes] = useState(false);
  const [newPlanInternalNote, setNewPlanInternalNote] = useState('');
  const [newlyCreatedItemId, setNewlyCreatedItemId] = useState(null);
  const itemRefs = useRef({});

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

  // Highlight & Scroll Effect
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const highlightId = params.get('item') || params.get('itemId');
    if (highlightId && plan?.items) {
      setTimeout(() => {
        const element = itemRefs.current[highlightId];
        if (element) {
          element.scrollIntoView({ behavior: 'smooth', block: 'center' });
          element.classList.add('ring-2', 'ring-indigo-600', 'ring-offset-4', 'dark:ring-offset-zinc-950');
          setTimeout(() => {
            element.classList.remove('ring-2', 'ring-indigo-600', 'ring-offset-4', 'dark:ring-offset-zinc-950');
          }, 3000);
        }
      }, 500);
    }
  }, [location.search, plan]);

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
    mutationFn: async () => {
      const response = await axios.post(`${getApiBaseUrl()}/api/content/plans/${currentPlanId}/share-token`, {}, {
        headers: { Authorization: `Bearer ${localStorage.getItem('authToken')}` }
      });
      return response.data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries(['content-plan', planId || `${clientSlug}-${period}`]);
      const url = `${window.location.origin}/compartir/${data.shareToken}`;
      navigator.clipboard.writeText(url);
      toast.success('¡Link compartido generado y copiado al portapapeles!');
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
    mutationFn: async ({ itemId, files }) => {
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

  const getMonthName = (monthNumber) => {
    const date = new Date();
    date.setMonth(monthNumber - 1);
    return date.toLocaleString('es-ES', { month: 'long' });
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
    finalAssetUploadMutation.mutate({ itemId, files });
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

  return (
    <div className="space-y-8 pb-20 animate-in fade-in duration-500">
      <PageHeader
        title={`${getMonthName(plan.month)} ${plan.year}`}
        subtitle="Planificación estratégica de contenidos digitales."

        breadcrumbs={[
          { label: 'Parrillas', href: '/parrillas' },
          { label: plan.client?.name || 'Cliente' },
        ]}
      >
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 w-full sm:w-auto">
          <div className="flex items-center gap-3 bg-white dark:bg-zinc-900 p-1 rounded-xl border border-zinc-200 dark:border-white/5">
            <select
              value={plan.status}
              onChange={(e) => updatePlanMutation.mutate({ status: e.target.value })}
              className="bg-transparent border-none text-[10px] font-black uppercase tracking-widest focus:ring-0 cursor-pointer px-3 py-1.5"
            >
              <option value="PLANIFICACION">Planificación</option>
              <option value="EN_APROBACION">En Aprobación</option>
              <option value="ACTIVO">Activo</option>
              <option value="FINALIZADO">Finalizado</option>
            </select>

            <div className="w-px h-4 bg-zinc-200 dark:bg-white/10" />

            <button
              onClick={() => generateShareTokenMutation.mutate()}
              disabled={generateShareTokenMutation.isPending}
              className="flex items-center gap-1.5 px-3 py-1.5 text-zinc-500 hover:text-indigo-600 transition-all font-bold text-[10px] uppercase tracking-widest"
              title={plan.shareToken ? 'Actualizar link compartido' : 'Generar link compartido'}
            >
              {generateShareTokenMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Share2 className="w-3 h-3" />}
              {plan.shareToken ? 'Link' : 'Compartir'}
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
            <select
              value={plan.clientId}
              onChange={(e) => updatePlanMutation.mutate({ clientId: e.target.value })}
              className="bg-transparent border-none text-zinc-500 dark:text-zinc-400 font-medium p-0 focus:ring-0 text-sm cursor-pointer hover:text-indigo-600 transition-colors"
            >
              {clients?.map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-2">
            <UserCheck className="w-3.5 h-3.5 text-zinc-400" />
            <select
              value={plan.ownerId || ''}
              onChange={(e) => updatePlanMutation.mutate({ ownerId: e.target.value || null })}
              className="bg-transparent border-none text-zinc-500 dark:text-zinc-400 font-medium p-0 focus:ring-0 text-sm cursor-pointer hover:text-indigo-600 transition-colors"
            >
              <option value="">Sin Responsable (CM)</option>
              {team?.map(member => (
                <option key={member.id} value={member.id}>{member.name}</option>
              ))}
            </select>
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
                      className="opacity-0 group-hover:opacity-100 p-1.5 text-zinc-400 hover:text-red-500 rounded-lg transition-all"
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

      {/* Items List */}
      <div className="space-y-6">
        {orderedPlanItems.length > 0 ? (
          orderedPlanItems.map((item, index) => (
            <ContentItemCard
              key={item.id}
              item={item}
              shareToken={plan.shareToken}
              index={index}
              isEditing={editingItemId === item.id}
              onEditToggle={() => setEditingItemId(editingItemId === item.id ? null : item.id)}
              onUpdate={updateItemMutation.mutate}
              onDelete={handleDeleteItem}
              onDispatch={() => setDispatchItemId(item.id)}
              navigate={navigate}
              itemRef={el => itemRefs.current[item.id] = el}
              onFinalAssetUpload={handleFinalAssetUpload}
              onFinalAssetDelete={handleFinalAssetDelete}
              isFinalAssetUploading={finalAssetUploadMutation.isPending}
              isFinalAssetDeleting={finalAssetDeleteMutation.isPending}
            />
          ))
        ) : (
          <div className="p-20 text-center bg-zinc-50/50 dark:bg-white/2 border border-dashed border-zinc-200 dark:border-white/10 rounded-[3rem]">
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
    </div>
  );
};

export default ContentPlanDetail;
