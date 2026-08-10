import React, { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import {
  AlertTriangle,
  ArrowUpRight,
  CalendarClock,
  CheckCircle2,
  ChevronDown,
  CircleDot,
  Clock,
  Compass,
  FileText,
  LayoutDashboard,
  Loader2,
  MessageSquareText,
  Target,
  Trophy,
  UserRound,
  UsersRound,
  Zap
} from '@/components/ui/icons';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/button';
import TeamAvatar from '@/components/ui/TeamAvatar';
import ClientAvatar from '@/components/ui/ClientAvatar';
import { useAuth } from '@/context/AuthContext';
import { getApiBaseUrl } from '@/lib/apiBaseUrl';
import { cn } from '@/lib/utils';
import CompletedTasksHistoryModal from './CompletedTasksHistoryModal';
import DashboardAnnouncements from './DashboardAnnouncements';

const container = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.06 }
  }
};

const item = {
  hidden: { y: 12, opacity: 0 },
  show: { y: 0, opacity: 1 }
};

const statConfig = [
  { key: 'active', label: 'Activas', icon: CircleDot, tone: 'text-sky-600 dark:text-sky-400', surface: 'bg-sky-50 dark:bg-sky-500/10' },
  { key: 'dueToday', label: 'Para hoy', icon: CalendarClock, tone: 'text-violet-600 dark:text-violet-400', surface: 'bg-violet-50 dark:bg-violet-500/10' },
  { key: 'overdue', label: 'Vencidas', icon: AlertTriangle, tone: 'text-amber-600 dark:text-amber-400', surface: 'bg-amber-50 dark:bg-amber-500/10' },
  { key: 'returned', label: 'Devueltas', icon: MessageSquareText, tone: 'text-rose-600 dark:text-rose-400', surface: 'bg-rose-50 dark:bg-rose-500/10' },
  { key: 'completedToday', label: 'Logros hoy', icon: Trophy, tone: 'text-emerald-600 dark:text-emerald-400', surface: 'bg-emerald-50 dark:bg-emerald-500/10' }
];

const cardTone = {
  critical: 'border-l-rose-500',
  warning: 'border-l-amber-500',
  info: 'border-l-sky-500',
  success: 'border-l-emerald-500'
};

const focusIconTone = {
  critical: 'bg-rose-50 text-rose-600 dark:bg-rose-500/10 dark:text-rose-300',
  warning: 'bg-amber-50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-300',
  info: 'bg-sky-50 text-sky-600 dark:bg-sky-500/10 dark:text-sky-300',
  success: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-300'
};

const dashboardPanelClass = 'rounded-lg border-zinc-200/80 dark:border-zinc-800 bg-white/95 dark:bg-zinc-900/90 shadow-sm hover:shadow-sm hover:bg-white dark:hover:bg-zinc-900/90 dark:hover:border-zinc-800 dark:hover:ring-white/5';
const balancedDashboardGridClass = 'grid grid-cols-1 xl:grid-cols-[minmax(0,1.3fr)_minmax(340px,0.7fr)] gap-5';

const formatDate = (value) => {
  if (!value) return 'Sin fecha';
  return new Date(value).toLocaleDateString('es-CO', {
    day: 'numeric',
    month: 'short'
  });
};

const formatTime = (value) => {
  if (!value) return '';
  return new Date(value).toLocaleTimeString('es-CO', {
    hour: '2-digit',
    minute: '2-digit'
  });
};

const getAuthHeaders = () => {
  const token = localStorage.getItem('authToken');
  return token ? { Authorization: `Bearer ${token}` } : {};
};

const fetchJson = async (url) => {
  const response = await fetch(url, {
    cache: 'no-store',
    headers: getAuthHeaders()
  });
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error || 'No se pudo cargar la informacion.');
  }
  return response.json();
};

const sendJson = async (url, options = {}) => {
  const response = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...getAuthHeaders(),
      ...(options.headers || {})
    }
  });
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    console.error('[Dashboard] API error:', errorData);
    throw new Error(errorData.error || 'No se pudo guardar el cambio.');
  }
  if (response.status === 204) return null;
  return response.json();
};

