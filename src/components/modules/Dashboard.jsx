import React, { useState, useEffect, useMemo } from 'react';
import { Card } from '@/components/ui/Card';
import { motion } from 'framer-motion';
import { ArrowUpRight, ArrowDownRight, Zap, TrendingUp, Clock, CheckCircle2, Activity, Target, Bell, MessageSquare, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import MeetingWidget from './MeetingWidget';
import HealthCheckWidget from './HealthCheckWidget';
import AnnouncementWidget from './AnnouncementWidget';
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
import ChatWidget from './ChatWidget';
import { useAuth } from '@/context/AuthContext';
import { useNavigate } from 'react-router-dom';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";

const Dashboard = () => {
  const { currentUser } = useAuth();
  const navigate = useNavigate();
  const [metrics, setMetrics] = useState({ total: 0, completed: 0, pending: 0, percentage: 0 });
  const [unreadCount, setUnreadCount] = useState(0);
  const [notifications, setNotifications] = useState([]);
  const [loadingNotifications, setLoadingNotifications] = useState(false);
  const [isGeneralChatModalOpen, setIsGeneralChatModalOpen] = useState(false);

  const getDailyMessage = () => {
    const day = new Date().getDay();
    const messages = {
      1: "Empezamos una nueva semana. ¡Vamos a darle con toda!",
      2: "Vamos a mantener el ritmo. ¡A seguir sumando victorias!",
      3: "¡Ya es mitad de semana! Ya pasamos la cima, ahora a cerrar con fuerza",
      4: "Jueves con sabor a viernes... Ya casi",
      5: "¡Ya llegó el viernes! Hoy celebramos los logro de la semana",
      6: "¿Trabajando un sábado? Gracias por tu compromiso",
      0: "Domingo chill. Día de recargar baterías, tómalo con mucha calma"
    };
    return messages[day] || "¡Bienvenido!";
  };

  const getFirstName = () => {
    if (!currentUser || !currentUser.name) return 'Equipo Brain';
    return currentUser.name.split(' ')[0];
  };

  const [completedNativeTasks, setCompletedNativeTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingNative, setLoadingNative] = useState(true);
  const [showHistoryModal, setShowHistoryModal] = useState(false);

  useEffect(() => {
    const fetchMetrics = async () => {
        try {
            setLoading(true);
            const baseUrl = getApiBaseUrl();
            const response = await fetch(`${baseUrl}/api/metrics/tasks`);
            if (!response.ok) {
                throw new Error(`Error ${response.status}: ${response.statusText}`);
            }
            const data = await response.json();
            setMetrics(data);
        } catch (err) {
            console.error("Failed to fetch dashboard metrics:", err);
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

    const fetchUnreadCount = async () => {
        try {
            const res = await fetch(`${getApiBaseUrl()}/api/notifications/unread-count`);
            if (res.ok) {
                const data = await res.json();
                setUnreadCount(data.count);
            }
        } catch (error) {
            console.error("Error fetching unread count:", error);
        }
    };

    const fetchNotifications = async () => {
        try {
            setLoadingNotifications(true);
            const res = await fetch(`${getApiBaseUrl()}/api/notifications`);
            if (res.ok) {
                const data = await res.json();
                setNotifications(data);
            }
        } catch (error) {
            console.error("Error fetching notifications:", error);
        } finally {
            setLoadingNotifications(false);
        }
    };

    fetchMetrics();
    fetchCompletedNativeTasks();
    fetchUnreadCount();
    fetchNotifications();

    const interval = setInterval(() => {
        fetchUnreadCount();
        fetchNotifications();
    }, 60000);

    const handleNotificationsRead = () => {
        fetchUnreadCount();
        fetchNotifications();
    };

    window.addEventListener('notifications-read', handleNotificationsRead);
    return () => {
        clearInterval(interval);
        window.removeEventListener('notifications-read', handleNotificationsRead);
    };
  }, []);

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

  const markAllAsRead = async () => {
      if (unreadCount === 0) return;

      // Optimistic update to prevent flicker/re-render cycles
      setUnreadCount(0);

      // Update local notifications state to mark them as read visually without a full refetch
      setNotifications(prev => prev.map(n => ({ ...n, isRead: true })));

      try {
          await fetch(`${getApiBaseUrl()}/api/notifications/read-all`, {
              method: 'POST'
          });
          // Notify other components if any, but avoid a full Dashboard re-render here
          // window.dispatchEvent(new Event('notifications-read'));
      } catch (error) {
          console.error("Error marking as read:", error);
      }
  };

  const handleNotificationClick = async (notif) => {
    // Mark as read first
    try {
        const baseUrl = getApiBaseUrl();
        await fetch(`${baseUrl}/api/notifications/${notif.id}/read`, { method: 'PATCH' });
        window.dispatchEvent(new Event('notifications-read'));
    } catch (e) {
        console.error("Error marking notification as read:", e);
    }

    // Navigate or Open Modal
    if (notif.type === 'GENERAL_CHAT_MENTION') {
        setIsGeneralChatModalOpen(true);
    } else if (notif.type === 'CAMPFIRE_MENTION') {
        // relatedId contains the clientId
        navigate(`/cliente/${notif.relatedId}?openChat=true`);
    } else if (notif.type === 'TASK_RETURNED') {
        // Navigate to Native Tasks (Gestion) and show returned tasks
        navigate(`/gestion?showReturned=true&taskId=${notif.relatedId}`);
    } else if (notif.type === 'TASK_CORRECTED') {
        // Navigate to Native Tasks (Gestion) and focus the corrected task
        navigate(`/gestion?taskId=${notif.relatedId}`);
    }
  };

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
            <DropdownMenu onOpenChange={(open) => open && markAllAsRead()}>
              <DropdownMenuTrigger asChild>
                <div className="p-3 bg-indigo-50 border border-indigo-100 rounded-full dark:bg-indigo-500/10 dark:border-indigo-500/20 relative cursor-pointer hover:bg-indigo-100 dark:hover:bg-indigo-500/20 transition-colors">
                  <Bell className="w-6 h-6 text-indigo-600 dark:text-indigo-400" />
                  {unreadCount > 0 && (
                    <div className="absolute -top-1 -right-1 flex h-5 w-5 items-center justify-center">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-5 w-5 bg-red-500 text-[10px] font-bold text-white items-center justify-center shadow-sm">
                            {unreadCount > 9 ? '9+' : unreadCount}
                        </span>
                    </div>
                  )}
                </div>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-80 p-0 overflow-hidden rounded-2xl border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-2xl">
                <div className="p-4 border-b border-zinc-100 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-900/50">
                    <h4 className="text-sm font-bold text-zinc-900 dark:text-white flex items-center gap-2">
                        <Bell className="w-4 h-4 text-primary" />
                        Notificaciones
                    </h4>
                </div>
                <div className="max-h-96 overflow-y-auto">
                    {loadingNotifications ? (
                        <div className="p-8 text-center"><Loader2 className="w-5 h-5 animate-spin text-zinc-400 mx-auto" /></div>
                    ) : notifications.length === 0 ? (
                        <div className="p-12 text-center">
                            <div className="w-12 h-12 rounded-full bg-zinc-50 dark:bg-zinc-800/50 flex items-center justify-center mx-auto mb-3">
                                <Bell className="w-6 h-6 text-zinc-300 dark:text-zinc-600" />
                            </div>
                            <p className="text-xs text-zinc-400">No hay notificaciones nuevas</p>
                        </div>
                    ) : (
                        notifications.map((notif) => (
                            <DropdownMenuItem
                                key={notif.id}
                                onClick={() => handleNotificationClick(notif)}
                                className="p-4 focus:bg-zinc-50 dark:focus:bg-zinc-800/50 cursor-pointer border-b border-zinc-50 dark:border-zinc-800/30 last:border-0"
                            >
                                <div className="flex gap-3 items-start w-full">
                                    <div className="p-1.5 bg-primary/10 rounded-lg shrink-0 mt-0.5">
                                        <MessageSquare className="w-3.5 h-3.5 text-primary" />
                                    </div>
                                    <div className="flex-1">
                                        <p className="text-xs text-zinc-700 dark:text-zinc-300 leading-relaxed">
                                            {notif.message}
                                        </p>
                                        <span className="text-[10px] text-zinc-400 mt-1 block">
                                            {new Date(notif.createdAt).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                                        </span>
                                    </div>
                                    {!notif.isRead && (
                                        <div className="w-1.5 h-1.5 rounded-full bg-primary shrink-0 mt-2" />
                                    )}
                                </div>
                            </DropdownMenuItem>
                        ))
                    )}
                </div>
              </DropdownMenuContent>
            </DropdownMenu>
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
                          {loading ? '...' : metrics.pending}
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
             <motion.div variants={item} className="col-span-1">
              <Card className="h-full flex flex-col justify-between hover:border-zinc-300 dark:hover:border-zinc-700 transition-colors group">
                <div className="flex justify-between items-start mb-4">
                  <span className="text-sm font-medium text-zinc-500 group-hover:text-zinc-600 dark:text-zinc-500 dark:group-hover:text-zinc-400 transition-colors">
                      Total realizadas
                  </span>
                  <div className="flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-full border bg-emerald-50 text-emerald-600 border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/20">
                    <TrendingUp className="w-3 h-3" />
                    +Impacto
                  </div>
                </div>
                <div>
                  <span className="text-4xl font-bold text-zinc-900 dark:text-white tracking-tight">
                      {loading ? '...' : metrics.completed}
                  </span>
                  <p className="text-xs text-zinc-400 mt-2">Tareas finalizadas en el historial</p>
                </div>
              </Card>
            </motion.div>

           {/* WIDGET 3: BROADCAST WIDGET (Full Width) */}
           <motion.div variants={item} className="col-span-2">
                <AnnouncementWidget scope="general" />
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
        <motion.div variants={item} className="md:col-span-1 flex flex-col gap-6 min-h-[900px]">
          {/* Recent Achievements */}
          <Card className="flex-1 flex flex-col min-h-[440px]">
            <div className="flex items-center gap-2 mb-6">
              <CheckCircle2 className="w-5 h-5 text-emerald-500" />
              <h3 className="text-lg font-semibold text-zinc-900 dark:text-white">Logros recientes</h3>
            </div>

            <div className="flex-1 overflow-y-auto space-y-6 pr-2 scroll-smooth">
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

            <div className="mt-4 pt-4 border-t border-zinc-100 dark:border-zinc-800">
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
          <div className="flex-1 min-h-[440px]">
            <ChatWidget
              title="Chat general"
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
