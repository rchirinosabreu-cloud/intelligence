import React, { useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Calendar, Search, Filter } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import TeamAvatar from '@/components/ui/TeamAvatar';

const CompletedTasksHistoryModal = ({ isOpen, onClose, tasks }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedUser, setSelectedUser] = useState('all');
  const [selectedDate, setSelectedDate] = useState('all');

  // Helper to group tasks by User, then by Date
  const groupedTasks = useMemo(() => {
    if (!tasks || tasks.length === 0) return {};

    // Filter tasks based on search, user selection, and date selection
    const filteredTasks = tasks.filter(task => {
        const matchesSearch = task.title?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                              task.client?.name?.toLowerCase().includes(searchTerm.toLowerCase());
        const matchesUser = selectedUser === 'all' || task.assigneeId === selectedUser;

        let matchesDate = true;
        if (selectedDate !== 'all') {
             const dateStr = task.completedAt ? new Date(task.completedAt).toISOString().split('T')[0] : 'Sin fecha';
             matchesDate = dateStr === selectedDate;
        }

        return matchesSearch && matchesUser && matchesDate;
    });

    const groupedByUser = {};

    filteredTasks.forEach(task => {
        const userId = task.assigneeId || 'unassigned';
        const userName = task.assignee ? task.assignee.name : 'Equipo (Sin asignar)';

        if (!groupedByUser[userId]) {
            groupedByUser[userId] = {
                name: userName,
                id: userId,
                dates: {}
            };
        }

        const dateStr = task.completedAt ? new Date(task.completedAt).toLocaleDateString() : 'Sin fecha';

        if (!groupedByUser[userId].dates[dateStr]) {
            groupedByUser[userId].dates[dateStr] = [];
        }

        groupedByUser[userId].dates[dateStr].push(task);
    });

    return groupedByUser;
  }, [tasks, searchTerm, selectedUser]);

  // Extract unique users for the filter dropdown
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

  // Extract unique dates for the filter dropdown
  const uniqueDates = useMemo(() => {
      const dates = [];
      const seen = new Set();
      tasks.forEach(task => {
          if (task.completedAt) {
              const d = new Date(task.completedAt);
              const dateStr = d.toISOString().split('T')[0];
              const displayDate = d.toLocaleDateString();

              if (!seen.has(dateStr)) {
                  seen.add(dateStr);
                  dates.push({ value: dateStr, label: displayDate });
              }
          }
      });
      // Sort newest first
      return dates.sort((a, b) => new Date(b.value) - new Date(a.value));
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
                <h2 className="text-xl font-bold text-zinc-900 dark:text-white">Historial de Logros</h2>
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
                    <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
                    <select
                        value={selectedDate}
                        onChange={(e) => setSelectedDate(e.target.value)}
                        className="w-full pl-9 pr-8 py-2 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg text-sm appearance-none focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:text-white"
                    >
                        <option value="all">Cualquier fecha</option>
                        {uniqueDates.map(d => (
                            <option key={d.value} value={d.value}>{d.label}</option>
                        ))}
                    </select>
                    <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none">
                        <svg className="w-4 h-4 text-zinc-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path></svg>
                    </div>
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
          <div className="flex-1 overflow-y-auto p-6 space-y-8 custom-scrollbar">
            {Object.keys(groupedTasks).length === 0 ? (
                <div className="text-center py-12">
                    <p className="text-zinc-500 dark:text-zinc-400">No se encontraron tareas completadas con estos filtros.</p>
                </div>
            ) : (
                Object.values(groupedTasks).map((userGroup) => (
                    <div key={userGroup.id} className="space-y-4">
                        {/* User Header */}
                        <div className="flex items-center gap-3 pb-2 border-b border-zinc-100 dark:border-zinc-800/50">
                            <TeamAvatar member={userGroup.id !== 'unassigned' ? { name: userGroup.name } : null} className="w-8 h-8" />
                            <h3 className="font-semibold text-zinc-900 dark:text-white text-lg">{userGroup.name}</h3>
                        </div>

                        {/* Dates mapping */}
                        <div className="space-y-6 pl-4 sm:pl-10">
                            {Object.entries(userGroup.dates).map(([dateStr, dayTasks]) => (
                                <div key={dateStr} className="space-y-3">
                                    <div className="flex items-center gap-2 text-xs font-medium text-zinc-500 dark:text-zinc-400 bg-zinc-100 dark:bg-zinc-800/50 inline-flex px-2 py-1 rounded-md">
                                        <Calendar className="w-3.5 h-3.5" />
                                        {dateStr}
                                    </div>
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                        {dayTasks.map(task => (
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
