import TeamAvatar from "../../components/ui/TeamAvatar";
import React, { useState, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Card } from '@/components/ui/Card';
import {
    CheckSquare,
    Plus,
    CheckCircle2,
    Circle,
    Calendar,
    Loader2,
    Trash2,
    MessageSquare,
    Send
} from 'lucide-react';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
    DialogFooter,
} from "@/components/ui/dialog";
import { cn } from '@/lib/utils';
import { getApiBaseUrl } from '@/lib/apiBaseUrl';
import { useToast } from '@/components/ui/use-toast';
import TaskCreateModal from './TaskCreateModal';
import TaskEditModal from './TaskEditModal';

const TEAM = [
    { name: 'Claudia', initial: 'CL', color: 'bg-pink-500' },
    { name: 'Helen', initial: 'HE', color: 'bg-purple-500' },
    { name: 'Rodny', initial: 'RO', color: 'bg-blue-500' },
    { name: 'Jarlan', initial: 'JA', color: 'bg-green-500' },
    { name: 'Francisco', initial: 'FR', color: 'bg-yellow-500' },
    { name: 'Camila', initial: 'CA', color: 'bg-indigo-600' },
    { name: 'Elisa', initial: 'EL', color: 'bg-rose-500' },
    { name: 'Melissa', initial: 'ME', color: 'bg-orange-500' }
];

