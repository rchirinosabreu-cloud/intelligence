import React, { useState, useMemo } from 'react';
import { MOCK_DATA } from '@/data';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { motion, AnimatePresence } from 'framer-motion';
import { Filter, Calendar, MoreHorizontal, CheckCircle2, Clock, AlertCircle, ChevronDown, User } from 'lucide-react';
import { cn } from '@/lib/utils';

// Helper to check if date is today or past
// Assumes format "DD/MM" and current year
const isOverdue = (dateStr) => {
    if (!dateStr) return false;
    const [day, month] = dateStr.split('/').map(Number);
    const now = new Date();
    const taskDate = new Date(now.getFullYear(), month - 1, day);
    // Reset time for comparison
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    return taskDate <= today;
};

// Helper for date filtering
const isToday = (dateStr) => {
    if (!dateStr) return false;
    const [day, month] = dateStr.split('/').map(Number);
    const now = new Date();
    return day === now.getDate() && (month - 1) === now.getMonth();
};

// Helper for "This Week" (next 7 days)
const isThisWeek = (dateStr) => {
    if (!dateStr) return false;
    const [day, month] = dateStr.split('/').map(Number);
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const taskDate = new Date(now.getFullYear(), month - 1, day);
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

  const tasks = MOCK_DATA.tasks || [];

  // Extract unique responsibles (URLs)
  const responsibles = useMemo(() => {
      const unique = [...new Set(tasks.map(t => t.responsable))];
      return ['Todos', ...unique];
  }, [tasks]);

  const filteredTasks = tasks.filter(task => {
    // Filter by Responsible
    if (responsibleFilter !== 'Todos' && task.responsable !== responsibleFilter) return false;

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
      { id: 'Pendiente', title: 'Por Hacer', color: 'bg-zinc-100 dark:bg-zinc-800/50' },
      { id: 'En Proceso', title: 'En Proceso', color: 'bg-blue-50/50 dark:bg-blue-900/10' },
      { id: 'Realizado', title: 'Finalizado', color: 'bg-emerald-50/50 dark:bg-emerald-900/10' }
  ];

  return (
    <div className="space-y-6 h-full flex flex-col">
      {/* Header & Filters */}
      <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-zinc-900 dark:text-white mb-1">Pendientes</h2>
          <p className="text-zinc-500 dark:text-zinc-400 text-sm">Gestión de tareas visual (Kanban).</p>
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
                            {r === 'Todos' ? 'Todos los responsables' : `Responsable ${i}`}
                        </option>
                    ))}
                </select>
                <User className="w-4 h-4 text-zinc-400 absolute left-3 top-2.5 pointer-events-none" />
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
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 flex-1 min-h-[500px]">
          {columns.map((col) => {
              const columnTasks = filteredTasks.filter(t => t.estado === col.id);

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
                    <div className={cn("flex-1 rounded-xl p-2 transition-colors", col.color, "bg-opacity-50 dark:bg-opacity-20 border border-transparent hover:border-zinc-200/50 dark:hover:border-zinc-700/50")}>
                        <div className="space-y-3">
                             <AnimatePresence mode='popLayout'>
                                {columnTasks.map((task) => (
                                    <TaskCard key={task.id} task={task} />
                                ))}
                             </AnimatePresence>
                             {columnTasks.length === 0 && (
                                 <div className="h-24 flex items-center justify-center text-zinc-400 dark:text-zinc-600 text-sm border-2 border-dashed border-zinc-200 dark:border-zinc-800 rounded-lg">
                                     Sin tareas
                                 </div>
                             )}
                        </div>
                    </div>
                </div>
              );
          })}
      </div>
    </div>
  );
};

const TaskCard = ({ task }) => {
    const isOverdueTask = isOverdue(task.fecha_entrega);
    const clientColorClass = CLIENT_COLORS[task.cliente] || "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300";

    return (
        <motion.div
            layout
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ duration: 0.2 }}
        >
            <Card className={cn(
                "group hover:border-indigo-300 dark:hover:border-indigo-500/30 transition-all cursor-pointer relative overflow-hidden bg-white/80 dark:bg-zinc-900/80 backdrop-blur-sm",
                task.es_prioritaria ? "border-l-4 border-l-red-500" : ""
            )}>
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
                            {task.fecha_entrega}
                        </div>

                        <div className="flex items-center">
                             <img
                                src={task.responsable}
                                alt="Responsable"
                                className="w-6 h-6 rounded-full ring-2 ring-white dark:ring-zinc-900"
                                title="Responsable"
                             />
                        </div>
                    </div>
                </div>
            </Card>
        </motion.div>
    );
};

export default Tasks;
