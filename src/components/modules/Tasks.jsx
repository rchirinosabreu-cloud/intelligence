import React, { useState, useMemo, useEffect } from 'react';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { motion } from 'framer-motion';
import { Filter, Calendar, MoreHorizontal, CheckCircle2, Clock, AlertCircle, ChevronDown, User, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';
import { useToast } from '@/components/ui/use-toast';

// Helper to check if date is today or past
// Assumes format "DD/MM" or similar
const isOverdue = (dateStr) => {
    if (!dateStr) return false;
    const parts = dateStr.split('/');
    if (parts.length !== 2 && parts.length !== 3) return false;

    const day = parseInt(parts[0], 10);
    const month = parseInt(parts[1], 10);
    const year = parts[2] ? parseInt(parts[2], 10) : new Date().getFullYear(); // Assume current year if missing

    if (isNaN(day) || isNaN(month)) return false;

    const now = new Date();
    const taskDate = new Date(year, month - 1, day);
    // Reset time for comparison
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    return taskDate <= today;
};

// Helper for date filtering
const isToday = (dateStr) => {
    if (!dateStr) return false;
    const parts = dateStr.split('/');
    if (parts.length < 2) return false;

    const day = parseInt(parts[0], 10);
    const month = parseInt(parts[1], 10);

    const now = new Date();
    return day === now.getDate() && (month - 1) === now.getMonth();
};

// Helper for "This Week" (next 7 days)
const isThisWeek = (dateStr) => {
    if (!dateStr) return false;
    const parts = dateStr.split('/');
    if (parts.length < 2) return false;

    const day = parseInt(parts[0], 10);
    const month = parseInt(parts[1], 10);
    const year = parts[2] ? parseInt(parts[2], 10) : new Date().getFullYear();

    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const taskDate = new Date(year, month - 1, day);

    const diffTime = taskDate - today;
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays >= 0 && diffDays <= 7;
};

const CLIENT_COLORS = {
    "SunPartners": "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300 border-orange-200 dark:border-orange-800",
    "TechFlow": "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300 border-blue-200 dark:border-blue-800",
    "Urban Coffee": "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800",
    "Dr. Smile": "bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300 border-rose-200 dark:border-rose-800",
    "Velvet Hotel": "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300 border-purple-200 dark:border-purple-800",
};

const Tasks = () => {
  const [responsibleFilter, setResponsibleFilter] = useState('Todos');
  const [dateFilter, setDateFilter] = useState('Todas');
  const [clientFilter, setClientFilter] = useState('Todos');

  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const { toast } = useToast();

  useEffect(() => {
      const fetchTasks = async () => {
          try {
              setLoading(true);
              const baseUrl = (import.meta.env.VITE_API_URL || "https://api.brainstudioagencia.com").replace(/\/$/, '');
              const response = await fetch(`${baseUrl}/api/pendientes`);
              if (!response.ok) {
                  throw new Error(`Error ${response.status}: ${response.statusText}`);
              }
              const data = await response.json();
              setTasks(data);
          } catch (err) {
              console.error("Failed to fetch tasks:", err);
              setError(err.message);
          } finally {
              setLoading(false);
          }
      };

      fetchTasks();
  }, []);

  // Extract unique responsibles (Names)
  const responsibles = useMemo(() => {
      const unique = [...new Set(tasks.map(t => t.responsable_name || "Desconocido"))].filter(Boolean).sort();
      return ['Todos', ...unique];
  }, [tasks]);

  // Extract unique clients
  const clients = useMemo(() => {
      const unique = [...new Set(tasks.map(t => t.cliente || "Desconocido"))].filter(Boolean).sort();
      return ['Todos', ...unique];
  }, [tasks]);

  const filteredTasks = tasks.filter(task => {
    // Filter by Responsible
    if (responsibleFilter !== 'Todos' && (task.responsable_name || "Desconocido") !== responsibleFilter) return false;

    // Filter by Client
    if (clientFilter !== 'Todos' && (task.cliente || "Desconocido") !== clientFilter) return false;

    // Filter by Date
    if (dateFilter === 'Para Hoy') {
        if (!isToday(task.fecha_entrega)) return false;
    }
    if (dateFilter === 'Esta semana') {
        if (!isThisWeek(task.fecha_entrega)) return false;
    }

    return true;
  });

  const columns = [
      { id: 'pendiente', title: 'Pendiente', color: 'bg-zinc-100 dark:bg-zinc-800/50' },
      { id: 'en-proceso', title: 'En proceso', color: 'bg-blue-50/50 dark:bg-blue-900/10' },
      { id: 'realizado', title: 'Realizado', color: 'bg-emerald-50/50 dark:bg-emerald-900/10' }
  ];

  // Note: Backend might return 'Realizado', 'Hecho', 'Finalizado'.
  // We need to normalize or map the backend status to our column IDs.
  // Or just flexible matching.
  const getColumnId = (status) => {
      if (!status) return 'pendiente';
      const normalized = String(status)
          .toLowerCase()
          .normalize('NFD')
          .replace(/[̀-ͯ]/g, '')
          .trim();

      if (['realizado', 'finalizado', 'hecho', 'done', 'completado', 'terminado'].includes(normalized)) return 'realizado';
      if (['en proceso', 'en curso', 'proceso', 'working', 'doing', 'in progress', 'en-proceso'].includes(normalized)) return 'en-proceso';
      return 'pendiente';
  };

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

      // Update internal status
      movedTask.estado = destinationColumnId;

      // Calculate Insertion Position (handling filters and visibility)
      // Filter the *remaining* tasks to match what's visible in the destination column
      const visibleTasksInDestColumn = newTasks.filter(task => {
          // Match Column
          if (getColumnId(task.estado) !== destinationColumnId) return false;

          // Match Active Filters
          if (responsibleFilter !== 'Todos' && (task.responsable_name || "Desconocido") !== responsibleFilter) return false;
          if (clientFilter !== 'Todos' && (task.cliente || "Desconocido") !== clientFilter) return false;
          if (dateFilter === 'Para Hoy' && !isToday(task.fecha_entrega)) return false;
          if (dateFilter === 'Esta semana' && !isThisWeek(task.fecha_entrega)) return false;

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
      setTasks(newTasks);

      // 4. API Sync (Only if column changed)
      // Note: If reordering within same column, we don't sync to backend (as per original logic/requirement)
      // unless we want to persist order (which is not supported by backend yet).
      if (sourceColumnId === destinationColumnId) {
          return;
      }

      const SHEET_STATUS_MAP = {
          'pendiente': 'Pendiente',
          'en-proceso': 'En Proceso',
          'realizado': 'Realizado'
      };

      const newStatusForSheet = SHEET_STATUS_MAP[destinationColumnId] || 'Pendiente';

      try {
          const baseUrl = (import.meta.env.VITE_API_URL || "https://api.brainstudioagencia.com").replace(/\/$/, '');
          const response = await fetch(`${baseUrl}/api/pendientes/${taskId}/status`, {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ status: newStatusForSheet })
          });

          if (!response.ok) {
              throw new Error("Failed to update status in backend");
          }
      } catch (err) {
          console.error("Drag and drop failed:", err);
          setTasks(previousTasks);
          toast({
              title: "Error de sincronización",
              description: "Se revirtió el movimiento porque no se pudo actualizar el estado en Google Sheets.",
              variant: "destructive"
          });
      }
  };

  if (loading) {
      return (
          <div className="h-full flex flex-col items-center justify-center space-y-4">
              <Loader2 className="w-10 h-10 text-indigo-500 animate-spin" />
              <p className="text-zinc-500 dark:text-zinc-400 text-sm animate-pulse">Sincronizando con Google Sheets...</p>
          </div>
      );
  }

  if (error) {
       return (
          <div className="h-full flex flex-col items-center justify-center space-y-4">
              <div className="w-12 h-12 bg-red-100 dark:bg-red-900/20 rounded-full flex items-center justify-center">
                  <AlertCircle className="w-6 h-6 text-red-500" />
              </div>
              <h3 className="text-lg font-semibold text-zinc-900 dark:text-white">No pudimos cargar tus tareas</h3>
              <p className="text-zinc-500 dark:text-zinc-400 text-sm max-w-sm text-center">
                  Hubo un problema al conectar con la hoja de cálculo. Por favor verifica tu conexión o las credenciales.
              </p>
              <p className="text-xs text-zinc-400 font-mono bg-zinc-100 dark:bg-zinc-900 px-2 py-1 rounded">
                  {error}
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
          <h2 className="text-2xl font-bold text-zinc-900 dark:text-white mb-1">Gestión de tareas</h2>
          <p className="text-zinc-500 dark:text-zinc-400 text-sm">(Sincronizado con Google Sheets).</p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
            {/* Responsible Filter */}
            <div className="relative group">
                <select
                    value={responsibleFilter}
                    onChange={(e) => setResponsibleFilter(e.target.value)}
                    className="appearance-none pl-9 pr-8 py-2 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg text-sm font-medium text-zinc-700 dark:text-zinc-300 hover:border-zinc-300 dark:hover:border-zinc-700 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 cursor-pointer shadow-sm transition-all w-48 truncate"
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
                    className="appearance-none pl-9 pr-8 py-2 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg text-sm font-medium text-zinc-700 dark:text-zinc-300 hover:border-zinc-300 dark:hover:border-zinc-700 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 cursor-pointer shadow-sm transition-all w-48 truncate"
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

             {/* Date Filter */}
             <div className="relative group">
                <select
                    value={dateFilter}
                    onChange={(e) => setDateFilter(e.target.value)}
                    className="appearance-none pl-9 pr-8 py-2 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg text-sm font-medium text-zinc-700 dark:text-zinc-300 hover:border-zinc-300 dark:hover:border-zinc-700 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 cursor-pointer shadow-sm transition-all"
                >
                    {['Todas', 'Para Hoy', 'Esta semana'].map((d) => (
                        <option key={d} value={d}>{d}</option>
                    ))}
                </select>
                <Calendar className="w-4 h-4 text-zinc-400 absolute left-3 top-2.5 pointer-events-none" />
                <ChevronDown className="w-4 h-4 text-zinc-400 absolute right-3 top-2.5 pointer-events-none group-hover:text-zinc-600 dark:group-hover:text-zinc-200 transition-colors" />
            </div>
        </div>
      </div>

      {/* Kanban Board */}
      <DragDropContext onDragEnd={onDragEnd}>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 flex-1 min-h-[500px]">
              {columns.map((col) => {
                  const columnTasks = filteredTasks.filter(t => getColumnId(t.estado) === col.id);

                  return (
                    <div key={col.id} className="flex flex-col gap-4">
                        {/* Column Header */}
                        <div className="flex items-center justify-between px-1">
                            <div className="flex items-center gap-2">
                                <h3 className="font-semibold text-zinc-700 dark:text-zinc-200 text-sm">{col.title}</h3>
                                <span className="bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400 text-xs px-2 py-0.5 rounded-full font-medium">
                                    {columnTasks.length}
                                </span>
                            </div>
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
                                        <TaskCard key={String(task.id)} task={task} index={index} />
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
      </DragDropContext>
    </div>
  );
};

const TaskCard = ({ task, index }) => {
    const isOverdueTask = isOverdue(task.fecha_entrega);
    const clientColorClass = CLIENT_COLORS[task.cliente] || "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300";

    return (
        <Draggable draggableId={String(task.id)} index={index}>
            {(provided, snapshot) => (
                <div
                    ref={provided.innerRef}
                    {...provided.draggableProps}
                    {...provided.dragHandleProps}
                    className="mb-3"
                    // Important: Only pass style if provided.draggableProps.style exists
                    style={provided.draggableProps.style}
                >
                    <div
                        className={cn(
                            "rounded-xl border bg-card text-card-foreground shadow-sm",
                            // Removed motion/layout props or animations that interfere with DND positioning
                            "group cursor-pointer relative overflow-hidden bg-white/80 dark:bg-zinc-900/80 backdrop-blur-sm transition-shadow",
                            task.es_prioritaria ? "border-l-4 border-l-red-500" : "border-zinc-200 dark:border-zinc-800",
                            snapshot.isDragging && "shadow-xl ring-2 ring-indigo-500 z-50 opacity-90 rotate-2 scale-105"
                        )}
                    >
                        <div className="flex flex-col gap-3 p-4">
                                {/* Header: Client Badge */}
                                <div className="flex justify-between items-start">
                                     <span className={cn("text-[10px] uppercase tracking-wider font-bold px-2 py-1 rounded-md border", clientColorClass)}>
                                         {task.cliente}
                                     </span>
                                     {task.es_prioritaria && (
                                         <span className="text-[10px] font-bold text-red-500 flex items-center gap-1 bg-red-50 dark:bg-red-900/20 px-1.5 py-0.5 rounded border border-red-100 dark:border-red-900/30">
                                             Prioritario
                                         </span>
                                     )}
                                </div>

                                {/* Body: Task Title */}
                                <h4 className="font-bold text-sm text-zinc-800 dark:text-zinc-100 leading-snug">
                                    {task.pendiente}
                                </h4>

                                {/* Footer: Date & Avatar */}
                                <div className="flex items-center justify-between mt-1 pt-3 border-t border-zinc-100 dark:border-zinc-800/50">
                                    <div className={cn(
                                        "flex items-center gap-1.5 text-xs font-medium transition-colors",
                                        isOverdueTask ? "text-red-500" : "text-zinc-400 dark:text-zinc-500"
                                    )}>
                                        <Calendar className="w-3.5 h-3.5" />
                                        {task.fecha_entrega || "Sin fecha"}
                                    </div>

                                    <div className="flex items-center gap-2">
                                        {/* Initials fallback or name if no image? */}
                                         <img
                                            src={task.responsable}
                                            alt={task.responsable_name}
                                            className="w-6 h-6 rounded-full ring-2 ring-white dark:ring-zinc-900"
                                            title={task.responsable_name}
                                            onError={(e) => {
                                                e.target.style.display = 'none'; // Hide if fails
                                            }}
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

export default Tasks;
