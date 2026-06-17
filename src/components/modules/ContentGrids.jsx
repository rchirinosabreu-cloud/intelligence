import React, { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';
import { getApiBaseUrl } from '@/lib/apiBaseUrl';
import { LayoutGrid, Plus, Calendar, Filter, Search, MoreHorizontal, ChevronRight, Loader2, Trash2, Eye, Table2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import PageHeader from '@/components/ui/PageHeader';
import ClientAvatar from '@/components/ui/ClientAvatar';
import { Button } from '@/components/ui/button';
import CreatePlanModal from './ContentGrids/CreatePlanModal';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator
} from "@/components/ui/dropdown-menu";
import { toast } from 'react-hot-toast';

const ContentGrids = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

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

  const deleteMutation = useMutation({
    mutationFn: async (id) => {
      await axios.delete(`${getApiBaseUrl()}/api/content/plans/${id}`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('authToken')}` }
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries(['content-plans']);
      toast.success('Parrilla eliminada correctamente');
    },
    onError: () => {
      toast.error('Error al eliminar la parrilla');
    }
  });

  const filteredPlans = useMemo(() => {
    if (!plans) return [];
    if (!searchTerm) return plans;

    const term = searchTerm.toLowerCase();
    return plans.filter(plan => {
      const clientName = plan.client?.name?.toLowerCase() || '';
      const monthName = getMonthName(plan.month).toLowerCase();
      const period = `${monthName} ${plan.year}`;
      return clientName.includes(term) || period.includes(term);
    });
  }, [plans, searchTerm]);

  const navigateToPlan = (plan) => {
    if (plan.client?.slug) {
      const months = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
      const monthName = months[plan.month - 1];
      navigate(`/parrillas/${plan.client.slug}/${monthName}-${plan.year}`);
    } else {
      navigate(`/parrillas/${plan.id}`);
    }
  };

  const handleDelete = (id, clientName) => {
    if (window.confirm(`¿Estás seguro de que deseas eliminar la parrilla de ${clientName}? Esta acción ocultará la parrilla y sus ítems.`)) {
      deleteMutation.mutate(id);
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <PageHeader
        title="Parrillas de Contenido"
        subtitle="Gestiona y planifica la presencia digital de tus clientes."

      >
        <Button
          size="lg"
          onClick={() => setIsModalOpen(true)}
          className="w-full sm:w-auto"
        >
          <Plus className="w-4 h-4 mr-2" />
          Nuevo Plan
        </Button>
      </PageHeader>

      {/* Stats/Filters Bar */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="p-4 rounded-2xl bg-white/50 dark:bg-zinc-900/50 border border-zinc-200/50 dark:border-white/5 backdrop-blur-sm">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-indigo-100 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400">
              <Calendar className="w-5 h-5" />
            </div>
            <div>
              <p className="text-xs text-zinc-500 dark:text-zinc-400 uppercase font-bold tracking-wider">Total Planes</p>
              <p className="text-xl font-bold text-zinc-900 dark:text-white">{plans?.length || 0}</p>
            </div>
          </div>
        </div>

        {/* Search & Filter */}
        <div className="md:col-span-2 p-4 rounded-2xl bg-white/50 dark:bg-zinc-900/50 border border-zinc-200/50 dark:border-white/5 backdrop-blur-sm flex items-center gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
            <input
              type="text"
              placeholder="Buscar por cliente, mes o año..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-zinc-100 dark:bg-white/5 border-transparent focus:border-indigo-600/50 focus:ring-0 rounded-xl text-sm transition-all text-zinc-900 dark:text-zinc-100"
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
            <Loader2 className="w-10 h-10 text-indigo-600 animate-spin" />
            <p className="text-zinc-500 animate-pulse">Cargando planes de contenido...</p>
          </div>
        ) : filteredPlans.length > 0 ? (
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
                <AnimatePresence mode="popLayout">
                  {filteredPlans.map((plan) => (
                    <motion.tr
                      layout
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      key={plan.id}
                      onClick={() => navigateToPlan(plan)}
                      className="group hover:bg-zinc-100/30 dark:hover:bg-white/2 transition-colors cursor-pointer"
                    >
                      <td className="px-6 py-5">
                        <div className="flex items-center gap-3">
                          <ClientAvatar client={plan.client} size={32} className="rounded-xl border border-zinc-200 dark:border-white/10" />
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
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                              <button className="p-2 hover:bg-zinc-200/50 dark:hover:bg-white/10 rounded-xl transition-colors text-zinc-500">
                                <MoreHorizontal className="w-4 h-4" />
                              </button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-48 bg-white dark:bg-zinc-900 border-zinc-200 dark:border-white/10 shadow-xl">
                              <DropdownMenuItem onClick={() => navigate(`/parrillas/${plan.id}`)} className="flex items-center gap-2 cursor-pointer py-2 text-zinc-600 dark:text-zinc-300">
                                <Eye className="w-4 h-4" />
                                <span>Ver Detalle</span>
                              </DropdownMenuItem>
                              {/*
                                Future: Add Edit metadata modal
                              <DropdownMenuItem onClick={(e) => { e.stopPropagation(); }} className="flex items-center gap-2 cursor-pointer py-2 text-zinc-600 dark:text-zinc-300">
                                <Edit className="w-4 h-4" />
                                <span>Editar</span>
                              </DropdownMenuItem>
                              */}
                              <DropdownMenuSeparator className="bg-zinc-100 dark:bg-white/5" />
                              <DropdownMenuItem
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleDelete(plan.id, plan.client?.name);
                                }}
                                className="flex items-center gap-2 cursor-pointer py-2 text-red-600 dark:text-red-400 focus:bg-red-50 dark:focus:bg-red-900/10"
                              >
                                <Trash2 className="w-4 h-4" />
                                <span>Eliminar</span>
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                          <ChevronRight className="w-4 h-4 text-zinc-300 dark:text-zinc-600" />
                        </div>
                      </td>
                    </motion.tr>
                  ))}
                </AnimatePresence>
              </tbody>
            </table>
          </div>
        ) : (
          <div className="p-20 flex flex-col items-center justify-center gap-6 text-center">
            <div className="w-20 h-20 rounded-full bg-zinc-100 dark:bg-white/5 flex items-center justify-center">
              <LayoutGrid className="w-10 h-10 text-zinc-300 dark:text-zinc-600" />
            </div>
            <div className="space-y-2 max-w-sm">
              <h3 className="text-xl font-bold text-zinc-900 dark:text-white">
                {searchTerm ? 'No se encontraron resultados' : 'No hay planes de contenido'}
              </h3>
              <p className="text-zinc-500 dark:text-zinc-400 text-sm">
                {searchTerm
                  ? `No pudimos encontrar parrillas que coincidan con "${searchTerm}".`
                  : 'Inicia la migración creando tu primer plan para un cliente. Aquí aparecerán todos los grids de la agencia.'
                }
              </p>
            </div>
            <Button
              size="lg"
              onClick={() => setIsModalOpen(true)}
            >
              <Plus className="w-5 h-5 mr-2" />
              Crear primer plan
            </Button>
          </div>
        )}
      </div>

      <CreatePlanModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
      />
    </div>
  );
};

export default ContentGrids;
