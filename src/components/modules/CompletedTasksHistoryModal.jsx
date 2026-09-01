import React, { useMemo, useState, useEffect } from 'react';
import { X, Search, Filter, Loader2, CalendarDays, TaskReintegrateIcon } from '@/components/ui/icons';
import { useQueryClient } from '@tanstack/react-query';
import { Card } from '@/components/ui/Card';
import TeamAvatar from '@/components/ui/TeamAvatar';
import { getApiBaseUrl } from '@/lib/apiBaseUrl';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/components/ui/use-toast';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  buildCompletedTaskReopenPayload,
  canReturnCompletedTaskToBoard,
  REOPEN_REASONS,
} from '@/lib/taskTiming';

const matchesTaskSearch = (task, searchTerm) => {
  const query = searchTerm.trim().toLowerCase();
  if (!query) return true;
  return task.title?.toLowerCase().includes(query)
    || task.client?.name?.toLowerCase().includes(query)
    || task.assignee?.name?.toLowerCase().includes(query);
};

const filterCompletedHistoryTasks = (tasks, searchTerm, selectedUser) => {
  if (searchTerm.trim()) return tasks.filter(task => matchesTaskSearch(task, searchTerm));
  return tasks.filter(task => selectedUser === 'all' || task.assigneeId === selectedUser);
};

