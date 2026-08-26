import TeamAvatar from "../../components/ui/TeamAvatar";
import UserAvatarPopover from "../../components/ui/UserAvatarPopover";
import React, { useState, useMemo, useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { motion, AnimatePresence } from 'framer-motion';
import {
    Filter,
    Calendar,
    MoreHorizontal,
    CheckCircle2,
    Clock,
    AlertCircle,
    ChevronDown,
    User,
    Loader2,
    AlertTriangle,
    MessageSquare,
    Edit2,
    X,
    RotateCcw,
    Send,
    Trash2,
    Zap,
    ClipboardList,
    HelpCircle,
    Plus,
    RefreshCw
} from '@/components/ui/icons';
import { cn } from '@/lib/utils';
import PageHeader from '@/components/ui/PageHeader';
import { Button } from '@/components/ui/button';
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
    DialogFooter,
} from "@/components/ui/dialog";
import { useToast } from '@/components/ui/use-toast';
import { useAuth } from '@/context/AuthContext';
import { getApiBaseUrl } from '@/lib/apiBaseUrl';
import ClientAvatar from "../../components/ui/ClientAvatar";
import TaskSidePanel from './TaskSidePanel';
import { triggerConfetti } from '@/utils/confetti';
import TaskTimerBadge from './TaskTimerBadge';
import {
    closeTaskWorkSession,
    findConflictingActiveTask,
    hasSeenTaskTimingTutorial,
    markTaskTimingTutorialAfternoonSeen,
    markTaskTimingTutorialSeen,
    shouldShowTaskTimingTutorialAgain,
    REOPEN_REASONS
} from '@/lib/taskTiming';

// --- DATE HELPERS ---

const parseDate = (dateStr) => {
    if (!dateStr) return null;
    const cleanStr = dateStr.trim();
    const separator = cleanStr.includes('/') ? '/' : '-';
    const parts = cleanStr.split(separator);

    if (parts.length < 2) return null;
    const day = parseInt(parts[0], 10);
    const month = parseInt(parts[1], 10) - 1;

    let yearVal = parts[2] ? parseInt(parts[2], 10) : new Date().getFullYear();
    if (yearVal < 100) yearVal += 2000;

    if (isNaN(day) || isNaN(month)) return null;
    return new Date(yearVal, month, day);
};

const isOverdue = (dateStr) => {
    const taskDate = parseDate(dateStr);
    if (!taskDate) return false;
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    return taskDate < today;
};

const isTodayOrOverdue = (dateStr) => {
    const taskDate = parseDate(dateStr);
    if (!taskDate) return false;
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    return taskDate <= today;
};

const isThisWeek = (dateStr) => {
    const taskDate = parseDate(dateStr);
    if (!taskDate) return false;
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const dayOfWeek = today.getDay();
    const diffToMon = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
    const monday = new Date(today);
    monday.setDate(today.getDate() - diffToMon);
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    return taskDate >= monday && taskDate <= sunday;
};

const getDaysOverdue = (dateStr) => {
    const taskDate = parseDate(dateStr);
    if (!taskDate) return 0;
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const diffTime = today - taskDate;
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays;
};

const formatTaskCardDate = (dateStr) => {
    const taskDate = parseDate(dateStr);
    if (!taskDate) return 'Sin fecha';

    const monthLabels = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
    const day = String(taskDate.getDate()).padStart(2, '0');
    return `${day} ${monthLabels[taskDate.getMonth()]}`;
};

// --- STYLES ---

const CLIENT_COLORS = {
    "SunPartners": "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300 border-orange-200 dark:border-orange-800",
    "TechFlow": "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300 border-blue-200 dark:border-blue-800",
    "Urban Coffee": "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800",
    "Dr. Smile": "bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300 border-rose-200 dark:border-rose-800",
    "Velvet Hotel": "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300 border-purple-200 dark:border-purple-800",
};

const CATEGORY_COLORS = {
    'Estratégico': '#009EB9',
    'Creativo & Diseño': '#00AC8A',
    'Marketing & Social Media': '#06b6d4',
    'Producción Audiovisual': '#ec4899',
    'Creación de Contenido': '#f97316',
    'Operaciones & Reuniones': '#10b981',
    'Administrativo & Finanzas': '#71717a',
    'Educación': '#f59e0b'
};

const taskPriorityBadgeConfig = {
    URGENTE: 'bg-red-600 border-red-500 text-white',
    ALTA: 'bg-amber-500 border-amber-500 text-white',
    NORMAL: 'bg-blue-600 border-blue-500 text-white'
};

const getColumnId = (status) => {
    if (!status) return 'pendiente';
    const s = String(status).toUpperCase();
    if (s === 'REALIZADA' || s === 'REALIZADO') return 'realizado';
    if (s === 'EN_CURSO' || s === 'EN PROCESO') return 'en-proceso';
    if (s === 'DEVUELTA') return 'devuelto';
    return 'pendiente';
};