const ClientTasksWidget = ({ clientId }) => {
    const queryClient = useQueryClient();
    const { toast } = useToast();

    // Modal states
    const [isCreating, setIsCreating] = useState(false);
    const [editingTask, setEditingTask] = useState(null);
    const [deletingTask, setDeletingTask] = useState(null);
    const [deleteReason, setDeleteReason] = useState('');
    const [isSubmittingDelete, setIsSubmittingDelete] = useState(false);

    // --- REACT QUERY: TASKS ---
    const {
        data: tasks = [],
        isLoading: loadingTasks,
        refetch: refetchTasks
    } = useQuery({
        queryKey: ['nativeTasks', clientId],
        queryFn: async () => {
            if (!clientId) return [];
            const baseUrl = getApiBaseUrl();
            const res = await fetch(`${baseUrl}/api/tasks?clientId=${clientId}`);
            if (!res.ok) throw new Error("Failed to fetch tasks");
            const data = await res.json();
            return Array.isArray(data) ? data : [];
        },
        refetchInterval: 30000,
        enabled: !!clientId
    });

    // --- REACT QUERY: CLIENTS ---
    const { data: clientsList = [] } = useQuery({
        queryKey: ['clientsDropdown'],
        queryFn: async () => {
            const baseUrl = getApiBaseUrl();
            const response = await fetch(`${baseUrl}/api/db/clients`);
            if (!response.ok) throw new Error("Failed to fetch clients");
            const data = await response.json();
            return data.sort((a, b) => a.name.localeCompare(b.name));
        },
        staleTime: 600000,
    });

    const handleToggleTask = async (e, task) => {
        e.stopPropagation();

        const isDone = task.status === 'REALIZADA';
        const newStatus = isDone ? 'PENDIENTE' : 'REALIZADA';

        // 1. Snapshot for Revert
        const previousTasks = [...tasks];

        try {
            // 2. OPTIMISTIC UPDATE
            queryClient.setQueryData(['nativeTasks', clientId], prev => prev?.map(t =>
                t.id === task.id ? { ...t, status: newStatus } : t
            ));

            const baseUrl = getApiBaseUrl();
            const token = localStorage.getItem('authToken');

            const response = await fetch(`${baseUrl}/api/tasks/${task.id}`, {
                method: 'PATCH',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': token ? `Bearer ${token}` : ''
                },
                body: JSON.stringify({ status: newStatus })
            });

            if (!response.ok) throw new Error("Failed to update status");

            queryClient.invalidateQueries({ queryKey: ['dashboardMetrics'] });
        } catch (error) {
            console.error("Error toggling task:", error);
            // 3. REVERT
            queryClient.setQueryData(['nativeTasks', clientId], previousTasks);
            toast({
                title: "Error",
                description: "No se pudo actualizar el estado de la tarea.",
                variant: "destructive"
            });
        }
    };

    const handleDeleteTask = async () => {
        if (!deletingTask || !deleteReason.trim() || isSubmittingDelete) return;

        const previousTasks = [...tasks];
        queryClient.setQueryData(['nativeTasks', clientId], prev => prev?.filter(t => t.id !== deletingTask.id));

        try {
            setIsSubmittingDelete(true);
            const baseUrl = getApiBaseUrl();
            const token = localStorage.getItem('authToken');

            const response = await fetch(`${baseUrl}/api/tasks/${deletingTask.id}`, {
                method: 'DELETE',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': token ? `Bearer ${token}` : ''
                },
                body: JSON.stringify({ reason: deleteReason })
            });

            if (response.ok) {
                toast({
                    title: "Tarea eliminada",
                    description: "La tarea ha sido movida al registro de eliminadas.",
                });
                setDeletingTask(null);
                setDeleteReason('');
                queryClient.invalidateQueries({ queryKey: ['nativeTasks', clientId] });
                queryClient.invalidateQueries({ queryKey: ['dashboardMetrics'] });
            } else {
                throw new Error("Failed to delete task");
            }
        } catch (err) {
            console.error("Error deleting task:", err);
            queryClient.setQueryData(['nativeTasks', clientId], previousTasks);
            toast({
                title: "Error",
                description: "No se pudo eliminar la tarea.",
                variant: "destructive"
            });
        } finally {
            setIsSubmittingDelete(false);
        }
    };

    const remaining = tasks.filter(t => t.status !== 'REALIZADA').length;

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
        return date.toLocaleDateString('es-ES', { day: 'numeric', month: 'short', timeZone: 'UTC' });
    };

    return (
        <Card className="w-full flex flex-col h-full min-h-[400px] p-6">
            <div className="flex items-center justify-between mb-5">
                <div className="flex items-center gap-2">
                    <div className="p-1.5 bg-blue-500/10 rounded-xl">
                        <CheckSquare className="w-4 h-4 text-blue-500" />
                    </div>
                    <h3 className="font-semibold text-zinc-900 dark:text-white">Pendientes</h3>
                    <span className="text-xs text-zinc-400 font-medium ml-2">{remaining} restantes</span>
                </div>
                <button
                    onClick={() => setIsCreating(true)}
                    className="flex items-center justify-center w-8 h-8 bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-zinc-700 rounded-xl transition-colors"
                    title="Nueva tarea"
                >
                    <Plus className="w-4 h-4" />
                </button>
            </div>

            {/* Task List */}
            <div className="space-y-2 overflow-y-auto max-h-[300px] pr-1">
                {loadingTasks ? (
                     <div className="flex justify-center py-4"><Loader2 className="w-5 h-5 animate-spin text-zinc-400"/></div>
                ) : tasks.length === 0 ? (
                    <div className="text-center py-8 text-zinc-400 text-sm">
                        No hay tareas pendientes.
                    </div>
                ) : (
                    tasks.map((task) => {
                        const assigneeName = task.assignee?.name;
                        const assigneeAvatar = task.assignee?.avatarUrl;
                        const isDone = task.status === 'REALIZADA';
                        const overdue = !isDone && isOverdue(task.dueDate);

                        return (
                            <div
                                key={task.id}
                                onClick={() => setEditingTask(task)}
                                className={cn(
                                    "flex items-start gap-3 p-3 rounded-xl border transition-all cursor-pointer group select-none relative",
                                    isDone
                                        ? "bg-zinc-50/50 dark:bg-zinc-900/20 border-transparent opacity-60 hover:opacity-80"
                                        : "bg-white dark:bg-zinc-800/50 border-zinc-100 dark:border-zinc-800 hover:border-blue-200 dark:hover:border-blue-900/30 hover:shadow-sm"
                                )}
                            >
                                <div
                                    className={cn(
                                        "transition-colors mt-0.5 cursor-pointer",
                                        isDone ? "text-blue-500" : "text-zinc-300 hover:text-blue-400"
                                    )}
                                    onClick={(e) => handleToggleTask(e, task)}
                                >
                                    {isDone ? <CheckCircle2 className="w-5 h-5" /> : <Circle className="w-5 h-5" />}
                                </div>

                                <div className="flex-1 min-w-0">
                                    <span className={cn(
                                        "text-sm font-medium transition-all block mb-1.5",
                                        isDone ? "text-zinc-400 line-through decoration-zinc-300" : "text-zinc-700 dark:text-zinc-200"
                                    )}>
                                        {task.title}
                                    </span>

                                    {/* Metadata Row */}
                                    <div className="flex items-center gap-3">
                                        {task.dueDate && (
                                            <div className={cn(
                                                "flex items-center gap-1.5 text-[10px] px-1.5 py-0.5 rounded-md font-medium border",
                                                isDone
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
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        setDeletingTask(task);
                                    }}
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
                onSuccess={() => {
                    queryClient.invalidateQueries({ queryKey: ['nativeTasks', clientId] });
                    queryClient.invalidateQueries({ queryKey: ['dashboardMetrics'] });
                }}
                clientsList={clientsList}
                defaultClientId={clientId}
            />

            <TaskEditModal
                isOpen={!!editingTask}
                onClose={() => setEditingTask(null)}
                onSuccess={() => {
                    queryClient.invalidateQueries({ queryKey: ['nativeTasks', clientId] });
                    queryClient.invalidateQueries({ queryKey: ['dashboardMetrics'] });
                }}
                clientsList={clientsList}
                taskData={editingTask}
            />

            {/* Hard Delete with Audit Log Modal */}
            <Dialog open={!!deletingTask} onOpenChange={(open) => !open && setDeletingTask(null)}>
                <DialogContent className="sm:max-w-md dark:bg-zinc-950 border-zinc-200 dark:border-zinc-800">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2 text-zinc-900 dark:text-white">
                            ¿Por qué quieres eliminar esta tarea?
                        </DialogTitle>
                        <DialogDescription>
                            La tarea <strong>{deletingTask?.title}</strong> dejará de ser visible en el Kanban y en las métricas.
                        </DialogDescription>
                    </DialogHeader>

                    <div className="py-4">
                        <textarea
                            value={deleteReason}
                            onChange={(e) => setDeleteReason(e.target.value)}
                            placeholder="Ej: Es un duplicado, el cliente canceló..."
                            className="w-full min-h-[120px] bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl p-3 text-sm focus:outline-none focus:ring-2 focus:ring-red-500/20 resize-none dark:text-white"
                            autoFocus
                            required
                        />
                    </div>

                    <DialogFooter className="flex sm:justify-between gap-3">
                        <button
                            onClick={() => setDeletingTask(null)}
                            className="px-4 py-2 text-sm font-medium text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-xl transition-colors"
                        >
                            Cancelar
                        </button>
                        <button
                            onClick={() => handleDeleteTask()}
                            disabled={!deleteReason.trim() || isSubmittingDelete}
                            className="px-4 py-2 bg-red-600 hover:bg-red-700 disabled:bg-zinc-200 dark:disabled:bg-zinc-800 text-white rounded-xl text-sm font-medium transition-colors flex items-center justify-center gap-2 shadow-lg shadow-red-500/20"
                        >
                            {isSubmittingDelete ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                            Eliminar Tarea
                        </button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </Card>
    );
};

export default ClientTasksWidget;
