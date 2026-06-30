import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import * as Dialog from '@radix-ui/react-dialog';
import { X, Loader2, Save, Activity, Settings2, Clock, CheckCircle2, AlertCircle, MessageSquare } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { getApiBaseUrl } from '@/lib/apiBaseUrl';
import { toast } from 'react-hot-toast';
import { cn } from '@/lib/utils';

const HealthModal = ({ isOpen, onClose, client, onUpdate }) => {
  const [mode, setMode] = useState('manual'); // 'auto' or 'manual'
  const [isSaving, setIsSaving] = useState(false);

  // Manual States
  const [contentStatus, setContentStatus] = useState('APROBADA');
  const [reportStatus, setReportStatus] = useState('COMPLETA');
  const [cmFlag, setCmFlag] = useState(true);
  const [comment, setComment] = useState('');

  // Derived / Calculated Score (Manual)
  const calculateManualScore = () => {
    let score = 0;

    // Parrilla (40%)
    if (contentStatus === 'APROBADA') score += 40;
    else if (contentStatus === 'EN_ESPERA') score += 20;

    // Informe (40%)
    if (reportStatus === 'COMPLETA') score += 40;
    else if (reportStatus === 'EN_PROCESO') score += 20;

    // CM (20%)
    if (cmFlag) score += 20;

    return score;
  };

  useEffect(() => {
    if (client && isOpen) {
      const record = client.healthRecords?.[0];
      if (record) {
        setMode(record.isExternal ? 'manual' : 'auto');
        setContentStatus(record.contentStatus || 'APROBADA');
        setReportStatus(record.reportStatus || 'COMPLETA');
        setCmFlag(!record.isExternal || record.score > (record.contentStatus === 'APROBADA' ? 40 : 0) + (record.reportStatus === 'COMPLETA' ? 40 : 0)); // Estimation for mock/past data
      }
      setComment('');
    }
  }, [client, isOpen]);

  const handleSave = async () => {
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
          comment
        }),
      });

      if (!res.ok) throw new Error("Error al guardar salud");

      const updatedData = await res.json();
      onUpdate(updatedData);
      toast.success("Salud configurada correctamente");
      onClose();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setIsSaving(false);
    }
  };

  if (!client) return null;

  return (
    <Dialog.Root open={isOpen} onOpenChange={onClose}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[60] animate-in fade-in duration-200" />
        <Dialog.Content className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-xl bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-white/10 rounded-3xl shadow-2xl z-[70] animate-in zoom-in-95 duration-200 overflow-hidden flex flex-col max-h-[90vh]">

          {/* Header */}
          <div className="p-6 border-b border-zinc-100 dark:border-white/5 flex items-center justify-between bg-zinc-50/50 dark:bg-white/1">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-2xl bg-indigo-600 text-white shadow-lg shadow-indigo-500/20">
                <Activity className="w-5 h-5" />
              </div>
              <div>
                <Dialog.Title className="text-lg font-bold text-zinc-900 dark:text-white">
                  Configurar Salud
                </Dialog.Title>
                <p className="text-xs text-zinc-500 font-medium">{client.name}</p>
              </div>
            </div>
            <Dialog.Close asChild>
              <button className="p-2 hover:bg-zinc-100 dark:hover:bg-white/5 rounded-xl transition-colors">
                <X className="w-5 h-5 text-zinc-400" />
              </button>
            </Dialog.Close>
          </div>

          <div className="flex-1 overflow-y-auto p-6 space-y-8 custom-scrollbar">

            {/* Origin Toggle */}
            <div className="space-y-3">
              <label className="text-xs font-bold text-zinc-500 uppercase tracking-widest flex items-center gap-2">
                <Settings2 className="w-3 h-3" />
                Origen del Score
              </label>
              <div className="flex p-1 bg-zinc-100 dark:bg-white/5 rounded-2xl border border-zinc-200 dark:border-white/5">
                <button
                  onClick={() => setMode('auto')}
                  className={cn(
                    "flex-1 py-2.5 text-sm font-bold rounded-xl transition-all",
                    mode === 'auto' ? "bg-white dark:bg-zinc-800 shadow-sm text-indigo-600" : "text-zinc-500 hover:text-zinc-700"
                  )}
                >
                  Sistema (Auto)
                </button>
                <button
                  onClick={() => setMode('manual')}
                  className={cn(
                    "flex-1 py-2.5 text-sm font-bold rounded-xl transition-all",
                    mode === 'manual' ? "bg-white dark:bg-zinc-800 shadow-sm text-indigo-600" : "text-zinc-500 hover:text-zinc-700"
                  )}
                >
                  Excel (Manual)
                </button>
              </div>
            </div>

            {/* Manual Fields */}
            <AnimatePresence mode="wait">
              {mode === 'manual' ? (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className="grid grid-cols-1 md:grid-cols-2 gap-6 p-5 bg-indigo-50/30 dark:bg-indigo-500/5 rounded-3xl border border-indigo-100 dark:border-indigo-500/10"
                >
                  <div className="space-y-2">
                    <label className="text-[11px] font-bold text-indigo-600/70 dark:text-indigo-400 uppercase tracking-wider">Parrilla (40%)</label>
                    <select
                      value={contentStatus}
                      onChange={(e) => setContentStatus(e.target.value)}
                      className="w-full bg-white dark:bg-zinc-900 border-zinc-200 dark:border-white/10 rounded-xl text-sm font-medium focus:ring-indigo-500"
                    >
                      <option value="APROBADA">Aprobada (Full)</option>
                      <option value="EN_ESPERA">En espera (Medio)</option>
                      <option value="SIN_PARRILLA">Sin parrilla (0)</option>
                    </select>
                  </div>
                  <div className="space-y-2">
                    <label className="text-[11px] font-bold text-indigo-600/70 dark:text-indigo-400 uppercase tracking-wider">Informe (40%)</label>
                    <select
                      value={reportStatus}
                      onChange={(e) => setReportStatus(e.target.value)}
                      className="w-full bg-white dark:bg-zinc-900 border-zinc-200 dark:border-white/10 rounded-xl text-sm font-medium focus:ring-indigo-500"
                    >
                      <option value="COMPLETA">Completa (Full)</option>
                      <option value="EN_PROCESO">En proceso (Medio)</option>
                      <option value="CHUECO">Chueco (0)</option>
                    </select>
                  </div>
                  <div className="md:col-span-2 flex items-center justify-between bg-white dark:bg-zinc-900/50 p-3 rounded-2xl border border-zinc-100 dark:border-white/5">
                    <div className="flex items-center gap-2">
                      <div className={cn("w-2 h-2 rounded-full", cmFlag ? "bg-emerald-500" : "bg-zinc-300")} />
                      <span className="text-sm font-bold text-zinc-700 dark:text-zinc-300">Community Manager (20%)</span>
                    </div>
                    <button
                      onClick={() => setCmFlag(!cmFlag)}
                      className={cn(
                        "relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none",
                        cmFlag ? "bg-indigo-600" : "bg-zinc-300 dark:bg-zinc-700"
                      )}
                    >
                      <span className={cn("inline-block h-4 w-4 transform rounded-full bg-white transition-transform", cmFlag ? "translate-x-6" : "translate-x-1")} />
                    </button>
                  </div>
                  <div className="md:col-span-2 text-center pt-2">
                    <p className="text-[10px] text-zinc-400 font-bold uppercase tracking-widest mb-1">Score Proyectado</p>
                    <p className="text-3xl font-black text-indigo-600 dark:text-indigo-400">{calculateManualScore()}</p>
                  </div>
                </motion.div>
              ) : (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="p-8 text-center space-y-3"
                >
                  <div className="w-16 h-16 bg-zinc-100 dark:bg-white/5 rounded-full flex items-center justify-center mx-auto">
                    <Clock className="w-8 h-8 text-zinc-400 animate-pulse" />
                  </div>
                  <p className="text-sm text-zinc-500 max-w-xs mx-auto">
                    El sistema calculará el score basándose en la actividad real de las parrillas y tareas del mes en curso.
                  </p>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Bitácora / Comentario */}
            <div className="space-y-3">
              <label className="text-xs font-bold text-zinc-500 uppercase tracking-widest flex items-center gap-2">
                <MessageSquare className="w-3 h-3" />
                Bitácora de Rendimiento
              </label>
              <textarea
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder="Escribe una observación sobre el desempeño del cliente este mes..."
                className="w-full h-32 bg-zinc-50 dark:bg-zinc-900 border-zinc-200 dark:border-white/5 rounded-2xl p-4 text-sm focus:ring-indigo-500 focus:border-indigo-500 transition-all text-zinc-900 dark:text-white"
              />
            </div>

            {/* History Section */}
            <div className="space-y-4">
               <label className="text-xs font-bold text-zinc-500 uppercase tracking-widest flex items-center gap-2">
                <Clock className="w-3 h-3" />
                Historial de Memoria
              </label>
              <div className="space-y-3 max-h-48 overflow-y-auto pr-2 custom-scrollbar">
                {client.agencyContexts?.length > 0 ? (
                  client.agencyContexts.map((obs, idx) => (
                    <div key={idx} className="p-4 rounded-2xl bg-zinc-50 dark:bg-white/1 border border-zinc-100 dark:border-white/5 space-y-1">
                      <div className="flex justify-between items-center text-[10px] font-bold text-zinc-400 uppercase tracking-tighter">
                        <span>{new Date(obs.createdAt).toLocaleDateString()}</span>
                        {obs.metadata?.authorId && <span className="text-indigo-400">PM Obs</span>}
                      </div>
                      <p className="text-xs text-zinc-600 dark:text-zinc-400 italic">"{obs.content}"</p>
                    </div>
                  ))
                ) : (
                  <p className="text-xs text-zinc-400 italic text-center py-4">No hay historial previo.</p>
                )}
              </div>
            </div>

          </div>

          {/* Footer Actions */}
          <div className="p-6 border-t border-zinc-100 dark:border-white/5 bg-zinc-50/50 dark:bg-white/1 flex gap-3">
            <button
              onClick={onClose}
              className="flex-1 py-3 text-sm font-bold text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 transition-colors"
            >
              Cancelar
            </button>
            <Button
              onClick={handleSave}
              disabled={isSaving}
              className="flex-[2] py-6 shadow-xl shadow-indigo-500/20"
            >
              {isSaving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Save className="w-4 h-4 mr-2" />}
              Guardar Configuración
            </Button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
};

export default HealthModal;
