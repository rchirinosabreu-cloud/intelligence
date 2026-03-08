import TeamAvatar from "../../components/ui/TeamAvatar";
import React, { useState, useEffect } from 'react';
import { Card } from '@/components/ui/Card';
import { CheckSquare, Plus, CheckCircle2, Circle, Calendar, Loader2, Trash2, MessageSquare } from 'lucide-react';
import { cn } from '@/lib/utils';
import { getApiBaseUrl } from '@/lib/apiBaseUrl';
import TaskCreateModal from './TaskCreateModal';
import TaskEditModal from './TaskEditModal';

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

    // Modal state
    const [isCreating, setIsCreating] = useState(false);
    const [editingTask, setEditingTask] = useState(null);
    const [clientsList, setClientsList] = useState([]); // Needed for the modal dropdowns

    // Fetch clients to pass to modals
    const fetchClients = async () => {
        try {
            const baseUrl = getApiBaseUrl();
            const response = await fetch(`${baseUrl}/api/db/clients`);
            if (response.ok) {
                const data = await response.json();
                setClientsList(data);
            }
        } catch (err) {
            console.error("Error fetching clients:", err);
        }
    };

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
        fetchClients();
    }, [clientId]);

    const handleToggleTask = async (e, task) => {
        e.stopPropagation(); // Prevent opening edit modal
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
                    <span className="text-xs text-zinc-400 font-medium ml-2">{remaining} restantes</span>
                </div>
                <button
                    onClick={() => setIsCreating(true)}
                    className="flex items-center justify-center w-8 h-8 bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-zinc-700 rounded-lg transition-colors"
                    title="Nueva tarea"
                >
                    <Plus className="w-4 h-4" />
                </button>
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
                        const assigneeName = task.assignee?.name;
                        const assigneeAvatar = task.assignee?.avatarUrl;
                        const overdue = task.status !== 'Realizado' && isOverdue(task.dueDate);

                        return (
                            <div
                                key={task.id}
                                onClick={() => setEditingTask(task)}
                                className={cn(
                                    "flex items-start gap-3 p-3 rounded-xl border transition-all cursor-pointer group select-none relative",
                                    task.status === 'Realizado'
                                        ? "bg-zinc-50/50 dark:bg-zinc-900/20 border-transparent opacity-60 hover:opacity-80"
                                        : "bg-white dark:bg-zinc-800/50 border-zinc-100 dark:border-zinc-800 hover:border-blue-200 dark:hover:border-blue-900/30 hover:shadow-sm"
                                )}
                            >
                                <div
                                    className={cn(
                                        "transition-colors mt-0.5 cursor-pointer",
                                        task.status === 'Realizado' ? "text-blue-500" : "text-zinc-300 hover:text-blue-400"
                                    )}
                                    onClick={(e) => handleToggleTask(e, task)}
                                >
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

                                        {assigneeName && (
                                            <div className="flex items-center gap-1.5" title={`Asignado a: ${assigneeName}`}>
                                                <TeamAvatar member={{ name: assigneeName, avatarUrl: assigneeAvatar }} className="w-5 h-5" />
                                                <span className="text-[10px] text-zinc-500 dark:text-zinc-400 hidden sm:inline-block">
                                                    {assigneeName}
                                                </span>
                                            </div>
                                        )}

                                        {task.comments && task.comments.trim() !== '' && (
                                            <div className="text-zinc-400 dark:text-zinc-500 ml-1" title="Tiene comentarios">
                                                <MessageSquare className="w-3.5 h-3.5" />
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

            {/* Modals */}
            <TaskCreateModal
                isOpen={isCreating}
                onClose={() => setIsCreating(false)}
                onSuccess={fetchTasks}
                clientsList={clientsList}
                defaultClientId={clientId}
            />

            <TaskEditModal
                isOpen={!!editingTask}
                onClose={() => setEditingTask(null)}
                onSuccess={fetchTasks}
                clientsList={clientsList}
                taskData={editingTask}
            />
        </Card>
    );
};

export default ClientTasksWidget;
