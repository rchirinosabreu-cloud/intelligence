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
  Clock3,
  Compass,
  FileText,
  LayoutDashboard,
  Loader2,
  Megaphone,
  MessageSquareText,
  Send,
  Shield,
  Sparkles,
  Target,
  Trophy,
  UserRound,
  UsersRound,
  Zap
} from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/button';
import PageHeader from '@/components/ui/PageHeader';
import TeamAvatar from '@/components/ui/TeamAvatar';
import ClientAvatar from '@/components/ui/ClientAvatar';
import { useAuth } from '@/context/AuthContext';
import { getApiBaseUrl } from '@/lib/apiBaseUrl';
import { cn } from '@/lib/utils';

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
  { key: 'active', label: 'Activas', icon: CircleDot, tone: 'text-sky-600 dark:text-sky-400' },
  { key: 'dueToday', label: 'Para hoy', icon: CalendarClock, tone: 'text-violet-600 dark:text-violet-400' },
  { key: 'overdue', label: 'Vencidas', icon: AlertTriangle, tone: 'text-amber-600 dark:text-amber-400' },
  { key: 'returned', label: 'Devueltas', icon: MessageSquareText, tone: 'text-rose-600 dark:text-rose-400' },
  { key: 'completedToday', label: 'Logros hoy', icon: Trophy, tone: 'text-emerald-600 dark:text-emerald-400' }
];

const cardTone = {
  critical: 'border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-500/20 dark:bg-rose-500/10 dark:text-rose-200',
  warning: 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-200',
  info: 'border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-500/20 dark:bg-sky-500/10 dark:text-sky-200',
  success: 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-200'
};

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
  return response.json();
};

const EmptyState = ({ icon: Icon, title, description }) => (
  <div className="min-h-[140px] rounded-xl border border-dashed border-zinc-200 dark:border-zinc-800 bg-zinc-50/60 dark:bg-zinc-950/40 flex flex-col items-center justify-center text-center px-6 py-8">
    <Icon className="w-8 h-8 text-zinc-300 dark:text-zinc-700 mb-3" />
    <p className="text-sm font-bold text-zinc-700 dark:text-zinc-200">{title}</p>
    <p className="text-xs text-zinc-500 dark:text-zinc-500 max-w-xs mt-1">{description}</p>
  </div>
);

