import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import axios from 'axios';
import { getApiBaseUrl } from '@/lib/apiBaseUrl';
import {
  CheckCircle2, Clock, AlertCircle, Loader2, Calendar,
  Video, Image as ImageIcon, MessageSquare, Check, X, Send
} from 'lucide-react';
import { toast } from 'react-hot-toast';

const SharedContentPlan = () => {
  const { token } = useParams();
  const [plan, setPlan] = useState(null);
  const [loading, setLoading] = useState(true);
  const [commentingItemId, setCommentingItemId] = useState(null);
  const [clientComment, setClientComment] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const fetchPlan = async () => {
    try {
      const response = await axios.get(`${getApiBaseUrl()}/api/public/parrilla/${token}`);
      setPlan(response.data);
    } catch (error) {
      console.error('Error fetching shared plan:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPlan();
  }, [token]);

  const handleApprove = async (itemId) => {
    try {
      await axios.post(`${getApiBaseUrl()}/api/public/items/${itemId}/approve`);
      toast.success('Pieza aprobada correctamente');
      fetchPlan();
    } catch (error) {
      toast.error('Error al aprobar la pieza');
    }
  };

  const handleSubmitComment = async (itemId) => {
    if (!clientComment.trim() || isSubmitting) return;
    setIsSubmitting(true);
    try {
      const response = await axios.post(`${getApiBaseUrl()}/api/public/items/${itemId}/comment`, { comment: clientComment });

      // First, clear input and close form
      setCommentingItemId(null);
      setClientComment('');

      toast.success('Comentario enviado');

      // Update local state directly to avoid white screen/race conditions
      if (response.data) {
        setPlan(prev => {
          if (!prev) return prev;
          return {
            ...prev,
            items: prev.items.map(item =>
              item.id === itemId ? { ...item, ...response.data } : item
            )
          };
        });
      } else {
        await fetchPlan();
      }
    } catch (error) {
      console.error('Comment error:', error);
      toast.error('Error al enviar el comentario');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-zinc-50 dark:bg-zinc-950">
        <Loader2 className="w-10 h-10 text-indigo-500 animate-spin mb-4" />
        <p className="text-zinc-500 font-medium">Cargando parrilla de contenidos...</p>
      </div>
    );
  }

  if (!plan) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-zinc-50 dark:bg-zinc-950 p-6 text-center">
        <div className="w-20 h-20 bg-red-50 dark:bg-red-900/10 rounded-full flex items-center justify-center mb-6">
          <AlertCircle className="w-10 h-10 text-red-500" />
        </div>
        <h1 className="text-2xl font-black text-zinc-900 dark:text-white mb-2">Parrilla no encontrada</h1>
        <p className="text-zinc-500 max-w-sm">El enlace es inválido o ha expirado. Por favor, solicita uno nuevo a tu ejecutivo de cuenta.</p>
      </div>
    );
  }

  const getMonthName = (monthNumber) => {
    const date = new Date();
    date.setMonth(monthNumber - 1);
    return date.toLocaleString('es-ES', { month: 'long' });
  };

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 pb-20">
      {/* Client Header */}
      <header className="bg-white dark:bg-zinc-900 border-b border-zinc-200 dark:border-white/5 sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-6 h-24 flex items-center justify-between">
          <div className="flex items-center gap-4">
            {plan.client.logoUrl && (
              <img src={plan.client.logoUrl} alt={plan.client.name} className="h-10 w-10 object-contain rounded-lg" />
            )}
            <div>
              <h1 className="text-xl font-black text-zinc-900 dark:text-white uppercase tracking-tighter">
                {plan.client.name}
              </h1>
              <p className="text-xs font-bold text-indigo-500 uppercase tracking-widest">
                Parrilla {getMonthName(plan.month)} {plan.year}
              </p>
            </div>
          </div>
          <div className="hidden sm:block">
             <div className="px-4 py-2 bg-zinc-100 dark:bg-white/5 rounded-xl border border-zinc-200 dark:border-white/10 text-[10px] font-black uppercase tracking-widest text-zinc-500">
               Portal del Cliente
             </div>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 mt-12 space-y-8">
        <div className="bg-indigo-600 rounded-[2rem] p-8 lg:p-12 text-white overflow-hidden relative">
          <div className="relative z-10 space-y-4 max-w-2xl">
            <h2 className="text-4xl font-black tracking-tighter leading-none">
              Revisión de Contenidos
            </h2>
            <p className="text-indigo-100 text-lg font-medium leading-relaxed">
              Hola 👋 Aquí tienes la propuesta de contenidos para este mes. Puedes revisar cada pieza, dejarnos tus comentarios o aprobarlas directamente para que pasen a producción.
            </p>
          </div>
          <div className="absolute right-[-10%] bottom-[-20%] opacity-10 rotate-12 scale-150">
            <CheckCircle2 className="w-64 h-64" />
          </div>
        </div>

        <div className="space-y-6">
          {plan.items.map((item, index) => {
            const isAprobado = item.status === 'APROBADO' || item.status === 'REALIZADO' || item.status === 'PUBLICADO';

            return (
              <div
                key={item.id}
                className="bg-white dark:bg-zinc-900 rounded-[2.5rem] overflow-hidden shadow-sm border border-transparent hover:border-indigo-500/20 transition-all duration-500"
              >
                <div className="p-8 lg:p-10">
                  <div className="grid grid-cols-1 lg:grid-cols-12 gap-10">
                    {/* Left: Metadata */}
                    <div className="lg:col-span-3 space-y-6">
                      <div className="flex items-center gap-3">
                        <span className="text-xs font-black text-indigo-500/40 font-mono tracking-tighter">
                          #{String(index + 1).padStart(2, '0')}
                        </span>
                        <div className="p-2.5 bg-zinc-100 dark:bg-white/5 text-zinc-500 rounded-xl">
                          {item.format === 'Reel' || item.format === 'Video' ? <Video className="w-5 h-5" /> : <ImageIcon className="w-5 h-5" />}
                        </div>
                        <span className="text-sm font-black text-zinc-900 dark:text-white uppercase tracking-tight">{item.format}</span>
                      </div>

                      <div className="space-y-4">
                        <div className="space-y-1">
                          <label className="text-[10px] font-black text-zinc-400 uppercase tracking-[0.2em] block">Objetivo</label>
                          <p className="text-sm font-bold text-zinc-800 dark:text-zinc-200 leading-tight">{item.objective}</p>
                        </div>

                        <div className="space-y-1">
                          <label className="text-[10px] font-black text-zinc-400 uppercase tracking-[0.2em] block">Publicación Estimada</label>
                          <div className="flex items-center gap-2 text-sm font-black text-indigo-600 dark:text-indigo-400">
                            <Calendar className="w-4 h-4" />
                            {item.publishDate ? new Date(item.publishDate).toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' }) : 'Pendiente'}
                          </div>
                        </div>

                        <div className="pt-2">
                          <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest border ${
                            isAprobado
                              ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-600'
                              : 'bg-indigo-500/10 border-indigo-500/30 text-indigo-600'
                          }`}>
                            {isAprobado ? <CheckCircle2 className="w-3.5 h-3.5" /> : <Clock className="w-3.5 h-3.5" />}
                            {isAprobado ? 'Aprobado' : 'En Revisión'}
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Middle: Content */}
                    <div className="lg:col-span-6 space-y-8">
                      <div className="space-y-3">
                        <label className="text-[10px] font-black text-zinc-400 uppercase tracking-[0.2em]">Copy Visual / Guion</label>
                        <div className="bg-zinc-50 dark:bg-white/2 p-6 rounded-[2rem] text-sm text-zinc-700 dark:text-zinc-300 whitespace-pre-wrap leading-relaxed">
                          {item.copyText || <span className="italic text-zinc-400">Sin detalles...</span>}
                        </div>
                      </div>

                      <div className="space-y-3">
                        <label className="text-[10px] font-black text-zinc-400 uppercase tracking-[0.2em]">Caption Redes</label>
                        <div className="bg-zinc-50 dark:bg-white/2 p-6 rounded-[2rem] text-sm text-zinc-700 dark:text-zinc-300 whitespace-pre-wrap leading-relaxed">
                          {item.captionText || <span className="italic text-zinc-400">Sin pie de foto...</span>}
                        </div>
                      </div>
                    </div>

                    {/* Right: Actions */}
                    <div className="lg:col-span-3 flex flex-col justify-between pt-6 lg:pt-0">
                      <div className="space-y-4">
                        {isAprobado ? (
                          <div className="p-6 bg-emerald-500/5 border border-emerald-500/20 rounded-[2rem] text-center space-y-2">
                            <div className="w-12 h-12 bg-emerald-500 text-white rounded-full flex items-center justify-center mx-auto shadow-lg shadow-emerald-500/20">
                              <Check className="w-6 h-6" />
                            </div>
                            <p className="text-sm font-black text-emerald-600 uppercase tracking-tight">Pieza Aprobada</p>
                          </div>
                        ) : (
                          <>
                            <button
                              onClick={() => handleApprove(item.id)}
                              className="w-full flex items-center justify-center gap-2 px-6 py-4 bg-emerald-600 hover:bg-emerald-700 text-white rounded-[1.5rem] transition-all font-black text-xs uppercase tracking-widest shadow-xl shadow-emerald-500/20"
                            >
                              <Check className="w-4 h-4" />
                              Aprobar Pieza
                            </button>
                            <button
                              onClick={() => setCommentingItemId(commentingItemId === item.id ? null : item.id)}
                              className="w-full flex items-center justify-center gap-2 px-6 py-4 bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 rounded-[1.5rem] transition-all font-black text-xs uppercase tracking-widest"
                            >
                              <MessageSquare className="w-4 h-4" />
                              Corregir / Comentar
                            </button>
                          </>
                        )}
                      </div>

                      {item.comments && (
                        <div className="mt-6 space-y-2">
                           <label className="text-[10px] font-black text-zinc-400 uppercase tracking-[0.2em]">Historial de Feedback</label>
                           <div className="max-h-48 overflow-y-auto space-y-3 pr-2">
                             {item.comments.split('\n\n').filter(Boolean).map((comment, i) => (
                               <div
                                 key={`${item.id}-comment-${i}`}
                                 className="text-[11px] text-zinc-500 dark:text-zinc-400 italic bg-zinc-50 dark:bg-white/2 p-3 rounded-xl border border-zinc-100 dark:border-white/5 leading-relaxed"
                               >
                                 {comment}
                               </div>
                             ))}
                           </div>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Comment Input Overlay */}
                  {commentingItemId === item.id && (
                    <div className="mt-8 pt-8 border-t border-zinc-100 dark:border-white/5">
                      <div className="flex flex-col gap-4">
                        <div className="flex items-center justify-between">
                          <label className="text-sm font-bold text-zinc-900 dark:text-white">Dinos qué debemos ajustar:</label>
                          <button onClick={() => setCommentingItemId(null)} className="text-zinc-400 hover:text-zinc-600"><X className="w-4 h-4" /></button>
                        </div>
                        <textarea
                          value={clientComment}
                          onChange={(e) => setClientComment(e.target.value)}
                          placeholder="Escribe tus sugerencias de cambio aquí..."
                          className="w-full min-h-[100px] bg-zinc-50 dark:bg-white/5 border border-zinc-200 dark:border-white/10 rounded-2xl p-4 text-sm focus:ring-4 focus:ring-indigo-500/10 outline-none transition-all"
                        />
                        <div className="flex justify-end">
                          <button
                            onClick={() => handleSubmitComment(item.id)}
                            disabled={isSubmitting || !clientComment.trim()}
                            className="flex items-center gap-2 px-6 py-3 bg-indigo-600 text-white rounded-xl font-bold text-xs uppercase tracking-widest disabled:opacity-50"
                          >
                            {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                            Enviar Feedback
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </main>

      <footer className="max-w-6xl mx-auto px-6 mt-20 text-center">
        <p className="text-xs text-zinc-400 font-medium">
          © {new Date().getFullYear()} Brainstudio Intelligence. Todos los derechos reservados.
        </p>
      </footer>
    </div>
  );
};

export default SharedContentPlan;
