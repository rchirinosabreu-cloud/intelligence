import React, { useState, useEffect } from 'react';
import { Card } from '@/components/ui/Card';
import { CheckSquare, Plus, CheckCircle2, Circle, Calendar, User, Loader2, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { getApiBaseUrl } from '@/lib/apiBaseUrl';
import DatePicker, { registerLocale } from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";
import { es } from 'date-fns/locale';

registerLocale('es', es);

const TEAM = [
    { name: 'Claudia', initial: 'CL', color: 'bg-pink-500' },
    { name: 'Helen', initial: 'HE', color: 'bg-purple-500' },
    { name: 'Rodny', initial: 'RO', color: 'bg-blue-500' },
    { name: 'Jarlan', initial: 'JA', color: 'bg-green-500' },
    { name: 'Francisco', initial: 'FR', color: 'bg-yellow-500' },
    { name: 'Camila', initial: 'CA', color: 'bg-indigo-500' },
    { name: 'Elisa', initial: 'EL', color: 'bg-rose-500' },
    { name: 'Melissa', initial: 'ME', color: 'bg-orange-500' }
];

const ClientTasksWidget = ({ clientId }) => {
    const [tasks, setTasks] = useState([]);
    const [loading, setLoading] = useState(true);
    const [newTask, setNewTask] = useState('');

    // New Fields State
    const [newDueDate, setNewDueDate] = useState(null);
    const [newAssignee, setNewAssignee] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);

    const fetchTasks = async () => {
        if (!clientId) return;
        try {
            setLoading(true);
            const baseUrl = getApiBaseUrl();
            const res = await fetch(`${baseUrl}/api/tasks?clientId=${clientId}`);
            if (res.ok) {
                const data = await res.json();
                setTasks(data);
            }
        } catch (error) {
            console.error("Error fetching tasks:", error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchTasks();
    }, [clientId]);

    const handleAddTask = async (e) => {
        if (e.key === 'Enter' && newTask.trim() && !isSubmitting) {
            try {
                setIsSubmitting(true);
                const baseUrl = getApiBaseUrl();
                const res = await fetch(`${baseUrl}/api/tasks`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        title: newTask,
                        dueDate: newDueDate || null,
                        assignee: newAssignee || null,
                        clientId,
                        status: 'Pendiente'
                    })
                });

                if (res.ok) {
                    await fetchTasks();
                    setNewTask('');
                    setNewDueDate(null);
                    setNewAssignee('');
                }
            } catch (error) {
                console.error("Error adding task:", error);
            } finally {
                setIsSubmitting(false);
            }
        }
    };

    const handleToggleTask = async (task) => {
        try {
            // Optimistic update
            setTasks(prev => prev.map(t =>
                t.id === task.id ? { ...t, status: t.status === 'Realizado' ? 'Pendiente' : 'Realizado' } : t
            ));

            const baseUrl = getApiBaseUrl();
            await fetch(`${baseUrl}/api/tasks/${task.id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ status: task.status === 'Realizado' ? 'Pendiente' : 'Realizado' })
            });
        } catch (error) {
            console.error("Error toggling task:", error);
            fetchTasks(); // Revert on error
        }
    };

    const handleDeleteTask = async (e, taskId) => {
        e.stopPropagation();
        if (!confirm("¿Eliminar tarea?")) return;
        try {
             const baseUrl = getApiBaseUrl();
             const res = await fetch(`${baseUrl}/api/tasks/${taskId}`, {
                 method: 'DELETE'
             });

             if (res.ok) {
                setTasks(prev => prev.filter(t => t.id !== taskId));
             } else {
                console.error("Failed to delete task:", await res.text());
             }
        } catch (error) {
            console.error("Error deleting task:", error);
        }
    };

    const remaining = tasks.filter(t => t.status !== 'Realizado').length;

    // Helper to get assignee details
    const getAssigneeDetails = (name) => {
        return TEAM.find(t => t.name === name) || { initial: name?.substring(0,2).toUpperCase(), color: 'bg-zinc-400' };
    };

    // Helper to check overdue
    const isOverdue = (dateStr) => {
        if (!dateStr) return false;
        const due = new Date(dateStr);
        const today = new Date();
        today.setHours(0,0,0,0);
        return due < today;
    };

    const formatDate = (dateStr) => {
        if (!dateStr) return '';
        const date = new Date(dateStr);
        // Add one day to fix timezone offset usually happening with simple YYYY-MM-DD input
        // Or just display UTC date. Simpler: use localized string
        return date.toLocaleDateString('es-ES', { day: 'numeric', month: 'short', timeZone: 'UTC' });
    };

    return (
        <Card className="w-full flex flex-col h-full min-h-[400px] p-6">
            <div className="flex items-center justify-between mb-5">
                <div className="flex items-center gap-2">
                    <div className="p-1.5 bg-blue-500/10 rounded-lg">
                        <CheckSquare className="w-4 h-4 text-blue-500" />
                    </div>
                    <h3 className="font-semibold text-zinc-900 dark:text-white">Pendientes</h3>
                </div>
                <span className="text-xs text-zinc-400 font-medium">{remaining} restantes</span>
            </div>

            {/* Input Area */}
            <div className="space-y-3 mb-6">
                <div className="relative group">
                    <Plus className="w-4 h-4 text-zinc-400 absolute left-3 top-3 group-focus-within:text-blue-500 transition-colors" />
                    <input
                        type="text"
                        value={newTask}
                        onChange={(e) => setNewTask(e.target.value)}
                        onKeyDown={handleAddTask}
                        placeholder="Añadir tarea..."
                        disabled={isSubmitting}
                        className="w-full pl-10 pr-4 py-2.5 bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-200 dark:border-zinc-800 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all placeholder:text-zinc-400"
                    />
                </div>

                {/* Secondary Inputs (Date & Assignee) */}
                <div className="flex gap-2">
                    {/* Date Picker */}
                    <div className="relative flex-1 group">
                        <Calendar className="w-4 h-4 text-zinc-400 absolute left-3 top-2.5 pointer-events-none z-10" />
                        <DatePicker
                            selected={newDueDate}
                            onChange={(date) => setNewDueDate(date)}
                            dateFormat="dd MMM, yyyy"
                            locale="es"
                            placeholderText="Fecha de entrega"
                            className="w-full pl-9 pr-3 py-2 bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-200 dark:border-zinc-800 rounded-lg text-xs text-zinc-600 dark:text-zinc-300 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                            popperClassName="z-50 shadow-lg rounded-xl border border-zinc-200 dark:border-zinc-800 overflow-hidden"
                        />
                    </div>

                    {/* Assignee Select */}
                    <div className="relative flex-1">
                         <User className="w-4 h-4 text-zinc-400 absolute left-3 top-2.5 pointer-events-none" />
                         <select
                            value={newAssignee}
                            onChange={(e) => setNewAssignee(e.target.value)}
                            className="w-full pl-9 pr-3 py-2 bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-200 dark:border-zinc-800 rounded-lg text-xs text-zinc-600 dark:text-zinc-300 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 appearance-none cursor-pointer"
                         >
                            <option value="">Asignar a...</option>
                            {TEAM.map(member => (
                                <option key={member.name} value={member.name}>{member.name}</option>
                            ))}
                         </select>
                    </div>
                </div>
            </div>

            {/* Task List */}
            <div className="space-y-2 overflow-y-auto max-h-[300px] pr-1">
                {loading ? (
                     <div className="flex justify-center py-4"><Loader2 className="w-5 h-5 animate-spin text-zinc-400"/></div>
                ) : tasks.length === 0 ? (
                    <div className="text-center py-8 text-zinc-400 text-sm">
                        No hay tareas pendientes.
                    </div>
                ) : (
                    tasks.map((task) => {
                        const assignee = task.assignee ? getAssigneeDetails(task.assignee) : null;
                        const overdue = task.status !== 'Realizado' && isOverdue(task.dueDate);

                        return (
                            <div
                                key={task.id}
                                onClick={() => handleToggleTask(task)}
                                className={cn(
                                    "flex items-start gap-3 p-3 rounded-xl border transition-all cursor-pointer group select-none relative",
                                    task.status === 'Realizado'
                                        ? "bg-zinc-50/50 dark:bg-zinc-900/20 border-transparent opacity-60 hover:opacity-80"
                                        : "bg-white dark:bg-zinc-800/50 border-zinc-100 dark:border-zinc-800 hover:border-blue-200 dark:hover:border-blue-900/30 hover:shadow-sm"
                                )}
                            >
                                <div className={cn(
                                    "transition-colors mt-0.5",
                                    task.status === 'Realizado' ? "text-blue-500" : "text-zinc-300 group-hover:text-blue-400"
                                )}>
                                    {task.status === 'Realizado' ? <CheckCircle2 className="w-5 h-5" /> : <Circle className="w-5 h-5" />}
                                </div>

                                <div className="flex-1 min-w-0">
                                    <span className={cn(
                                        "text-sm font-medium transition-all block mb-1.5",
                                        task.status === 'Realizado' ? "text-zinc-400 line-through decoration-zinc-300" : "text-zinc-700 dark:text-zinc-200"
                                    )}>
                                        {task.title}
                                    </span>

                                    {/* Metadata Row */}
                                    <div className="flex items-center gap-3">
                                        {task.dueDate && (
                                            <div className={cn(
                                                "flex items-center gap-1.5 text-[10px] px-1.5 py-0.5 rounded-md font-medium border",
                                                task.status === 'Realizado'
                                                    ? "bg-zinc-100 text-zinc-400 border-zinc-200"
                                                    : overdue
                                                        ? "bg-red-50 text-red-600 border-red-200 dark:bg-red-900/20 dark:border-red-900/30 dark:text-red-400"
                                                        : "bg-zinc-50 text-zinc-500 border-zinc-200 dark:bg-zinc-800 dark:border-zinc-700 dark:text-zinc-400"
                                            )}>
                                                <Calendar className="w-3 h-3" />
                                                {formatDate(task.dueDate)}
                                            </div>
                                        )}

                                        {assignee && (
                                            <div className="flex items-center gap-1.5" title={`Asignado a: ${task.assignee}`}>
                                                <div className={cn(
                                                    "w-4 h-4 rounded-full flex items-center justify-center text-[8px] font-bold text-white",
                                                    assignee.color
                                                )}>
                                                    {assignee.initial}
                                                </div>
                                                <span className="text-[10px] text-zinc-500 dark:text-zinc-400 hidden sm:inline-block">
                                                    {task.assignee}
                                                </span>
                                            </div>
                                        )}
                                    </div>
                                </div>

                                <button
                                    onClick={(e) => handleDeleteTask(e, task.id)}
                                    className="opacity-0 group-hover:opacity-100 p-1.5 text-zinc-400 hover:text-red-500 transition-all absolute top-2 right-2"
                                >
                                    <Trash2 className="w-4 h-4" />
                                </button>
                            </div>
                        );
                    })
                )}
            </div>
        </Card>
    );
};

export default ClientTasksWidget;
