import React, { useState, useEffect } from 'react';
import { Card } from '@/components/ui/Card';
import { CheckSquare, Plus, Circle, CheckCircle2, Trash2, Loader2, Calendar as CalendarIcon, User, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { motion, AnimatePresence } from 'framer-motion';
import { getApiBaseUrl } from '@/lib/apiBaseUrl';
import * as Popover from '@radix-ui/react-popover';
import { DayPicker } from 'react-day-picker';
import { format, isBefore, isToday, isTomorrow, startOfDay } from 'date-fns';
import { es } from 'date-fns/locale';
import { TEAM_MEMBERS } from '@/data/team';
import 'react-day-picker/dist/style.css';

const ClientTasksWidget = ({ clientId }) => {
  const [tasks, setTasks] = useState([]);
  const [newTask, setNewTask] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // New Task Meta State
  const [selectedDate, setSelectedDate] = useState(null);
  const [selectedAssignee, setSelectedAssignee] = useState(null);

  // Popover State
  const [isDateOpen, setIsDateOpen] = useState(false);
  const [isUserOpen, setIsUserOpen] = useState(false);

  const baseUrl = getApiBaseUrl();

  // Helper: Format Date for Display
  const formatDateDisplay = (dateString) => {
    if (!dateString) return null;
    const date = new Date(dateString);
    if (isToday(date)) return 'Hoy';
    if (isTomorrow(date)) return 'Mañana';
    return format(date, 'd MMM', { locale: es });
  };

  // Helper: Check Overdue
  const isOverdue = (dateString, completed) => {
    if (!dateString || completed) return false;
    const date = startOfDay(new Date(dateString));
    const today = startOfDay(new Date());
    return isBefore(date, today);
  };

  // Fetch Tasks
  useEffect(() => {
    if (!clientId) return;

    const fetchTasks = async () => {
      try {
        setLoading(true);
        const res = await fetch(`${baseUrl}/api/db/clients/${clientId}/tasks`);
        if (!res.ok) throw new Error('Failed to fetch tasks');
        const data = await res.json();
        setTasks(data);
      } catch (err) {
        console.error(err);
        setError('Error cargando tareas');
      } finally {
        setLoading(false);
      }
    };

    fetchTasks();
  }, [clientId, baseUrl]);

  // Toggle Task
  const toggleTask = async (id, currentStatus) => {
    setTasks(prev => prev.map(t =>
      t.id === id ? { ...t, completed: !currentStatus } : t
    ));

    try {
      const res = await fetch(`${baseUrl}/api/db/tasks/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ completed: !currentStatus })
      });
      if (!res.ok) throw new Error('Failed to update task');
    } catch (err) {
      console.error(err);
      setTasks(prev => prev.map(t =>
        t.id === id ? { ...t, completed: currentStatus } : t
      ));
    }
  };

  // Add Task
  const addTask = async (e) => {
    if ((e.key === 'Enter' || e.type === 'click') && newTask.trim()) {
      const text = newTask;
      const assignee = selectedAssignee?.id; // Store ID string
      const dueDate = selectedDate;

      // Reset Input State
      setNewTask('');
      setSelectedDate(null);
      setSelectedAssignee(null);

      // Optimistic Add
      const tempId = Date.now().toString();
      const optimisticTask = {
          id: tempId,
          text,
          completed: false,
          isTemp: true,
          dueDate: dueDate ? dueDate.toISOString() : null,
          assignee: assignee
      };
      setTasks(prev => [optimisticTask, ...prev]);

      try {
        const res = await fetch(`${baseUrl}/api/db/clients/${clientId}/tasks`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
              text,
              dueDate: dueDate,
              assignee: assignee
          })
        });

        if (!res.ok) throw new Error('Failed to create task');
        const savedTask = await res.json();

        setTasks(prev => prev.map(t => (t.id === tempId ? savedTask : t)));
      } catch (err) {
        console.error(err);
        setTasks(prev => prev.filter(t => t.id !== tempId));
        setError('Error al crear tarea');
      }
    }
  };

  // Delete Task
  const deleteTask = async (id, e) => {
    e.stopPropagation();
    if (!confirm('¿Eliminar tarea?')) return;

    setTasks(prev => prev.filter(t => t.id !== id));

    try {
      const res = await fetch(`${baseUrl}/api/db/tasks/${id}`, {
        method: 'DELETE'
      });
      if (!res.ok) throw new Error('Failed to delete task');
    } catch (err) {
      console.error(err);
      alert('Error eliminando tarea');
    }
  };

  return (
    <Card className="h-full flex flex-col p-5 bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
            <div className="p-1.5 bg-blue-500/10 rounded-lg">
                <CheckSquare className="w-4 h-4 text-blue-500" />
            </div>
            <h3 className="font-semibold text-zinc-900 dark:text-white text-sm">Pendientes</h3>
        </div>
        <span className="text-xs text-zinc-400 font-medium">
            {tasks.filter(t => !t.completed).length} restantes
        </span>
      </div>

      <div className="flex-1 flex flex-col gap-3 min-h-0">

        {/* Input Area */}
        <div className="relative group">
            <div className="absolute left-3 top-2.5 text-zinc-400">
                <Plus className="w-4 h-4" />
            </div>

            <input
                type="text"
                value={newTask}
                onChange={(e) => setNewTask(e.target.value)}
                onKeyDown={addTask}
                placeholder="Añadir tarea..."
                className="w-full bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-200 dark:border-zinc-700 rounded-lg py-2 pl-9 pr-20 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 placeholder:text-zinc-400 transition-all"
            />

            {/* Triggers (Right Side) */}
            <div className="absolute right-2 top-1.5 flex items-center gap-1">

                {/* Date Picker Popover */}
                <Popover.Root open={isDateOpen} onOpenChange={setIsDateOpen}>
                    <Popover.Trigger asChild>
                        <button className={cn(
                            "p-1.5 rounded-md transition-colors hover:bg-zinc-200 dark:hover:bg-zinc-700 outline-none",
                            selectedDate ? "text-blue-500 bg-blue-50 dark:bg-blue-500/10" : "text-zinc-400"
                        )}>
                            <CalendarIcon className="w-4 h-4" />
                        </button>
                    </Popover.Trigger>
                    <Popover.Portal>
                        <Popover.Content className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-xl shadow-xl p-2 z-50 animate-in zoom-in-95" align="end" sideOffset={5}>
                            <DayPicker
                                mode="single"
                                selected={selectedDate}
                                onSelect={(d) => { setSelectedDate(d); setIsDateOpen(false); }}
                                locale={es}
                                modifiersClassNames={{
                                    selected: 'bg-blue-500 text-white rounded-full' // Custom style override
                                }}
                            />
                        </Popover.Content>
                    </Popover.Portal>
                </Popover.Root>

                {/* User Selector Popover */}
                <Popover.Root open={isUserOpen} onOpenChange={setIsUserOpen}>
                    <Popover.Trigger asChild>
                        <button className={cn(
                            "p-1.5 rounded-md transition-colors hover:bg-zinc-200 dark:hover:bg-zinc-700 outline-none flex items-center justify-center",
                            selectedAssignee ? "text-blue-500 bg-blue-50 dark:bg-blue-500/10" : "text-zinc-400"
                        )}>
                            {selectedAssignee ? (
                                <img src={selectedAssignee.avatar} alt="User" className="w-4 h-4 rounded-full" />
                            ) : (
                                <User className="w-4 h-4" />
                            )}
                        </button>
                    </Popover.Trigger>
                    <Popover.Portal>
                        <Popover.Content className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-xl shadow-xl p-1 z-50 min-w-[150px] animate-in zoom-in-95" align="end" sideOffset={5}>
                            <div className="max-h-[200px] overflow-y-auto">
                                {TEAM_MEMBERS.map(member => (
                                    <button
                                        key={member.id}
                                        onClick={() => { setSelectedAssignee(member); setIsUserOpen(false); }}
                                        className="w-full flex items-center gap-2 px-2 py-1.5 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg text-left transition-colors"
                                    >
                                        <img src={member.avatar} alt={member.name} className="w-5 h-5 rounded-full" />
                                        <span className="text-xs text-zinc-700 dark:text-zinc-300">{member.name}</span>
                                    </button>
                                ))}
                            </div>
                        </Popover.Content>
                    </Popover.Portal>
                </Popover.Root>

            </div>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto space-y-2 pr-1 scrollbar-thin scrollbar-thumb-zinc-200 dark:scrollbar-thumb-zinc-800">
            {loading ? (
                <div className="flex justify-center py-4">
                    <Loader2 className="w-5 h-5 text-zinc-400 animate-spin" />
                </div>
            ) : tasks.length === 0 ? (
                <div className="text-center py-4 text-xs text-zinc-400 italic">
                    No hay pendientes activos.
                </div>
            ) : (
                <AnimatePresence initial={false}>
                    {tasks.map(task => {
                        const assignee = TEAM_MEMBERS.find(m => m.id === task.assignee);
                        const overdue = isOverdue(task.dueDate, task.completed);

                        return (
                            <motion.div
                                key={task.id}
                                initial={{ opacity: 0, y: 5 }}
                                animate={{ opacity: task.isTemp ? 0.5 : 1, y: 0 }}
                                exit={{ opacity: 0, height: 0, marginBottom: 0 }}
                                className={cn(
                                    "flex items-start gap-3 p-3 rounded-xl border transition-all cursor-pointer group relative",
                                    task.completed
                                        ? "bg-zinc-50 dark:bg-zinc-800/30 border-transparent opacity-60"
                                        : "bg-white dark:bg-zinc-900 border-zinc-100 dark:border-zinc-800 hover:border-zinc-300 dark:hover:border-zinc-700 hover:shadow-sm"
                                )}
                                onClick={() => toggleTask(task.id, task.completed)}
                            >
                                {/* Checkbox */}
                                <div className={cn(
                                    "flex-shrink-0 transition-colors mt-0.5",
                                    task.completed ? "text-blue-500" : "text-zinc-300 group-hover:text-zinc-400"
                                )}>
                                    {task.completed ? <CheckCircle2 className="w-5 h-5" /> : <Circle className="w-5 h-5" />}
                                </div>

                                <div className="flex-1 min-w-0 flex flex-col gap-1.5">
                                    {/* Task Title */}
                                    <span className={cn(
                                        "text-sm font-medium leading-tight select-none",
                                        task.completed ? "text-zinc-400 line-through decoration-zinc-300" : "text-zinc-700 dark:text-zinc-200"
                                    )}>
                                        {task.text}
                                    </span>

                                    {/* Meta Badges (Date & Assignee) */}
                                    {(task.dueDate || task.assignee) && (
                                        <div className="flex flex-wrap items-center gap-2">
                                            {/* Date Badge */}
                                            {task.dueDate && (
                                                <span className={cn(
                                                    "inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium border",
                                                    overdue && !task.completed
                                                        ? "bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-300 border-red-200 dark:border-red-800"
                                                        : "bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-300 border-blue-100 dark:border-blue-800"
                                                )}>
                                                    <CalendarIcon className="w-3 h-3" />
                                                    {formatDateDisplay(task.dueDate)}
                                                </span>
                                            )}

                                            {/* Assignee Badge */}
                                            {assignee && (
                                                <div className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 border border-zinc-200 dark:border-zinc-700">
                                                    <img src={assignee.avatar} className="w-3.5 h-3.5 rounded-full" alt={assignee.name} />
                                                    {assignee.name}
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>

                                {!task.isTemp && (
                                    <button
                                        onClick={(e) => deleteTask(task.id, e)}
                                        className="opacity-0 group-hover:opacity-100 p-1.5 text-zinc-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-md transition-all absolute top-2 right-2"
                                    >
                                        <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                )}
                            </motion.div>
                        );
                    })}
                </AnimatePresence>
            )}
        </div>
      </div>
    </Card>
  );
};

export default ClientTasksWidget;
