import React, { useState, useEffect, useMemo } from 'react';
import { Card } from '@/components/ui/Card';
import { motion } from 'framer-motion';
import { ArrowUpRight, ArrowDownRight, Zap, TrendingUp, Clock, CheckCircle2, Activity, Target } from 'lucide-react';
import { cn } from '@/lib/utils';
import StudioBroadcastWidget from './StudioBroadcastWidget';
import MeetingWidget from './MeetingWidget';
import HealthCheckWidget from './HealthCheckWidget';
import { getApiBaseUrl } from '@/lib/apiBaseUrl';

const container = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: {
      staggerChildren: 0.1
    }
  }
};

const item = {
  hidden: { y: 20, opacity: 0 },
  show: { y: 0, opacity: 1 }
};

import CompletedTasksHistoryModal from './CompletedTasksHistoryModal';
import TeamAvatar from '@/components/ui/TeamAvatar';

const Dashboard = () => {
  const [tasks, setTasks] = useState([]);
  const [completedNativeTasks, setCompletedNativeTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingNative, setLoadingNative] = useState(true);
  const [showHistoryModal, setShowHistoryModal] = useState(false);

  useEffect(() => {
    const fetchTasks = async () => {
        try {
            setLoading(true);
            const baseUrl = getApiBaseUrl();
            const response = await fetch(`${baseUrl}/api/pendientes`);
            if (!response.ok) {
                throw new Error(`Error ${response.status}: ${response.statusText}`);
            }
            const data = await response.json();
            setTasks(data);
        } catch (err) {
            console.error("Failed to fetch tasks for dashboard:", err);
            // On error, we just show empty states, not a crash
        } finally {
            setLoading(false);
        }
    };

    const fetchCompletedNativeTasks = async () => {
        try {
            setLoadingNative(true);
            const baseUrl = getApiBaseUrl();
            const response = await fetch(`${baseUrl}/api/tasks/completed`);
            if (!response.ok) {
                throw new Error(`Error ${response.status}: ${response.statusText}`);
            }
            const data = await response.json();
            setCompletedNativeTasks(data);
        } catch (err) {
            console.error("Failed to fetch completed native tasks:", err);
        } finally {
            setLoadingNative(false);
        }
    };

    fetchTasks();
    fetchCompletedNativeTasks();
  }, []);

  // --- LOGIC: METAS DEL MES ---
  const goalsStats = useMemo(() => {
      const total = tasks.length;
      // Normalizar estado 'Realizado'
      const completed = tasks.filter(t => {
          const s = String(t.estado || "").toLowerCase().trim();
          return ['realizado', 'finalizado', 'hecho', 'done'].includes(s);
      }).length;
      const pending = total - completed;
      const percentage = total > 0 ? Math.round((completed / total) * 100) : 0;

      return { total, completed, pending, percentage };
  }, [tasks]);

  // --- LOGIC: FEED DE LOGROS (Completed TODAY from Native Tasks) ---
  const completedFeed = useMemo(() => {
      const today = new Date();
      // Reset time to compare only dates (YYYY-MM-DD)
      const todayStr = today.toISOString().split('T')[0];

      return completedNativeTasks.filter(t => {
          if (!t.completedAt) return false;
          try {
              const d = new Date(t.completedAt);
              const dStr = d.toISOString().split('T')[0];
              return dStr === todayStr;
          } catch (e) {
              return false;
          }
      }).slice(0, 5); // Limit to the 5 most recent
  }, [completedNativeTasks]);

  return (
    <motion.div
      variants={container}
      initial="hidden"
      animate="show"
      className="space-y-6"
    >
      {/* Welcome Widget - Full Width */}
      <motion.div variants={item}>
        <Card className="bg-gradient-to-r from-white to-zinc-50 border-zinc-200/60 dark:from-zinc-900 dark:to-zinc-900/50 dark:border-zinc-800">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-2xl font-bold text-zinc-900 dark:text-white mb-2">¡Hola, Equipo Brain!</h2>
              <p className="text-zinc-500 dark:text-zinc-400">Aquí está el resumen de progreso y logros del mes.</p>
            </div>
            <div className="p-3 bg-indigo-50 border border-indigo-100 rounded-full dark:bg-indigo-500/10 dark:border-indigo-500/20">
              <Zap className="w-6 h-6 text-indigo-600 dark:text-indigo-400" />
            </div>
          </div>
        </Card>
      </motion.div>

      {/* Bento Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">

        {/* Metrics Column (Left - 2/3 width) */}
        <div className="md:col-span-2 grid grid-cols-2 gap-6">

            {/* WIDGET 1: PENDIENTES DEL MES (Counter + Progress) */}
            <motion.div variants={item} className="col-span-1">
              <Card className="h-full flex flex-col justify-between hover:border-zinc-300 dark:hover:border-zinc-700 transition-colors group">
                <div className="flex justify-between items-start mb-4">
                  <span className="text-sm font-medium text-zinc-500 group-hover:text-zinc-600 dark:text-zinc-500 dark:group-hover:text-zinc-400 transition-colors">
                      Pendientes del Mes
                  </span>
                  <div className="flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-full border bg-orange-50 text-orange-600 border-orange-200 dark:bg-orange-500/10 dark:text-orange-400 dark:border-orange-500/20">
                    <Target className="w-3 h-3" />
                    En curso
                  </div>
                </div>

                <div>
                  <div className="flex items-end gap-2 mb-2">
                      <span className="text-4xl font-bold text-zinc-900 dark:text-white tracking-tight">
                          {loading ? '...' : goalsStats.pending}
                      </span>
                      <span className="text-sm text-zinc-400 mb-1.5">
                          / {goalsStats.total} total
                      </span>
                  </div>

                  {/* Progress Bar */}
                  <div className="w-full bg-zinc-100 dark:bg-zinc-800 rounded-full h-2.5 overflow-hidden">
                      <div
                        className="bg-indigo-600 dark:bg-indigo-500 h-2.5 rounded-full transition-all duration-1000 ease-out"
                        style={{ width: `${goalsStats.percentage}%` }}
                      ></div>
                  </div>
                  <p className="text-xs text-zinc-400 mt-2 text-right">{goalsStats.percentage}% Completado</p>
                </div>
              </Card>
            </motion.div>

             {/* WIDGET 2: COMPLETED (Counter) */}
             <motion.div variants={item} className="col-span-1">
              <Card className="h-full flex flex-col justify-between hover:border-zinc-300 dark:hover:border-zinc-700 transition-colors group">
                <div className="flex justify-between items-start mb-4">
                  <span className="text-sm font-medium text-zinc-500 group-hover:text-zinc-600 dark:text-zinc-500 dark:group-hover:text-zinc-400 transition-colors">
                      Total Realizadas
                  </span>
                  <div className="flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-full border bg-emerald-50 text-emerald-600 border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/20">
                    <TrendingUp className="w-3 h-3" />
                    +Impacto
                  </div>
                </div>
                <div>
                  <span className="text-4xl font-bold text-zinc-900 dark:text-white tracking-tight">
                      {loading ? '...' : goalsStats.completed}
                  </span>
                  <p className="text-xs text-zinc-400 mt-2">Tareas finalizadas este mes</p>
                </div>
              </Card>
            </motion.div>

           {/* WIDGET 3: BROADCAST WIDGET (Full Width) */}
           <motion.div variants={item} className="col-span-2">
                <StudioBroadcastWidget />
           </motion.div>

           {/* ROW: MEETING + HEALTH CHECK */}
           <motion.div variants={item} className="col-span-1">
                <MeetingWidget />
           </motion.div>

           <motion.div variants={item} className="col-span-1">
                <HealthCheckWidget />
           </motion.div>
        </div>

        {/* News/Updates Column (Right - 1/3 width) -> FEED DE LOGROS */}
        <motion.div variants={item} className="md:col-span-1 h-full">
          <Card className="h-full">
            <div className="flex items-center gap-2 mb-6">
              <CheckCircle2 className="w-5 h-5 text-emerald-500" />
              <h3 className="text-lg font-semibold text-zinc-900 dark:text-white">Logros Recientes</h3>
            </div>

            <div className="space-y-6">
              {loadingNative ? (
                  <p className="text-sm text-zinc-400 animate-pulse">Cargando feed...</p>
              ) : completedFeed.length === 0 ? (
                  <div className="text-center py-8">
                      <p className="text-sm text-zinc-500 dark:text-zinc-400 italic">
                          "Aún no hay victorias hoy. ¡Tú puedes!"
                      </p>
                  </div>
              ) : (
                  completedFeed.map((task, idx) => (
                    <div key={idx} className="relative pl-6 border-l border-zinc-200 dark:border-zinc-800 pb-2 last:pb-0">
                      <div className="absolute -left-[5px] top-1.5 w-2.5 h-2.5 rounded-full bg-emerald-400 border border-emerald-200 dark:border-emerald-900 shadow-[0_0_8px_rgba(52,211,153,0.5)]" />
                      <div className="group">
                        <div className="flex items-center gap-2 mb-1">
                          {task.assignee ? (
                              <TeamAvatar member={task.assignee} className="w-4 h-4" />
                          ) : null}
                          <span className="text-xs text-emerald-600 dark:text-emerald-400 block font-medium">
                              {task.assignee ? task.assignee.name : "Equipo"} completó:
                          </span>
                        </div>
                        <h4 className="text-zinc-700 hover:text-zinc-900 dark:text-zinc-200 text-sm font-medium mb-1 dark:group-hover:text-white transition-colors line-clamp-2">
                            {task.title}
                        </h4>
                        <div className="flex items-center gap-1 text-xs text-zinc-400 dark:text-zinc-500">
                          <Clock className="w-3 h-3" />
                          {new Date(task.completedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          {task.client && (
                            <>
                                <span className="mx-1">•</span>
                                <span>{task.client.name}</span>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  ))
              )}
            </div>

            <div className="mt-8 pt-6 border-t border-zinc-200 dark:border-zinc-800">
               <button
                  onClick={() => setShowHistoryModal(true)}
                  className="w-full py-2 text-xs font-medium text-zinc-600 border border-zinc-200 hover:bg-zinc-50 hover:text-zinc-900 dark:text-zinc-500 dark:hover:text-white transition-colors dark:border-zinc-800 rounded-lg dark:hover:bg-zinc-800"
               >
                 Ver historial completo
               </button>
            </div>
          </Card>
        </motion.div>
      </div>

      {showHistoryModal && (
        <CompletedTasksHistoryModal
          isOpen={showHistoryModal}
          onClose={() => setShowHistoryModal(false)}
          tasks={completedNativeTasks}
        />
      )}
    </motion.div>
  );
};

export default Dashboard;
