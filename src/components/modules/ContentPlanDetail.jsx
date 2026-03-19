import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';
import { getApiBaseUrl } from '@/lib/apiBaseUrl';
import {
  ChevronLeft, Plus, Send, ExternalLink, Save, Trash2,
  MoreVertical, CheckCircle2, Circle, Clock, Loader2,
  Calendar, User, LayoutGrid, FileText, Instagram, Facebook, Video, Image as ImageIcon
} from 'lucide-react';
import { toast } from 'react-hot-toast';

const ContentPlanDetail = () => {
  const { planId } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [editingItem, setEditingItem] = useState(null);

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

  // Mutations
  const updatePlanMutation = useMutation({
    mutationFn: async (data) => {
      const response = await axios.patch(`${getApiBaseUrl()}/api/content/plans/${planId}`, data, {
        headers: { Authorization: `Bearer ${localStorage.getItem('authToken')}` }
      });
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries(['content-plan', planId]);
      toast.success('Plan actualizado');
    }
  });

  const createItemMutation = useMutation({
    mutationFn: async (data) => {
      const response = await axios.post(`${getApiBaseUrl()}/api/content/items`, { ...data, planId }, {
        headers: { Authorization: `Bearer ${localStorage.getItem('authToken')}` }
      });
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries(['content-plan', planId]);
      toast.success('Pieza añadida');
    }
  });

  const updateItemMutation = useMutation({
    mutationFn: async ({ id, ...data }) => {
      const response = await axios.patch(`${getApiBaseUrl()}/api/content/items/${id}`, data, {
        headers: { Authorization: `Bearer ${localStorage.getItem('authToken')}` }
      });
      return response.data;
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
    mutationFn: async (id) => {
      const response = await axios.post(`${getApiBaseUrl()}/api/content/items/${id}/send-to-kanban`, {}, {
        headers: { Authorization: `Bearer ${localStorage.getItem('authToken')}` }
      });
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries(['content-plan', planId]);
      toast.success('Enviado a Kanban con éxito');
    },
    onError: (error) => {
      toast.error(error.response?.data?.error || 'Error al enviar a Kanban');
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
      networks: ['Instagram'],
      status: 'BORRADOR'
    });
  };

  if (planLoading) {
    return (
      <div className="flex flex-col items-center justify-center p-20 gap-4">
        <Loader2 className="w-10 h-10 text-indigo-500 animate-spin" />
        <p className="text-zinc-500">Cargando detalles del plan...</p>
      </div>
    );
  }

  if (!plan) return <div>No se encontró el plan.</div>;

  return (
    <div className="space-y-8 pb-20 animate-in fade-in duration-500">
      {/* Header */}
      <header className="flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div className="space-y-4">
          <button
            onClick={() => navigate('/parrillas')}
            className="flex items-center gap-2 text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-300 transition-colors text-sm font-medium"
          >
            <ChevronLeft className="w-4 h-4" />
            Volver a Parrillas
          </button>

          <div className="space-y-1">
            <div className="flex items-center gap-3">
              <h1 className="text-4xl font-bold tracking-tight text-zinc-900 dark:text-white capitalize">
                {getMonthName(plan.month)} {plan.year}
              </h1>
              <div className="px-3 py-1 rounded-full bg-indigo-500/10 text-indigo-600 text-[10px] font-bold uppercase tracking-widest border border-indigo-500/20">
                Fase de {plan.status}
              </div>
            </div>

            {/* Client Selector Mockup */}
            <div className="flex items-center gap-2">
               <span className="text-sm text-zinc-500">Cliente:</span>
               <select
                 value={plan.clientId}
                 onChange={(e) => updatePlanMutation.mutate({ clientId: e.target.value })}
                 className="bg-transparent border-none text-zinc-900 dark:text-zinc-100 font-bold p-0 focus:ring-0 text-lg cursor-pointer hover:underline decoration-indigo-500/30 underline-offset-4"
               >
                 {clients?.map(c => (
                   <option key={c.id} value={c.id}>{c.name}</option>
                 ))}
               </select>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <select
            value={plan.status}
            onChange={(e) => updatePlanMutation.mutate({ status: e.target.value })}
            className="px-4 py-2 rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-white/10 text-sm font-bold shadow-sm focus:ring-2 focus:ring-indigo-500/20 outline-none"
          >
            <option value="PLANIFICACION">Planificación</option>
            <option value="EN_APROBACION">En Aprobación</option>
            <option value="ACTIVO">Activo</option>
            <option value="FINALIZADO">Finalizado</option>
          </select>
          <button
            onClick={handleAddItem}
            className="flex items-center gap-2 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl transition-all shadow-lg shadow-indigo-500/20 font-bold"
          >
            <Plus className="w-4 h-4" />
            Añadir Contenido
          </button>
        </div>
      </header>

      {/* Items List */}
      <div className="space-y-4">
        {plan.items?.length > 0 ? (
          plan.items.map((item) => (
            <div
              key={item.id}
              className="group relative bg-white/50 dark:bg-zinc-900/40 border border-zinc-200/60 dark:border-white/5 backdrop-blur-md rounded-2xl p-6 hover:border-indigo-500/30 transition-all shadow-sm hover:shadow-xl hover:shadow-indigo-500/5 overflow-hidden"
            >
              {/* Kanban Status Stripe */}
              {item.taskId && (
                <div className="absolute left-0 top-0 bottom-0 w-1 bg-indigo-500 shadow-[0_0_10px_rgba(99,102,241,0.5)]" />
              )}

              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                {/* Meta Info */}
                <div className="lg:col-span-3 space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="p-2 rounded-lg bg-zinc-100 dark:bg-white/5 text-zinc-500">
                      {item.format === 'Reel' || item.format === 'Video' ? <Video className="w-5 h-5" /> : <ImageIcon className="w-5 h-5" />}
                    </div>
                    <select
                      value={item.status}
                      onChange={(e) => updateItemMutation.mutate({ id: item.id, status: e.target.value })}
                      className="text-[10px] font-bold uppercase tracking-widest bg-zinc-100 dark:bg-white/5 px-2 py-1 rounded-full outline-none"
                    >
                      <option value="BORRADOR">Borrador</option>
                      <option value="EN_REVISION">En Revisión</option>
                      <option value="APROBADO">Aprobado</option>
                      <option value="PUBLICADO">Publicado</option>
                    </select>
                  </div>

                  <div className="space-y-3">
                    <div>
                      <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest block mb-1">Formato</label>
                      <input
                        type="text"
                        defaultValue={item.format}
                        onBlur={(e) => updateItemMutation.mutate({ id: item.id, format: e.target.value })}
                        className="w-full bg-transparent border-none p-0 text-sm font-bold text-zinc-900 dark:text-zinc-100 focus:ring-0"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest block mb-1">Redes</label>
                      <div className="flex flex-wrap gap-1">
                        {['Instagram', 'TikTok', 'Facebook', 'LinkedIn'].map(net => (
                          <button
                            key={net}
                            onClick={() => {
                              const newNets = item.networks.includes(net)
                                ? item.networks.filter(n => n !== net)
                                : [...item.networks, net];
                              updateItemMutation.mutate({ id: item.id, networks: newNets });
                            }}
                            className={`px-2 py-0.5 rounded-md text-[9px] font-bold border transition-colors ${
                              item.networks.includes(net)
                                ? 'bg-indigo-500/10 border-indigo-500/30 text-indigo-600'
                                : 'border-zinc-200 dark:border-white/5 text-zinc-400'
                            }`}
                          >
                            {net}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Content Copy */}
                <div className="lg:col-span-6 space-y-4">
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest flex items-center gap-1">
                      <FileText className="w-3 h-3" /> Copy / Guion
                    </label>
                    <textarea
                      defaultValue={item.copyText}
                      placeholder="Escribe el copy visual o guion aquí..."
                      onBlur={(e) => updateItemMutation.mutate({ id: item.id, copyText: e.target.value })}
                      className="w-full bg-zinc-50/50 dark:bg-white/2 border border-zinc-200/50 dark:border-white/5 rounded-xl p-3 text-sm min-h-[80px] focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500/30 transition-all outline-none resize-none"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest flex items-center gap-1">
                      <Instagram className="w-3 h-3" /> Caption (Post)
                    </label>
                    <textarea
                      defaultValue={item.captionText}
                      placeholder="Escribe el pie de foto para redes..."
                      onBlur={(e) => updateItemMutation.mutate({ id: item.id, captionText: e.target.value })}
                      className="w-full bg-zinc-50/50 dark:bg-white/2 border border-zinc-200/50 dark:border-white/5 rounded-xl p-3 text-sm min-h-[60px] focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500/30 transition-all outline-none resize-none"
                    />
                  </div>
                </div>

                {/* Actions & Links */}
                <div className="lg:col-span-3 flex flex-col justify-between">
                  <div className="space-y-4">
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest flex items-center gap-1">
                        <ExternalLink className="w-3 h-3" /> Recurso Media
                      </label>
                      <input
                        type="text"
                        defaultValue={item.mediaUrl}
                        placeholder="Link de Drive o Dropbox"
                        onBlur={(e) => updateItemMutation.mutate({ id: item.id, mediaUrl: e.target.value })}
                        className="w-full bg-white dark:bg-zinc-900 border border-zinc-200/50 dark:border-white/5 rounded-lg px-3 py-2 text-[11px] focus:ring-1 focus:ring-indigo-500 outline-none"
                      />
                    </div>

                    {item.taskId ? (
                      <div className="flex items-center gap-2 text-indigo-600 dark:text-indigo-400 bg-indigo-500/10 p-3 rounded-xl border border-indigo-500/20">
                        <CheckCircle2 className="w-4 h-4" />
                        <span className="text-xs font-bold uppercase tracking-widest">En Producción</span>
                      </div>
                    ) : (
                      <button
                        onClick={() => sendToKanbanMutation.mutate(item.id)}
                        disabled={sendToKanbanMutation.isPending}
                        className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 rounded-xl hover:scale-[1.02] active:scale-[0.98] transition-all font-bold text-xs uppercase tracking-widest disabled:opacity-50"
                      >
                        {sendToKanbanMutation.isPending && sendToKanbanMutation.variables === item.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Send className="w-3 h-3" />}
                        Enviar a Kanban
                      </button>
                    )}
                  </div>

                  <div className="flex items-center justify-end gap-2 mt-4 pt-4 border-t border-zinc-200/50 dark:border-white/5 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={() => {
                        if(window.confirm('¿Eliminar esta pieza?')) deleteItemMutation.mutate(item.id);
                      }}
                      className="p-2 text-zinc-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/10 rounded-lg transition-all"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ))
        ) : (
          <div className="p-12 text-center bg-zinc-50/50 dark:bg-white/2 border border-dashed border-zinc-200 dark:border-white/10 rounded-3xl">
            <p className="text-zinc-500">No hay contenido en este plan todavía.</p>
            <button
              onClick={handleAddItem}
              className="mt-4 text-indigo-600 font-bold hover:underline"
            >
              Crea la primera pieza
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default ContentPlanDetail;
