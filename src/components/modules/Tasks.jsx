import React, { useState } from 'react';
import { MOCK_DATA } from '@/data';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { motion, AnimatePresence } from 'framer-motion';
import { Filter, Calendar, MoreHorizontal, CheckCircle2, Clock, AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

const Tasks = () => {
  const [filter, setFilter] = useState('Todos');
  const tasks = MOCK_DATA.tasks;

  const filteredTasks = tasks.filter(task => {
    if (filter === 'Todos') return true;
    if (filter === 'Alta Prioridad') return task.priority === 'Alta';
    if (filter === 'En Proceso') return task.status === 'En Proceso';
    return true;
  });

  const getPriorityVariant = (priority) => {
    switch(priority) {
      case 'Alta': return 'danger';
      case 'Media': return 'warning';
      case 'Baja': return 'success';
      default: return 'default';
    }
  };

  const getStatusIcon = (status) => {
     switch(status) {
       case 'Completado': return <CheckCircle2 className="w-4 h-4 text-emerald-500" />;
       case 'En Proceso': return <Clock className="w-4 h-4 text-indigo-500" />;
       case 'Pendiente': return <AlertCircle className="w-4 h-4 text-zinc-500" />;
       default: return <Clock className="w-4 h-4 text-zinc-500" />;
     }
  };

  return (
    <div className="space-y-6">
      {/* Header & Filters */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-zinc-900 dark:text-white mb-1">Pendientes</h2>
          <p className="text-zinc-500 dark:text-zinc-400 text-sm">Gestión de tareas y entregables por cliente.</p>
        </div>

        <div className="flex items-center gap-2 bg-zinc-100 dark:bg-zinc-900/50 p-1 rounded-xl border border-zinc-200 dark:border-zinc-800">
          {['Todos', 'Alta Prioridad', 'En Proceso'].map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={cn(
                "px-3 py-1.5 text-xs font-medium rounded-lg transition-all",
                filter === f
                  ? 'bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white shadow-sm ring-1 ring-zinc-200 dark:ring-zinc-700'
                  : 'text-zinc-500 dark:text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-300 hover:bg-zinc-200/50 dark:hover:bg-zinc-800/50'
              )}
            >
              {f}
            </button>
          ))}
        </div>
      </div>

      {/* Task Grid */}
      <motion.div
        layout
        className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6"
      >
        <AnimatePresence mode='popLayout'>
          {filteredTasks.map((task) => (
            <motion.div
              layout
              key={task.id}
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              transition={{ duration: 0.2 }}
            >
              <Card className="h-full group hover:border-indigo-300 dark:hover:border-indigo-500/30 transition-all cursor-pointer relative overflow-hidden">
                <div className="absolute top-0 right-0 p-4 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button className="p-1 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded text-zinc-400 dark:text-zinc-500 hover:text-zinc-900 dark:hover:text-white transition-colors">
                    <MoreHorizontal className="w-4 h-4" />
                  </button>
                </div>

                <div className="flex flex-col h-full gap-4">
                  <div className="flex items-start justify-between">
                    <Badge variant="indigo" className="mb-2">{task.client}</Badge>
                  </div>

                  <h3 className="text-lg font-semibold text-zinc-900 dark:text-white leading-tight group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">
                    {task.task}
                  </h3>

                  <div className="mt-auto pt-4 border-t border-zinc-200 dark:border-zinc-800/50 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                       <img
                         src={task.avatar}
                         alt="Avatar"
                         className="w-6 h-6 rounded-full border border-zinc-200 dark:border-zinc-700"
                       />
                       <span className="text-xs text-zinc-500 dark:text-zinc-500 font-medium">Responsable</span>
                    </div>

                    <div className="flex items-center gap-2">
                      <Badge variant={getPriorityVariant(task.priority)}>{task.priority}</Badge>
                      <div className="w-px h-3 bg-zinc-200 dark:bg-zinc-800 mx-1" />
                      <div className="flex items-center gap-1 text-xs text-zinc-400" title={task.status}>
                        {getStatusIcon(task.status)}
                        {task.date}
                      </div>
                    </div>
                  </div>
                </div>
              </Card>
            </motion.div>
          ))}
        </AnimatePresence>
      </motion.div>
    </div>
  );
};

export default Tasks;
