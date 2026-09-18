import Select from '@/components/ui/Select';
import React, { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import {
  AlertTriangle,
  ArrowUpRight,
  CalendarClock,
  CheckCircle2,
  CircleDot,
  Clock,
  FileText,
  LayoutDashboard,
  Loader2,
  MessageSquareText,
  Trophy,
  UserRound,
  UsersRound
} from '@/components/ui/icons';
import { Button } from '@/components/ui/button';
import TeamAvatar from '@/components/ui/TeamAvatar';
import ClientAvatar from '@/components/ui/ClientAvatar';
import { useAuth } from '@/context/AuthContext';
import { getApiBaseUrl } from '@/lib/apiBaseUrl';
import { pickDashboardTip } from '@/lib/dashboardTips';
import { cn } from '@/lib/utils';
import CompletedTasksHistoryModal from './CompletedTasksHistoryModal';
import DashboardAnnouncements from './DashboardAnnouncements';
import DashboardCrmAttention from './dashboard/DashboardCrmAttention';
import DashboardMeetings from './dashboard/DashboardMeetings';
import DashboardTip from './dashboard/DashboardTip';
import DashboardUpcomingTasks from './dashboard/DashboardUpcomingTasks';
import TaskRecognitionLabels from '@/components/recognitions/TaskRecognitionLabels';

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

// Task summary tiles painted with the official gradients (decision of 18 September 2026): white number, no ornaments.
const statConfig = [
  { key: 'active', label: 'Activas', icon: CircleDot, surface: 'brain-gradient-primary' },
  { key: 'dueToday', label: 'Para hoy', icon: CalendarClock, surface: 'bg-brand-cyan' },
  { key: 'overdue', label: 'Vencidas', icon: AlertTriangle, surface: 'bg-brand-coral' },
  { key: 'returned', label: 'Devueltas', icon: MessageSquareText, surface: 'brain-gradient-energy' },
  { key: 'completedToday', label: 'Logros hoy', icon: Trophy, surface: 'bg-brand-green' }
];

const dashboardPanelClass = 'brain-glass';
const topDashboardPanelClass = cn(dashboardPanelClass, 'h-[470px] max-h-[470px]');
// One grid for the whole body: every row stretches its widgets to the same height, so bottoms always align.
const dashboardColumnsClass = 'grid grid-cols-1 gap-5 items-stretch xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(300px,0.85fr)]';

const BOGOTA = 'America/Bogota';

const formatTodayLabel = (now = new Date()) => {
  const label = new Intl.DateTimeFormat('es-CO', { timeZone: BOGOTA, weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(now);
  return label.charAt(0).toUpperCase() + label.slice(1);
};

const firstNameOf = (name = '') => String(name).trim().split(/\s+/)[0] || '';

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
  <div className="min-h-[140px] rounded-xl border border-dashed border-zinc-200/80 dark:border-white/10 flex flex-col items-center justify-center text-center px-6 py-8">
    <Icon className="w-8 h-8 text-zinc-300 dark:text-zinc-600 mb-3" />
    <p className="text-sm font-bold text-zinc-700 dark:text-zinc-200">{title}</p>
    <p className="text-xs text-zinc-500 dark:text-zinc-400 max-w-xs mt-1">{description}</p>
  </div>
);

const Dashboard = () => {
  const { currentUser } = useAuth();
  const [selectedUserId, setSelectedUserId] = useState(currentUser?.id || '');
  const [assignClientId, setAssignClientId] = useState('');
  const [assignMemberId, setAssignMemberId] = useState('');
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
    refetchInterval: () => (document.hidden ? false : 60000),
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true
  });

  const communityManagers = useMemo(
    () => teamMembers.filter((member) => member.role?.toLowerCase().includes('community manager')),
    [teamMembers]
  );

  const selectedMember = dashboard?.member;
  const isViewingAnotherMember = Boolean(selectedMember?.userId && currentUser?.id && selectedMember.userId !== currentUser.id);
  const firstName = firstNameOf(currentUser?.name);
  const todayLabel = useMemo(() => formatTodayLabel(), []);
  // The tip is only personal when the person looks at their own dashboard.
  const tipUser = isViewingAnotherMember ? null : currentUser;
  const dailyTip = useMemo(() => (dashboard && tipUser ? pickDashboardTip({ dashboard, user: tipUser }) : null), [dashboard, tipUser]);
  const hasPersonalReminders = Boolean(
    dailyTip
    || (dashboard?.crmAttention?.enabled && dashboard.crmAttention.items?.length > 0)
    || selectedMember?.isCommunityManager
  );

  const completedFeed = useMemo(() => {
    const bogotaFormatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: BOGOTA,
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
    <motion.div variants={container} initial="hidden" animate="show" className="brain-ambient space-y-6 pb-4">
      <motion.header variants={item} className="pt-2 flex flex-col lg:flex-row lg:items-end lg:justify-between gap-5">
        <div className="min-w-0">
          <h1 className="text-3xl font-semibold tracking-tight text-zinc-950 dark:text-white">
            Hola, {firstName || 'equipo'}
          </h1>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">{todayLabel}</p>
          {isViewingAnotherMember && (
            <p className="mt-2 inline-flex items-center gap-2 rounded-full bg-brand-cyan/10 px-3 py-1 text-xs font-semibold text-brand-cyan-deep dark:bg-brand-cyan/15 dark:text-brand-cyan">
              <TeamAvatar member={selectedMember} size={20} className="h-5 w-5" showTitle={false} />
              Viendo el dashboard de {selectedMember.name}
            </p>
          )}
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          {canViewTeamDashboards && (
            <label className="brain-glass flex min-w-full items-center gap-3 px-3 py-2 sm:min-w-[300px]">
              <span className="w-9 h-9 rounded-lg bg-brand-cyan/10 dark:bg-brand-cyan/15 flex items-center justify-center shrink-0">
                <LayoutDashboard className="w-4.5 h-4.5 text-brand-cyan-deep dark:text-brand-cyan" />
              </span>
              <span className="sr-only">Colaborador</span>
              <Select
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
              </Select>
            </label>
          )}
          <Button className="gap-2 rounded-xl px-5 shadow-sm shadow-primary/15" onClick={() => { window.location.href = '/gestion'; }}>
            Ver gestión
            <ArrowUpRight className="w-4 h-4" />
          </Button>
        </div>
      </motion.header>

      {isLoading ? (
        <div className="h-96 flex items-center justify-center">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      ) : error ? (
        <div className="brain-glass p-8 text-center">
          <AlertTriangle className="mx-auto mb-4 h-10 w-10 text-destructive" />
          <h3 className="text-xl font-black text-zinc-900 dark:text-zinc-100">No se pudo cargar el dashboard</h3>
          <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-2">{error.message}</p>
        </div>
      ) : (
        <>
          {/* Always one row: five equal tiles on wide screens, horizontal scroll on narrow ones. */}
          <motion.section
            variants={item}
            aria-label="Resumen de tareas"
            className="-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-1 scroll-px-4 custom-scrollbar md:mx-0 md:px-0 md:pb-0 md:scroll-px-0 [&>*]:min-w-[150px] [&>*]:flex-1 md:[&>*]:min-w-0"
          >
            {statConfig.map(({ key, label, icon: Icon, surface }) => (
              <div
                key={key}
                data-stat={key}
                className={cn('flex min-h-[108px] snap-start flex-col justify-between rounded-2xl p-4 text-white shadow-md shadow-zinc-950/10', surface)}
              >
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/20">
                  <Icon className="w-4 h-4 text-white" />
                </span>
                <div>
                  <p className="text-3xl font-semibold leading-none text-white">{dashboard.stats?.[key] ?? 0}</p>
                  <p className="mt-1.5 text-xs font-medium text-white/90">{label}</p>
                </div>
              </div>
            ))}
          </motion.section>

          <div className={dashboardColumnsClass}>
            {/* Row 1: announcements across two columns, achievements beside them at the same height. */}
            <motion.div variants={item} className="min-w-0 xl:col-span-2">
              <DashboardAnnouncements
                announcements={dashboard.announcements}
                teamMembers={teamMembers}
                canManage={canManageDashboard}
                onCreate={(announcement) => createAnnouncementMutation.mutateAsync(announcement)}
                onUpdate={(announcement) => updateAnnouncementMutation.mutateAsync(announcement)}
                onDelete={(announcement) => deleteAnnouncementMutation.mutateAsync(announcement)}
                isSubmitting={createAnnouncementMutation.isPending || updateAnnouncementMutation.isPending || deleteAnnouncementMutation.isPending}
                error={createAnnouncementMutation.error || updateAnnouncementMutation.error || deleteAnnouncementMutation.error}
                className={topDashboardPanelClass}
              />
            </motion.div>

            {/* Beside the announcements: the personal reminders (tip, crm, my clients) at the same height.
                Without reminders, recent achievements take that place. */}
            {hasPersonalReminders ? (
              <motion.div variants={item} className={cn('flex min-w-0 flex-col gap-4 overflow-y-auto custom-scrollbar', topDashboardPanelClass, 'border-0 bg-transparent p-0 shadow-none backdrop-blur-0 dark:bg-transparent dark:ring-0')} aria-label="Recordatorios personales">
                <DashboardTip dashboard={dashboard} user={tipUser} className="shrink-0" />
                <DashboardCrmAttention attention={dashboard.crmAttention} className={cn('shrink-0', !selectedMember?.isCommunityManager && 'flex-1')} />

                {selectedMember?.isCommunityManager && (
                  <section className={cn(dashboardPanelClass, 'min-w-0 flex-1 shrink-0 p-6')} aria-labelledby="dashboard-clients-title">
                    <div className="flex items-center gap-3 mb-5">
                      <FileText className="w-5 h-5 text-brand-cyan-deep dark:text-brand-cyan" />
                      <h3 id="dashboard-clients-title" className="text-lg font-semibold text-zinc-950 dark:text-white">Mis clientes</h3>
                    </div>
                    {dashboard.clients?.length > 0 ? (
                      <div className="grid grid-cols-1 gap-3">
                        {dashboard.clients.map((client) => (
                          <div key={client.id} className="rounded-xl border border-zinc-200/70 dark:border-white/10 bg-white/60 dark:bg-zinc-950/30 p-4">
                            <div className="flex items-center gap-3">
                              <ClientAvatar client={client} size={32} />
                              <div className="min-w-0">
                                <p className="text-sm font-semibold text-zinc-950 dark:text-white truncate">{client.name}</p>
                                <p className="text-xs text-zinc-500 dark:text-zinc-400">{client.activeTasks} tareas activas</p>
                              </div>
                            </div>
                            <div className="grid grid-cols-3 gap-2 mt-4 text-center text-xs">
                              <span className="rounded-lg bg-white dark:bg-zinc-900 py-2 text-zinc-500 dark:text-zinc-400">Salud {client.healthScore ?? '-'}</span>
                              <span className="rounded-lg bg-white dark:bg-zinc-900 py-2 text-brand-yellow-deep dark:text-brand-yellow">{client.overdueTasks} venc.</span>
                              <span className="rounded-lg bg-white dark:bg-zinc-900 py-2 text-destructive">{client.returnedTasks} dev.</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <EmptyState icon={UserRound} title="Sin clientes asignados" description="Cuando admin o project manager asignen cuentas, aparecerá aquí tu mapa de liderazgo." />
                    )}
                  </section>
                )}
              </motion.div>
            ) : (
              <AchievementsPanel variants={item} feed={completedFeed} onOpenHistory={() => setShowHistoryModal(true)} className={topDashboardPanelClass} />
            )}

            {/* Row 2: recent achievements | upcoming work | cited meetings, all stretched to the same height. */}
            {hasPersonalReminders && (
              <AchievementsPanel variants={item} feed={completedFeed} onOpenHistory={() => setShowHistoryModal(true)} className={cn(dashboardPanelClass, 'max-h-[560px]')} />
            )}

            <motion.div variants={item} className={cn('flex min-w-0', !hasPersonalReminders && 'xl:col-span-2')}>
              <DashboardUpcomingTasks tasks={dashboard.upcomingTasks || []} className="flex-1" />
            </motion.div>

            <motion.div variants={item} className="flex min-w-0">
              <DashboardMeetings meetings={dashboard.meetings || []} className="flex-1" />
            </motion.div>

            {/* Row 3: management tools across the full width. */}
            {canManageDashboard && (
              <motion.section variants={item} className={cn(dashboardPanelClass, 'min-w-0 p-6 xl:col-span-3')} aria-labelledby="dashboard-assign-title">
                <div className="flex items-center gap-3 mb-5">
                  <UsersRound className="w-5 h-5 text-brand-cyan-deep dark:text-brand-cyan" />
                  <h3 id="dashboard-assign-title" className="text-lg font-semibold text-zinc-950 dark:text-white">Asignar cliente</h3>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <Select
                    value={assignClientId}
                    onChange={(event) => setAssignClientId(event.target.value)}
                    className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 px-4 py-3 text-sm font-semibold text-zinc-800 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-primary/30"
                  >
                    <option value="">Cliente</option>
                    {clients.map((client) => (
                      <option key={client.id} value={client.id}>{client.name}</option>
                    ))}
                  </Select>
                  <Select
                    value={assignMemberId}
                    onChange={(event) => setAssignMemberId(event.target.value)}
                    className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 px-4 py-3 text-sm font-semibold text-zinc-800 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-primary/30"
                  >
                    <option value="">Community Manager</option>
                    {communityManagers.map((member) => (
                      <option key={member.id} value={member.id}>{member.name}</option>
                    ))}
                  </Select>
                </div>
                {assignClientMutation.error && (
                  <p className="mt-3 text-xs font-semibold text-destructive">{assignClientMutation.error.message}</p>
                )}
                <Button
                  className="gap-2 mt-4 rounded-lg"
                  disabled={assignClientMutation.isPending || !assignClientId || !assignMemberId}
                  onClick={() => assignClientMutation.mutate()}
                >
                  {assignClientMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <UsersRound className="w-4 h-4" />}
                  Asignar
                </Button>
              </motion.section>
            )}
          </div>
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

/** «Logros recientes»: the original completed-task feed of the team for today, with the full-history modal. */
function AchievementsPanel({ feed, onOpenHistory, className, variants }) {
  return (
    <motion.section variants={variants} data-achievements-feed className={cn('flex min-w-0 flex-col overflow-hidden p-0', className)} aria-labelledby="dashboard-achievements-title">
      <div className="px-5 py-4 border-b border-zinc-200/70 dark:border-white/10 shrink-0">
        <div className="flex items-center gap-3">
          <span className="w-9 h-9 rounded-xl bg-brand-yellow/20 dark:bg-brand-yellow/15 flex items-center justify-center">
            <CheckCircle2 className="w-[18px] h-[18px] text-brand-yellow-deep dark:text-brand-yellow" />
          </span>
          <div>
            <h3 id="dashboard-achievements-title" className="text-base font-semibold text-zinc-950 dark:text-white">Logros recientes</h3>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">Victorias del equipo hoy</p>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-5 py-5 scroll-smooth custom-scrollbar min-h-0">
        {feed.length === 0 ? (
          <EmptyState icon={Trophy} title="Aún no hay logros hoy" description="Las tareas completadas por el equipo aparecerán aquí." />
        ) : (
          feed.map((task, idx) => (
            <div key={task.id || idx} data-completed-task-id={task.id} className="relative pl-5 pb-6 last:pb-0">
              {idx < feed.length - 1 && (
                <div className="absolute left-[3.5px] top-2 w-px h-full bg-zinc-200 dark:bg-white/10" />
              )}
              <div className="absolute left-0 top-1.5 w-2 h-2 rounded-full bg-brand-green ring-4 ring-brand-green/15 z-10" />
              <div className="group">
                <div className="flex items-center gap-2 mb-1">
                  {task.assignee ? (
                    <TeamAvatar member={task.assignee} className="w-4 h-4" />
                  ) : (
                    <div className="w-4 h-4 rounded-full bg-brand-green/10 flex items-center justify-center">
                      <div className="w-1.5 h-1.5 rounded-full bg-brand-green" />
                    </div>
                  )}
                  <span className="text-[11px] text-brand-green-deep dark:text-brand-green block font-semibold truncate">
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
                <TaskRecognitionLabels task={task} />
              </div>
            </div>
          ))
        )}
      </div>

      <div className="shrink-0 px-4 py-3 border-t border-zinc-200/70 dark:border-white/10 flex justify-center">
        <Button
          variant="ghost"
          size="sm"
          onClick={onOpenHistory}
          className="w-full rounded-lg text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-white transition-colors flex items-center gap-2 py-2"
        >
          Ver historial completo
          <ArrowUpRight className="w-3 h-3" />
        </Button>
      </div>
    </motion.section>
  );
}

export default Dashboard;