const EmptyState = ({ icon: Icon, title, description }) => (
  <div className="min-h-[140px] rounded-xl border border-dashed border-zinc-200 dark:border-zinc-800 bg-zinc-50/60 dark:bg-zinc-950/40 flex flex-col items-center justify-center text-center px-6 py-8">
    <Icon className="w-8 h-8 text-zinc-300 dark:text-zinc-700 mb-3" />
    <p className="text-sm font-bold text-zinc-700 dark:text-zinc-200">{title}</p>
    <p className="text-xs text-zinc-500 dark:text-zinc-500 max-w-xs mt-1">{description}</p>
  </div>
);

const TaskRow = ({ task, showFeedback = false, onClick }) => (
  <div
    role={onClick ? 'button' : undefined}
    tabIndex={onClick ? 0 : undefined}
    onClick={onClick}
    onKeyDown={(event) => {
      if (onClick && (event.key === 'Enter' || event.key === ' ')) {
        event.preventDefault();
        onClick();
      }
    }}
    className={cn(
      'flex items-start justify-between gap-4 rounded-xl border border-zinc-100 dark:border-zinc-800 bg-white dark:bg-zinc-950/40 px-4 py-3',
      onClick && 'cursor-pointer transition-colors hover:border-primary/30 hover:bg-primary/5 dark:hover:bg-primary/10 focus:outline-none focus:ring-2 focus:ring-primary/30'
    )}
  >
    <div className="min-w-0">
      <div className="flex items-center gap-2">
        {task.client && <ClientAvatar client={task.client} size={18} />}
        <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 truncate">{task.title}</p>
      </div>
      <div className="flex flex-wrap items-center gap-2 mt-1 text-xs text-zinc-500 dark:text-zinc-400">
        {task.client?.name && <span>{task.client.name}</span>}
        {task.assignee?.name && <span>{task.assignee.name}</span>}
        {task.status && <span className="rounded-full bg-zinc-100 dark:bg-zinc-800 px-2 py-0.5">{task.status}</span>}
        {showFeedback && task.lastFeedback && <span className="text-amber-600 dark:text-amber-400 line-clamp-1">Feedback: {task.lastFeedback}</span>}
      </div>
    </div>
    <div className="shrink-0 text-right">
      <p className="text-xs font-bold text-zinc-700 dark:text-zinc-200">{formatDate(task.dueDate || task.completedAt)}</p>
      {task.completedAt && <p className="text-[11px] text-zinc-400">{formatTime(task.completedAt)}</p>}
    </div>
  </div>
);

