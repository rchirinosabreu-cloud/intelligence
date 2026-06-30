import React, { useState } from 'react';
import {
  Loader2, Save, Activity, Settings2, Clock,
  MessageSquare, CheckCircle2, AlertCircle, Layout,
  ShieldCheck, AlertTriangle
} from 'lucide-react';
import { getApiBaseUrl } from '@/lib/apiBaseUrl';
import { toast } from 'react-hot-toast';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { motion } from 'framer-motion';

const ClientExpandedDetail = ({ client, onUpdate }) => {
  const [mode, setMode] = useState(client.healthRecords?.[0]?.isExternal ? 'manual' : 'auto');
  const [isSaving, setIsSaving] = useState(false);
  const [newComment, setNewComment] = useState('');

  // Manual States
  const [contentStatus, setContentStatus] = useState(client.healthRecords?.[0]?.contentStatus || 'CERRADA');
  const [reportStatus, setReportStatus] = useState(client.healthRecords?.[0]?.reportStatus || 'COMPLETA');
  const [cmFlag, setCmFlag] = useState(true); // Default to true if not explicitly set before

  const calculateManualScore = () => {
    let score = 0;
    if (contentStatus === 'CERRADA' || contentStatus === 'APROBADA') score += 40;
    else if (contentStatus === 'EN_ESPERA' || contentStatus === 'PROGRAMADA') score += 20;

    if (reportStatus === 'COMPLETA') score += 40;
    else if (reportStatus === 'EN_PROCESO') score += 20;

    if (cmFlag) score += 20;
    return score;
  };

  const handleSaveHealth = async () => {
    try {
      setIsSaving(true);
      const baseUrl = getApiBaseUrl();
      const score = mode === 'manual' ? calculateManualScore() : null;

      const res = await fetch(`${baseUrl}/api/clients/${client.id}/health`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${localStorage.getItem('authToken')}`
        },
        body: JSON.stringify({
          mode,
          score,
          contentStatus,
          reportStatus,
          isExternal: mode === 'manual',
          comment: "" // Comment is handled separately or can be sent here too
        }),
      });

      if (!res.ok) throw new Error("Error al guardar salud");
      const updated = await res.json();
      onUpdate(updated);
      toast.success("Configuración guardada");
    } catch (err) {
      toast.error(err.message);
    } finally {
      setIsSaving(false);
    }
  };

  const handleAddComment = async (e) => {
    if (e.key === 'Enter' && !e.shiftKey && newComment.trim()) {
      e.preventDefault();
      try {
        const baseUrl = getApiBaseUrl();
        const res = await fetch(`${baseUrl}/api/clients/${client.id}/health-comment`, {
          method: 'POST',
          headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${localStorage.getItem('authToken')}`
          },
          body: JSON.stringify({ comment: newComment }),
        });

        if (!res.ok) throw new Error();

        const addedComment = await res.json();
        // Update local client state to show the new comment
        const updatedClient = {
          ...client,
          agencyContexts: [addedComment, ...(client.agencyContexts || [])]
        };
        onUpdate(updatedClient);
        setNewComment('');
        toast.success("Comentario estampado");
      } catch (err) {
        toast.error("Error al guardar comentario");
      }
    }
  };

  return (
    <div className="p-8 grid grid-cols-1 lg:grid-cols-3 gap-8 animate-in slide-in-from-top-4 duration-300">

      {/* Block 1: Operational Control */}
      <div className="space-y-6">
        <div className="flex items-center gap-2 text-zinc-900 dark:text-white font-bold text-sm uppercase tracking-tight">
          <Settings2 className="w-4 h-4 text-indigo-500" />
          Control Operativo del Mes
        </div>

        <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-white/5 rounded-2xl p-5 space-y-4 shadow-sm">
          <div className="space-y-1.5">
            <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Estado de Avance</label>
            <select
              value={reportStatus}
              onChange={(e) => setReportStatus(e.target.value)}
              className="w-full bg-zinc-50 dark:bg-zinc-800 border-none rounded-xl text-sm font-medium focus:ring-2 focus:ring-indigo-500"
            >
              <option value="COMPLETA">Parrilla completa</option>
              <option value="CRITICO">Crítico</option>
              <option value="EN_PROCESO">Parrilla en proceso</option>
              <option value="SIN_PARRILLA">Sin parrilla</option>
            </select>
          </div>

          <div className="space-y-1.5">
            <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Fase de Aprobación</label>
            <select
              value={contentStatus}
              onChange={(e) => setContentStatus(e.target.value)}
              className="w-full bg-zinc-50 dark:bg-zinc-800 border-none rounded-xl text-sm font-medium focus:ring-2 focus:ring-indigo-500"
            >
              <option value="CERRADA">Cerrada</option>
              <option value="EN_ESPERA">En espera</option>
              <option value="PROGRAMADA">Programada</option>
              <option value="APROBADA">Aprobada</option>
            </select>
          </div>

          <div className="flex items-center justify-between py-2 border-t border-zinc-100 dark:border-white/5 mt-4">
             <span className="text-sm font-bold text-zinc-600 dark:text-zinc-400">Validación CM</span>
             <button
                onClick={() => setCmFlag(!cmFlag)}
                className={cn(
                  "relative inline-flex h-5 w-10 items-center rounded-full transition-colors",
                  cmFlag ? "bg-indigo-600" : "bg-zinc-200 dark:bg-zinc-800"
                )}
              >
                <span className={cn("inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform", cmFlag ? "translate-x-6" : "translate-x-0.5")} />
              </button>
          </div>

          <Button
            className="w-full mt-2"
            size="sm"
            onClick={handleSaveHealth}
            disabled={isSaving}
          >
            {isSaving ? <Loader2 className="w-3 h-3 animate-spin mr-2" /> : <Save className="w-3 h-3 mr-2" />}
            Actualizar Control
          </Button>
        </div>
      </div>

      {/* Block 2: Telemetry */}
      <div className="space-y-6">
        <div className="flex items-center gap-2 text-zinc-900 dark:text-white font-bold text-sm uppercase tracking-tight">
          <Activity className="w-4 h-4 text-indigo-500" />
          Detalle de Contenedores
        </div>

        <div className="space-y-6">
          <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-white/5 rounded-2xl p-5 shadow-sm">
            <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-2">Planificación del Mes</p>
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-xl bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600">
                <Layout className="w-5 h-5" />
              </div>
              <p className="text-sm font-bold text-zinc-700 dark:text-zinc-300">
                {client.telemetry?.planning}
              </p>
            </div>
          </div>

          <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-white/5 rounded-2xl p-5 shadow-sm">
            <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-3">Telemetría Kanban</p>
            <div className="space-y-2">
              <div className="flex justify-between items-end">
                <span className="text-2xl font-black text-indigo-600">{client.telemetry?.kanbanProgress}%</span>
                <span className="text-[10px] font-bold text-zinc-400 uppercase">Completado</span>
              </div>
              <div className="h-2 w-full bg-zinc-100 dark:bg-zinc-800 rounded-full overflow-hidden">
                <div
                  className="h-full bg-indigo-600 transition-all duration-1000"
                  style={{ width: `${client.telemetry?.kanbanProgress}%` }}
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Block 3: Bitácora */}
      <div className="space-y-6">
        <div className="flex items-center gap-2 text-zinc-900 dark:text-white font-bold text-sm uppercase tracking-tight">
          <MessageSquare className="w-4 h-4 text-indigo-500" />
          Bitácora Histórica
        </div>

        <div className="space-y-4">
          <div className="relative group">
            <textarea
              value={newComment}
              onChange={(e) => setNewComment(e.target.value)}
              onKeyDown={handleAddComment}
              placeholder="Escribe una observación y presiona Enter..."
              className="w-full h-20 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-white/10 rounded-2xl p-4 text-xs focus:ring-2 focus:ring-indigo-500 transition-all shadow-sm"
            />
          </div>

          <div className="space-y-3 max-h-[250px] overflow-y-auto pr-2 custom-scrollbar">
            {client.agencyContexts?.map((obs, idx) => (
              <div key={idx} className="p-3 rounded-xl bg-white dark:bg-zinc-800 border border-zinc-100 dark:border-white/5 space-y-1 shadow-sm">
                <div className="flex justify-between items-center text-[9px] font-bold text-zinc-400 uppercase">
                  <span>{new Date(obs.createdAt).toLocaleDateString()}</span>
                  <span className="text-indigo-500">
                    {obs.metadata?.authorName || "PM"}
                  </span>
                </div>
                <p className="text-[11px] text-zinc-600 dark:text-zinc-300 leading-relaxed italic">"{obs.content}"</p>
              </div>
            ))}
          </div>
        </div>
      </div>

    </div>
  );
};

export default ClientExpandedDetail;
