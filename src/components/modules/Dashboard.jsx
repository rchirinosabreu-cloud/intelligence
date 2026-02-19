import React from 'react';
import { MOCK_DATA } from '@/data';
import { Card } from '@/components/ui/Card';
import { motion } from 'framer-motion';
import { ArrowUpRight, ArrowDownRight, Zap, TrendingUp, Clock, Globe, Activity } from 'lucide-react';
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

const Dashboard = () => {
  const { welcome, metrics, news } = MOCK_DATA.dashboard;

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

        {/* News/Updates Column (Right - 1/3 width) */}
        <motion.div variants={item} className="md:col-span-1 h-full">
          <Card className="h-full">
            <div className="flex items-center gap-2 mb-6">
              <Globe className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
              <h3 className="text-lg font-semibold text-zinc-900 dark:text-white">Actualizaciones</h3>
            </div>
            <div className="space-y-6">
              {news.map((item) => (
                <div key={item.id} className="relative pl-6 border-l border-zinc-200 dark:border-zinc-800 pb-2 last:pb-0">
                  <div className="absolute -left-[5px] top-1.5 w-2.5 h-2.5 rounded-full bg-zinc-200 border border-zinc-300 dark:bg-zinc-800 dark:border-zinc-700 group-hover:bg-indigo-500 transition-colors" />
                  <div className="group cursor-pointer">
                    <span className="text-xs text-indigo-600 dark:text-indigo-400 mb-1 block font-medium">{item.category}</span>
                    <h4 className="text-zinc-700 hover:text-zinc-900 dark:text-zinc-200 text-sm font-medium mb-1 dark:group-hover:text-white transition-colors">{item.title}</h4>
                    <div className="flex items-center gap-1 text-xs text-zinc-400 dark:text-zinc-500">
                      <Clock className="w-3 h-3" />
                      {item.date}
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-8 pt-6 border-t border-zinc-200 dark:border-zinc-800">
               <button className="w-full py-2 text-xs font-medium text-zinc-600 border border-zinc-200 hover:bg-zinc-50 hover:text-zinc-900 dark:text-zinc-500 dark:hover:text-white transition-colors dark:border-zinc-800 rounded-lg dark:hover:bg-zinc-800">
                 Ver todas las notificaciones
               </button>
            </div>
          </Card>
        </motion.div>
      </div>
    </motion.div>
  );
};

export default Dashboard;