const TaskRow = ({ task, showFeedback = false }) => (
  <div className="flex items-start justify-between gap-4 rounded-xl border border-zinc-100 dark:border-zinc-800 bg-white dark:bg-zinc-950/40 px-4 py-3">
    <div className="min-w-0">
      <div className="flex items-center gap-2">
        {task.client && <ClientAvatar client={task.client} size={18} />}
        <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 truncate">{task.title}</p>
      </div>
      <div className="flex flex-wrap items-center gap-2 mt-1 text-xs text-zinc-500 dark:text-zinc-400">
        {task.client?.name && <span>{task.client.name}</span>}
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
  const [announcementScope, setAnnouncementScope] = useState('GLOBAL');
  const [announcementTargetUserId, setAnnouncementTargetUserId] = useState('');
  const [announcementContent, setAnnouncementContent] = useState('');
  const [assignClientId, setAssignClientId] = useState('');
  const [assignMemberId, setAssignMemberId] = useState('');
  const [expandedFocusCards, setExpandedFocusCards] = useState({});

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

  const toggleFocusCard = (focusCardId) => {
    setExpandedFocusCards((current) => ({
      ...current,
      [focusCardId]: !current[focusCardId]
    }));
  };

  const createAnnouncementMutation = useMutation({
    mutationFn: () => sendJson(`${baseUrl}/api/dashboard/announcements`, {
      method: 'POST',
      body: JSON.stringify({
        scope: announcementScope,
        targetUserId: announcementScope === 'MEMBER' ? announcementTargetUserId : undefined,
        content: announcementContent
      })
    }),
    onSuccess: async () => {
      setAnnouncementContent('');
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
    <motion.div variants={container} initial="hidden" animate="show" className="space-y-6">
      <PageHeader
        title="Dashboard de adopcion"
        subtitle="Radar de Foco para convertir tareas, cuentas y comunicacion interna en acciones concretas."
      />

      {canViewTeamDashboards && (
        <motion.div variants={item} className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-5 py-4">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-primary/10 dark:bg-primary/20 flex items-center justify-center">
              <LayoutDashboard className="w-6 h-6 text-primary" />
            </div>
            <div>
              <p className="text-xs uppercase tracking-widest font-black text-zinc-400">Vista admin</p>
              <h2 className="text-lg font-black text-zinc-900 dark:text-zinc-100">Explora dashboards personales del equipo</h2>
            </div>
          </div>
          <label className="flex flex-col gap-1 min-w-full sm:min-w-[280px] lg:min-w-[340px]">
            <span className="text-xs font-bold text-zinc-500 dark:text-zinc-400">Colaborador</span>
            <select
              value={selectedMemberUserId}
              onChange={(event) => setSelectedUserId(event.target.value)}
              className="w-full rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 px-4 py-3 text-sm font-semibold text-zinc-800 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-primary/30"
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
        </motion.div>
      )}

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
          <motion.div variants={item} className="grid grid-cols-1 xl:grid-cols-[1.2fr_0.8fr] gap-6">
            <Card className="p-6">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
                <div className="flex items-center gap-4">
                  <TeamAvatar member={selectedMember || { name: 'Equipo Brain' }} className="w-14 h-14 text-xl" size={56} />
                  <div>
                    <p className="text-xs uppercase tracking-widest font-black text-primary">Tu foco de hoy</p>
                    <h2 className="text-2xl font-black text-zinc-900 dark:text-zinc-100">{selectedMember?.name || 'Equipo Brain'}</h2>
                    <p className="text-sm text-zinc-500 dark:text-zinc-400">{selectedMember?.role || 'Sin rol asignado'}</p>
                  </div>
                </div>
                <Button className="gap-2" onClick={() => { window.location.href = '/gestion'; }}>
                  Ver gestion
                  <ArrowUpRight className="w-4 h-4" />
                </Button>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                {statConfig.map(({ key, label, icon: Icon, tone }) => (
                  <div key={key} className="rounded-xl border border-zinc-100 dark:border-zinc-800 bg-zinc-50/70 dark:bg-zinc-950/40 p-4">
                    <Icon className={cn('w-4 h-4 mb-3', tone)} />
                    <p className="text-2xl font-black text-zinc-900 dark:text-zinc-100">{dashboard.stats?.[key] ?? 0}</p>
                    <p className="text-xs text-zinc-500 dark:text-zinc-400">{label}</p>
                  </div>
                ))}
              </div>
            </Card>

            <Card className="p-6">
              <div className="flex items-center gap-3 mb-5">
                <div className="w-10 h-10 rounded-xl bg-violet-50 dark:bg-violet-500/10 flex items-center justify-center">
                  <Target className="w-5 h-5 text-violet-600 dark:text-violet-400" />
                </div>
                <div>
                  <h3 className="font-black text-zinc-900 dark:text-zinc-100">Reto de la semana</h3>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400">Habito operativo calibrable</p>
                </div>
              </div>
              <h4 className="text-lg font-black text-zinc-900 dark:text-zinc-100">{dashboard.weeklyHabit?.title}</h4>
              <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-2">{dashboard.weeklyHabit?.description}</p>
              <div className="mt-5">
                <div className="flex justify-between text-xs font-bold text-zinc-500 dark:text-zinc-400 mb-2">
                  <span>{dashboard.weeklyHabit?.targetLabel}</span>
                  <span>{dashboard.weeklyHabit?.progress ?? 0}%</span>
                </div>
                <div className="h-2.5 rounded-full bg-zinc-100 dark:bg-zinc-800 overflow-hidden">
                  <div className="h-full rounded-full bg-primary transition-all duration-700" style={{ width: `${dashboard.weeklyHabit?.progress ?? 0}%` }} />
                </div>
              </div>
            </Card>
          </motion.div>

          <motion.div variants={item} className="grid grid-cols-1 xl:grid-cols-[0.95fr_1.05fr] gap-6">
            <Card className="p-6">
              <div className="flex items-center gap-3 mb-5">
                <Compass className="w-5 h-5 text-primary" />
                <h3 className="text-lg font-black text-zinc-900 dark:text-zinc-100">Radar de Foco</h3>
              </div>
              <div className="space-y-3">
                {dashboard.focusCards?.map((focusCard) => (
                  <div key={focusCard.id} className={cn('rounded-xl border px-4 py-4', cardTone[focusCard.severity] || cardTone.info)}>
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-[10px] uppercase tracking-widest font-black opacity-70">{focusCard.type}</p>
                        <h4 className="text-sm font-black mt-1">{focusCard.title}</h4>
                        <p className="text-xs mt-2 opacity-80 leading-relaxed">{focusCard.content}</p>
                      </div>
                      <Zap className="w-4 h-4 shrink-0 mt-1" />
                    </div>
                    {focusCard.items?.length > 0 && (
                      <div className="mt-3">
                        <button
                          type="button"
                          onClick={() => toggleFocusCard(focusCard.id)}
                          className="inline-flex items-center gap-1.5 text-xs font-black opacity-80 hover:opacity-100 transition-opacity"
                        >
                          Ver tareas
                          <ChevronDown className={cn('w-3.5 h-3.5 transition-transform', expandedFocusCards[focusCard.id] && 'rotate-180')} />
                        </button>
                        {expandedFocusCards[focusCard.id] && (
                          <div className="mt-3 space-y-2">
                            {focusCard.items.map((task) => (
                              <TaskRow key={task.id} task={task} showFeedback={Boolean(task.lastFeedback)} />
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </Card>

            <Card className="p-6">
              <div className="flex items-center gap-3 mb-5">
                <Clock3 className="w-5 h-5 text-primary" />
                <h3 className="text-lg font-black text-zinc-900 dark:text-zinc-100">Mis tareas de hoy</h3>
              </div>
              <div className="space-y-3">
                {dashboard.todayTasks?.length > 0
                  ? dashboard.todayTasks.map((task) => <TaskRow key={task.id} task={task} />)
                  : <EmptyState icon={CheckCircle2} title="Sin vencimientos para hoy" description="Buen momento para anticipar pendientes o preparar propuestas." />}
              </div>
            </Card>
          </motion.div>

          <motion.div variants={item} className="grid grid-cols-1 xl:grid-cols-3 gap-6">
            <Card className="p-6">
              <div className="flex items-center gap-3 mb-5">
                <AlertTriangle className="w-5 h-5 text-amber-500" />
                <h3 className="text-lg font-black text-zinc-900 dark:text-zinc-100">Correcciones y vencidas</h3>
              </div>
              <div className="space-y-3">
                {dashboard.returnedTasks?.length > 0
                  ? dashboard.returnedTasks.slice(0, 4).map((task) => <TaskRow key={task.id} task={task} showFeedback />)
                  : dashboard.overdueTasks?.length > 0
                    ? dashboard.overdueTasks.slice(0, 4).map((task) => <TaskRow key={task.id} task={task} />)
                    : <EmptyState icon={Shield} title="Sin bloqueos fuertes" description="No hay devoluciones ni vencidas asignadas a esta persona." />}
              </div>
            </Card>

            <Card className="p-6">
              <div className="flex items-center gap-3 mb-5">
                <CalendarClock className="w-5 h-5 text-sky-500" />
                <h3 className="text-lg font-black text-zinc-900 dark:text-zinc-100">Proximos pendientes</h3>
              </div>
              <div className="space-y-3">
                {dashboard.upcomingTasks?.length > 0
                  ? dashboard.upcomingTasks.slice(0, 5).map((task) => <TaskRow key={task.id} task={task} />)
                  : <EmptyState icon={CalendarClock} title="Sin proximos vencimientos" description="No se encontraron tareas futuras con fecha asignada." />}
              </div>
            </Card>

            <Card className="p-6">
              <div className="flex items-center gap-3 mb-5">
                <Sparkles className="w-5 h-5 text-emerald-500" />
                <h3 className="text-lg font-black text-zinc-900 dark:text-zinc-100">Logros recientes</h3>
              </div>
              <div className="space-y-3">
                {dashboard.achievements?.length > 0
                  ? dashboard.achievements.slice(0, 5).map((task) => <TaskRow key={task.id} task={task} />)
                  : <EmptyState icon={Trophy} title="Sin cierres hoy" description="Los cierres del dia apareceran aqui para reforzar progreso y visibilidad." />}
              </div>
            </Card>
          </motion.div>

          <motion.div variants={item} className="grid grid-cols-1 xl:grid-cols-[1.1fr_0.9fr] gap-6">
            <Card className="p-6">
              <div className="flex items-center gap-3 mb-5">
                <FileText className="w-5 h-5 text-primary" />
                <h3 className="text-lg font-black text-zinc-900 dark:text-zinc-100">Mis clientes</h3>
              </div>
              {dashboard.clients?.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {dashboard.clients.map((client) => (
                    <div key={client.id} className="rounded-xl border border-zinc-100 dark:border-zinc-800 bg-zinc-50/70 dark:bg-zinc-950/40 p-4">
                      <div className="flex items-center gap-3">
                        <ClientAvatar client={client} size={32} />
                        <div className="min-w-0">
                          <p className="text-sm font-black text-zinc-900 dark:text-zinc-100 truncate">{client.name}</p>
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
                <EmptyState icon={UserRound} title="Sin clientes asignados" description="Cuando admin o project manager asignen cuentas, aparecera aqui tu mapa de liderazgo." />
              )}
            </Card>

            <Card className="p-6">
              <div className="flex items-center gap-3 mb-5">
                <Megaphone className="w-5 h-5 text-primary" />
                <h3 className="text-lg font-black text-zinc-900 dark:text-zinc-100">Anuncios</h3>
              </div>
              <div className="space-y-3">
                {dashboard.announcements?.length > 0 ? (
                  dashboard.announcements.map((announcement) => (
                    <div key={`${announcement.scope}-${announcement.id}`} className="rounded-xl border border-zinc-100 dark:border-zinc-800 bg-zinc-50/70 dark:bg-zinc-950/40 p-4">
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-[10px] uppercase tracking-widest font-black text-primary">
                          {announcement.scope === 'GLOBAL' ? 'Global' : 'Directo'}
                        </span>
                        <span className="text-[11px] text-zinc-400">{formatDate(announcement.createdAt)}</span>
                      </div>
                      <p className="text-sm text-zinc-700 dark:text-zinc-200 mt-2 leading-relaxed">{announcement.content}</p>
                    </div>
                  ))
                ) : (
                  <EmptyState icon={Megaphone} title="Sin anuncios" description="Los avisos del equipo apareceran aqui." />
                )}
              </div>
            </Card>
          </motion.div>

          {canManageDashboard && (
            <motion.div variants={item} className="grid grid-cols-1 xl:grid-cols-2 gap-6">
              <Card className="p-6">
                <div className="flex items-center gap-3 mb-5">
                  <Send className="w-5 h-5 text-primary" />
                  <h3 className="text-lg font-black text-zinc-900 dark:text-zinc-100">Crear anuncio</h3>
                </div>
                <div className="space-y-3">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <select
                      value={announcementScope}
                      onChange={(event) => setAnnouncementScope(event.target.value)}
                      className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 px-4 py-3 text-sm font-semibold text-zinc-800 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-primary/30"
                    >
                      <option value="GLOBAL">Todo el equipo</option>
                      <option value="MEMBER">Una persona</option>
                    </select>
                    {announcementScope === 'MEMBER' && (
                      <select
                        value={announcementTargetUserId}
                        onChange={(event) => setAnnouncementTargetUserId(event.target.value)}
                        className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 px-4 py-3 text-sm font-semibold text-zinc-800 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-primary/30"
                      >
                        <option value="">Seleccionar persona</option>
                        {teamMembers.filter((member) => member.userId).map((member) => (
                          <option key={member.id} value={member.userId}>{member.name} - {member.role}</option>
                        ))}
                      </select>
                    )}
                  </div>
                  <textarea
                    value={announcementContent}
                    onChange={(event) => setAnnouncementContent(event.target.value)}
                    rows={3}
                    className="w-full rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 px-4 py-3 text-sm text-zinc-800 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-primary/30"
                    placeholder="Mensaje para el equipo"
                  />
                  {createAnnouncementMutation.error && (
                    <p className="text-xs font-semibold text-rose-600 dark:text-rose-400">{createAnnouncementMutation.error.message}</p>
                  )}
                  <Button
                    className="gap-2"
                    disabled={createAnnouncementMutation.isPending || !announcementContent.trim() || (announcementScope === 'MEMBER' && !announcementTargetUserId)}
                    onClick={() => createAnnouncementMutation.mutate()}
                  >
                    {createAnnouncementMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                    Publicar
                  </Button>
                </div>
              </Card>

              <Card className="p-6">
                <div className="flex items-center gap-3 mb-5">
                  <UsersRound className="w-5 h-5 text-primary" />
                  <h3 className="text-lg font-black text-zinc-900 dark:text-zinc-100">Asignar cliente</h3>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <select
                    value={assignClientId}
                    onChange={(event) => setAssignClientId(event.target.value)}
                    className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 px-4 py-3 text-sm font-semibold text-zinc-800 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-primary/30"
                  >
                    <option value="">Cliente</option>
                    {clients.map((client) => (
                      <option key={client.id} value={client.id}>{client.name}</option>
                    ))}
                  </select>
                  <select
                    value={assignMemberId}
                    onChange={(event) => setAssignMemberId(event.target.value)}
                    className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 px-4 py-3 text-sm font-semibold text-zinc-800 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-primary/30"
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
                  className="gap-2 mt-4"
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
    </motion.div>
  );
};

export default Dashboard;