const Dashboard = () => {
  const { currentUser } = useAuth();
  const [selectedUserId, setSelectedUserId] = useState(currentUser?.id || '');
  const [assignClientId, setAssignClientId] = useState('');
  const [assignMemberId, setAssignMemberId] = useState('');
  const [expandedFocusCards, setExpandedFocusCards] = useState({});
  const [showHistoryModal, setShowHistoryModal] = useState(false);

  const queryClient = useQueryClient();
  const baseUrl = getApiBaseUrl();
  const canViewTeamDashboards = currentUser?.role === 'ADMIN';
  const canManageDashboard = ['ADMIN', 'PROJECT_MANAGER'].includes(currentUser?.role);

  const { data: teamMembers = [] } = useQuery({
    queryKey: ['dashboard-team-members'],
    queryFn: () => fetchJson(`${baseUrl}/api/team`),
    enabled: canViewTeamDashboards || canManageDashboard,
    staleTime: 60000
  });

  const { data: clients = [] } = useQuery({
    queryKey: ['dashboard-assignment-clients'],
    queryFn: () => fetchJson(`${baseUrl}/api/clients`),
    enabled: canManageDashboard,
    staleTime: 60000
  });

  const selectedMemberUserId = useMemo(() => {
    if (canViewTeamDashboards && selectedUserId) return selectedUserId;
    return currentUser?.id || '';
  }, [canViewTeamDashboards, currentUser?.id, selectedUserId]);

  const { data: dashboard, isLoading, error } = useQuery({
    queryKey: ['personal-dashboard', selectedMemberUserId],
    queryFn: () => fetchJson(`${baseUrl}/api/dashboard/personal/${selectedMemberUserId}`),
    enabled: !!selectedMemberUserId,
    refetchInterval: 45000,
    refetchOnWindowFocus: true
  });

  const communityManagers = useMemo(
    () => teamMembers.filter((member) => member.role?.toLowerCase().includes('community manager')),
    [teamMembers]
  );

  const selectedMember = dashboard?.member;
  const completedFeed = useMemo(() => {
    const bogotaFormatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Bogota',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    });
    const todayStr = bogotaFormatter.format(new Date());

    return (dashboard?.achievements || []).filter((task) => {
      if (!task.completedAt) return false;
      try {
        return bogotaFormatter.format(new Date(task.completedAt)) === todayStr;
      } catch {
        return false;
      }
    }).slice(0, 15);
  }, [dashboard?.achievements]);

  const toggleFocusCard = (focusCardId) => {
    setExpandedFocusCards((current) => ({
      ...current,
      [focusCardId]: !current[focusCardId]
    }));
  };

  const getFocusItemUrl = (focusCard, focusItem) => {
    if (focusItem?.creatorId !== undefined || focusItem?.assigneeId !== undefined) {
      return `/gestion?taskId=${focusItem.id}`;
    }
    if (focusCard?.actionUrl) return focusCard.actionUrl;
    return '/gestion';
  };

  const createAnnouncementMutation = useMutation({
    mutationFn: (announcement) => sendJson(`${baseUrl}/api/dashboard/announcements`, {
      method: 'POST',
      body: JSON.stringify(announcement)
    }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['personal-dashboard'] });
    }
  });

  const updateAnnouncementMutation = useMutation({
    mutationFn: (announcement) => sendJson(`${baseUrl}/api/dashboard/announcements/${announcement.scope}/${announcement.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ content: announcement.content })
    }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['personal-dashboard'] });
    }
  });

  const deleteAnnouncementMutation = useMutation({
    mutationFn: (announcement) => sendJson(`${baseUrl}/api/dashboard/announcements/${announcement.scope}/${announcement.id}`, {
      method: 'DELETE'
    }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['personal-dashboard'] });
    }
  });

  const assignClientMutation = useMutation({
    mutationFn: () => sendJson(`${baseUrl}/api/dashboard/clients/${assignClientId}/responsible`, {
      method: 'PATCH',
      body: JSON.stringify({ memberId: assignMemberId })
    }),
    onSuccess: async () => {
      setAssignClientId('');
      setAssignMemberId('');
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['personal-dashboard'] }),
        queryClient.invalidateQueries({ queryKey: ['dashboard-assignment-clients'] })
      ]);
    }
  });

  return (
    <motion.div variants={container} initial="hidden" animate="show" className="space-y-5 pb-4">
      <motion.header variants={item} className="pt-4 flex flex-col lg:flex-row lg:items-end lg:justify-between gap-5">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-sm font-semibold text-primary mb-2">
            <span className="w-2 h-2 rounded-full bg-primary" />
            Centro de adopción
          </div>
          <h1 className="text-3xl font-semibold text-zinc-950 dark:text-white">Foco del equipo</h1>
          <p className="mt-1.5 max-w-2xl text-sm leading-6 text-zinc-500 dark:text-zinc-400">
            Señales accionables, liderazgo de cuentas y avances reales en una sola lectura.
          </p>
        </div>

        {canViewTeamDashboards && (
          <label className="flex items-center gap-3 min-w-full sm:min-w-[320px] lg:min-w-[380px] rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-3 py-2 shadow-sm">
            <span className="w-9 h-9 rounded-lg bg-primary/10 dark:bg-primary/15 flex items-center justify-center shrink-0">
              <LayoutDashboard className="w-4.5 h-4.5 text-primary" />
            </span>
            <span className="sr-only">Colaborador</span>
            <select
              value={selectedMemberUserId}
              onChange={(event) => setSelectedUserId(event.target.value)}
              aria-label="Colaborador"
              className="w-full bg-transparent py-1 text-sm font-semibold text-zinc-800 dark:text-zinc-100 focus:outline-none"
            >
              <option value={currentUser.id}>{currentUser.name || 'Mi dashboard'}</option>
              {teamMembers
                .filter((member) => member.userId && member.userId !== currentUser.id)
                .map((member) => (
                  <option key={member.userId} value={member.userId}>
                    {member.name} - {member.role}
                  </option>
                ))}
            </select>
          </label>
        )}
      </motion.header>

      {isLoading ? (
        <div className="h-96 flex items-center justify-center">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      ) : error ? (
        <Card className="p-8 text-center">
          <AlertTriangle className="w-10 h-10 mx-auto text-amber-500 mb-4" />
          <h3 className="text-xl font-black text-zinc-900 dark:text-zinc-100">No se pudo cargar el dashboard</h3>
          <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-2">{error.message}</p>
        </Card>
      ) : (
        <>
          <motion.div variants={item} className={balancedDashboardGridClass}>
            <Card className={cn(dashboardPanelClass, 'p-0')}>
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-5 p-6">
                <div className="flex items-center gap-4">
                  <div className="relative">
                    <TeamAvatar member={selectedMember || { name: 'Equipo Brain' }} className="w-14 h-14 text-xl ring-4 ring-zinc-50 dark:ring-zinc-800" size={56} />
                    <span className="absolute right-0 bottom-0 w-3.5 h-3.5 rounded-full bg-emerald-500 border-2 border-white dark:border-zinc-900" />
                  </div>
                  <div className="min-w-0">
                    <h2 className="text-2xl font-semibold text-zinc-950 dark:text-white truncate">{selectedMember?.name || 'Equipo Brain'}</h2>
                    <p className="text-sm text-zinc-500 dark:text-zinc-400 truncate">{selectedMember?.role || 'Sin rol asignado'}</p>
                  </div>
                </div>
                <Button className="gap-2 rounded-lg px-5 shadow-sm shadow-primary/15" onClick={() => { window.location.href = '/gestion'; }}>
                  Ver gestión
                  <ArrowUpRight className="w-4 h-4" />
                </Button>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-5 border-t border-zinc-100 dark:border-zinc-800 bg-zinc-50/55 dark:bg-zinc-950/25">
                {statConfig.map(({ key, label, icon: Icon, tone, surface }, index) => (
                  <div
                    key={key}
                    className={cn(
                      'min-h-[112px] p-4 flex flex-col justify-between border-zinc-100 dark:border-zinc-800',
                      index > 0 && 'md:border-l',
                      index % 2 === 1 && 'border-l md:border-l',
                      index >= 2 && 'border-t md:border-t-0'
                    )}
                  >
                    <span className={cn('w-8 h-8 rounded-lg flex items-center justify-center', surface)}>
                      <Icon className={cn('w-4 h-4', tone)} />
                    </span>
                    <div>
                      <p className="text-2xl font-semibold text-zinc-950 dark:text-white">{dashboard.stats?.[key] ?? 0}</p>
                      <p className="text-xs text-zinc-500 dark:text-zinc-400">{label}</p>
                    </div>
                  </div>
                ))}
              </div>
            </Card>

            <Card className={cn(dashboardPanelClass, 'p-6 flex flex-col justify-between')}>
              <div>
                <div className="flex items-center gap-3 mb-6">
                  <div className="w-10 h-10 rounded-lg bg-violet-50 dark:bg-violet-500/10 flex items-center justify-center">
                    <Target className="w-5 h-5 text-violet-600 dark:text-violet-400" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-zinc-950 dark:text-white">Reto de la semana</h3>
                    <p className="text-xs text-zinc-500 dark:text-zinc-400">Hábito operativo calibrable</p>
                  </div>
                </div>
                <h4 className="text-xl font-semibold text-zinc-950 dark:text-white">{dashboard.weeklyHabit?.title}</h4>
                <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-2 leading-6">{dashboard.weeklyHabit?.description}</p>
              </div>
              <div className="mt-7">
                <div className="flex justify-between text-xs font-semibold text-zinc-500 dark:text-zinc-400 mb-2.5">
                  <span>{dashboard.weeklyHabit?.targetLabel}</span>
                  <span>{dashboard.weeklyHabit?.progress ?? 0}%</span>
                </div>
                <div className="h-2 rounded-full bg-zinc-100 dark:bg-zinc-800 overflow-hidden">
                  <div className="h-full rounded-full bg-primary transition-all duration-700" style={{ width: `${dashboard.weeklyHabit?.progress ?? 0}%` }} />
                </div>
              </div>
            </Card>
          </motion.div>

          <motion.div variants={item} className={cn(balancedDashboardGridClass, 'items-stretch')}>
            <Card className={cn(dashboardPanelClass, 'p-0 min-h-[470px]')}>
              <div className="flex items-center justify-between gap-4 px-6 py-5 border-b border-zinc-100 dark:border-zinc-800">
                <div className="flex items-center gap-3">
                  <span className="w-9 h-9 rounded-lg bg-primary/10 dark:bg-primary/15 flex items-center justify-center">
                    <Compass className="w-[18px] h-[18px] text-primary" />
                  </span>
                  <div>
                    <h3 className="text-lg font-semibold text-zinc-950 dark:text-white">Radar de Foco</h3>
                    <p className="text-xs text-zinc-500 dark:text-zinc-400">Lo que merece atención ahora</p>
                  </div>
                </div>
                <span className="text-xs font-semibold text-zinc-500 dark:text-zinc-400 rounded-full bg-zinc-100 dark:bg-zinc-800 px-2.5 py-1">
                  {dashboard.focusCards?.length || 0} {dashboard.focusCards?.length === 1 ? 'señal' : 'señales'}
                </span>
              </div>
              <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
                {dashboard.focusCards?.map((focusCard) => (
                  <div key={focusCard.id} className={cn('border-l-2 px-6 py-5', cardTone[focusCard.severity] || cardTone.info)}>
                    <div className="flex items-start gap-4">
                      <span className={cn('w-9 h-9 rounded-lg flex items-center justify-center shrink-0', focusIconTone[focusCard.severity] || focusIconTone.info)}>
                        <Zap className="w-[18px] h-[18px]" />
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="text-[11px] uppercase font-semibold text-zinc-400 dark:text-zinc-500">{focusCard.type}</p>
                        <h4 className="text-sm font-semibold text-zinc-950 dark:text-white mt-0.5">{focusCard.title}</h4>
                        <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1.5 leading-6">{focusCard.content}</p>
                      </div>
                    </div>
                    {focusCard.items?.length > 0 && (
                      <div className="mt-3 pl-[52px]">
                        <button
                          type="button"
                          onClick={() => toggleFocusCard(focusCard.id)}
                          className="inline-flex items-center gap-1.5 text-xs font-semibold text-zinc-600 hover:text-primary dark:text-zinc-300 dark:hover:text-primary transition-colors"
                        >
                          Ver mas
                          <ChevronDown className={cn('w-3.5 h-3.5 transition-transform', expandedFocusCards[focusCard.id] && 'rotate-180')} />
                        </button>
                        {expandedFocusCards[focusCard.id] && (
                          <div className="mt-3 space-y-2">
                            {focusCard.items.map((task) => (
                              <TaskRow
                                key={task.id}
                                task={task}
                                showFeedback={Boolean(task.lastFeedback)}
                                onClick={() => { window.location.href = getFocusItemUrl(focusCard, task); }}
                              />
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </Card>

            <Card className={cn(dashboardPanelClass, 'flex flex-col min-h-[470px] h-[470px] max-h-[470px] p-0')}>
              <div className="px-5 py-5 border-b border-zinc-100 dark:border-zinc-800 shrink-0">
                <div className="flex items-center gap-3">
                  <span className="w-9 h-9 rounded-lg bg-emerald-50 dark:bg-emerald-500/10 flex items-center justify-center">
                    <CheckCircle2 className="w-[18px] h-[18px] text-emerald-600 dark:text-emerald-400" />
                  </span>
                  <div>
                    <h3 className="text-base font-semibold text-zinc-950 dark:text-white">Logros recientes</h3>
                    <p className="text-xs text-zinc-500 dark:text-zinc-400">Victorias del equipo</p>
                  </div>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto px-5 py-5 scroll-smooth custom-scrollbar min-h-0">
                {completedFeed.length === 0 ? (
                  <EmptyState icon={Trophy} title="Aún no hay logros hoy" description="Las tareas completadas por el equipo aparecerán aquí." />
                ) : (
                  completedFeed.map((task, idx) => (
                    <div key={task.id || idx} className="relative pl-5 pb-6 last:pb-0">
                      {idx < completedFeed.length - 1 && (
                        <div className="absolute left-[3.5px] top-2 w-px h-full bg-zinc-200 dark:bg-zinc-800" />
                      )}
                      <div className="absolute left-0 top-1.5 w-2 h-2 rounded-full bg-emerald-500 ring-4 ring-emerald-50 dark:ring-emerald-500/10 z-10" />
                      <div className="group">
                        <div className="flex items-center gap-2 mb-1">
                          {task.assignee ? (
                            <TeamAvatar member={task.assignee} className="w-4 h-4" />
                          ) : (
                            <div className="w-4 h-4 rounded-full bg-emerald-500/10 flex items-center justify-center">
                              <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                            </div>
                          )}
                          <span className="text-[11px] text-emerald-600 dark:text-emerald-400 block font-semibold truncate">
                            {task.assignee ? task.assignee.name : 'Equipo'} completó:
                          </span>
                        </div>
                        <h4 className="text-zinc-800 dark:text-zinc-200 text-sm font-semibold mb-1.5 line-clamp-2">
                          {task.title}
                        </h4>
                        <div className="flex items-center gap-2 text-xs text-zinc-400 dark:text-zinc-500">
                          <div className="flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            {new Date(task.completedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </div>
                          {task.client && (
                            <>
                              <span className="mx-0.5 opacity-40">•</span>
                              <div className="flex items-center gap-1.5">
                                <ClientAvatar client={task.client} size={14} />
                                <span className="truncate max-w-[72px] font-semibold text-zinc-500">{task.client.name}</span>
                              </div>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>

              <div className="shrink-0 px-4 py-3 border-t border-zinc-100 dark:border-zinc-800 flex justify-center">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowHistoryModal(true)}
                  className="w-full rounded-lg text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-white transition-colors flex items-center gap-2 py-2"
                >
                  Ver historial completo
                  <ArrowUpRight className="w-3 h-3" />
                </Button>
              </div>
            </Card>
          </motion.div>

          <motion.div variants={item} className={balancedDashboardGridClass}>
            <DashboardAnnouncements
              announcements={dashboard.announcements}
              teamMembers={teamMembers}
              canManage={canManageDashboard}
              onCreate={(announcement) => createAnnouncementMutation.mutateAsync(announcement)}
              onUpdate={(announcement) => updateAnnouncementMutation.mutateAsync(announcement)}
              onDelete={(announcement) => deleteAnnouncementMutation.mutateAsync(announcement)}
              isSubmitting={createAnnouncementMutation.isPending || updateAnnouncementMutation.isPending || deleteAnnouncementMutation.isPending}
              error={createAnnouncementMutation.error || updateAnnouncementMutation.error || deleteAnnouncementMutation.error}
              className={dashboardPanelClass}
            />

            <Card className={cn(dashboardPanelClass, 'p-0 min-h-[360px]')}>
              <div className="flex items-center justify-between gap-4 px-6 py-5 border-b border-zinc-100 dark:border-zinc-800">
                <div className="flex items-center gap-3">
                  <span className="w-9 h-9 rounded-lg bg-sky-50 dark:bg-sky-500/10 flex items-center justify-center">
                    <CalendarClock className="w-[18px] h-[18px] text-sky-600 dark:text-sky-400" />
                  </span>
                  <div>
                    <h3 className="text-lg font-semibold text-zinc-950 dark:text-white">Próximos pendientes</h3>
                    <p className="text-xs text-zinc-500 dark:text-zinc-400">Lo que viene después del foco inmediato</p>
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="rounded-lg shrink-0"
                  title="Abrir gestión"
                  aria-label="Abrir gestión"
                  onClick={() => { window.location.href = '/gestion'; }}
                >
                  <ArrowUpRight className="w-4 h-4" />
                </Button>
              </div>
              <div className="p-5 space-y-2">
                {dashboard.upcomingTasks?.length > 0
                  ? dashboard.upcomingTasks.slice(0, 5).map((task) => <TaskRow key={task.id} task={task} />)
                  : <EmptyState icon={CalendarClock} title="Sin próximos vencimientos" description="No se encontraron tareas futuras con fecha asignada." />}
              </div>
            </Card>
          </motion.div>

          {selectedMember?.isCommunityManager && (
            <motion.div variants={item}>
              <Card className={cn(dashboardPanelClass, 'p-6')}>
                <div className="flex items-center gap-3 mb-5">
                  <FileText className="w-5 h-5 text-primary" />
                  <h3 className="text-lg font-semibold text-zinc-950 dark:text-white">Mis clientes</h3>
                </div>
                {dashboard.clients?.length > 0 ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {dashboard.clients.map((client) => (
                      <div key={client.id} className="rounded-lg border border-zinc-100 dark:border-zinc-800 bg-zinc-50/70 dark:bg-zinc-950/40 p-4">
                        <div className="flex items-center gap-3">
                          <ClientAvatar client={client} size={32} />
                          <div className="min-w-0">
                            <p className="text-sm font-semibold text-zinc-950 dark:text-white truncate">{client.name}</p>
                            <p className="text-xs text-zinc-500 dark:text-zinc-400">{client.activeTasks} tareas activas</p>
                          </div>
                        </div>
                        <div className="grid grid-cols-3 gap-2 mt-4 text-center text-xs">
                          <span className="rounded-lg bg-white dark:bg-zinc-900 py-2 text-zinc-500 dark:text-zinc-400">Salud {client.healthScore ?? '-'}</span>
                          <span className="rounded-lg bg-white dark:bg-zinc-900 py-2 text-amber-600 dark:text-amber-400">{client.overdueTasks} venc.</span>
                          <span className="rounded-lg bg-white dark:bg-zinc-900 py-2 text-rose-600 dark:text-rose-400">{client.returnedTasks} dev.</span>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <EmptyState icon={UserRound} title="Sin clientes asignados" description="Cuando admin o project manager asignen cuentas, aparecerá aquí tu mapa de liderazgo." />
                )}
              </Card>
            </motion.div>
          )}

          {canManageDashboard && (
            <motion.div variants={item}>
              <Card className={cn(dashboardPanelClass, 'p-6')}>
                <div className="flex items-center gap-3 mb-5">
                  <UsersRound className="w-5 h-5 text-primary" />
                  <h3 className="text-lg font-semibold text-zinc-950 dark:text-white">Asignar cliente</h3>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <select
                    value={assignClientId}
                    onChange={(event) => setAssignClientId(event.target.value)}
                    className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 px-4 py-3 text-sm font-semibold text-zinc-800 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-primary/30"
                  >
                    <option value="">Cliente</option>
                    {clients.map((client) => (
                      <option key={client.id} value={client.id}>{client.name}</option>
                    ))}
                  </select>
                  <select
                    value={assignMemberId}
                    onChange={(event) => setAssignMemberId(event.target.value)}
                    className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 px-4 py-3 text-sm font-semibold text-zinc-800 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-primary/30"
                  >
                    <option value="">Community Manager</option>
                    {communityManagers.map((member) => (
                      <option key={member.id} value={member.id}>{member.name}</option>
                    ))}
                  </select>
                </div>
                {assignClientMutation.error && (
                  <p className="text-xs font-semibold text-rose-600 dark:text-rose-400 mt-3">{assignClientMutation.error.message}</p>
                )}
                <Button
                  className="gap-2 mt-4 rounded-lg"
                  disabled={assignClientMutation.isPending || !assignClientId || !assignMemberId}
                  onClick={() => assignClientMutation.mutate()}
                >
                  {assignClientMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <UsersRound className="w-4 h-4" />}
                  Asignar
                </Button>
              </Card>
            </motion.div>
          )}
        </>
      )}
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
