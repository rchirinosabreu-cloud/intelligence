import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';
import { getApiBaseUrl } from '@/lib/apiBaseUrl';
import {
  ChevronLeft, Plus, Send, ExternalLink, Save, Trash2,
  MoreVertical, CheckCircle2, Circle, Clock, Loader2,
  Calendar, User, LayoutGrid, FileText, Instagram, Facebook, Video, Image as ImageIcon,
  Edit2, Check, AlertCircle, Sparkles
} from 'lucide-react';
import { toast } from 'react-hot-toast';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription
} from '@/components/ui/dialog';

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
            <Send className="w-5 h-5 text-indigo-500" />
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
              className="w-full h-11 px-4 rounded-xl bg-zinc-50 dark:bg-white/5 border border-zinc-200 dark:border-white/10 focus:ring-2 focus:ring-indigo-500/20 outline-none transition-all text-sm"
            >
              <option value="">Sin asignar (Pendiente)</option>
              {team?.map(member => (
                <option key={member.id} value={member.id}>{member.name}</option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            <label className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">Fecha Límite</label>
            <input
              type="date"
              value={data.dueDate}
              onChange={(e) => setData({ ...data, dueDate: e.target.value })}
              className="w-full h-11 px-4 rounded-xl bg-zinc-50 dark:bg-white/5 border border-zinc-200 dark:border-white/10 focus:ring-2 focus:ring-indigo-500/20 outline-none transition-all text-sm"
            />
          </div>

          <div className="flex items-center gap-6 pt-2">
            <label className="flex items-center gap-2 cursor-pointer group">
              <input
                type="checkbox"
                checked={data.isPriority}
                onChange={(e) => setData({ ...data, isPriority: e.target.checked })}
                className="w-4 h-4 rounded border-zinc-300 text-indigo-600 focus:ring-indigo-500"
              />
              <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300 group-hover:text-indigo-500 transition-colors">Prioridad</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer group">
              <input
                type="checkbox"
                checked={data.isSpecial}
                onChange={(e) => setData({ ...data, isSpecial: e.target.checked })}
                className="w-4 h-4 rounded border-zinc-300 text-indigo-600 focus:ring-indigo-500"
              />
              <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300 group-hover:text-indigo-500 transition-colors">Especial</span>
            </label>
          </div>
        </div>

        <DialogFooter>
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-bold text-zinc-500 hover:text-zinc-900 transition-colors"
          >
            Cancelar
          </button>
          <button
            onClick={() => onConfirm(data)}
            disabled={isPending}
            className="px-6 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold shadow-lg shadow-indigo-500/20 transition-all flex items-center gap-2 disabled:opacity-50"
          >
            {isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
            Confirmar Despacho
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

const ContentPlanDetail = () => {
  const { planId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const [editingItemId, setEditingItemId] = useState(null);
  const [dispatchItemId, setDispatchItemId] = useState(null);
  const itemRefs = useRef({});

  // Queries
  const { data: plan, isLoading: planLoading } = useQuery({
    queryKey: ['content-plan', planId],
    queryFn: async () => {
      const response = await axios.get(`${getApiBaseUrl()}/api/content/plans/${planId}`, {
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

  // Highlight & Scroll Effect
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const highlightId = params.get('itemId');
    if (highlightId && plan?.items) {
      setTimeout(() => {
        const element = itemRefs.current[highlightId];
        if (element) {
          element.scrollIntoView({ behavior: 'smooth', block: 'center' });
          element.classList.add('ring-2', 'ring-indigo-500', 'ring-offset-4', 'dark:ring-offset-zinc-950');
          setTimeout(() => {
            element.classList.remove('ring-2', 'ring-indigo-500', 'ring-offset-4', 'dark:ring-offset-zinc-950');
          }, 3000);
        }
      }, 500);
    }
  }, [location.search, plan]);

  // Mutations
  const updatePlanMutation = useMutation({
    mutationFn: async (data) => {
      await axios.patch(`${getApiBaseUrl()}/api/content/plans/${planId}`, data, {
        headers: { Authorization: `Bearer ${localStorage.getItem('authToken')}` }
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries(['content-plan', planId]);
      toast.success('Estado del plan actualizado');
    }
  });

  const createItemMutation = useMutation({
    mutationFn: async (data) => {
      const response = await axios.post(`${getApiBaseUrl()}/api/content/items`, { ...data, planId }, {
        headers: { Authorization: `Bearer ${localStorage.getItem('authToken')}` }
      });
      return response.data;
    },
    onSuccess: (newItem) => {
      queryClient.invalidateQueries(['content-plan', planId]);
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
    onSuccess: () => {
      queryClient.invalidateQueries(['content-plan', planId]);
    }
  });

  const deleteItemMutation = useMutation({
    mutationFn: async (id) => {
      await axios.delete(`${getApiBaseUrl()}/api/content/items/${id}`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('authToken')}` }
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries(['content-plan', planId]);
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
      queryClient.invalidateQueries(['content-plan', planId]);
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

  if (planLoading) {
    return (
      <div className="flex flex-col items-center justify-center p-20 gap-4">
        <Loader2 className="w-10 h-10 text-indigo-500 animate-spin" />
        <p className="text-zinc-500">Cargando detalles de la parrilla...</p>
      </div>
    );
  }

  if (!plan) return <div className="p-20 text-center">Plan no encontrado.</div>;

  return (
    <div className="space-y-8 pb-20 animate-in fade-in duration-500">
      {/* Header */}
      <header className="flex flex-col md:flex-row md:items-end justify-between gap-6 border-b border-zinc-200 dark:border-white/5 pb-8">
        <div className="space-y-4">
          <button
            onClick={() => navigate('/parrillas')}
            className="flex items-center gap-2 text-zinc-500 hover:text-indigo-600 transition-colors text-sm font-bold uppercase tracking-widest"
          >
            <ChevronLeft className="w-4 h-4" />
            Parrillas
          </button>

          <div className="space-y-1">
            <div className="flex items-center gap-4">
              <h1 className="text-4xl font-black tracking-tighter text-zinc-900 dark:text-white capitalize">
                {getMonthName(plan.month)} {plan.year}
              </h1>
              <div className="px-3 py-1 rounded-full bg-zinc-100 dark:bg-white/5 text-zinc-500 text-[10px] font-bold uppercase tracking-widest border border-zinc-200 dark:border-white/10">
                {plan.status}
              </div>
            </div>

            <div className="flex items-center gap-2">
               <select
                 value={plan.clientId}
                 onChange={(e) => updatePlanMutation.mutate({ clientId: e.target.value })}
                 className="bg-transparent border-none text-zinc-500 dark:text-zinc-400 font-medium p-0 focus:ring-0 text-sm cursor-pointer hover:text-indigo-500 transition-colors"
               >
                 {clients?.map(c => (
                   <option key={c.id} value={c.id}>{c.name}</option>
                 ))}
               </select>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3 bg-white/50 dark:bg-zinc-900/50 p-2 rounded-2xl border border-zinc-200/50 dark:border-white/5 backdrop-blur-sm">
          <select
            value={plan.status}
            onChange={(e) => updatePlanMutation.mutate({ status: e.target.value })}
            className="bg-transparent border-none text-xs font-bold uppercase tracking-widest focus:ring-0 cursor-pointer px-4"
          >
            <option value="PLANIFICACION">Planificación</option>
            <option value="EN_APROBACION">En Aprobación</option>
            <option value="ACTIVO">Activo</option>
            <option value="FINALIZADO">Finalizado</option>
          </select>
          <button
            onClick={handleAddItem}
            className="flex items-center gap-2 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl transition-all shadow-lg shadow-indigo-500/20 font-bold text-sm"
          >
            <Plus className="w-4 h-4" />
            Añadir Contenido
          </button>
        </div>
      </header>

      {/* Items List */}
      <div className="space-y-6">
        {plan.items?.length > 0 ? (
          plan.items.map((item) => {
            const isEditing = editingItemId === item.id;
            const isRealizado = item.status === 'REALIZADO' || item.status === 'PUBLICADO';

            return (
              <div
                key={item.id}
                ref={el => itemRefs.current[item.id] = el}
                id={`item-${item.id}`}
                className={`group relative bg-white/40 dark:bg-zinc-900/30 border transition-all duration-300 rounded-3xl overflow-hidden shadow-sm ${
                  isEditing
                    ? 'border-indigo-500/50 ring-4 ring-indigo-500/5'
                    : 'border-zinc-200/60 dark:border-white/5 hover:border-zinc-300 dark:hover:border-white/10'
                }`}
              >
                {/* Mirror Effect Indicator */}
                {item.taskId && (
                  <div className={`absolute left-0 top-0 bottom-0 w-1.5 shadow-[0_0_15px_rgba(99,102,241,0.3)] ${isRealizado ? 'bg-emerald-500' : 'bg-indigo-500'}`} />
                )}

                <div className="p-6 lg:p-8">
                  <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
                    {/* Column 1: Format & Status */}
                    <div className="lg:col-span-3 space-y-6">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className={`p-2.5 rounded-xl ${isEditing ? 'bg-indigo-500 text-white shadow-lg shadow-indigo-500/20' : 'bg-zinc-100 dark:bg-white/5 text-zinc-500'}`}>
                            {item.format === 'Reel' || item.format === 'Video' ? <Video className="w-5 h-5" /> : <ImageIcon className="w-5 h-5" />}
                          </div>
                          {isEditing ? (
                            <select
                              value={item.format}
                              onChange={(e) => updateItemMutation.mutate({ id: item.id, format: e.target.value })}
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
                                  updateItemMutation.mutate({ id: item.id, objective: e.target.value });
                                }
                              }}
                              className="w-full bg-zinc-50 dark:bg-white/5 border border-zinc-200 dark:border-white/10 rounded-xl px-3 py-2 text-sm font-medium focus:ring-2 focus:ring-indigo-500/20 outline-none"
                            />
                          ) : (
                            <p className="text-sm font-semibold text-zinc-800 dark:text-zinc-200 leading-tight">{item.objective}</p>
                          )}
                        </div>

                        <div className="space-y-1">
                          <label className="text-[10px] font-black text-zinc-400 uppercase tracking-[0.2em] block mb-1">Estado Pieza</label>
                          <select
                            value={item.status}
                            onChange={(e) => updateItemMutation.mutate({ id: item.id, status: e.target.value })}
                            className={`text-[10px] font-bold uppercase tracking-widest px-3 py-1.5 rounded-full border transition-all outline-none ${
                              isRealizado
                                ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-600'
                                : 'bg-zinc-100 dark:bg-white/5 border-zinc-200 dark:border-white/10 text-zinc-500'
                            }`}
                          >
                            <option value="BORRADOR">Borrador</option>
                            <option value="EN_REVISION">En Revisión</option>
                            <option value="APROBADO">Aprobado</option>
                            <option value="REALIZADO">Realizado</option>
                            <option value="PUBLICADO">Publicado</option>
                          </select>
                        </div>
                      </div>
                    </div>

                    {/* Column 2: Copy & Caption */}
                    <div className="lg:col-span-6 space-y-6">
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <label className="text-[10px] font-black text-zinc-400 uppercase tracking-[0.2em] flex items-center gap-1.5">
                            <FileText className="w-3.5 h-3.5 text-indigo-500" /> Copy Visual / Guion
                          </label>
                        </div>
                        {isEditing ? (
                          <AutoResizeTextarea
                            defaultValue={item.copyText}
                            onBlur={(e) => {
                              if (e.target.value !== item.copyText) {
                                updateItemMutation.mutate({ id: item.id, copyText: e.target.value });
                              }
                            }}
                            placeholder="Escribe el copy visual o guion aquí..."
                            className="w-full bg-zinc-50 dark:bg-white/5 border border-zinc-200 dark:border-white/10 rounded-2xl p-4 text-sm font-medium focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500/30 transition-all outline-none"
                          />
                        ) : (
                          <div className="bg-zinc-50/50 dark:bg-white/2 p-4 rounded-2xl text-sm text-zinc-700 dark:text-zinc-300 whitespace-pre-wrap leading-relaxed min-h-[4rem]">
                            {item.copyText || <span className="italic text-zinc-400">Sin copy visual...</span>}
                          </div>
                        )}
                      </div>

                      <div className="space-y-2">
                        <label className="text-[10px] font-black text-zinc-400 uppercase tracking-[0.2em] flex items-center gap-1.5">
                          <Instagram className="w-3.5 h-3.5 text-indigo-500" /> Caption (Post)
                        </label>
                        {isEditing ? (
                          <AutoResizeTextarea
                            defaultValue={item.captionText}
                            onBlur={(e) => {
                              if (e.target.value !== item.captionText) {
                                updateItemMutation.mutate({ id: item.id, captionText: e.target.value });
                              }
                            }}
                            placeholder="Escribe el pie de foto para redes..."
                            className="w-full bg-zinc-50 dark:bg-white/5 border border-zinc-200 dark:border-white/10 rounded-2xl p-4 text-sm font-medium focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500/30 transition-all outline-none"
                          />
                        ) : (
                          <div className="bg-zinc-50/50 dark:bg-white/2 p-4 rounded-2xl text-sm text-zinc-700 dark:text-zinc-300 whitespace-pre-wrap leading-relaxed min-h-[4rem]">
                            {item.captionText || <span className="italic text-zinc-400">Sin caption...</span>}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Column 3: Links & Production */}
                    <div className="lg:col-span-3 flex flex-col justify-between gap-6">
                      <div className="space-y-5">
                        <div className="space-y-1.5">
                          <label className="text-[10px] font-black text-zinc-400 uppercase tracking-[0.2em] flex items-center gap-1.5">
                            <ExternalLink className="w-3.5 h-3.5 text-indigo-500" /> Referencia (Link)
                          </label>
                          {isEditing ? (
                            <input
                              type="text"
                              defaultValue={item.mediaUrl}
                              placeholder="Link de Drive/Pinterest"
                              onBlur={(e) => {
                                if (e.target.value !== item.mediaUrl) {
                                  updateItemMutation.mutate({ id: item.id, mediaUrl: e.target.value });
                                }
                              }}
                              className="w-full bg-zinc-50 dark:bg-white/5 border border-zinc-200 dark:border-white/10 rounded-xl px-3 py-2.5 text-xs focus:ring-2 focus:ring-indigo-500/20 outline-none transition-all"
                            />
                          ) : (
                            item.mediaUrl ? (
                              <a href={item.mediaUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-indigo-600 hover:text-indigo-700 font-bold text-xs truncate transition-colors">
                                <ExternalLink className="w-3 h-3" /> Ver Referencia
                              </a>
                            ) : <span className="text-[10px] text-zinc-400 italic">No asignado</span>
                          )}
                        </div>

                        <div className="space-y-1.5">
                          <label className="text-[10px] font-black text-zinc-400 uppercase tracking-[0.2em] flex items-center gap-1.5">
                            <Sparkles className="w-3.5 h-3.5 text-indigo-500" /> Insumos (Links)
                          </label>
                          {isEditing ? (
                            <AutoResizeTextarea
                              defaultValue={item.assetsLinks}
                              onBlur={(e) => {
                                if (e.target.value !== item.assetsLinks) {
                                  updateItemMutation.mutate({ id: item.id, assetsLinks: e.target.value });
                                }
                              }}
                              placeholder="Links de fotos, logos, etc."
                              className="w-full bg-zinc-50 dark:bg-white/5 border border-zinc-200 dark:border-white/10 rounded-xl px-3 py-2.5 text-xs focus:ring-2 focus:ring-indigo-500/20 outline-none transition-all"
                            />
                          ) : (
                            <p className="text-[11px] text-zinc-500 dark:text-zinc-400 line-clamp-2 leading-relaxed">
                              {item.assetsLinks || <span className="italic text-zinc-400">Sin insumos...</span>}
                            </p>
                          )}
                        </div>

                        {item.taskId ? (
                          <div className={`flex flex-col gap-2 p-4 rounded-2xl border transition-all ${
                            isRealizado
                              ? 'bg-emerald-500/5 border-emerald-500/20 text-emerald-600'
                              : 'bg-indigo-500/5 border-indigo-500/20 text-indigo-600'
                          }`}>
                            <div className="flex items-center gap-2">
                              {isRealizado ? <CheckCircle2 className="w-4 h-4" /> : <Clock className="w-4 h-4 animate-pulse" />}
                              <span className="text-[10px] font-black uppercase tracking-widest">
                                {isRealizado ? 'Realizado' : 'En Producción'}
                              </span>
                            </div>
                            <button
                              onClick={() => navigate('/gestion')}
                              className="text-[9px] font-bold text-zinc-500 hover:text-indigo-600 flex items-center gap-1 transition-colors"
                            >
                              Ver en Kanban <ExternalLink className="w-2 h-2" />
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => setDispatchItemId(item.id)}
                            className="w-full flex items-center justify-center gap-2 px-4 py-3.5 bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 rounded-2xl hover:scale-[1.02] active:scale-[0.98] transition-all font-black text-[10px] uppercase tracking-[0.1em] shadow-lg shadow-black/5"
                          >
                            <Send className="w-3 h-3" />
                            Despachar a Kanban
                          </button>
                        )}
                      </div>

                      <div className="flex items-center justify-between mt-4 pt-4 border-t border-zinc-200/50 dark:border-white/5">
                        <button
                          onClick={() => setEditingItemId(isEditing ? null : item.id)}
                          className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase transition-all ${
                            isEditing
                              ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/20'
                              : 'text-zinc-500 hover:text-indigo-600 hover:bg-indigo-500/5'
                          }`}
                        >
                          {isEditing ? <Check className="w-3.5 h-3.5" /> : <Edit2 className="w-3.5 h-3.5" />}
                          {isEditing ? 'Guardar' : 'Editar'}
                        </button>

                        <button
                          onClick={() => {
                            if(window.confirm('¿Eliminar esta pieza permanentemente?')) deleteItemMutation.mutate(item.id);
                          }}
                          className="p-2 text-zinc-300 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/10 rounded-lg transition-all"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            );
          })
        ) : (
          <div className="p-20 text-center bg-zinc-50/50 dark:bg-white/2 border border-dashed border-zinc-200 dark:border-white/10 rounded-[3rem]">
            <div className="w-16 h-16 bg-zinc-100 dark:bg-white/5 rounded-full flex items-center justify-center mx-auto mb-4">
              <LayoutGrid className="w-8 h-8 text-zinc-300 dark:text-zinc-600" />
            </div>
            <h3 className="text-lg font-bold text-zinc-900 dark:text-white mb-2">Parrilla Vacía</h3>
            <p className="text-zinc-500 max-w-xs mx-auto text-sm leading-relaxed mb-6">
              Empieza a planificar tu contenido añadiendo la primera pieza.
            </p>
            <button
              onClick={handleAddItem}
              className="flex items-center gap-2 px-6 py-3 bg-indigo-600 text-white rounded-2xl hover:scale-105 transition-all mx-auto font-bold shadow-xl shadow-indigo-500/20"
            >
              <Plus className="w-5 h-5" />
              Crear Pieza
            </button>
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
