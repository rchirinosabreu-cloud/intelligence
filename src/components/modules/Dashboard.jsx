import React, { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card } from '@/components/ui/Card';
import { motion } from 'framer-motion';
import { ArrowUpRight, Zap, TrendingUp, Clock, CheckCircle2, Target } from 'lucide-react';
import MeetingWidget from './MeetingWidget';
import HealthCheckWidget from './HealthCheckWidget';
import AnnouncementWidget from './AnnouncementWidget';
import { getApiBaseUrl } from '@/lib/apiBaseUrl';
import CompletedTasksHistoryModal from './CompletedTasksHistoryModal';
import TeamAvatar from '@/components/ui/TeamAvatar';
import ChatWidget from './ChatWidget';
import { useAuth } from '@/context/AuthContext';

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

const Dashboard = () => {
  const { currentUser } = useAuth();
  const [isGeneralChatModalOpen, setIsGeneralChatModalOpen] = useState(false);

  const getDailyMessage = () => {
    const day = new Date().getDay();
    const messages = {
      1: "Empezamos una nueva semana. ¡Vamos a darle con toda!",
      2: "Vamos a mantener el ritmo. ¡A seguir sumando victorias!",
      3: "¡Ya es mitad de semana! Ya pasamos la cima, ahora a cerrar con fuerza",
      4: "Jueves con sabor a viernes... Ya casi",
      5: "¡Ya llegó el viernes! Hoy celebramos los logros de la semana",
      6: "¿Trabajando un sábado? Gracias por tu compromiso",
      0: "Domingo chill. Día de recargar baterías, tómalo con mucha calma"
    };
    return messages[day] || "¡Bienvenido!";
  };

  const getFirstName = () => {
    if (!currentUser || !currentUser.name) return 'Equipo Brain';
    return currentUser.name.split(' ')[0];
  };

  const [showHistoryModal, setShowHistoryModal] = useState(false);

  // --- REACT QUERY: METRICS ---
  const {
    data: metrics = { total: 0, completed: 0, pending: 0, percentage: 0 },
    isLoading: loadingMetrics
  } = useQuery({
    queryKey: ['dashboardMetrics'],
    queryFn: async () => {
      const baseUrl = getApiBaseUrl();
      const response = await fetch(`${baseUrl}/api/metrics/tasks`, { cache: 'no-store' });
      if (!response.ok) throw new Error("Failed to fetch metrics");
      return await response.json();
    },
    refetchInterval: 30000,
    refetchOnWindowFocus: true,
  });

  // --- REACT QUERY: COMPLETED TASKS (Feed) ---
  const {
    data: completedNativeTasks = [],
    isLoading: loadingNative
  } = useQuery({
    queryKey: ['completedNativeTasks'],
    queryFn: async () => {
      const baseUrl = getApiBaseUrl();
      const response = await fetch(`${baseUrl}/api/tasks/completed`, { cache: 'no-store' });
      if (!response.ok) throw new Error("Failed to fetch completed tasks");
      const data = await response.json();
      return Array.isArray(data) ? data : [];
    },
    refetchInterval: 30000,
    refetchOnWindowFocus: true,
  });

  // --- LOGIC: FEED DE LOGROS (Completed TODAY from Native Tasks) ---
  const completedFeed = useMemo(() => {
      // Robust "Today" in America/Bogota to match backend boundaries
      const bogotaFormatter = new Intl.DateTimeFormat('en-CA', {
          timeZone: 'America/Bogota',
          year: 'numeric', month: '2-digit', day: '2-digit'
      });
      const todayStr = bogotaFormatter.format(new Date()); // Returns YYYY-MM-DD in Bogota

      return completedNativeTasks.filter(t => {
          if (!t.completedAt) return false;
          try {
              // Extract the date part using the same formatter to ensure we compare Bogota days
              const d = new Date(t.completedAt);
              const dStr = bogotaFormatter.format(d);
              return dStr === todayStr;
          } catch (e) {
              return false;
          }
      }).slice(0, 15); // Limit to the 15 most recent achievements
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
              <h2 className="text-2xl font-bold text-zinc-900 dark:text-white mb-2">
                ¡Hola, {getFirstName()}! {getDailyMessage()}
              </h2>
              <p className="text-zinc-500 dark:text-zinc-400">Aquí está el resumen de progreso y logros del mes.</p>
            </div>
          </div>
        </Card>
      </motion.div>

      {/* Bento Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">

        {/* Metrics Column (Left - 2/3 width) */}
        <div className="md:col-span-2 grid grid-cols-1 md:grid-cols-2 gap-6">

            {/* WIDGET 1: PENDIENTES DEL MES (Counter + Progress) */}
            <motion.div variants={item} className="w-full">
              <Card className="h-full flex flex-col justify-between hover:border-zinc-300 dark:hover:border-zinc-700 transition-colors group">
                <div className="flex justify-between items-start mb-4">
                  <span className="text-sm font-medium text-zinc-500 group-hover:text-zinc-600 dark:text-zinc-500 dark:group-hover:text-zinc-400 transition-colors">
                      Pendientes del mes
                  </span>
                  <div className="flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-full border bg-orange-50 text-orange-600 border-orange-200 dark:bg-orange-500/10 dark:text-orange-400 dark:border-orange-500/20">
                    <Target className="w-3 h-3" />
                    En curso
                  </div>
                </div>

                <div>
                  <div className="flex items-end gap-2 mb-2">
                      <span className="text-4xl font-bold text-zinc-900 dark:text-white tracking-tight">
                          {loadingMetrics ? '...' : metrics.pending}
                      </span>
                      <span className="text-sm text-zinc-400 mb-1.5">
                          / {metrics.total} total
                      </span>
                  </div>

                  {/* Progress Bar */}
                  <div className="w-full bg-zinc-100 dark:bg-zinc-800 rounded-full h-2.5 overflow-hidden">
                      <div
                        className="bg-indigo-600 dark:bg-indigo-500 h-2.5 rounded-full transition-all duration-1000 ease-out"
                        style={{ width: `${metrics.percentage}%` }}
                      ></div>
                  </div>
                  <p className="text-xs text-zinc-400 mt-2 text-right">{metrics.percentage}% Completado</p>
                </div>
              </Card>
            </motion.div>

             {/* WIDGET 2: COMPLETED (Counter) */}
             <motion.div variants={item} className="w-full">
              <Card className="h-full flex flex-col justify-between hover:border-zinc-300 dark:hover:border-zinc-700 transition-colors group">
                <div className="flex justify-between items-start mb-4">
                  <span className="text-sm font-medium text-zinc-500 group-hover:text-zinc-600 dark:text-zinc-500 dark:group-hover:text-zinc-400 transition-colors">
                      Total realizados
                  </span>
                  <div className="flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-full border bg-emerald-50 text-emerald-600 border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/20">
                    <TrendingUp className="w-3 h-3" />
                    +Impacto
                  </div>
                </div>
                <div>
                  <span className="text-4xl font-bold text-zinc-900 dark:text-white tracking-tight">
                      {loadingMetrics ? '...' : metrics.completed}
                  </span>
                  <p className="text-xs text-zinc-400 mt-2">Pendientes finalizados en el historial</p>
                </div>
              </Card>
            </motion.div>

           {/* WIDGET 3: BROADCAST WIDGET (Full Width) */}
           <motion.div variants={item} className="md:col-span-2">
                <AnnouncementWidget scope="general" />
           </motion.div>

           {/* ROW: MEETING + HEALTH CHECK */}
           <motion.div variants={item} className="md:col-span-1">
                <MeetingWidget />
           </motion.div>

           <motion.div variants={item} className="md:col-span-1">
                <HealthCheckWidget />
           </motion.div>
        </div>

        {/* News/Updates Column (Right - 1/3 width) -> FEED DE LOGROS */}
        <motion.div variants={item} className="md:col-span-1 flex flex-col gap-6">
          {/* Recent Achievements */}
          <Card className="flex-1 flex flex-col min-h-[400px] h-full overflow-hidden">
            <div className="flex items-center gap-2 mb-6 shrink-0">
              <CheckCircle2 className="w-5 h-5 text-emerald-500" />
              <h3 className="text-lg font-semibold text-zinc-900 dark:text-white">Logros recientes</h3>
            </div>

            <div className="max-h-[400px] overflow-y-auto space-y-6 pr-2 scroll-smooth custom-scrollbar">
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
                    <div key={idx} className="relative pl-6 pb-6 last:pb-0">
                      {/* Vertical line connecting points */}
                      {idx < completedFeed.length - 1 && (
                        <div className="absolute left-[4.5px] top-2 w-px h-full bg-zinc-200 dark:bg-zinc-800" />
                      )}
                      <div className="absolute left-0 top-1.5 w-2.5 h-2.5 rounded-full bg-emerald-400 border border-emerald-200 dark:border-emerald-900 shadow-[0_0_8px_rgba(52,211,153,0.5)] z-10" />
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

            <div className="mt-4 shrink-0 pt-4 border-t border-zinc-100 dark:border-zinc-800">
               <button
                  onClick={() => setShowHistoryModal(true)}
                  className="w-full py-2 text-xs font-medium text-zinc-600 hover:text-zinc-900 dark:text-zinc-500 dark:hover:text-white transition-colors flex items-center justify-center gap-2"
               >
                 Ver historial completo
                 <ArrowUpRight className="w-3 h-3" />
               </button>
            </div>
          </Card>

          {/* General Chat */}
          <div className="flex-1 min-h-[400px] h-full">
            <ChatWidget
              title="Team Flow"
              description="Chat operativo de toda la agencia"
              apiEndpoint="/api/general-chat"
              isGlobal={true}
              fullInterface={false}
              externalOpen={isGeneralChatModalOpen}
              onExternalOpenChange={setIsGeneralChatModalOpen}
            />
          </div>
        </motion.div>
      </div>

      {showHistoryModal && (
        <CompletedTasksHistoryModal
          isOpen={showHistoryModal}
          onClose={() => setShowHistoryModal(false)}
        />
      )}
    </motion.div>
  );
};

export default Dashboard;
