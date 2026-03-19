import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import axios from 'axios';
import { getApiBaseUrl } from '@/lib/apiBaseUrl';
import { LayoutGrid, Plus, Calendar, Filter, Search, MoreHorizontal, ChevronRight, Loader2 } from 'lucide-react';
import { motion } from 'framer-motion';

const ContentGrids = () => {
  const navigate = useNavigate();
  const { data: plans, isLoading, error } = useQuery({
    queryKey: ['content-plans'],
    queryFn: async () => {
      const response = await axios.get(`${getApiBaseUrl()}/api/content/plans`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('authToken')}` }
      });
      return response.data;
    }
  });

  const getMonthName = (monthNumber) => {
    const date = new Date();
    date.setMonth(monthNumber - 1);
    return date.toLocaleString('es-ES', { month: 'long' });
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'PLANIFICACION': return 'bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400';
      case 'EN_APROBACION': return 'bg-amber-100 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400';
      case 'ACTIVO': return 'bg-indigo-100 text-indigo-600 dark:bg-indigo-900/30 dark:text-indigo-400';
      case 'FINALIZADO': return 'bg-emerald-100 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400';
      default: return 'bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400';
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      {/* Header Section */}
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-3xl font-bold tracking-tight text-zinc-900 dark:text-white">
            Parrillas de Contenido
          </h1>
          <p className="text-zinc-500 dark:text-zinc-400 text-sm">
            Gestiona y planifica la presencia digital de tus clientes.
          </p>
        </div>

        <button className="flex items-center justify-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl transition-all shadow-lg shadow-indigo-500/20 font-medium">
          <Plus className="w-4 h-4" />
          Nuevo Plan
        </button>
      </header>

      {/* Stats/Filters Bar */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="p-4 rounded-2xl bg-white/50 dark:bg-zinc-900/50 border border-zinc-200/50 dark:border-white/5 backdrop-blur-sm">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-indigo-100 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400">
              <Calendar className="w-5 h-5" />
            </div>
            <div>
              <p className="text-xs text-zinc-500 dark:text-zinc-400 uppercase font-bold tracking-wider">Total Planes</p>
              <p className="text-xl font-bold text-zinc-900 dark:text-white">{plans?.length || 0}</p>
            </div>
          </div>
        </div>

        {/* Search & Filter Mockup */}
        <div className="md:col-span-2 p-4 rounded-2xl bg-white/50 dark:bg-zinc-900/50 border border-zinc-200/50 dark:border-white/5 backdrop-blur-sm flex items-center gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
            <input
              type="text"
              placeholder="Buscar por cliente..."
              className="w-full pl-10 pr-4 py-2 bg-zinc-100 dark:bg-white/5 border-transparent focus:border-indigo-500/50 focus:ring-0 rounded-xl text-sm transition-all"
            />
          </div>
          <button className="p-2 rounded-xl bg-zinc-100 dark:bg-white/5 text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors">
            <Filter className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Content Section */}
      <div className="bg-white/50 dark:bg-zinc-900/50 border border-zinc-200/50 dark:border-white/5 backdrop-blur-md rounded-3xl overflow-hidden shadow-xl shadow-black/5">
        {isLoading ? (
          <div className="p-20 flex flex-col items-center justify-center gap-4">
            <Loader2 className="w-10 h-10 text-indigo-500 animate-spin" />
            <p className="text-zinc-500 animate-pulse">Cargando planes de contenido...</p>
          </div>
        ) : plans && plans.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-zinc-200/50 dark:border-white/5 bg-zinc-50/50 dark:bg-white/2">
                  <th className="px-6 py-4 text-xs font-bold text-zinc-500 uppercase tracking-widest">Cliente</th>
                  <th className="px-6 py-4 text-xs font-bold text-zinc-500 uppercase tracking-widest">Periodo</th>
                  <th className="px-6 py-4 text-xs font-bold text-zinc-500 uppercase tracking-widest">Estado</th>
                  <th className="px-6 py-4 text-xs font-bold text-zinc-500 uppercase tracking-widest text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-200/50 dark:divide-white/5">
                {plans.map((plan) => (
                  <tr
                    key={plan.id}
                    onClick={() => navigate(`/parrillas/${plan.id}`)}
                    className="group hover:bg-zinc-100/30 dark:hover:bg-white/2 transition-colors cursor-pointer"
                  >
                    <td className="px-6 py-5">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-indigo-500/10 flex items-center justify-center text-indigo-600 font-bold text-xs uppercase">
                          {plan.client?.name?.substring(0, 2)}
                        </div>
                        <span className="font-semibold text-zinc-900 dark:text-zinc-100">{plan.client?.name}</span>
                      </div>
                    </td>
                    <td className="px-6 py-5 capitalize text-zinc-600 dark:text-zinc-400">
                      {getMonthName(plan.month)} {plan.year}
                    </td>
                    <td className="px-6 py-5">
                      <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${getStatusColor(plan.status)}`}>
                        {plan.status.replace('_', ' ')}
                      </span>
                    </td>
                    <td className="px-6 py-5 text-right">
                      <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button className="p-2 hover:bg-zinc-200/50 dark:hover:bg-white/10 rounded-lg transition-colors text-zinc-500">
                          <MoreHorizontal className="w-4 h-4" />
                        </button>
                        <ChevronRight className="w-4 h-4 text-zinc-300 dark:text-zinc-600" />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="p-20 flex flex-col items-center justify-center gap-6 text-center">
            <div className="w-20 h-20 rounded-full bg-zinc-100 dark:bg-white/5 flex items-center justify-center">
              <LayoutGrid className="w-10 h-10 text-zinc-300 dark:text-zinc-600" />
            </div>
            <div className="space-y-2 max-w-sm">
              <h3 className="text-xl font-bold text-zinc-900 dark:text-white">No hay planes de contenido</h3>
              <p className="text-zinc-500 dark:text-zinc-400 text-sm">
                Inicia la migración creando tu primer plan para un cliente. Aquí aparecerán todos los grids de la agencia.
              </p>
            </div>
            <button className="flex items-center gap-2 px-6 py-3 bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 rounded-2xl hover:scale-105 transition-all font-bold">
              <Plus className="w-5 h-5" />
              Crear primer plan
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default ContentGrids;
