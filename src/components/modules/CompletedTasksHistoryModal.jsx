import React, { useMemo, useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Search, Filter, Loader2, CalendarDays } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import TeamAvatar from '@/components/ui/TeamAvatar';
import { getApiBaseUrl } from '@/lib/apiBaseUrl';

const CompletedTasksHistoryModal = ({ isOpen, onClose }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedUser, setSelectedUser] = useState('all');
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);

  // Default to today's date in YYYY-MM-DD format based on America/Bogota timezone
  const todayStr = useMemo(() => {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Bogota',
      year: 'numeric', month: '2-digit', day: '2-digit'
    }).format(new Date());
  }, []);

  const [selectedDate, setSelectedDate] = useState(todayStr);

  useEffect(() => {
    if (!isOpen) return;

    const fetchTasksByDate = async () => {
      try {
        setLoading(true);
        const baseUrl = getApiBaseUrl();
        // Option B: Fetch directly from backend passing the selected date
        const response = await fetch(`${baseUrl}/api/tasks/completed?date=${selectedDate}`);
        if (!response.ok) throw new Error('Network response was not ok');
        const data = await response.json();
        setTasks(Array.isArray(data) ? data : []);
      } catch (error) {
        console.error('Error fetching completed tasks history:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchTasksByDate();
  }, [isOpen, selectedDate]);

  // Helper to group tasks by User
  // Since we are fetching by a specific day, grouping by date is no longer strictly necessary,
  // but we keep the structure clean by grouping by User first.
  const groupedTasks = useMemo(() => {
    if (!tasks || tasks.length === 0) return {};

    // Filter tasks based on search and user selection locally
    const filteredTasks = tasks.filter(task => {
        const matchesSearch = task.title?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                              task.client?.name?.toLowerCase().includes(searchTerm.toLowerCase());
        const matchesUser = selectedUser === 'all' || task.assigneeId === selectedUser;
        return matchesSearch && matchesUser;
    });

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

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6">
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="absolute inset-0 bg-zinc-900/60 backdrop-blur-sm"
          onClick={onClose}
        />

        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 10 }}
          className="relative w-full max-w-4xl bg-white dark:bg-zinc-950 rounded-2xl shadow-2xl border border-zinc-200 dark:border-zinc-800 flex flex-col max-h-[90vh]"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-200 dark:border-zinc-800">
            <div>
                <h2 className="text-xl font-bold text-zinc-900 dark:text-white">Historial de logros</h2>
                <p className="text-sm text-zinc-500 dark:text-zinc-400">Registro detallado de tareas completadas</p>
            </div>
            <button
              onClick={onClose}
              className="p-2 text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-white rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Filters */}
          <div className="px-6 py-4 border-b border-zinc-200 dark:border-zinc-800 flex flex-col sm:flex-row gap-4 bg-zinc-50 dark:bg-zinc-900/50">
            <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
                <input
                    type="text"
                    placeholder="Buscar tarea o cliente..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full pl-9 pr-4 py-2 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:text-white"
                />
            </div>

            <div className="flex gap-4 min-w-[320px]">
                <div className="relative flex-1">
                    <CalendarDays className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
                    <input
                        type="date"
                        value={selectedDate}
                        onChange={(e) => setSelectedDate(e.target.value)}
                        max={todayStr}
                        className="w-full pl-9 pr-4 py-2 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:text-white"
                    />
                </div>

                <div className="relative flex-1">
                    <Filter className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
                    <select
                        value={selectedUser}
                        onChange={(e) => setSelectedUser(e.target.value)}
                        className="w-full pl-9 pr-8 py-2 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg text-sm appearance-none focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:text-white"
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
                                <Card key={task.id} className="p-3 border-zinc-200 dark:border-zinc-800 hover:border-emerald-200 dark:hover:border-emerald-900/50 transition-colors group">
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
        </motion.div>
      </div>
    </AnimatePresence>
  );
};

export default CompletedTasksHistoryModal;
