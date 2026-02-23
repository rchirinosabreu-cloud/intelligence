import React, { useState, useEffect } from 'react';
import { MOCK_DATA } from '@/data';
import { Card } from '@/components/ui/Card';
import { motion } from 'framer-motion';
import { ArrowUpRight, ArrowDownRight, Zap, TrendingUp, Clock, Globe, Activity, CheckCircle2 } from 'lucide-react';
import { cn } from '@/lib/utils';

const container = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: {
      staggerChildren: 0.1
    }
  }
};

const item = {
  hidden: { y: 20, opacity: 0 },
  show: { y: 0, opacity: 1 }
};

// Helper: Parse date string for sorting
// Tries to handle "D/M/YYYY, H:mm:ss" (es-CO locale) or ISO
const parseDate = (dateStr) => {
    if (!dateStr) return 0;
    try {
        // Try standard Date.parse first
        const timestamp = Date.parse(dateStr);
        if (!isNaN(timestamp)) return timestamp;

        // Try manual parsing for "DD/MM/YYYY" or "DD/MM/YYYY, HH:mm:ss"
        // Detect AM/PM
        const isPM = /p\.?\s*m\.?/i.test(dateStr);
        const isAM = /a\.?\s*m\.?/i.test(dateStr);

        // Remove "a. m." / "p. m." for parsing numbers
        const cleanStr = dateStr.replace(/[ap]\.?\s*m\.?/gi, '').trim();
        const parts = cleanStr.split(/[\s,\/:-]+/);

        // Expect at least [D, M, Y]
        if (parts.length >= 3) {
             const day = parseInt(parts[0], 10);
             const month = parseInt(parts[1], 10) - 1;
             const year = parseInt(parts[2], 10);
             let hour = parts.length > 3 ? parseInt(parts[3], 10) : 0;
             const min = parts.length > 4 ? parseInt(parts[4], 10) : 0;
             const sec = parts.length > 5 ? parseInt(parts[5], 10) : 0;

             // Handle 12-hour format adjustment
             if (isPM && hour < 12) hour += 12;
             if (isAM && hour === 12) hour = 0;

             // Check year validity (e.g. 2023 vs 23)
             const fullYear = year < 100 ? 2000 + year : year;

             return new Date(fullYear, month, day, hour, min, sec).getTime();
        }
    } catch (e) {
        return 0;
    }
    return 0;
};

