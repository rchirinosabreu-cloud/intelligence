import TeamAvatar from "../../components/ui/TeamAvatar";
import React, { useState, useMemo, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { motion, AnimatePresence } from 'framer-motion';
import { Filter, Calendar, MoreHorizontal, CheckCircle2, Clock, AlertCircle, ChevronDown, User, Loader2, AlertTriangle, AlertOctagon, MessageSquare, Edit2, X, RotateCcw, Send, Trash2, Zap, Star, Link as LinkIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
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
import TaskCreateModal from './TaskCreateModal';
import TaskEditModal from './TaskEditModal';
import { triggerConfetti } from '@/utils/confetti';

// --- DATE HELPERS ---

const parseDate = (dateStr) => {
    if (!dateStr) return null;
    const cleanStr = dateStr.trim();
    // Support both / and - separators
    const separator = cleanStr.includes('/') ? '/' : '-';
    const parts = cleanStr.split(separator);

    if (parts.length < 2) return null;
    const day = parseInt(parts[0], 10);
    const month = parseInt(parts[1], 10) - 1; // JS months are 0-based

    // Handle 2-digit years or full years
    let yearVal = parts[2] ? parseInt(parts[2], 10) : new Date().getFullYear();
    if (yearVal < 100) yearVal += 2000; // Assume 20xx for 2-digit years

    if (isNaN(day) || isNaN(month)) return null;
    return new Date(yearVal, month, day);
};

// Check if task is overdue (Date < Today)
// Used for "Solo Vencidos" and visual alerts
const isOverdue = (dateStr) => {
    const taskDate = parseDate(dateStr);
    if (!taskDate) return false;

    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    // Strictly less than today
    return taskDate < today;
};

// Check if task is today (Date === Today)
const isToday = (dateStr) => {
    const taskDate = parseDate(dateStr);
    if (!taskDate) return false;

    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    return taskDate.getTime() === today.getTime();
};

// Check if task is "Today + Overdue" (Date <= Today)
const isTodayOrOverdue = (dateStr) => {
    const taskDate = parseDate(dateStr);
    if (!taskDate) return false;

    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    return taskDate <= today;
};

// Check if task is in current week (Monday to Sunday)
const isThisWeek = (dateStr) => {
    const taskDate = parseDate(dateStr);
    if (!taskDate) return false;

    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    const dayOfWeek = today.getDay(); // 0 (Sun) - 6 (Sat)
    // Calculate Monday of this week. (If Sunday, go back 6 days. Else go back day-1)
    const diffToMon = dayOfWeek === 0 ? 6 : dayOfWeek - 1;

    const monday = new Date(today);
    monday.setDate(today.getDate() - diffToMon);

    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);

    return taskDate >= monday && taskDate <= sunday;
};

// Check if task is in current month
const isThisMonth = (dateStr) => {
    const taskDate = parseDate(dateStr);
    if (!taskDate) return false;

    const now = new Date();
    return taskDate.getMonth() === now.getMonth() && taskDate.getFullYear() === now.getFullYear();
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

// --- STYLES ---

const STRICT_RESPONSIBLES = ['Claudia', 'Helen', 'Rodny', 'Jarlan', 'Francisco', 'Camila', 'Elisa', 'Melissa'];

const CLIENT_COLORS = {
    "SunPartners": "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300 border-orange-200 dark:border-orange-800",
    "TechFlow": "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300 border-blue-200 dark:border-blue-800",
    "Urban Coffee": "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800",
    "Dr. Smile": "bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300 border-rose-200 dark:border-rose-800",
    "Velvet Hotel": "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300 border-purple-200 dark:border-purple-800",
};

// Note: Backend strictly returns Enum values: PENDIENTE, EN_CURSO, REALIZADA, DEVUELTA.
// Hierarchical Blindness: REALIZADA > EN_CURSO > DEVUELTA (by status or by comment if PENDIENTE)
const getColumnId = (status, comments = '') => {
    if (!status) return 'pendiente';
    const s = String(status).toUpperCase();
    const hasReturnTag = (comments || '').includes('[DEVOLUCIÓN');

    // High Priority: Always REALIZADA
    if (s === 'REALIZADA' || s === 'REALIZADO') return 'realizado';

    // Medium Priority: EN_CURSO
    if (s === 'EN_CURSO' || s === 'EN PROCESO') return 'en-proceso';

    // Shielding Logic: DEVUELTA or (PENDIENTE with Return Tag)
    // HOTFIX: Must be exactly uppercase for Enum matching
    if (s === 'DEVUELTA' || (s === 'PENDIENTE' && hasReturnTag)) return 'devuelto';

    return 'pendiente';
};

const NativeTasks = () => {
  const { currentUser } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [responsibleFilter, setResponsibleFilter] = useState('Todos');
  const [dateFilter, setDateFilter] = useState('Hoy + Vencidos');
  const [clientFilter, setClientFilter] = useState('Todos');

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

  // --- REACT QUERY: TASKS ---
  const {
    data: tasks = [],
    isLoading: loadingTasks,
    error: tasksError,
    refetch: refetchTasks
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
          clientName: task.client?.name || 'Sin Cliente',
          assigneeName: task.assignee?.name || 'Sin Asignar',
          assigneeId: task.assigneeId,
          assigneeAvatar: task.assignee?.avatarUrl || null,
          creatorId: task.creatorId,
          creatorName: task.creator?.name || 'Sistema',
          status: task.status,
          dueDateFormatted: task.dueDate ? task.dueDate.split('T')[0].split('-').reverse().join('-') : null,
          comments: task.comments,
          isPriority: task.isPriority || false,
          isSpecial: task.isSpecial || false,
          specialType: task.specialType,
          referenceUrl: task.referenceUrl,
          contentPlanId: task.contentItem?.planId,
          contentItemId: task.contentItem?.id
      }));
    },
    refetchInterval: 30000,
    refetchOnWindowFocus: true,
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
    staleTime: 600000, // 10 minutes
  });

  // Set default responsible filter based on user role
  useEffect(() => {
    const user = sessionStorage.getItem('currentUser');
    if (user) {
      const parsedUser = JSON.parse(user);
      if (parsedUser.role !== 'ADMIN' && parsedUser.name) {
        setResponsibleFilter(parsedUser.name);
      }
    }
  }, []);

  // Deep linking logic: open returned tasks sidebar and open specific task if taskId is provided
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const showReturned = params.get('showReturned') === 'true';
    const taskId = params.get('taskId');

    if (showReturned) {
        setIsReturnedSidebarOpen(true);
    }

    // Auto-scroll to specific task and open modal if taskId is provided
    if (taskId && tasks.length > 0) {
        setHighlightedTaskId(taskId);

        // Magic touch: find the task and open it in the modal automatically
        const taskToOpen = tasks.find(t => String(t.id) === taskId);
        if (taskToOpen && !editingTask) {
            setEditingTask(taskToOpen);
        }

        // Wait for potential animations and list render
        setTimeout(() => {
            const element = document.getElementById(`task-${taskId}`);
            if (element) {
                element.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
        }, showReturned ? 600 : 300);

        // Turn off highlight after 3 seconds
        const timer = setTimeout(() => {
            setHighlightedTaskId(null);
        }, 3000);

        return () => clearTimeout(timer);
    }
  }, [location.search, tasks]); // Only trigger when URL params or tasks change

  const handleReturnTask = async () => {
      if (!returningTask || !returnReason.trim() || isSubmittingReturn) return;

      // 1. Snapshot for Revert
      const previousTasks = [...tasks];

      try {
          setIsSubmittingReturn(true);
          const baseUrl = getApiBaseUrl();

          // 2. Local State Prep (Comments tag and Exact Status)
          const returnTag = `[DEVOLUCIÓN - ${new Date().toLocaleDateString()}]: ${returnReason}`;
          const updatedComments = (returningTask.comments)
              ? `${returnTag}\n\n${returningTask.comments}`
              : returnTag;

          // 3. OPTIMISTIC UPDATE
          queryClient.setQueryData(['nativeTasks'], prev => prev?.map(t =>
            t.id === returningTask.id
                ? { ...t, status: 'DEVUELTA', comments: updatedComments, comentarios: updatedComments }
                : t
          ));

          const response = await fetch(`${baseUrl}/api/tasks/${returningTask.id}`, {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                  status: 'DEVUELTA',
                  comments: updatedComments
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
          } else {
              throw new Error("Failed to return task");
          }
      } catch (err) {
          console.error("Error returning task:", err);
          // 4. REVERT on failure
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

      // Optimistic UI: Remove from local state
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
              body: JSON.stringify({
                  reason: deleteReason
              })
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
          } else {
              throw new Error("Failed to delete task");
          }
      } catch (err) {
          console.error("Error deleting task:", err);
          // Revert on failure
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

  // Extract unique responsibles (Names)
  const responsibles = useMemo(() => {
      const unique = [...new Set(tasks.map(t => t.assigneeName || "Desconocido"))].filter(Boolean).sort();
      return ['Todos', ...unique];
  }, [tasks]);

  // Extract unique clients
  const clients = useMemo(() => {
      const unique = [...new Set(tasks.map(t => t.clientName || "Desconocido"))].filter(Boolean).sort();
      return ['Todos', ...unique];
  }, [tasks]);

  const filteredTasks = useMemo(() => {
      let filtered = tasks.filter(task => {
        // Filter by Responsible
        if (responsibleFilter !== 'Todos' && (task.assigneeName || "Desconocido") !== responsibleFilter) return false;

        // Filter by Client
        if (clientFilter !== 'Todos' && (task.clientName || "Desconocido") !== clientFilter) return false;

        // Filter by Date Logic
        // 'Hoy + Vencidos' (Default): Muestra fecha <= HOY.
        // 'Solo Vencidos' (⚠️): Muestra fecha < HOY.
        // 'Esta Semana': Muestra fecha >= Lunes Y fecha <= Domingo.
        // 'Todos': Muestra TODO (tenga fecha o no).

        if (dateFilter === 'Todos') {
            return true;
        }

        if (dateFilter === 'Hoy + Vencidos') {
             return isTodayOrOverdue(task.dueDateFormatted);
        }

        if (dateFilter === 'Solo Vencidos') {
            return isOverdue(task.dueDateFormatted);
        }

        if (dateFilter === 'Esta Semana') {
            return isThisWeek(task.dueDateFormatted);
        }

        return true;
      });

      // 2. Sorting: Always by Date Ascending (Oldest First)
      filtered.sort((a, b) => {
          const dateA = parseDate(a.dueDateFormatted) || new Date(2100, 0, 1); // Future if null
          const dateB = parseDate(b.dueDateFormatted) || new Date(2100, 0, 1);
          return dateA - dateB;
      });

      return filtered;
  }, [tasks, responsibleFilter, clientFilter, dateFilter]);


  const columns = [
      { id: 'pendiente', title: 'Pendiente', color: 'bg-zinc-100 dark:bg-zinc-800/50' },
      { id: 'en-proceso', title: 'En proceso', color: 'bg-blue-50/50 dark:bg-blue-900/10' },
      { id: 'realizado', title: 'Realizado', color: 'bg-emerald-50/50 dark:bg-emerald-900/10' }
  ];

  const returnedTasks = useMemo(() => {
      return tasks.filter(t => getColumnId(t.status, t.comments) === 'devuelto');
  }, [tasks]);

  const onDragEnd = async (result) => {
      const { destination, source, draggableId } = result;

      // 1. Validation
      if (!destination) return;
      if (
          destination.droppableId === source.droppableId &&
          destination.index === source.index
      ) {
          return;
      }

      // 2. Snapshot for reverting (Optimistic UI)
      const previousTasks = [...tasks];
      const taskId = draggableId;
      const destinationColumnId = destination.droppableId;
      const sourceColumnId = source.droppableId;

      // 3. Optimistic Update Logic
      const newTasks = [...tasks];
      const taskIndex = newTasks.findIndex(t => String(t.id) === taskId);

      if (taskIndex === -1) return;

      // Get the task and remove it from original position
      const movedTask = { ...newTasks[taskIndex] };
      newTasks.splice(taskIndex, 1);

      // Update internal status using the exact Enum values for visual consistency
      const newStatusEnum =
          destinationColumnId === 'pendiente' ? 'PENDIENTE' :
          destinationColumnId === 'en-proceso' ? 'EN_CURSO' :
          destinationColumnId === 'devuelto' ? 'DEVUELTA' : 'REALIZADA';

      movedTask.status = newStatusEnum;

      // Tag Stripping Logic for Optimistic UI: If moving to Pendiente, strip return tag
      if (newStatusEnum === 'PENDIENTE' && (movedTask.comments)) {
          const currentText = movedTask.comments || '';
          const cleanedText = currentText.replace(/^\s*\[DEVOLUCIÓN[^\]]*\]:[^\n]*(\n\n)?/i, '').trim();
          movedTask.comments = cleanedText;
          console.log("[onDragEnd] Optimistic UI: Stripped return tag from comments.");
      }

      // Calculate Insertion Position (handling filters and visibility)
      // Filter the *remaining* tasks to match what's visible in the destination column
      const visibleTasksInDestColumn = newTasks.filter(task => {
          // Match Column
          if (getColumnId(task.status, task.comments) !== destinationColumnId) return false;

          // Match Active Filters
          if (responsibleFilter !== 'Todos' && (task.assigneeName || "Desconocido") !== responsibleFilter) return false;
          if (clientFilter !== 'Todos' && (task.clientName || "Desconocido") !== clientFilter) return false;

          // Match Date Filter Logic
          if (dateFilter === 'Hoy + Vencidos' && !isTodayOrOverdue(task.dueDateFormatted)) return false;
          if (dateFilter === 'Solo Vencidos' && !isOverdue(task.dueDateFormatted)) return false;
          if (dateFilter === 'Esta Semana' && !isThisWeek(task.dueDateFormatted)) return false;
          if (dateFilter === 'Todos') return true;

          return true;
      });

      // Determine where to insert in the global 'newTasks' list
      let insertionIndexInGlobal = -1;

      if (visibleTasksInDestColumn.length === 0) {
          // If column is empty, append to end
          insertionIndexInGlobal = newTasks.length;
      } else if (destination.index >= visibleTasksInDestColumn.length) {
          // Insert after the last visible task
          const lastVisibleTask = visibleTasksInDestColumn[visibleTasksInDestColumn.length - 1];
          const lastVisibleIndex = newTasks.findIndex(t => t.id === lastVisibleTask.id);
          insertionIndexInGlobal = lastVisibleIndex + 1;
      } else {
          // Insert before the task at destination.index
          const anchorTask = visibleTasksInDestColumn[destination.index];
          insertionIndexInGlobal = newTasks.findIndex(t => t.id === anchorTask.id);
      }

      // Safe insertion
      if (insertionIndexInGlobal !== -1) {
           newTasks.splice(insertionIndexInGlobal, 0, movedTask);
      } else {
           // Fallback (should not happen if logic is correct)
           newTasks.push(movedTask);
      }

      // Apply Optimistic Update
      queryClient.setQueryData(['nativeTasks'], newTasks);

      // 4. API Sync (Only if column changed)
      if (sourceColumnId === destinationColumnId) {
          return;
      }

      // Trigger confetti if moving to 'realizado' for the first time in this interaction
      // Anti-spam: Only if it's a real status transition from another column
      if (sourceColumnId !== 'realizado' && destinationColumnId === 'realizado') {
          triggerConfetti();
      }

      // Para nativo usamos los IDs de columna como estado: "Pendiente", "En proceso", "Realizado", "Devuelto"
        const newStatusForDB =
            destinationColumnId === 'pendiente' ? 'PENDIENTE' :
            destinationColumnId === 'en-proceso' ? 'EN_CURSO' :
            destinationColumnId === 'devuelto' ? 'DEVUELTA' : 'REALIZADA';

      try {
          const baseUrl = getApiBaseUrl();
          const token = localStorage.getItem('authToken');

          // Construct Payload
          const payload = { status: newStatusForDB };

          // If moving to Pendiente, also strip the tag in the DB update
          if (newStatusForDB === 'PENDIENTE') {
              const currentText = movedTask.comments || '';
              const cleanedText = currentText.replace(/^\s*\[DEVOLUCIÓN[^\]]*\]:[^\n]*(\n\n)?/i, '').trim();
              payload.comments = cleanedText;
          }

          console.log(`[onDragEnd] Syncing status to ${newStatusForDB}...`, payload);

          const response = await fetch(`${baseUrl}/api/tasks/${taskId}`, {
              method: 'PATCH',
              headers: {
                  'Content-Type': 'application/json',
                  'Authorization': token ? `Bearer ${token}` : ''
              },
              body: JSON.stringify(payload)
          });

          if (!response.ok) {
              throw new Error("Failed to update status in backend");
          }

          queryClient.invalidateQueries({ queryKey: ['dashboardMetrics'] });
      } catch (err) {
          console.error("Drag and drop failed:", err);
          // Manually reset local tasks to previous snapshot on query fail if needed,
          // but React Query will usually handle re-sync on next interval.
          // For immediate visual revert:
          queryClient.setQueryData(['nativeTasks'], previousTasks);

          toast({
              title: "Error de sincronización",
              description: "Se revirtió el movimiento porque no se pudo actualizar el estado.",
              variant: "destructive"
          });
      }
  };

  if (loadingTasks && tasks.length === 0) {
      return (
          <div className="h-full flex flex-col items-center justify-center space-y-4">
              <Loader2 className="w-10 h-10 text-indigo-500 animate-spin" />
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
              <p className="text-xs text-zinc-400 font-mono bg-zinc-100 dark:bg-zinc-900 px-2 py-1 rounded">
                  {tasksError?.message}
              </p>
              <button
                onClick={() => window.location.reload()}
                className="mt-4 px-4 py-2 bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 rounded-lg text-sm font-medium hover:opacity-90 transition-opacity"
              >
                  Reintentar
              </button>
          </div>
      );
  }

  return (
    <div className="space-y-6 h-full flex flex-col">
      {/* Header & Filters */}
      <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-zinc-900 dark:text-white mb-1">Pendientes (Nativo)</h2>
          <p className="text-zinc-500 dark:text-zinc-400 text-sm">Gestiona tareas con la base de datos de Prisma.</p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
            <button
                onClick={() => setIsCreating(true)}
                className="bg-primary hover:bg-primary/90 text-primary-foreground px-4 py-2 rounded-lg text-sm font-medium transition-colors shadow-sm"
            >
                + Nueva tarea
            </button>
            {/* Responsible Filter */}
            <div className="relative group">
                <select
                    value={responsibleFilter}
                    onChange={(e) => setResponsibleFilter(e.target.value)}
                    className="appearance-none pl-9 pr-8 py-2 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg text-sm font-medium text-zinc-700 dark:text-zinc-300 hover:border-zinc-300 dark:hover:border-zinc-700 focus:outline-none focus:ring-2 focus:ring-primary/20 cursor-pointer shadow-sm transition-all w-48 truncate"
                >
                    {responsibles.map((r, i) => (
                        <option key={i} value={r}>
                            {r === 'Todos' ? 'Todos los responsables' : r}
                        </option>
                    ))}
                </select>
                <User className="w-4 h-4 text-zinc-400 absolute left-3 top-2.5 pointer-events-none" />
                <ChevronDown className="w-4 h-4 text-zinc-400 absolute right-3 top-2.5 pointer-events-none group-hover:text-zinc-600 dark:group-hover:text-zinc-200 transition-colors" />
            </div>

             {/* Client Filter */}
             <div className="relative group">
                <select
                    value={clientFilter}
                    onChange={(e) => setClientFilter(e.target.value)}
                    className="appearance-none pl-9 pr-8 py-2 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg text-sm font-medium text-zinc-700 dark:text-zinc-300 hover:border-zinc-300 dark:hover:border-zinc-700 focus:outline-none focus:ring-2 focus:ring-primary/20 cursor-pointer shadow-sm transition-all w-48 truncate"
                >
                    {clients.map((c, i) => (
                        <option key={i} value={c}>
                            {c === 'Todos' ? 'Todos los clientes' : c}
                        </option>
                    ))}
                </select>
                <Filter className="w-4 h-4 text-zinc-400 absolute left-3 top-2.5 pointer-events-none" />
                <ChevronDown className="w-4 h-4 text-zinc-400 absolute right-3 top-2.5 pointer-events-none group-hover:text-zinc-600 dark:group-hover:text-zinc-200 transition-colors" />
            </div>

             {/* Date Filter (Dropdown Updated) */}
             <div className="relative group">
                <select
                    value={dateFilter}
                    onChange={(e) => setDateFilter(e.target.value)}
                    className={cn(
                        "appearance-none pl-9 pr-8 py-2 bg-white dark:bg-zinc-900 border rounded-lg text-sm font-medium focus:outline-none focus:ring-2 focus:ring-primary/20 cursor-pointer shadow-sm transition-all",
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

                {/* Dynamic Icon */}
                {dateFilter === 'Solo Vencidos' ? (
                     <AlertTriangle className="w-4 h-4 text-red-500 absolute left-3 top-2.5 pointer-events-none" />
                ) : (
                     <Calendar className="w-4 h-4 text-zinc-400 absolute left-3 top-2.5 pointer-events-none" />
                )}

                <ChevronDown className="w-4 h-4 text-zinc-400 absolute right-3 top-2.5 pointer-events-none group-hover:text-zinc-600 dark:group-hover:text-zinc-200 transition-colors" />
            </div>
        </div>
      </div>

      {/* Modals */}
      <TaskCreateModal
          isOpen={isCreating}
          onClose={() => setIsCreating(false)}
          onSuccess={() => {
            queryClient.invalidateQueries({ queryKey: ['nativeTasks'] });
            queryClient.invalidateQueries({ queryKey: ['dashboardMetrics'] });
          }}
          clientsList={clientsList}
      />
      <TaskEditModal
          isOpen={!!editingTask}
          onClose={() => {
              setEditingTask(null);
              // Clear taskId from URL to prevent auto-reopening if it was opened via deep link
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
          }}
          clientsList={clientsList}
          taskData={editingTask}
      />

      {/* Return Reason Modal */}
      <Dialog open={!!returningTask} onOpenChange={(open) => !open && setReturningTask(null)}>
          <DialogContent className="sm:max-w-md dark:bg-zinc-950 border-zinc-200 dark:border-zinc-800">
              <DialogHeader>
                  <DialogTitle className="flex items-center gap-2 text-red-600">
                      <RotateCcw className="w-5 h-5" />
                      Devolver tarea
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
                      className="px-4 py-2 text-sm font-medium text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg transition-colors"
                  >
                      Cancelar
                  </button>
                  <button
                      onClick={() => handleReturnTask()}
                      disabled={!returnReason.trim() || isSubmittingReturn}
                      className="px-4 py-2 bg-red-600 hover:bg-red-700 disabled:bg-zinc-200 dark:disabled:bg-zinc-800 text-white rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-2 shadow-lg shadow-red-500/20"
                  >
                      {isSubmittingReturn ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                      Devolver ahora
                  </button>
              </DialogFooter>
          </DialogContent>
      </Dialog>

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
                      className="px-4 py-2 text-sm font-medium text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg transition-colors"
                  >
                      Cancelar
                  </button>
                  <button
                      onClick={() => handleDeleteTask()}
                      disabled={!deleteReason.trim() || isSubmittingDelete}
                      className="px-4 py-2 bg-red-600 hover:bg-red-700 disabled:bg-zinc-200 dark:disabled:bg-zinc-800 text-white rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-2 shadow-lg shadow-red-500/20"
                  >
                      {isSubmittingDelete ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                      Eliminar Tarea
                  </button>
              </DialogFooter>
          </DialogContent>
      </Dialog>

      {/* Kanban Board */}
      <DragDropContext onDragEnd={onDragEnd}>
          <div className="flex gap-6 flex-1 min-h-[500px] relative">

              {/* OVERLAY / BACKDROP FOR RETURNED TASKS */}
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

              {/* DRAWER PANEL FOR RETURNED TASKS */}
              <div className={cn(
                  "fixed right-0 top-0 h-full w-full max-w-sm sm:max-w-md bg-white dark:bg-zinc-950 z-[110] shadow-2xl transition-transform duration-500 ease-in-out transform flex flex-col border-l border-zinc-200 dark:border-zinc-800",
                  isReturnedSidebarOpen ? "translate-x-0" : "translate-x-full"
              )}>
                  <div className="p-6 border-b border-zinc-100 dark:border-zinc-800 flex justify-between items-center bg-zinc-50/50 dark:bg-zinc-900/50">
                      <div className="flex flex-col">
                        <h3 className="text-lg font-bold text-red-600 flex items-center gap-2">
                            <RotateCcw className="w-5 h-5" />
                            Tareas devueltas
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
                              className={cn(
                                  "flex-1 p-6 overflow-y-auto space-y-4",
                                  snapshot.isDraggingOver && "bg-red-50/20 dark:bg-red-900/5"
                              )}
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
                                          onDelete={(t) => setDeletingTask(t)}
                                      />
                                  ))
                              )}
                              {provided.placeholder}
                          </div>
                      )}
                  </Droppable>
              </div>

              {/* Grid Column Layout Area */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 flex-1">
                  {columns.map((col) => {
                      const columnTasks = filteredTasks.filter(t => getColumnId(t.status, t.comments) === col.id);

                      return (
                        <div key={col.id} className="flex flex-col gap-4">
                            {/* Column Header */}
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
                                        className="group/returned relative flex items-center gap-1.5 px-2 py-1 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 rounded-lg hover:bg-red-100 dark:hover:bg-red-900/30 transition-all border border-red-100 dark:border-red-900/30 shadow-sm"
                                    >
                                        <RotateCcw className="w-3.5 h-3.5 animate-pulse" />
                                        <span className="text-[10px] font-black uppercase tracking-tighter">
                                            {returnedTasks.length} Devueltas
                                        </span>
                                    </button>
                                )}
                            </div>

                            {/* Column Area */}
                            <Droppable droppableId={col.id}>
                                {(provided, snapshot) => (
                                    <div
                                        {...provided.droppableProps}
                                        ref={provided.innerRef}
                                        className={cn(
                                            "flex-1 rounded-xl p-2 transition-colors space-y-3 min-h-[100px]",
                                            col.color,
                                            "bg-opacity-50 dark:bg-opacity-20 border border-transparent hover:border-zinc-200/50 dark:hover:border-zinc-700/50",
                                            snapshot.isDraggingOver && "ring-2 ring-indigo-500/20"
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
                                                onDelete={(t) => setDeletingTask(t)}
                                            />
                                        ))}
                                        {provided.placeholder}
                                        {columnTasks.length === 0 && !snapshot.isDraggingOver && (
                                            <div className="h-24 flex items-center justify-center text-zinc-400 dark:text-zinc-600 text-sm border-2 border-dashed border-zinc-200 dark:border-zinc-800 rounded-lg">
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

const TaskCard = ({ task, index, highlightedTaskId, onClick, onReturn, onDelete }) => {
    const isHighlighted = highlightedTaskId === String(task.id);

    // Overdue Logic for Style
    const columnId = getColumnId(task.status, task.comments);
    const isDone = columnId === 'realizado';
    const isReturned = columnId === 'devuelto';
    const overdue = !isDone && isOverdue(task.dueDateFormatted);
    const daysOverdue = overdue ? getDaysOverdue(task.dueDateFormatted) : 0;

    // Check if we should highlight overdue items (visual indicator logic)
    // "Si selecciono 'Solo Vencidos', o si hay tareas vencidas en la vista 'Hoy', resáltalas"
    // Basically, if it is overdue, we style it.

    const clientColorClass = CLIENT_COLORS[task.clientName] || "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300";

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
                    // Important: Only pass style if provided.draggableProps.style exists
                    style={provided.draggableProps.style}
                >
                    <div
                        className={cn(
                            "rounded-xl border bg-card text-card-foreground shadow-sm",
                            "group cursor-pointer relative overflow-hidden bg-white/80 dark:bg-zinc-900/80 backdrop-blur-sm transition-shadow",
                            "transition-all duration-700 ease-in-out",
                            // Border priority: Dragging > Highlight > Overdue > Priority > Normal
                            snapshot.isDragging ? "ring-2 ring-indigo-500 shadow-xl z-50 opacity-90 rotate-2 scale-105" : "",
                            !snapshot.isDragging && isHighlighted ? "ring-2 ring-red-500 scale-[1.02] z-10" : "ring-2 ring-transparent",
                            !snapshot.isDragging && !isHighlighted && overdue ? "border-red-500/50 ring-1 ring-red-500/20" : "",
                            !snapshot.isDragging && !isHighlighted && !overdue && task.isPriority ? "border-l-4 border-l-red-500 border-zinc-200 dark:border-zinc-800" : "border-zinc-200 dark:border-zinc-800",
                            isReturned && !isHighlighted && "border-red-500/30 bg-red-50/20 dark:bg-red-900/10 shadow-[inset_0_0_12px_rgba(239,68,68,0.05)]"
                        )}
                    >
                        <div className="flex flex-col gap-3 p-4">
                                {/* Header: Client Badge */}
                                <div className="flex justify-between items-start">
                                     <div className="flex items-center gap-2">
                                        <span className={cn("text-[10px] uppercase tracking-wider font-bold px-2 py-1 rounded-md border", clientColorClass)}>
                                            {task.clientName}
                                        </span>
                                        {isReturned && (
                                            <span className="text-[9px] font-black text-red-600 dark:text-red-400 bg-red-100 dark:bg-red-900/40 px-1.5 py-0.5 rounded flex items-center gap-1 uppercase tracking-tight">
                                                <RotateCcw className="w-2.5 h-2.5" />
                                                Devuelto
                                            </span>
                                        )}
                                     </div>

                                     {/* Priority or Overdue Badge */}
                                     <div className="flex flex-col items-end gap-1">
                                        <div className="flex items-center gap-1">
                                            {!isReturned && (
                                                <button
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        onReturn(task);
                                                    }}
                                                    className="p-1 hover:bg-red-50 dark:hover:bg-red-900/20 text-zinc-400 hover:text-red-500 rounded-lg transition-colors group/btn"
                                                    title="Devolver tarea"
                                                >
                                                    <RotateCcw className="w-3.5 h-3.5" />
                                                </button>
                                            )}
                                            <button
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    onDelete(task);
                                                }}
                                                className="p-1 text-slate-400 hover:text-red-500 rounded-lg transition-colors group/btn"
                                                title="Eliminar tarea"
                                            >
                                                <Trash2 className="w-3.5 h-3.5" />
                                            </button>
                                        </div>
                                        {overdue && (
                                            <span className="text-[10px] font-bold text-red-600 bg-red-50 dark:bg-red-900/30 px-1.5 py-0.5 rounded border border-red-100 dark:border-red-800 flex items-center gap-1">
                                                <AlertOctagon className="w-3 h-3" />
                                                Vencido (+{daysOverdue}d)
                                            </span>
                                        )}
                                        {task.isPriority && !overdue && !isReturned && (
                                            <span className="text-[10px] font-bold text-white flex items-center gap-1 bg-orange-600 px-1.5 py-0.5 rounded border border-orange-500 shadow-sm animate-pulse">
                                                <Zap className="w-3 h-3 fill-current" />
                                                PRIORITARIO
                                            </span>
                                        )}
                                        {task.isSpecial && !isReturned && (
                                            <span className="text-[10px] font-bold text-purple-600 dark:text-purple-400 flex items-center gap-1 bg-purple-50 dark:bg-purple-900/30 px-1.5 py-0.5 rounded border border-purple-100 dark:border-purple-800">
                                                <Star className="w-3 h-3 fill-current" />
                                                {task.specialType || 'Especial'}
                                            </span>
                                        )}
                                     </div>
                                </div>

                                {/* Body: Task Title */}
                                    <div>
                                        <h4 className="font-bold text-sm text-zinc-800 dark:text-zinc-100 leading-snug mb-1">
                                            {task.title}
                                        </h4>
                                        <div className="flex items-center gap-1.5 opacity-60">
                                            <span className="text-[9px] text-zinc-500 uppercase tracking-tighter font-semibold">Creado por</span>
                                            <span className="text-[9px] text-primary font-bold uppercase tracking-tighter">{task.creatorName}</span>
                                        </div>
                                    </div>

                                {/* Footer: Date & Avatar & Comments */}
                                <div className="flex items-center justify-between mt-1 pt-3 border-t border-zinc-100 dark:border-zinc-800/50">
                                    <div className={cn(
                                        "flex items-center gap-1.5 text-xs font-medium transition-colors",
                                        overdue ? "text-red-600 font-bold animate-pulse" : "text-zinc-400 dark:text-zinc-500"
                                    )}>
                                        <Calendar className={cn("w-3.5 h-3.5", overdue && "text-red-600")} />
                                        {task.dueDateFormatted || "Sin fecha"}
                                    </div>

                                    <div className="flex items-center gap-2">
                                        {task.contentPlanId && (
                                            <button
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    navigate(`/parrillas/${task.contentPlanId}?itemId=${task.contentItemId}`);
                                                }}
                                                className="text-indigo-600 hover:text-indigo-800 transition-colors p-1 bg-indigo-50 dark:bg-indigo-900/20 rounded-full"
                                                title="Ir a la Parrilla de Contenido"
                                            >
                                                <LayoutGrid className="w-3.5 h-3.5" />
                                            </button>
                                        )}
                                        {task.referenceUrl && (
                                            <a
                                                href={task.referenceUrl}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                onClick={(e) => e.stopPropagation()}
                                                className="text-primary hover:text-primary/80 transition-colors p-1 bg-primary/10 rounded-full"
                                                title="Ver Referencia"
                                            >
                                                <LinkIcon className="w-3.5 h-3.5" />
                                            </a>
                                        )}
                                        {task.comments && task.comments.trim() !== '' && (
                                            <div className="text-zinc-400 dark:text-zinc-500 mr-1" title="Tiene comentarios">
                                                <MessageSquare className="w-3.5 h-3.5" />
                                            </div>
                                        )}
                                        <TeamAvatar
                                            member={{ name: task.assigneeName, avatarUrl: task.assigneeAvatar }}
                                            className="w-6 h-6 ring-2 ring-white dark:ring-zinc-900"
                                        />
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