const NativeTasks = () => {
    const { currentUser } = useAuth();
    const location = useLocation();
    const navigate = useNavigate();
    const queryClient = useQueryClient();
    const { toast } = useToast();

    const [responsibleFilter, setResponsibleFilter] = useState(currentUser?.name || 'Todos');
    const [dateFilter, setDateFilter] = useState('Esta Semana');
    const [clientFilter, setClientFilter] = useState('Todos');
    const [searchQuery, setSearchQuery] = useState("");

    useEffect(() => {
        const handleSearch = (e) => {
            setSearchQuery(e.detail?.query || "");
        };
        window.addEventListener('global-search-changed', handleSearch);
        return () => window.removeEventListener('global-search-changed', handleSearch);
    }, []);

    const [returningTask, setReturningTask] = useState(null);
    const [returnReason, setReturnReason] = useState('');
    const [isSubmittingReturn, setIsSubmittingReturn] = useState(false);

    const [deletingTask, setDeletingTask] = useState(null);
    const [deleteReason, setDeleteReason] = useState('');
    const [isSubmittingDelete, setIsSubmittingDelete] = useState(false);
    const [isReturnedSidebarOpen, setIsReturnedSidebarOpen] = useState(false);
    const [highlightedTaskId, setHighlightedTaskId] = useState(null);

    const [isCreating, setIsCreating] = useState(false);
    const [editingTask, setEditingTask] = useState(null);
    const [conflictingMove, setConflictingMove] = useState(null);
    const [reopeningTask, setReopeningTask] = useState(null);
    const [reopenReason, setReopenReason] = useState('CLIENT_CORRECTION');
    const [reopenNote, setReopenNote] = useState('');
    const [isSubmittingReopen, setIsSubmittingReopen] = useState(false);
    const [isTimingTutorialOpen, setIsTimingTutorialOpen] = useState(false);
    const [timingTutorialPresentation, setTimingTutorialPresentation] = useState('initial');
    const [showTutorialButtonHint, setShowTutorialButtonHint] = useState(false);
    const [refreshConfirmed, setRefreshConfirmed] = useState(false);
    const defaultResponsibleValidatedRef = useRef(false);
    const refreshConfirmationTimerRef = useRef(null);
    const tutorialHintTimerRef = useRef(null);
    const tutorialUserId = currentUser?.id || currentUser?.email || 'guest';

    useEffect(() => {
        if (!currentUser) return undefined;
        const checkTutorial = () => {
            if (!hasSeenTaskTimingTutorial(window.localStorage, tutorialUserId)) {
                setTimingTutorialPresentation('initial');
                setIsTimingTutorialOpen(true);
            } else if (shouldShowTaskTimingTutorialAgain(window.localStorage, tutorialUserId)) {
                setTimingTutorialPresentation('afternoon');
                setIsTimingTutorialOpen(true);
            }
        };
        const timer = window.setTimeout(checkTutorial, 500);
        const interval = window.setInterval(checkTutorial, 30_000);
        return () => {
            window.clearTimeout(timer);
            window.clearInterval(interval);
        };
    }, [currentUser, tutorialUserId]);

    const closeTimingTutorial = () => {
        const shouldGuideToHelp = timingTutorialPresentation !== 'manual';
        if (timingTutorialPresentation === 'afternoon') {
            markTaskTimingTutorialAfternoonSeen(window.localStorage, tutorialUserId);
        } else if (!hasSeenTaskTimingTutorial(window.localStorage, tutorialUserId)) {
            markTaskTimingTutorialSeen(window.localStorage, tutorialUserId);
        }
        setIsTimingTutorialOpen(false);
        if (shouldGuideToHelp) {
            setShowTutorialButtonHint(true);
            window.clearTimeout(tutorialHintTimerRef.current);
            tutorialHintTimerRef.current = window.setTimeout(() => setShowTutorialButtonHint(false), 4000);
        }
    };

    useEffect(() => () => {
        window.clearTimeout(refreshConfirmationTimerRef.current);
        window.clearTimeout(tutorialHintTimerRef.current);
    }, []);

    const handleManualRefresh = async () => {
        setRefreshConfirmed(false);
        const result = await refetch();
        if (result.error) return;
        setRefreshConfirmed(true);
        window.clearTimeout(refreshConfirmationTimerRef.current);
        refreshConfirmationTimerRef.current = window.setTimeout(() => setRefreshConfirmed(false), 1400);
    };

    const {
        data: tasks = [],
        isLoading: loadingTasks,
        error: tasksError,
        isFetching,
        refetch,
    } = useQuery({
        queryKey: ['nativeTasks'],
        queryFn: async () => {
            const baseUrl = getApiBaseUrl();
            const response = await fetch(`${baseUrl}/api/tasks`);
            if (!response.ok) {
                throw new Error(`Error ${response.status}: ${response.statusText}`);
            }
            const data = await response.json();
            const safeData = Array.isArray(data) ? data : [];

            return safeData.map(task => ({
                id: task.id,
                title: task.title,
                clientId: task.clientId,
                client: task.client,
                clientName: task.client?.name || 'Sin Cliente',
                assigneeName: task.assignee?.name || 'Sin Asignar',
                assigneeId: task.assigneeId,
                assigneeAvatar: task.assignee?.avatarUrl || null,
                assigneeRole: task.assignee?.role || 'Colaborador',
                assigneeStatus: task.assignee?.statusMessage || '',
                creatorId: task.creatorId,
                creator: task.creator,
                creatorName: task.creator?.name || 'Sistema',
                status: task.status,
                isReturned: task.isReturned || false,
                dueDate: task.dueDate,
                dueDateFormatted: task.dueDate ? task.dueDate.split('T')[0].split('-').reverse().join('-') : null,
                completedAt: task.completedAt,
                startedAt: task.startedAt,
                accumulatedWorkMs: task.accumulatedWorkMs || 0,
                comments: task.comments,
                isPriority: task.isPriority || false,
                priority: task.priority || null,
                isSpecial: task.isSpecial || false,
                referenceUrl: task.referenceUrl,
                contentPlanId: task.contentItem?.planId,
                contentItemId: task.contentItem?.id,
                contentItem: task.contentItem,
                aiCategory: task.aiCategory,
                aiComplexity: task.aiComplexity,
                plan: task.plan,
                sortOrder: task.sortOrder || 0,
                taskComments: task.taskComments || [],
                taskAttachments: task.taskAttachments || []
            }));
        },
        enabled: !!localStorage.getItem('authToken'),
        refetchInterval: localStorage.getItem('authToken')
            ? () => (document.hidden ? false : 30_000)
            : false,
        refetchIntervalInBackground: false,
        refetchOnWindowFocus: true,
    });

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

    useEffect(() => {
        if (defaultResponsibleValidatedRef.current || !currentUser?.name || tasks.length === 0) return;
        const currentUserHasTasks = tasks.some(task => task.assigneeName === currentUser.name);
        setResponsibleFilter(currentUserHasTasks ? currentUser.name : 'Todos');
        defaultResponsibleValidatedRef.current = true;
    }, [currentUser?.name, tasks]);

    useEffect(() => {
        const params = new URLSearchParams(location.search);
        const showReturned = params.get('showReturned') === 'true';
        const taskId = params.get('taskId');

        if (showReturned) {
            setIsReturnedSidebarOpen(true);
        }

        if (taskId && tasks.length > 0) {
            setHighlightedTaskId(taskId);
            const taskToOpen = tasks.find(t => String(t.id) === taskId);
            if (taskToOpen) {
                setEditingTask(taskToOpen);
                if (getColumnId(taskToOpen.status) === 'devuelto') {
                    setIsReturnedSidebarOpen(true);
                }
            }
            const paramsToClean = new URLSearchParams(location.search);
            if (paramsToClean.has('taskId') || paramsToClean.has('showReturned')) {
                paramsToClean.delete('taskId');
                paramsToClean.delete('showReturned');
                const newSearch = paramsToClean.toString();
                navigate(`${location.pathname}${newSearch ? `?${newSearch}` : ''}`, { replace: true });
            }
            setTimeout(() => {
                const element = document.getElementById(`task-${taskId}`);
                if (element) {
                    element.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }
            }, showReturned ? 600 : 300);
            const timer = setTimeout(() => {
                setHighlightedTaskId(null);
            }, 3000);
            return () => clearTimeout(timer);
        }
    }, [location.search, tasks, navigate, location.pathname]);

    const handleReturnTask = async () => {
        if (!returningTask || !returnReason.trim() || isSubmittingReturn) return;
        const previousTasks = [...tasks];
        try {
            setIsSubmittingReturn(true);
            const baseUrl = getApiBaseUrl();

            queryClient.setQueryData(['nativeTasks'], prev => prev?.map(t =>
                t.id === returningTask.id
                    ? { ...t, status: 'DEVUELTA', isReturned: true }
                    : t
            ));

            const response = await fetch(`${baseUrl}/api/tasks/${returningTask.id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    status: 'DEVUELTA',
                    isReturned: true,
                    returnReason: returnReason
                })
            });

            if (response.ok) {
                toast({
                    title: "Tarea devuelta",
                    description: "Se ha cambiado el estado a Devuelto y se añadió el comentario.",
                });
                setReturningTask(null);
                setReturnReason('');
                queryClient.invalidateQueries({ queryKey: ['nativeTasks'] });
                queryClient.invalidateQueries({ queryKey: ['dashboardMetrics'] });
                queryClient.invalidateQueries({ queryKey: ['quality-streak'] });
            } else {
                throw new Error("Failed to return task");
            }
        } catch (err) {
            console.error("Error returning task:", err);
            queryClient.setQueryData(['nativeTasks'], previousTasks);
            toast({
                title: "Error",
                description: "No se pudo devolver la tarea.",
                variant: "destructive"
            });
        } finally {
            setIsSubmittingReturn(false);
        }
    };

    const handleDeleteTask = async () => {
        if (!deletingTask || !deleteReason.trim() || isSubmittingDelete) return;
        const previousTasks = [...tasks];
        queryClient.setQueryData(['nativeTasks'], prev => prev?.filter(t => t.id !== deletingTask.id));

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
                queryClient.invalidateQueries({ queryKey: ['nativeTasks'] });
                queryClient.invalidateQueries({ queryKey: ['dashboardMetrics'] });
                queryClient.invalidateQueries({ queryKey: ['quality-streak'] });
            } else {
                throw new Error("Failed to delete task");
            }
        } catch (err) {
            console.error("Error deleting task:", err);
            queryClient.setQueryData(['nativeTasks'], previousTasks);
            toast({
                title: "Error",
                description: "No se pudo eliminar la tarea.",
                variant: "destructive"
            });
        } finally {
            setIsSubmittingDelete(false);
        }
    };

    const responsibles = useMemo(() => {
        const unique = [...new Set(tasks.map(t => t.assigneeName || "Desconocido"))].filter(Boolean).sort();
        return ['Todos', ...unique];
    }, [tasks]);

    const clients = useMemo(() => {
        const unique = [...new Set(tasks.map(t => t.clientName || "Desconocido"))].filter(Boolean).sort();
        return ['Todos', ...unique];
    }, [tasks]);

    const filteredTasks = useMemo(() => {
        let filtered = tasks.filter(task => {
            const columnId = getColumnId(task.status);
            if (columnId === 'realizado') {
                if (!task.completedAt) return false;
                const completedDate = new Date(task.completedAt);
                const now = new Date();
                const isCurrentMonth = completedDate.getMonth() === now.getMonth() &&
                                      completedDate.getFullYear() === now.getFullYear();
                if (!isCurrentMonth) return false;
            }
            if (responsibleFilter !== 'Todos' && (task.assigneeName || "Desconocido") !== responsibleFilter) return false;
            if (clientFilter !== 'Todos' && (task.clientName || "Desconocido") !== clientFilter) return false;

            // Global Search Filter
            if (searchQuery.trim() !== '') {
                const query = searchQuery.toLowerCase();
                const matchesTitle = task.title?.toLowerCase().includes(query);
                const matchesClient = task.clientName?.toLowerCase().includes(query);
                const matchesAssignee = task.assigneeName?.toLowerCase().includes(query);
                if (!matchesTitle && !matchesClient && !matchesAssignee) return false;
            }

            if (dateFilter === 'Todos') return true;
            if (dateFilter === 'Hoy + Vencidos') return isTodayOrOverdue(task.dueDateFormatted);
            if (dateFilter === 'Solo Vencidos') return isOverdue(task.dueDateFormatted);
            if (dateFilter === 'Esta Semana') return isThisWeek(task.dueDateFormatted);
            return true;
        });
        filtered.sort((a, b) => {
            const orderA = a.sortOrder !== undefined && a.sortOrder !== null ? a.sortOrder : 999999;
            const orderB = b.sortOrder !== undefined && b.sortOrder !== null ? b.sortOrder : 999999;
            if (orderA !== orderB) {
                return orderA - orderB;
            }
            const dateA = parseDate(a.dueDateFormatted) || new Date(2100, 0, 1);
            const dateB = parseDate(b.dueDateFormatted) || new Date(2100, 0, 1);
            return dateA - dateB;
        });
        return filtered;
    }, [tasks, responsibleFilter, clientFilter, dateFilter, searchQuery]);

    const columns = [
        { id: 'pendiente', title: 'Pendiente', color: 'bg-zinc-100 dark:bg-zinc-800/50' },
        { id: 'en-proceso', title: 'En proceso', color: 'bg-blue-50/50 dark:bg-blue-900/10' },
        { id: 'realizado', title: 'Realizado', color: 'bg-emerald-50/50 dark:bg-emerald-900/10' }
    ];

    const returnedTasks = useMemo(() => {
        return tasks.filter(t => getColumnId(t.status) === 'devuelto');
    }, [tasks]);

    const onDragEnd = async (result) => {
        const { destination, source, draggableId } = result;
        if (!destination) return;
        if (destination.droppableId === source.droppableId && destination.index === source.index) return;
        const previousTasks = [...tasks];
        const taskId = draggableId;
        const destinationColumnId = destination.droppableId;
        const sourceColumnId = source.droppableId;
        const targetTask = tasks.find(task => String(task.id) === String(taskId));

        if (!result.timingConflictConfirmed && destinationColumnId === 'en-proceso') {
            const conflict = findConflictingActiveTask(tasks, targetTask);
            if (conflict) {
                setConflictingMove({ result, conflict, targetTask });
                return;
            }
        }

        if (sourceColumnId === 'realizado' && destinationColumnId !== 'realizado') {
            setReopeningTask(targetTask);
            return;
        }

        const isPMOrAdmin = currentUser?.role === 'ADMIN' || currentUser?.role === 'PROJECT_MANAGER' || currentUser?.role === 'PM';

        // 1. Dragged within the same column (Reordering Priority)
        if (sourceColumnId === destinationColumnId) {
            if (!isPMOrAdmin) {
                toast({
                    variant: "destructive",
                    title: "Acceso denegado",
                    description: "Solo los Project Managers o Administradores pueden reorganizar la prioridad de las tareas."
                });
                return;
            }

            const columnTasks = filteredTasks.filter(t => getColumnId(t.status) === sourceColumnId);
            const reordered = [...columnTasks];
            const [removed] = reordered.splice(source.index, 1);
            reordered.splice(destination.index, 0, removed);

            // Update sortOrder indexes locally
            const updatedTasks = tasks.map(task => {
                const newIndex = reordered.findIndex(t => t.id === task.id);
                if (newIndex !== -1) {
                    return { ...task, sortOrder: newIndex };
                }
                return task;
            });
            queryClient.setQueryData(['nativeTasks'], updatedTasks);

            try {
                const baseUrl = getApiBaseUrl();
                const token = localStorage.getItem('authToken');
                const reorderList = reordered.map((task, idx) => ({ id: task.id, sortOrder: idx }));

                const res = await fetch(`${baseUrl}/api/tasks/reorder`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': token ? `Bearer ${token}` : ''
                    },
                    body: JSON.stringify({ reorderList })
                });

                if (res.ok) {
                    toast({ title: "Prioridad guardada", description: "El orden de la columna se actualizó correctamente." });
                } else {
                    throw new Error("Failed to persist task reordering");
                }
            } catch (err) {
                console.error("Reorder failed:", err);
                queryClient.setQueryData(['nativeTasks'], previousTasks);
                toast({ variant: "destructive", title: "Error", description: "No se pudo guardar la prioridad de la columna." });
            }
            return;
        }

        // 2. Dragged to a different column (Status transition)
        const newTasks = [...tasks];
        const taskIndex = newTasks.findIndex(t => String(t.id) === taskId);
        if (taskIndex === -1) return;
        const movedTask = { ...newTasks[taskIndex] };
        newTasks.splice(taskIndex, 1);
        const newStatusEnum =
            destinationColumnId === 'pendiente' ? 'PENDIENTE' :
            destinationColumnId === 'en-proceso' ? 'EN_CURSO' :
            destinationColumnId === 'devuelto' ? 'DEVUELTA' : 'REALIZADA';
        movedTask.status = newStatusEnum;
        if (sourceColumnId === 'en-proceso' && newStatusEnum !== 'EN_CURSO') {
            movedTask.accumulatedWorkMs = closeTaskWorkSession(movedTask);
            movedTask.startedAt = null;
        }
        if (newStatusEnum === 'EN_CURSO' && sourceColumnId !== 'en-proceso') {
            movedTask.startedAt = new Date().toISOString();
        }
        if (newStatusEnum === 'PENDIENTE' && sourceColumnId === 'devuelto') {
            movedTask.isReturned = false;
        }
        const visibleTasksInDestColumn = newTasks.filter(task => {
            if (getColumnId(task.status) !== destinationColumnId) return false;
            if (responsibleFilter !== 'Todos' && (task.assigneeName || "Desconocido") !== responsibleFilter) return false;
            if (clientFilter !== 'Todos' && (task.clientName || "Desconocido") !== clientFilter) return false;
            if (dateFilter === 'Hoy + Vencidos' && !isTodayOrOverdue(task.dueDateFormatted)) return false;
            if (dateFilter === 'Solo Vencidos' && !isOverdue(task.dueDateFormatted)) return false;
            if (dateFilter === 'Esta Semana' && !isThisWeek(task.dueDateFormatted)) return false;
            if (dateFilter === 'Todos') return true;
            return true;
        });
        let insertionIndexInGlobal = -1;
        if (visibleTasksInDestColumn.length === 0) {
            insertionIndexInGlobal = newTasks.length;
        } else if (destination.index >= visibleTasksInDestColumn.length) {
            const lastVisibleTask = visibleTasksInDestColumn[visibleTasksInDestColumn.length - 1];
            const lastVisibleIndex = newTasks.findIndex(t => t.id === lastVisibleTask.id);
            insertionIndexInGlobal = lastVisibleIndex + 1;
        } else {
            const anchorTask = visibleTasksInDestColumn[destination.index];
            insertionIndexInGlobal = newTasks.findIndex(t => t.id === anchorTask.id);
        }
        if (insertionIndexInGlobal !== -1) newTasks.splice(insertionIndexInGlobal, 0, movedTask);
        else newTasks.push(movedTask);
        queryClient.setQueryData(['nativeTasks'], newTasks);
        if (sourceColumnId !== 'realizado' && destinationColumnId === 'realizado') triggerConfetti();
        const newStatusForDB =
            destinationColumnId === 'pendiente' ? 'PENDIENTE' :
            destinationColumnId === 'en-proceso' ? 'EN_CURSO' :
            destinationColumnId === 'devuelto' ? 'DEVUELTA' : 'REALIZADA';
        try {
            const baseUrl = getApiBaseUrl();
            const token = localStorage.getItem('authToken');
            const payload = { status: newStatusForDB };
            if (newStatusForDB === 'PENDIENTE' && sourceColumnId === 'devuelto') payload.isReturned = false;
            if (isPMOrAdmin) {
                payload.sortOrder = destination.index;
            }
            const response = await fetch(`${baseUrl}/api/tasks/${taskId}`, {
                method: 'PATCH',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': token ? `Bearer ${token}` : ''
                },
                body: JSON.stringify(payload)
            });
            if (!response.ok) throw new Error("Failed to update status in backend");
            await queryClient.invalidateQueries({ queryKey: ['nativeTasks'] });
            queryClient.invalidateQueries({ queryKey: ['dashboardMetrics'] });
            queryClient.invalidateQueries({ queryKey: ['quality-streak'] });
        } catch (err) {
            console.error("Drag and drop failed:", err);
            queryClient.setQueryData(['nativeTasks'], previousTasks);
            toast({
                title: "Error de sincronización",
                description: "Se revirtió el movimiento porque no se pudo actualizar el estado.",
                variant: "destructive"
            });
        }
    };

    const handleReopenTask = async () => {
        if (!reopeningTask || !reopenReason || !reopenNote.trim() || isSubmittingReopen) return;
        try {
            setIsSubmittingReopen(true);
            const baseUrl = getApiBaseUrl();
            const token = localStorage.getItem('authToken');
            const response = await fetch(`${baseUrl}/api/tasks/${reopeningTask.id}`, {
                method: 'PATCH',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': token ? `Bearer ${token}` : ''
                },
                body: JSON.stringify({
                    status: 'PENDIENTE',
                    reopenReason,
                    reopenNote: reopenNote.trim()
                })
            });
            if (!response.ok) throw new Error(`Reopen failed with status ${response.status}`);
            await queryClient.invalidateQueries({ queryKey: ['nativeTasks'] });
            toast({ title: 'Tarea reabierta', description: 'Conserva su código, responsable, prioridad e historial.' });
            setReopeningTask(null);
            setReopenNote('');
            setReopenReason('CLIENT_CORRECTION');
        } catch (error) {
            console.error('Error reopening task:', error);
            toast({ variant: 'destructive', title: 'No se pudo reabrir', description: 'La tarea permanece en Realizado.' });
        } finally {
            setIsSubmittingReopen(false);
        }
    };

    if (loadingTasks && tasks.length === 0) {
        return (
            <div className="h-full flex flex-col items-center justify-center space-y-4">
                <Loader2 className="w-10 h-10 text-indigo-600 animate-spin" />
                <p className="text-zinc-500 dark:text-zinc-400 text-sm animate-pulse">Cargando base de datos...</p>
            </div>
        );
    }

    if (tasksError && tasks.length === 0) {
        return (
            <div className="h-full flex flex-col items-center justify-center space-y-4">
                <div className="w-12 h-12 bg-red-100 dark:bg-red-900/20 rounded-full flex items-center justify-center">
                    <AlertCircle className="w-6 h-6 text-red-500" />
                </div>
                <h3 className="text-lg font-semibold text-zinc-900 dark:text-white">No pudimos cargar tus tareas</h3>
                <p className="text-zinc-500 dark:text-zinc-400 text-sm max-w-sm text-center">
                    Hubo un problema al conectar con la base de datos.
                </p>
                <button
                    onClick={() => window.location.reload()}
                    className="mt-4 px-4 py-2 bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 rounded-xl text-sm font-medium hover:opacity-90 transition-opacity"
                >
                    Reintentar
                </button>
            </div>
        );
    }

    return (
        <div className="space-y-6 h-full flex flex-col">
            <PageHeader
                title="Gestión de Tareas"
                subtitle="Gestiona y prioriza el flujo operativo de la agencia."
                layout="stacked"
            >
                <div className="task-toolbar-grid">
                    <div className="task-toolbar-actions flex min-h-11 items-center justify-end gap-1.5">
                        <button
                            type="button"
                            onClick={handleManualRefresh}
                            disabled={isFetching}
                            aria-label={refreshConfirmed ? 'Tareas actualizadas' : 'Actualizar tareas'}
                            title={refreshConfirmed ? 'Actualizado' : 'Actualizar tareas'}
                            className={cn(
                                "flex h-9 w-9 items-center justify-center rounded-lg border bg-white shadow-sm transition-all duration-150 active:scale-90 disabled:cursor-wait dark:bg-zinc-900",
                                refreshConfirmed
                                    ? "border-emerald-300 bg-emerald-50 text-emerald-600 ring-2 ring-emerald-500/15 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-400"
                                    : "border-zinc-200 text-zinc-400 hover:border-violet-200 hover:text-violet-600 dark:border-zinc-800 dark:text-zinc-500 dark:hover:border-violet-800 dark:hover:text-violet-400"
                            )}
                        >
                            {refreshConfirmed
                                ? <CheckCircle2 className="h-4 w-4" />
                                : <RefreshCw className={cn('h-4 w-4', isFetching && 'animate-spin')} />}
                        </button>
                        <div className="relative">
                            <button
                                type="button"
                                onClick={() => {
                                    setShowTutorialButtonHint(false);
                                    setTimingTutorialPresentation('manual');
                                    setIsTimingTutorialOpen(true);
                                }}
                                aria-label="Cómo funciona el registro de tiempo"
                                title="Cómo funciona"
                                className={cn(
                                    "flex h-9 w-9 items-center justify-center rounded-lg border bg-white shadow-sm transition-all dark:bg-zinc-900",
                                    showTutorialButtonHint
                                        ? "scale-105 border-[#009EB9] text-[#009EB9] ring-4 ring-[#009EB9]/15"
                                        : "border-zinc-200 text-zinc-400 hover:border-[#009EB9]/40 hover:text-[#009EB9] dark:border-zinc-800 dark:text-zinc-500"
                                )}
                            >
                                <HelpCircle className="h-4 w-4" />
                            </button>
                            <AnimatePresence>
                                {showTutorialButtonHint && (
                                    <motion.div
                                        initial={{ opacity: 0, y: 6, scale: 0.96 }}
                                        animate={{ opacity: 1, y: 0, scale: 1 }}
                                        exit={{ opacity: 0, y: 4, scale: 0.97 }}
                                        className="absolute right-0 top-12 z-[210] whitespace-nowrap rounded-lg bg-[#009EB9] px-3 py-2 text-[11px] font-semibold text-white shadow-xl shadow-[#009EB9]/20"
                                    >
                                        Puedes volver a verlo aquí
                                    </motion.div>
                                )}
                            </AnimatePresence>
                        </div>
                    </div>
                    <Button size="lg" onClick={() => setIsCreating(true)} className="min-h-11 w-full sm:w-auto">
                        <Plus className="w-4 h-4 mr-2" />
                        Nueva Tarea
                    </Button>
                    <div className="task-filter-grid">
                        <div className="group relative min-w-0">
                            <select
                                value={responsibleFilter}
                                onChange={(e) => setResponsibleFilter(e.target.value)}
                                className="min-h-11 w-full min-w-0 appearance-none truncate rounded-xl border border-zinc-200 bg-white py-2 pl-9 pr-8 text-sm font-medium text-zinc-700 shadow-sm transition-all hover:border-zinc-300 focus:outline-none focus:ring-2 focus:ring-primary/20 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:border-zinc-700"
                            >
                                {responsibles.map((r, i) => (
                                    <option key={i} value={r}>
                                        {r === 'Todos' ? 'Todos los responsables' : r}
                                    </option>
                                ))}
                            </select>
                            <User className="pointer-events-none absolute left-3 top-3.5 h-4 w-4 text-zinc-400" />
                            <ChevronDown className="pointer-events-none absolute right-3 top-3.5 h-4 w-4 text-zinc-400 transition-colors group-hover:text-zinc-600 dark:group-hover:text-zinc-200" />
                        </div>

                        <div className="group relative min-w-0">
                            <select
                                value={clientFilter}
                                onChange={(e) => setClientFilter(e.target.value)}
                                className="min-h-11 w-full min-w-0 appearance-none truncate rounded-xl border border-zinc-200 bg-white py-2 pl-9 pr-8 text-sm font-medium text-zinc-700 shadow-sm transition-all hover:border-zinc-300 focus:outline-none focus:ring-2 focus:ring-primary/20 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:border-zinc-700"
                            >
                                {clients.map((c, i) => (
                                    <option key={i} value={c}>
                                        {c === 'Todos' ? 'Todos los clientes' : c}
                                    </option>
                                ))}
                            </select>
                            <Filter className="pointer-events-none absolute left-3 top-3.5 h-4 w-4 text-zinc-400" />
                            <ChevronDown className="pointer-events-none absolute right-3 top-3.5 h-4 w-4 text-zinc-400 transition-colors group-hover:text-zinc-600 dark:group-hover:text-zinc-200" />
                        </div>

                        <div className="group relative min-w-0">
                            <select
                                value={dateFilter}
                                onChange={(e) => setDateFilter(e.target.value)}
                                className={cn(
                                    "min-h-11 w-full min-w-0 appearance-none rounded-xl border py-2 pl-9 pr-8 text-sm font-medium shadow-sm transition-all focus:outline-none focus:ring-2 focus:ring-primary/20 dark:bg-zinc-900",
                                    dateFilter === 'Solo Vencidos'
                                        ? "border-red-200 text-red-600 bg-red-50 dark:bg-red-900/10 dark:text-red-400 dark:border-red-900/30"
                                        : "border-zinc-200 dark:border-zinc-800 text-zinc-700 dark:text-zinc-300 hover:border-zinc-300 dark:hover:border-zinc-700"
                                )}
                            >
                                <option value="Hoy + Vencidos">Hoy + Vencidos</option>
                                <option value="Solo Vencidos">⚠️ Solo Vencidos</option>
                                <option value="Esta Semana">Esta Semana</option>
                                <option value="Todos">Todos</option>
                            </select>
                            {dateFilter === 'Solo Vencidos' ? (
                                <AlertTriangle className="pointer-events-none absolute left-3 top-3.5 h-4 w-4 text-red-500" />
                            ) : (
                                <Calendar className="pointer-events-none absolute left-3 top-3.5 h-4 w-4 text-zinc-400" />
                            )}
                            <ChevronDown className="pointer-events-none absolute right-3 top-3.5 h-4 w-4 text-zinc-400 transition-colors group-hover:text-zinc-600 dark:group-hover:text-zinc-200" />
                        </div>
                    </div>
                </div>
            </PageHeader>

            <TaskSidePanel
                isOpen={isCreating || !!editingTask}
                onClose={() => {
                    setIsCreating(false);
                    setEditingTask(null);
                    const params = new URLSearchParams(location.search);
                    if (params.has('taskId')) {
                        params.delete('taskId');
                        const newSearch = params.toString();
                        navigate(`${location.pathname}${newSearch ? `?${newSearch}` : ''}`, { replace: true });
                    }
                }}
                onSuccess={() => {
                    queryClient.invalidateQueries({ queryKey: ['nativeTasks'] });
                    queryClient.invalidateQueries({ queryKey: ['dashboardMetrics'] });
                queryClient.invalidateQueries({ queryKey: ['quality-streak'] });
                }}
                clientsList={clientsList}
                taskData={editingTask}
            />

            <Dialog open={isTimingTutorialOpen} onOpenChange={(open) => !open && closeTimingTutorial()}>
                <DialogContent
                    overlayClassName="z-[190]"
                    className="z-[200] max-h-[calc(100vh-1.5rem)] w-[calc(100%-1.5rem)] overflow-y-auto border-zinc-200 bg-white p-0 dark:border-zinc-800 dark:bg-zinc-950 sm:max-w-xl"
                >
                    <div className="relative overflow-hidden bg-gradient-to-br from-[#00AC8A] to-[#009EB9] px-6 py-7 pr-28 text-white">
                        <img src="/brainstudio-mascot-tip.png" alt="Mascota de Brainstudio" className="absolute -bottom-4 right-2 h-24 w-24 object-contain drop-shadow-xl" />
                        <DialogHeader className="relative z-10">
                            <span className="mb-1.5 w-fit rounded-full border border-white/25 bg-white/15 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.16em] text-white">Novedad</span>
                            <DialogTitle className="text-lg text-white sm:whitespace-nowrap">El tiempo de trabajo será visible para ti</DialogTitle>
                            <DialogDescription className="text-sm leading-relaxed text-indigo-100">
                                Ahora tenemos una forma más clara de comprender el trabajo de la agencia, aprender de nuestros tiempos para poder planificar mejor.
                            </DialogDescription>
                        </DialogHeader>
                    </div>
                    <div className="space-y-3 px-6 py-5">
                        <div className="flex gap-3 rounded-xl border border-zinc-200 p-3.5 dark:border-zinc-800">
                            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-600 dark:bg-blue-950/50 dark:text-blue-400"><Clock className="h-4 w-4" /></div>
                            <div><p className="text-sm font-semibold text-zinc-900 dark:text-white">El cronómetro comenzará con las tareas “En proceso”</p><p className="mt-0.5 text-xs leading-relaxed text-zinc-500 dark:text-zinc-400">Cada vez que muevas una tarea, podrás ver su cronómetro directamente en la tarjeta.</p></div>
                        </div>
                        <div className="flex gap-3 rounded-xl border border-zinc-200 p-3.5 dark:border-zinc-800">
                            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-amber-50 text-amber-600 dark:bg-amber-950/50 dark:text-amber-400"><AlertTriangle className="h-4 w-4" /></div>
                            <div><p className="text-sm font-semibold text-zinc-900 dark:text-white">Tú decides si mantienes activa más de una tarea</p><p className="mt-0.5 text-xs leading-relaxed text-zinc-500 dark:text-zinc-400">Si ya estás registrando tiempo en una tarea, te avisaremos, pero tú decides continuar. Si quieres pausar el cronómetro, puedes regresar la tarea a “Pendiente” y continuar cuando quieras.</p></div>
                        </div>
                        <div className="flex gap-3 rounded-xl border border-zinc-200 p-3.5 dark:border-zinc-800">
                            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-purple-50 text-purple-600 dark:bg-purple-950/50 dark:text-purple-400"><RefreshCw className="h-4 w-4" /></div>
                            <div><p className="text-sm font-semibold text-zinc-900 dark:text-white">Las tareas pueden reabrirse</p><p className="mt-0.5 text-xs leading-relaxed text-zinc-500 dark:text-zinc-400">Si una tarea realizada necesita una corrección, no necesitas crear un pendiente nuevo. Puedes buscar la tarea realizada y regresarla a “Pendiente” para conservar el ID de la tarea y su historial. Esto nos garantiza una mejor trazabilidad.</p></div>
                        </div>
                        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs leading-relaxed text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-200">
                            <strong>Antes de comenzar:</strong> Revisa las tareas que ya tenías “En proceso” y devuelve a “Pendiente” las tareas en las que no estés trabajando ahora.
                        </div>
                    </div>
                    <DialogFooter className="border-t border-zinc-100 px-6 py-4 dark:border-zinc-800">
                        <Button onClick={closeTimingTutorial} className="w-full sm:w-auto">Entendido</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <Dialog open={!!conflictingMove} onOpenChange={(open) => !open && setConflictingMove(null)}>
                <DialogContent className="sm:max-w-md border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2 text-zinc-900 dark:text-white">
                            <Clock className="h-5 w-5 text-blue-600 dark:text-blue-400" /> Ya tienes un cronómetro activo
                        </DialogTitle>
                        <DialogDescription>
                            Ya estás registrando tiempo en <strong>“{conflictingMove?.conflict?.title}”</strong>. Si continúas, el cronómetro también se activará en esta tarea y ambos seguirán registrando tiempo. ¿Quieres continuar?
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter className="gap-3 sm:justify-between">
                        <button onClick={() => setConflictingMove(null)} className="rounded-xl px-4 py-2 text-sm font-medium text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800">
                            Cancelar
                        </button>
                        <button
                            onClick={() => {
                                const pending = conflictingMove;
                                setConflictingMove(null);
                                onDragEnd({ ...pending.result, timingConflictConfirmed: true });
                            }}
                            className="rounded-xl bg-[#009EB9] px-4 py-2 text-sm font-medium text-white hover:bg-[#008CA4]"
                        >
                            Sí, continuar
                        </button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <Dialog open={!!reopeningTask} onOpenChange={(open) => !open && setReopeningTask(null)}>
                <DialogContent className="sm:max-w-md border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2 text-zinc-900 dark:text-white">
                            <RefreshCw className="h-5 w-5 text-[#009EB9] dark:text-[#29B8CF]" /> Reabrir tarea
                        </DialogTitle>
                        <DialogDescription>
                            <strong>{reopeningTask?.title}</strong> conservará su código, responsable, prioridad e historial.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 py-2">
                        <label className="block space-y-1.5">
                            <span className="text-xs font-bold text-zinc-700 dark:text-zinc-300">Motivo de reapertura</span>
                            <select value={reopenReason} onChange={(event) => setReopenReason(event.target.value)} className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2.5 text-sm text-zinc-900 focus:ring-2 focus:ring-[#009EB9]/20 dark:border-zinc-800 dark:bg-zinc-900 dark:text-white">
                                {REOPEN_REASONS.map(reason => <option key={reason.value} value={reason.value}>{reason.label}</option>)}
                            </select>
                        </label>
                        <label className="block space-y-1.5">
                            <span className="text-xs font-bold text-zinc-700 dark:text-zinc-300">Nota de reapertura</span>
                            <textarea value={reopenNote} onChange={(event) => setReopenNote(event.target.value)} placeholder="Describe brevemente la novedad o solicitud." className="min-h-[96px] w-full resize-none rounded-xl border border-zinc-200 bg-zinc-50 p-3 text-sm text-zinc-900 focus:ring-2 focus:ring-[#009EB9]/20 dark:border-zinc-800 dark:bg-zinc-900 dark:text-white" />
                        </label>
                    </div>
                    <DialogFooter className="gap-3 sm:justify-between">
                        <button onClick={() => setReopeningTask(null)} className="rounded-xl px-4 py-2 text-sm font-medium text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800">Cancelar</button>
                        <button onClick={handleReopenTask} disabled={isSubmittingReopen || !reopenNote.trim()} className="flex items-center gap-2 rounded-xl bg-[#009EB9] px-4 py-2 text-sm font-medium text-white hover:bg-[#008CA4] disabled:opacity-50">
                            {isSubmittingReopen && <Loader2 className="h-4 w-4 animate-spin" />} Reabrir en pendientes
                        </button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <Dialog open={!!returningTask} onOpenChange={(open) => !open && setReturningTask(null)}>
                <DialogContent className="sm:max-w-md dark:bg-zinc-950 border-zinc-200 dark:border-zinc-800">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2 text-red-600">
                            <RotateCcw className="w-5 h-5" /> Devolver tarea
                        </DialogTitle>
                        <DialogDescription>
                            Por favor, explica por qué estás devolviendo la tarea: <strong>{returningTask?.title}</strong>
                        </DialogDescription>
                    </DialogHeader>
                    <div className="py-4">
                        <textarea
                            value={returnReason}
                            onChange={(e) => setReturnReason(e.target.value)}
                            placeholder="Ej: Faltan los assets de diseño, el copy no es claro..."
                            className="w-full min-h-[120px] bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl p-3 text-sm focus:outline-none focus:ring-2 focus:ring-red-500/20 resize-none dark:text-white"
                            autoFocus
                        />
                    </div>
                    <DialogFooter className="flex sm:justify-between gap-3">
                        <button
                            onClick={() => setReturningTask(null)}
                            className="px-4 py-2 text-sm font-medium text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-xl transition-colors"
                        >
                            Cancelar
                        </button>
                        <button
                            onClick={() => handleReturnTask()}
                            disabled={!returnReason.trim() || isSubmittingReturn}
                            className="px-4 py-2 bg-red-600 hover:bg-red-700 disabled:bg-zinc-200 dark:disabled:bg-zinc-800 text-white rounded-xl text-sm font-medium transition-colors flex items-center justify-center gap-2 shadow-lg shadow-red-500/20"
                        >
                            {isSubmittingReturn ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                            Devolver ahora
                        </button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

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
                        <Button
                            variant="destructive"
                            onClick={() => handleDeleteTask()}
                            disabled={!deleteReason.trim() || isSubmittingDelete}
                            className="gap-2"
                        >
                            {isSubmittingDelete ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                            Eliminar Tarea
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <DragDropContext onDragEnd={onDragEnd}>
                <div className="flex gap-6 flex-1 min-h-[500px] relative">
                    <AnimatePresence>
                        {isReturnedSidebarOpen && (
                            <motion.div
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                exit={{ opacity: 0 }}
                                onClick={() => setIsReturnedSidebarOpen(false)}
                                className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[100] transition-opacity"
                            />
                        )}
                    </AnimatePresence>
                    <div className={cn(
                        "fixed right-0 top-0 h-full w-full max-w-sm sm:max-w-md bg-white dark:bg-zinc-950 z-[110] shadow-2xl transition-transform duration-500 ease-in-out transform flex flex-col border-l border-zinc-200 dark:border-zinc-800",
                        isReturnedSidebarOpen ? "translate-x-0" : "translate-x-full"
                    )}>
                        <div className="p-6 border-b border-zinc-100 dark:border-zinc-800 flex justify-between items-center bg-zinc-50/50 dark:bg-zinc-900/50">
                            <div className="flex flex-col">
                                <h3 className="text-lg font-bold text-red-600 flex items-center gap-2">
                                    <RotateCcw className="w-5 h-5" /> Tareas devueltas
                                </h3>
                                <p className="text-xs text-zinc-500 mt-1 font-medium">Estas tareas requieren tu atención inmediata.</p>
                            </div>
                            <button
                                onClick={() => setIsReturnedSidebarOpen(false)}
                                className="p-2 hover:bg-zinc-200 dark:hover:bg-zinc-800 rounded-full text-zinc-400 transition-colors"
                            >
                                <X className="w-5 h-5" />
                            </button>
                        </div>
                        <Droppable droppableId="devuelto">
                            {(provided, snapshot) => (
                                <div
                                    {...provided.droppableProps}
                                    ref={provided.innerRef}
                                    className={cn("flex-1 p-6 overflow-y-auto space-y-4", snapshot.isDraggingOver && "bg-red-50/20 dark:bg-red-900/5")}
                                >
                                    {returnedTasks.length === 0 ? (
                                        <div className="h-40 flex flex-col items-center justify-center text-zinc-400 border-2 border-dashed border-zinc-100 dark:border-zinc-800 rounded-2xl">
                                            <CheckCircle2 className="w-8 h-8 mb-2 opacity-20" />
                                            <p className="text-sm">No hay tareas devueltas</p>
                                        </div>
                                    ) : (
                                        returnedTasks.map((task, index) => (
                                            <TaskCard
                                                key={String(task.id)}
                                                task={task}
                                                index={index}
                                                highlightedTaskId={highlightedTaskId}
                                                onClick={(t) => setEditingTask(t)}
                                                onReturn={(t) => setReturningTask(t)}
                                                onReopen={(t) => setReopeningTask(t)}
                                                onDelete={(t) => setDeletingTask(t)}
                                            />
                                        ))
                                    )}
                                    {provided.placeholder}
                                </div>
                            )}
                        </Droppable>
                    </div>
                    <div className="task-board-grid flex-1">
                        {columns.map((col) => {
                            const columnTasks = filteredTasks.filter(t => getColumnId(t.status) === col.id);
                            return (
                                <div key={col.id} className="flex flex-col gap-4">
                                    <div className="flex items-center justify-between px-1 h-8">
                                        <div className="flex items-center gap-2">
                                            <h3 className="font-semibold text-zinc-700 dark:text-zinc-200 text-sm">{col.title}</h3>
                                            <span className="bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400 text-xs px-2 py-0.5 rounded-full font-medium">
                                                {columnTasks.length}
                                            </span>
                                        </div>
                                        {col.id === 'pendiente' && returnedTasks.length > 0 && (
                                            <button
                                                onClick={() => setIsReturnedSidebarOpen(true)}
                                                className="group/returned relative flex items-center gap-1.5 px-2 py-1 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 rounded-xl hover:bg-red-100 dark:hover:bg-red-900/30 transition-all border border-red-100 dark:border-red-900/30 shadow-sm"
                                            >
                                                <RotateCcw className="w-3.5 h-3.5 animate-pulse" />
                                                <span className="text-[10px] font-black uppercase tracking-tighter">
                                                    {returnedTasks.length} Devueltas
                                                </span>
                                            </button>
                                        )}
                                    </div>
                                    <Droppable droppableId={col.id}>
                                        {(provided, snapshot) => (
                                            <div
                                                {...provided.droppableProps}
                                                ref={provided.innerRef}
                                                className={cn(
                                                    "flex-1 rounded-xl p-2 transition-colors space-y-3 min-h-[100px]",
                                                    col.color,
                                                    "bg-opacity-50 dark:bg-opacity-20 border border-transparent hover:border-zinc-200/50 dark:hover:border-zinc-700/50",
                                                    snapshot.isDraggingOver && "ring-2 ring-indigo-600/20"
                                                )}
                                            >
                                                {columnTasks.map((task, index) => (
                                                    <TaskCard
                                                        key={String(task.id)}
                                                        task={task}
                                                        index={index}
                                                        highlightedTaskId={highlightedTaskId}
                                                        onClick={(t) => setEditingTask(t)}
                                                        onReturn={(t) => setReturningTask(t)}
                                                        onReopen={(t) => setReopeningTask(t)}
                                                        onDelete={(t) => setDeletingTask(t)}
                                                    />
                                                ))}
                                                {provided.placeholder}
                                                {columnTasks.length === 0 && !snapshot.isDraggingOver && (
                                                    <div className="h-24 flex items-center justify-center text-zinc-400 dark:text-zinc-600 text-sm border-2 border-dashed border-zinc-200 dark:border-zinc-800 rounded-xl">
                                                        Sin tareas
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                    </Droppable>
                                </div>
                            );
                        })}
                    </div>
                </div>
            </DragDropContext>
        </div>
    );
};

const TaskCard = ({ task, index, highlightedTaskId, onClick, onReturn, onReopen, onDelete }) => {
    const isHighlighted = highlightedTaskId === String(task.id);
    const columnId = getColumnId(task.status);
    const isDone = columnId === 'realizado';
    const isReturned = columnId === 'devuelto';
    const overdue = !isDone && isOverdue(task.dueDateFormatted);
    const daysOverdue = overdue ? getDaysOverdue(task.dueDateFormatted) : 0;
    const priorityBadgeClass = task.priority ? taskPriorityBadgeConfig[task.priority] : null;
    const taskCardFooterBadges = [
        overdue && {
            key: 'overdue',
            className: 'min-w-[74px] justify-center text-red-600 bg-red-50 dark:bg-red-900/30 border-red-100 dark:border-red-800',
            label: `Vencido (+${daysOverdue}d)`
        },
        !isReturned && task.priority && priorityBadgeClass && {
            key: 'priority',
            className: `min-w-[74px] justify-center ${priorityBadgeClass} shadow-sm`,
            label: task.priority
        }
    ].filter(Boolean);
    // Client Color Logic handled by ClientAvatar component now

    return (
        <Draggable draggableId={String(task.id)} index={index}>
            {(provided, snapshot) => (
                <div
                    id={`task-${task.id}`}
                    ref={provided.innerRef}
                    {...provided.draggableProps}
                    {...provided.dragHandleProps}
                    className="mb-3 cursor-pointer group"
                    onClick={() => onClick(task)}
                    style={provided.draggableProps.style}
                >
                    <div className={cn(
                        "rounded-xl border bg-card text-card-foreground shadow-sm",
                        "group cursor-pointer relative overflow-hidden bg-white/80 dark:bg-zinc-900/80 backdrop-blur-sm transition-shadow",
                        "transition-all duration-700 ease-in-out",
                        snapshot.isDragging ? "ring-2 ring-indigo-600 shadow-xl z-50 opacity-90 rotate-2 scale-105" : "",
                        !snapshot.isDragging && isHighlighted ? "ring-2 ring-red-500 scale-[1.02] z-10" : "ring-2 ring-transparent",
                        !snapshot.isDragging && !isHighlighted && task.isSpecial ? "border-purple-500/70 ring-1 ring-purple-500/15" : "",
                        !snapshot.isDragging && !isHighlighted && overdue && !task.isSpecial ? "border-red-500/50 ring-1 ring-red-500/20" : "",
                        !snapshot.isDragging && !isHighlighted && !overdue && !task.isSpecial ? (
                            task.priority === 'URGENTE' ? "border-red-500/40 dark:border-red-500/30" :
                            task.priority === 'ALTA' ? "border-amber-500/40 dark:border-amber-500/30" :
                            task.priority === 'NORMAL' ? "border-blue-500/40 dark:border-blue-500/30" :
                            "border-zinc-200 dark:border-zinc-800"
                        ) : "",
                        isReturned && !isHighlighted && "border-red-500/30 bg-red-50/20 dark:bg-red-900/10 shadow-[inset_0_0_12px_rgba(239,68,68,0.05)]"
                    )}>
                        <div className="flex flex-col gap-3 p-4">
                            <div className="flex justify-between items-start">
                                <div className="flex flex-col gap-1.5">
                                    <div className="flex items-center gap-2">
                                        <ClientAvatar
                                            client={{
                                                id: task.clientId,
                                                name: task.clientName,
                                                logoUrl: task.client?.logoUrl
                                            }}
                                            size={20}
                                        />
                                        <span className="text-[10px] uppercase tracking-wider font-black text-zinc-600 dark:text-zinc-400 truncate max-w-[120px]">
                                            {task.clientName}
                                        </span>
                                        {isReturned && (
                                            <span className="text-[9px] font-black text-red-600 dark:text-red-400 bg-red-100 dark:bg-red-900/40 px-1.5 py-0.5 rounded flex items-center gap-1 uppercase tracking-tight">
                                                <RotateCcw className="w-2.5 h-2.5" /> Devuelto
                                            </span>
                                        )}
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <div className="flex items-center gap-1.5">
                                            <div
                                                className="w-1.5 h-1.5 rounded-full"
                                                style={{ backgroundColor: CATEGORY_COLORS[task.aiCategory] || '#94a3b8' }}
                                            />
                                            <span className="text-[9px] font-bold text-zinc-500 uppercase tracking-tighter">
                                                {task.aiCategory || "Sin Clasificar"}
                                            </span>
                                        </div>
                                        {task.aiComplexity && (
                                            <>
                                                <span className="w-1 h-1 rounded-full bg-zinc-200" />
                                                <span className={cn(
                                                    "text-[9px] font-bold uppercase tracking-tighter",
                                                    task.aiComplexity === 'ALTA' ? 'text-red-500' : task.aiComplexity === 'MEDIA' ? 'text-indigo-500' : 'text-emerald-500'
                                                )}>
                                                    {task.aiComplexity}
                                                </span>
                                            </>
                                        )}
                                        {String(task.status || '').toUpperCase() === 'EN_CURSO' && (
                                            <>
                                                <span className="w-1 h-1 rounded-full bg-zinc-200" />
                                                <TaskTimerBadge task={task} />
                                            </>
                                        )}
                                    </div>
                                </div>
                                <div className="flex flex-col items-end gap-1">
                                    <div className="flex items-center gap-1">
                                        {isDone ? (
                                            <button
                                                onClick={(e) => { e.stopPropagation(); onReopen(task); }}
                                                className="p-1 text-zinc-400 hover:text-[#009EB9] hover:bg-[#009EB9]/10 rounded-xl transition-colors"
                                                title="Reabrir tarea"
                                                aria-label="Reabrir tarea"
                                            >
                                                <RefreshCw className="w-3.5 h-3.5" />
                                            </button>
                                        ) : !isReturned && (
                                            <button
                                                onClick={(e) => { e.stopPropagation(); onReturn(task); }}
                                                className="p-1 hover:bg-red-50 dark:hover:bg-red-900/20 text-zinc-400 hover:text-red-500 rounded-xl transition-colors group/btn"
                                                title="Devolver tarea"
                                                aria-label="Devolver tarea"
                                            >
                                                <RotateCcw className="w-3.5 h-3.5" />
                                            </button>
                                        )}
                                        <button
                                            onClick={(e) => { e.stopPropagation(); onDelete(task); }}
                                            className="p-1 text-slate-400 hover:text-red-500 rounded-xl transition-colors group/btn"
                                        >
                                            <Trash2 className="w-3.5 h-3.5" />
                                        </button>
                                    </div>
                                </div>
                            </div>
                            <div>
                                <h4 className="font-bold text-sm text-zinc-800 dark:text-zinc-100 leading-snug mb-1">
                                    {task.title}
                                </h4>
                                <div className="flex items-center gap-1.5 opacity-60">
                                    <span className="text-[9px] text-zinc-500 uppercase tracking-tighter font-semibold">Creado por</span>
                                    <span className="text-[9px] text-primary font-bold uppercase tracking-tighter">{task.creatorName}</span>
                                </div>
                            </div>
                            <div className="flex items-center justify-between gap-2 mt-1 pt-3 border-t border-zinc-100 dark:border-zinc-800/50">
                                <div
                                    title={task.dueDateFormatted || "Sin fecha"}
                                    className={cn(
                                    "flex items-center gap-1.5 text-xs font-medium transition-colors shrink-0",
                                    overdue ? "text-red-600 font-bold animate-pulse" : "text-zinc-400 dark:text-zinc-500"
                                    )}
                                >
                                    <Calendar className={cn("w-3.5 h-3.5", overdue && "text-red-600")} />
                                    {formatTaskCardDate(task.dueDateFormatted)}
                                </div>
                                <div className="flex min-w-0 flex-1 items-center justify-end gap-1.5">
                                    {taskCardFooterBadges.map((badge) => {
                                        const BadgeIcon = badge.icon;
                                        return (
                                            <span
                                                key={badge.key}
                                                className={cn(
                                                    "inline-flex h-[22px] items-center gap-1 rounded border px-1.5 text-[10px] font-bold leading-none",
                                                    badge.className
                                                )}
                                                title={badge.label}
                                            >
                                                {BadgeIcon && <BadgeIcon className="h-3 w-3 fill-current shrink-0" />}
                                                <span className="truncate">{badge.label}</span>
                                            </span>
                                        );
                                    })}
                                    {task.comments && task.comments.trim() !== '' && (
                                        <div className="text-zinc-400 dark:text-zinc-500 mr-1">
                                            <MessageSquare className="w-3.5 h-3.5" />
                                        </div>
                                    )}
                                    <UserAvatarPopover user={{
                                        name: task.assigneeName,
                                        avatarUrl: task.assigneeAvatar,
                                        role: task.assigneeRole,
                                        statusMessage: task.assigneeStatus
                                    }}>
                                        <TeamAvatar
                                            member={{ name: task.assigneeName, avatarUrl: task.assigneeAvatar }}
                                            showTitle={false}
                                            className="w-6 h-6 ring-2 ring-white dark:ring-zinc-900"
                                        />
                                    </UserAvatarPopover>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </Draggable>
    );
};

export default NativeTasks;