const CompletedTasksHistoryModal = ({ isOpen, onClose }) => {
  const { currentUser } = useAuth();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearchTerm, setDebouncedSearchTerm] = useState('');
  const [selectedUser, setSelectedUser] = useState('all');
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [reopeningTask, setReopeningTask] = useState(null);
  const [reopenReason, setReopenReason] = useState('CLIENT_CORRECTION');
  const [reopenNote, setReopenNote] = useState('');
  const [isSubmittingReopen, setIsSubmittingReopen] = useState(false);
  const canReopenTasks = canReturnCompletedTaskToBoard(currentUser);

  // Default to today's date in YYYY-MM-DD format based on America/Bogota timezone
  const todayStr = useMemo(() => {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Bogota',
      year: 'numeric', month: '2-digit', day: '2-digit'
    }).format(new Date());
  }, []);

  const [selectedDate, setSelectedDate] = useState(todayStr);
  const isGlobalSearchActive = searchTerm.trim() !== '';

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedSearchTerm(searchTerm), 250);
    return () => window.clearTimeout(timer);
  }, [searchTerm]);

  useEffect(() => {
    if (!isOpen) setReopeningTask(null);
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const requestController = new AbortController();

    const fetchCompletedTasks = async () => {
      try {
        setLoading(true);
        const baseUrl = getApiBaseUrl();
        const params = new URLSearchParams();
        const normalizedSearch = debouncedSearchTerm.trim();
        if (normalizedSearch) params.set('search', normalizedSearch);
        else params.set('date', selectedDate);
        const response = await fetch(`${baseUrl}/api/tasks/completed?${params.toString()}`, {
          signal: requestController.signal
        });
        if (!response.ok) throw new Error('Network response was not ok');
        const data = await response.json();
        setTasks(Array.isArray(data) ? data : []);
      } catch (error) {
        if (error.name === 'AbortError') return;
        console.error('Error fetching completed tasks history:', error);
      } finally {
        if (!requestController.signal.aborted) setLoading(false);
      }
    };

    fetchCompletedTasks();
    return () => requestController.abort();
  }, [isOpen, selectedDate, debouncedSearchTerm]);

  // Helper to group tasks by User
  // Since we are fetching by a specific day, grouping by date is no longer strictly necessary,
  // but we keep the structure clean by grouping by User first.
  const groupedTasks = useMemo(() => {
    if (!tasks || tasks.length === 0) return {};

    const filteredTasks = filterCompletedHistoryTasks(tasks, searchTerm, selectedUser);

    const groupedByUser = {};

    filteredTasks.forEach(task => {
        const userId = task.assigneeId || 'unassigned';
        const userName = task.assignee ? task.assignee.name : 'Equipo (Sin asignar)';
        const userAvatar = task.assignee ? task.assignee.avatarUrl : null;

        if (!groupedByUser[userId]) {
            groupedByUser[userId] = {
                name: userName,
                id: userId,
                avatarUrl: userAvatar,
                items: []
            };
        }
        groupedByUser[userId].items.push(task);
    });

    return groupedByUser;
  }, [tasks, searchTerm, selectedUser]);

  // Extract unique users for the filter dropdown based on the currently loaded date
  const uniqueUsers = useMemo(() => {
      const users = [];
      const seen = new Set();
      tasks.forEach(task => {
          if (task.assigneeId && !seen.has(task.assigneeId)) {
              seen.add(task.assigneeId);
              users.push({ id: task.assigneeId, name: task.assignee.name });
          }
      });
      return users;
  }, [tasks]);

  const closeReopenDialog = (force = false) => {
    if (isSubmittingReopen && !force) return;
    setReopeningTask(null);
    setReopenReason('CLIENT_CORRECTION');
    setReopenNote('');
  };

  const handleReopenTask = async () => {
    if (!reopeningTask || isSubmittingReopen || !canReopenTasks) return;
    const payload = buildCompletedTaskReopenPayload(reopenReason, reopenNote);
    if (!payload) return;

    try {
      setIsSubmittingReopen(true);
      const baseUrl = getApiBaseUrl();
      const token = localStorage.getItem('authToken');
      const response = await fetch(`${baseUrl}/api/tasks/${reopeningTask.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': token ? `Bearer ${token}` : '',
        },
        body: JSON.stringify(payload),
      });
      const responseBody = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(responseBody?.details || responseBody?.error || `Error ${response.status}`);

      setTasks(current => current.filter(task => task.id !== reopeningTask.id));
      await Promise.allSettled([
        queryClient.invalidateQueries({ queryKey: ['nativeTasks'] }),
        queryClient.invalidateQueries({ queryKey: ['dashboardMetrics'] }),
        queryClient.invalidateQueries({ queryKey: ['quality-streak'] }),
        queryClient.invalidateQueries({ queryKey: ['personalDashboard'] }),
      ]);
      toast({
        title: 'Tarea regresada al tablero',
        description: 'Ahora aparece en Pendiente y conserva todo su historial.',
      });
      closeReopenDialog(true);
    } catch (error) {
      console.error('Error reopening completed task from achievement history:', error);
      toast({
        variant: 'destructive',
        title: 'No se pudo regresar la tarea',
        description: 'La tarea permanece en el historial de logros.',
      });
    } finally {
      setIsSubmittingReopen(false);
    }
  };

  return (
    <>
      <Dialog open={isOpen} onOpenChange={open => { if (!open) onClose(); }}>
        <DialogContent
          showCloseButton={false}
          className="flex max-h-[calc(100dvh-1rem)] max-w-4xl flex-col gap-0 overflow-hidden rounded-2xl border-zinc-200 bg-white p-0 shadow-2xl dark:border-zinc-800 dark:bg-zinc-950 sm:max-h-[90dvh]"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-200 dark:border-zinc-800">
            <div>
                <DialogTitle className="text-xl font-bold text-zinc-900 dark:text-white">Historial de logros</DialogTitle>
                <DialogDescription className="text-sm text-zinc-500 dark:text-zinc-400">Registro detallado de tareas completadas</DialogDescription>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Cerrar historial de logros"
              className="flex h-11 w-11 items-center justify-center text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-white rounded-xl hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Filters */}
          <div className="flex flex-col gap-4 border-b border-zinc-200 bg-zinc-50 px-4 py-4 dark:border-zinc-800 dark:bg-zinc-900/50 sm:px-6 lg:flex-row">
            <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
                <input
                    type="text"
                    placeholder="Buscar tarea o cliente..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full pl-9 pr-4 py-2 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-600 dark:text-white"
                />
            </div>

            <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2 lg:min-w-[320px]">
                <div className="relative flex-1">
                    <CalendarDays className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
                    <input
                        type="date"
                        value={selectedDate}
                        onChange={(e) => setSelectedDate(e.target.value)}
                        disabled={isGlobalSearchActive}
                        max={todayStr}
                        className="w-full pl-9 pr-4 py-2 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-600 dark:text-white disabled:cursor-not-allowed disabled:opacity-45"
                    />
                </div>

                <div className="relative flex-1">
                    <Filter className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
                    <select
                        value={selectedUser}
                        onChange={(e) => setSelectedUser(e.target.value)}
                        disabled={isGlobalSearchActive}
                        className="w-full pl-9 pr-8 py-2 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl text-sm appearance-none focus:outline-none focus:ring-2 focus:ring-indigo-600 dark:text-white disabled:cursor-not-allowed disabled:opacity-45"
                    >
                        <option value="all">Todos los miembros</option>
                        {uniqueUsers.map(u => (
                            <option key={u.id} value={u.id}>{u.name}</option>
                        ))}
                    </select>
                    <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none">
                        <svg className="w-4 h-4 text-zinc-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path></svg>
                    </div>
                </div>
            </div>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto p-6 space-y-8 custom-scrollbar min-h-[300px]">
            {loading ? (
                <div className="flex flex-col items-center justify-center h-full space-y-3 opacity-70">
                    <Loader2 className="w-8 h-8 text-primary animate-spin" />
                    <p className="text-sm text-zinc-500 dark:text-zinc-400">Cargando logros de este día...</p>
                </div>
            ) : Object.keys(groupedTasks).length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-center py-12 space-y-3">
                    <div className="w-12 h-12 rounded-full bg-zinc-100 dark:bg-zinc-800/50 flex items-center justify-center mb-2">
                        <CalendarDays className="w-6 h-6 text-zinc-400" />
                    </div>
                    <p className="text-zinc-600 dark:text-zinc-300 font-medium">No hay tareas completadas</p>
                    <p className="text-sm text-zinc-500 dark:text-zinc-500">Prueba buscando en otra fecha o con otros filtros.</p>
                </div>
            ) : (
                Object.values(groupedTasks).map((userGroup) => (
                    <div key={userGroup.id} className="space-y-4">
                        {/* User Header */}
                        <div className="flex items-center gap-3 pb-2 border-b border-zinc-100 dark:border-zinc-800/50">
                            <TeamAvatar
                                member={userGroup.id !== 'unassigned' ? {
                                    name: userGroup.name,
                                    avatarUrl: userGroup.avatarUrl
                                } : null}
                                className="w-8 h-8"
                            />
                            <h3 className="font-semibold text-zinc-900 dark:text-white text-lg">{userGroup.name}</h3>
                        </div>

                        {/* Task Cards Grid */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pl-2 sm:pl-11">
                            {userGroup.items.map(task => (
                                <Card key={task.id} className="relative p-3 pr-11 border-zinc-200 dark:border-zinc-800 hover:border-emerald-200 dark:hover:border-emerald-900/50 transition-colors group">
                                    {canReopenTasks && (
                                      <button
                                          type="button"
                                          onClick={() => setReopeningTask(task)}
                                          aria-label="Regresar al tablero"
                                          title="Regresar al tablero"
                                          className="absolute right-2.5 top-2.5 flex h-7 w-7 items-center justify-center rounded-lg text-zinc-400 transition-colors hover:bg-[#009EB9]/10 hover:text-[#009EB9] focus:outline-none focus:ring-2 focus:ring-[#009EB9]/30 dark:text-zinc-500"
                                      >
                                          <TaskReintegrateIcon className="h-3.5 w-3.5" />
                                      </button>
                                    )}
                                    <div className="flex items-start gap-3">
                                        <div className="mt-0.5">
                                            <div className="w-4 h-4 rounded-full bg-emerald-100 dark:bg-emerald-500/20 border border-emerald-500 flex items-center justify-center">
                                                <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                                            </div>
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <h4 className="text-sm font-medium text-zinc-900 dark:text-white truncate" title={task.title}>
                                                {task.title}
                                            </h4>
                                            <div className="flex items-center gap-2 mt-1.5 text-xs text-zinc-500 dark:text-zinc-400">
                                                <span>{new Date(task.completedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                                                {task.client && (
                                                    <>
                                                        <span>•</span>
                                                        <span className="truncate max-w-[120px]" title={task.client.name}>
                                                            {task.client.name}
                                                        </span>
                                                    </>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                </Card>
                            ))}
                        </div>
                    </div>
                ))
            )}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!reopeningTask} onOpenChange={open => { if (!open) closeReopenDialog(); }}>
        <DialogContent
          overlayClassName="z-[90]"
          className="z-[91] border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950 sm:max-w-md"
        >
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-zinc-900 dark:text-white">
              <TaskReintegrateIcon className="h-5 w-5 text-[#009EB9] dark:text-[#29B8CF]" />
              Regresar tarea al tablero
            </DialogTitle>
            <DialogDescription>
              <strong>{reopeningTask?.title}</strong> volverá a Pendiente y conservará responsable, prioridad y bitácora.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-1">
            <label className="block space-y-1.5">
              <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Motivo</span>
              <select
                value={reopenReason}
                onChange={event => setReopenReason(event.target.value)}
                className="min-h-11 w-full rounded-xl border border-zinc-200 bg-white px-3 text-sm text-zinc-900 focus:outline-none focus:ring-2 focus:ring-[#009EB9]/20 dark:border-zinc-800 dark:bg-zinc-900 dark:text-white"
              >
                {REOPEN_REASONS.map(reason => <option key={reason.value} value={reason.value}>{reason.label}</option>)}
              </select>
            </label>
            <label className="block space-y-1.5">
              <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Nota de corrección</span>
              <textarea
                value={reopenNote}
                onChange={event => setReopenNote(event.target.value)}
                placeholder="Explica brevemente qué debe corregirse."
                className="min-h-[112px] w-full resize-y rounded-xl border border-zinc-200 bg-zinc-50 p-3 text-sm text-zinc-900 focus:outline-none focus:ring-2 focus:ring-[#009EB9]/20 dark:border-zinc-800 dark:bg-zinc-900 dark:text-white"
              />
            </label>
          </div>
          <DialogFooter className="flex-col-reverse gap-2 sm:flex-row sm:justify-between">
            <button
              type="button"
              onClick={() => closeReopenDialog()}
              disabled={isSubmittingReopen}
              className="min-h-11 rounded-xl px-4 text-sm font-medium text-zinc-600 hover:bg-zinc-100 disabled:opacity-50 dark:text-zinc-300 dark:hover:bg-zinc-800"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={handleReopenTask}
              disabled={isSubmittingReopen || !reopenNote.trim()}
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[#009EB9] px-4 text-sm font-medium text-white hover:bg-[#008CA4] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isSubmittingReopen && <Loader2 className="h-4 w-4 animate-spin" />}
              Regresar a Pendiente
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default CompletedTasksHistoryModal;