const Dashboard = () => {
  const { welcome, metrics } = MOCK_DATA.dashboard;
  const [recentAchievements, setRecentAchievements] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchAchievements = async () => {
      try {
        const baseUrl = (import.meta.env.VITE_API_URL || "https://api.brainstudioagencia.com").replace(/\/$/, '');
        // Cache busting to ensure fresh data on mount/reload
        const response = await fetch(`${baseUrl}/api/pendientes?t=${new Date().getTime()}`);
        if (!response.ok) throw new Error('Failed to fetch');

        const tasks = await response.json();

        // Filter "Realizado" tasks and Sort by last_updated descending
        const completed = tasks
            .filter(t => t.estado === 'Realizado')
            .sort((a, b) => {
                const dateA = parseDate(a.last_updated || a.fecha_entrega);
                const dateB = parseDate(b.last_updated || b.fecha_entrega);
                return dateB - dateA; // Descending
            })
            .slice(0, 5); // Take top 5

        setRecentAchievements(completed);
      } catch (err) {
        console.error("Error fetching achievements:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchAchievements();
  }, []);

  return (
    <motion.div
      variants={container}
      initial="hidden"
      animate="show"
      className="space-y-6"
    >
      {/* Welcome Widget - Full Width */}
      <motion.div variants={item}>
        <Card className="bg-gradient-to-r from-white to-zinc-50 border-zinc-200/60 dark:from-zinc-900 dark:to-zinc-900/50 dark:border-zinc-800">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-2xl font-bold text-zinc-900 dark:text-white mb-2">{welcome}</h2>
              <p className="text-zinc-500 dark:text-zinc-400">Resumen de actividad diaria y métricas clave.</p>
            </div>
            <div className="p-3 bg-indigo-50 border border-indigo-100 rounded-full dark:bg-indigo-500/10 dark:border-indigo-500/20">
              <Zap className="w-6 h-6 text-indigo-600 dark:text-indigo-400" />
            </div>
          </div>
        </Card>
      </motion.div>

      {/* Bento Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">

        {/* Metrics Column (Left - 2/3 width) */}
        <div className="md:col-span-2 grid grid-cols-2 gap-6">
          {metrics.map((metric) => (
            <motion.div variants={item} key={metric.id}>
              <Card className="h-full flex flex-col justify-between hover:border-zinc-300 dark:hover:border-zinc-700 transition-colors group">
                <div className="flex justify-between items-start mb-4">
                  <span className="text-sm font-medium text-zinc-500 group-hover:text-zinc-600 dark:text-zinc-500 dark:group-hover:text-zinc-400 transition-colors">{metric.label}</span>
                  <div className={cn(
                    "flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-full border",
                    metric.trend === 'up'
                      ? 'bg-emerald-50 text-emerald-600 border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/20'
                      : 'bg-rose-50 text-rose-600 border-rose-200 dark:bg-rose-500/10 dark:text-rose-400 dark:border-rose-500/20'
                  )}>
                    {metric.trend === 'up' ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
                    {metric.change}
                  </div>
                </div>
                <div>
                  <span className="text-3xl font-bold text-zinc-900 dark:text-white tracking-tight">{metric.value}</span>
                </div>
              </Card>
            </motion.div>
          ))}

           {/* Chart Placeholder (Bottom of metrics) */}
           <motion.div variants={item} className="col-span-2">
            <Card className="h-64 flex items-center justify-center border-dashed border-zinc-300 bg-zinc-50/50 dark:border-zinc-800 dark:bg-zinc-900/20">
               <div className="text-center">
                 <Activity className="w-8 h-8 text-zinc-400 dark:text-zinc-700 mx-auto mb-2" />
                 <p className="text-zinc-500 dark:text-zinc-600 text-sm">Visualización de Datos (Próximamente)</p>
               </div>
            </Card>
           </motion.div>
        </div>

        {/* Logros Recientes (Renamed from Actualizaciones) */}
        <motion.div variants={item} className="md:col-span-1 h-full">
          <Card className="h-full">
            <div className="flex items-center gap-2 mb-6">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
              <h3 className="text-lg font-semibold text-zinc-900 dark:text-white">Logros Recientes</h3>
            </div>

            {loading ? (
                <div className="flex justify-center py-8">
                    <div className="w-6 h-6 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin"></div>
                </div>
            ) : recentAchievements.length === 0 ? (
                <div className="text-center py-8 text-zinc-400 text-sm">
                    No hay logros recientes.
                </div>
            ) : (
                <div className="space-y-6">
                  {recentAchievements.map((task) => (
                    <div key={task.id} className="relative pl-6 border-l border-zinc-200 dark:border-zinc-800 pb-2 last:pb-0">
                      <div className="absolute -left-[5px] top-1.5 w-2.5 h-2.5 rounded-full bg-emerald-200 border border-emerald-300 dark:bg-emerald-900 dark:border-emerald-700 group-hover:bg-emerald-500 transition-colors" />
                      <div className="group cursor-pointer">
                        <span className="text-xs text-emerald-600 dark:text-emerald-400 mb-1 block font-medium uppercase tracking-wider">{task.cliente}</span>
                        <h4 className="text-zinc-700 hover:text-zinc-900 dark:text-zinc-200 text-sm font-medium mb-1 dark:group-hover:text-white transition-colors line-clamp-2" title={task.pendiente}>
                            {task.pendiente}
                        </h4>
                        <div className="flex items-center gap-1 text-xs text-zinc-400 dark:text-zinc-500">
                          <Clock className="w-3 h-3" />
                          {task.last_updated || task.fecha_entrega || "Reciente"}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
            )}

            <div className="mt-8 pt-6 border-t border-zinc-200 dark:border-zinc-800">
               <button className="w-full py-2 text-xs font-medium text-zinc-600 border border-zinc-200 hover:bg-zinc-50 hover:text-zinc-900 dark:text-zinc-500 dark:hover:text-white transition-colors dark:border-zinc-800 rounded-lg dark:hover:bg-zinc-800">
                 Ver todas las tareas completadas
               </button>
            </div>
          </Card>
        </motion.div>
      </div>
    </motion.div>
  );
};

export default Dashboard;
