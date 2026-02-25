import React, { useState, useEffect } from 'react';
import { Card } from '@/components/ui/Card';
import { CheckSquare, Plus, Circle, CheckCircle2, Trash2, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { motion, AnimatePresence } from 'framer-motion';
import { getApiBaseUrl } from '@/lib/apiBaseUrl';

const ClientTasksWidget = ({ clientId }) => {
  const [tasks, setTasks] = useState([]);
  const [newTask, setNewTask] = useState('');
  const [loading, setLoading] = useState(false); // Initial load
  const [error, setError] = useState(null);

  const baseUrl = getApiBaseUrl();

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

  // Toggle Task (Optimistic)
  const toggleTask = async (id, currentStatus) => {
    // Optimistic Update
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
      // Revert on error
      setTasks(prev => prev.map(t =>
        t.id === id ? { ...t, completed: currentStatus } : t
      ));
    }
  };

  // Add Task
  const addTask = async (e) => {
    if (e.key === 'Enter' && newTask.trim()) {
      const text = newTask;
      setNewTask(''); // Clear input immediately

      // Optimistic Add (with temporary ID)
      const tempId = Date.now().toString();
      const optimisticTask = { id: tempId, text, completed: false, isTemp: true };
      setTasks(prev => [optimisticTask, ...prev]);

      try {
        const res = await fetch(`${baseUrl}/api/db/clients/${clientId}/tasks`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text })
        });

        if (!res.ok) throw new Error('Failed to create task');
        const savedTask = await res.json();

        // Replace temp task with real one
        setTasks(prev => prev.map(t => (t.id === tempId ? savedTask : t)));
      } catch (err) {
        console.error(err);
        // Remove temp task on error
        setTasks(prev => prev.filter(t => t.id !== tempId));
        setError('Error al crear tarea');
      }
    }
  };

  // Delete Task
  const deleteTask = async (id, e) => {
    e.stopPropagation();
    if (!confirm('¿Eliminar tarea?')) return;

    // Optimistic Delete
    setTasks(prev => prev.filter(t => t.id !== id));

    try {
      const res = await fetch(`${baseUrl}/api/db/tasks/${id}`, {
        method: 'DELETE'
      });
      if (!res.ok) throw new Error('Failed to delete task');
    } catch (err) {
      console.error(err);
      alert('Error eliminando tarea');
      // Ideally re-fetch here to restore state
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
        {/* Input */}
        <div className="relative">
            <input
                type="text"
                value={newTask}
                onChange={(e) => setNewTask(e.target.value)}
                onKeyDown={addTask}
                placeholder="Añadir tarea..."
                className="w-full bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-200 dark:border-zinc-700 rounded-lg py-2 pl-9 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 placeholder:text-zinc-400 transition-all"
            />
            <Plus className="absolute left-3 top-2.5 w-4 h-4 text-zinc-400" />
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
                    {tasks.map(task => (
                        <motion.div
                            key={task.id}
                            initial={{ opacity: 0, y: 5 }}
                            animate={{ opacity: task.isTemp ? 0.5 : 1, y: 0 }}
                            exit={{ opacity: 0, height: 0, marginBottom: 0 }}
                            className={cn(
                                "flex items-center gap-3 p-2.5 rounded-lg border transition-all cursor-pointer group relative",
                                task.completed
                                    ? "bg-zinc-50 dark:bg-zinc-800/30 border-transparent opacity-60"
                                    : "bg-white dark:bg-zinc-900 border-zinc-100 dark:border-zinc-800 hover:border-zinc-300 dark:hover:border-zinc-700"
                            )}
                            onClick={() => toggleTask(task.id, task.completed)}
                        >
                            <div className={cn(
                                "flex-shrink-0 transition-colors",
                                task.completed ? "text-blue-500" : "text-zinc-300 group-hover:text-zinc-400"
                            )}>
                                {task.completed ? <CheckCircle2 className="w-5 h-5" /> : <Circle className="w-5 h-5" />}
                            </div>
                            <span className={cn(
                                "text-sm flex-1 truncate transition-all select-none",
                                task.completed ? "text-zinc-400 line-through" : "text-zinc-700 dark:text-zinc-200"
                            )}>
                                {task.text}
                            </span>

                            {!task.isTemp && (
                                <button
                                    onClick={(e) => deleteTask(task.id, e)}
                                    className="opacity-0 group-hover:opacity-100 p-1 text-zinc-400 hover:text-red-500 transition-colors"
                                >
                                    <Trash2 className="w-3.5 h-3.5" />
                                </button>
                            )}
                        </motion.div>
                    ))}
                </AnimatePresence>
            )}
        </div>
      </div>
    </Card>
  );
};

export default ClientTasksWidget;
