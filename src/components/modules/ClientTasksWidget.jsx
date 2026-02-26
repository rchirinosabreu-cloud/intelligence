import React, { useState } from 'react';
import { Card } from '@/components/ui/Card';
import { CheckSquare, Plus, CheckCircle2, Circle } from 'lucide-react';
import { cn } from '@/lib/utils';

const ClientTasksWidget = () => {
    const [tasks, setTasks] = useState([
        { id: 1, text: 'Pendiente', completed: false },
        { id: 2, text: 'Aprobar paleta de colores final', completed: false },
        { id: 3, text: 'Enviar accesos de Analytics', completed: false },
        { id: 4, text: 'Revisar propuesta de copy para web', completed: true },
    ]);
    const [newTask, setNewTask] = useState('');

    const toggleTask = (id) => {
        setTasks(prev => prev.map(t =>
            t.id === id ? { ...t, completed: !t.completed } : t
        ));
    };

    const addTask = (e) => {
        if (e.key === 'Enter' && newTask.trim()) {
            setTasks([{ id: Date.now(), text: newTask, completed: false }, ...tasks]);
            setNewTask('');
        }
    };

    const remaining = tasks.filter(t => !t.completed).length;

    return (
        <Card className="flex flex-col h-full min-h-[350px] p-6 space-y-6">
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <div className="p-1.5 bg-blue-500/10 rounded-lg">
                        <CheckSquare className="w-4 h-4 text-blue-500" />
                    </div>
                    <h3 className="font-semibold text-zinc-900 dark:text-white">Pendientes</h3>
                </div>
                <span className="text-xs text-zinc-400 font-medium">{remaining} restantes</span>
            </div>

            {/* Input */}
            <div className="relative group">
                <Plus className="w-4 h-4 text-zinc-400 absolute left-3 top-3 group-focus-within:text-blue-500 transition-colors" />
                <input
                    type="text"
                    value={newTask}
                    onChange={(e) => setNewTask(e.target.value)}
                    onKeyDown={addTask}
                    placeholder="Añadir tarea..."
                    className="w-full pl-10 pr-4 py-2.5 bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-200 dark:border-zinc-800 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all placeholder:text-zinc-400"
                />
            </div>

            {/* List */}
            <div className="space-y-2">
                {tasks.map((task) => (
                    <div
                        key={task.id}
                        onClick={() => toggleTask(task.id)}
                        className={cn(
                            "flex items-center gap-3 p-3 rounded-xl border transition-all cursor-pointer group select-none",
                            task.completed
                                ? "bg-zinc-50/50 dark:bg-zinc-900/20 border-transparent opacity-60 hover:opacity-80"
                                : "bg-white dark:bg-zinc-800/50 border-zinc-100 dark:border-zinc-800 hover:border-blue-200 dark:hover:border-blue-900/30 hover:shadow-sm"
                        )}
                    >
                        <div className={cn(
                            "transition-colors",
                            task.completed ? "text-blue-500" : "text-zinc-300 group-hover:text-blue-400"
                        )}>
                            {task.completed ? <CheckCircle2 className="w-5 h-5" /> : <Circle className="w-5 h-5" />}
                        </div>
                        <span className={cn(
                            "text-sm font-medium transition-all",
                            task.completed ? "text-zinc-400 line-through decoration-zinc-300" : "text-zinc-700 dark:text-zinc-200"
                        )}>
                            {task.text}
                        </span>
                    </div>
                ))}
            </div>
        </Card>
    );
};

export default ClientTasksWidget;
