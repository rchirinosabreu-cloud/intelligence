import React, { useState } from 'react';
import { Card } from '@/components/ui/Card';
import { CheckSquare, Plus, Circle, CheckCircle2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { motion, AnimatePresence } from 'framer-motion';

const ClientTasksWidget = () => {
  const [tasks, setTasks] = useState([
    { id: 1, text: 'Aprobar paleta de colores final', completed: false },
    { id: 2, text: 'Enviar accesos de Analytics', completed: false },
    { id: 3, text: 'Revisar propuesta de copy para web', completed: true },
  ]);
  const [newTask, setNewTask] = useState('');

  const toggleTask = (id) => {
    setTasks(prev => prev.map(t =>
      t.id === id ? { ...t, completed: !t.completed } : t
    ));
  };

  const addTask = (e) => {
    if (e.key === 'Enter' && newTask.trim()) {
      setTasks(prev => [{ id: Date.now(), text: newTask, completed: false }, ...prev]);
      setNewTask('');
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
        <div className="flex-1 overflow-y-auto space-y-2 pr-1">
            <AnimatePresence initial={false}>
                {tasks.map(task => (
                    <motion.div
                        key={task.id}
                        initial={{ opacity: 0, y: 5 }}
                        animate={{ opacity: 1, y: 0 }}
                        className={cn(
                            "flex items-center gap-3 p-2.5 rounded-lg border transition-all cursor-pointer group",
                            task.completed
                                ? "bg-zinc-50 dark:bg-zinc-800/30 border-transparent opacity-60"
                                : "bg-white dark:bg-zinc-900 border-zinc-100 dark:border-zinc-800 hover:border-zinc-300 dark:hover:border-zinc-700"
                        )}
                        onClick={() => toggleTask(task.id)}
                    >
                        <div className={cn(
                            "flex-shrink-0 transition-colors",
                            task.completed ? "text-blue-500" : "text-zinc-300 group-hover:text-zinc-400"
                        )}>
                            {task.completed ? <CheckCircle2 className="w-5 h-5" /> : <Circle className="w-5 h-5" />}
                        </div>
                        <span className={cn(
                            "text-sm flex-1 truncate transition-all",
                            task.completed ? "text-zinc-400 line-through" : "text-zinc-700 dark:text-zinc-200"
                        )}>
                            {task.text}
                        </span>
                    </motion.div>
                ))}
            </AnimatePresence>
        </div>
      </div>
    </Card>
  );
};

export default ClientTasksWidget;
