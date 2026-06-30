import React, { useState, useMemo, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';
import { getApiBaseUrl } from '@/lib/apiBaseUrl';
import {
  Plus, Calendar, Filter, Search, MoreHorizontal,
  ChevronRight, ChevronDown, Loader2, Trash2, Eye,
  Folder, Grid, List, Clock
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import PageHeader from '@/components/ui/PageHeader';
import ClientAvatar from '@/components/ui/ClientAvatar';
import { Button } from '@/components/ui/button';
import CreatePlanModal from './ContentGrids/CreatePlanModal';
import { useAuth } from '@/context/AuthContext';
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
  const { currentUser } = useAuth();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [activeClientId, setActiveClientId] = useState(null);
  const gridRef = useRef(null);

  const isAdmin = currentUser?.role === 'ADMIN';

  const { data: plans, isLoading } = useQuery({
    queryKey: ['content-plans'],
    queryFn: async () => {
      const response = await axios.get(`${getApiBaseUrl()}/api/content/plans`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('authToken')}` }
      });
      return response.data;
    }
  });

  // Click Outside Behavior
  useEffect(() => {
    const handleClickOutside = (event) => {
      // Close if clicking outside the grid OR exactly on the grid container (between cards)
      if (gridRef.current && (!gridRef.current.contains(event.target) || event.target === gridRef.current)) {
        setActiveClientId(null);
      }
    };
    document.addEventListener("click", handleClickOutside);
    return () => document.removeEventListener("click", handleClickOutside);
  }, []);

  const getMonthName = (monthNumber) => {
    const date = new Date();
    date.setMonth(monthNumber - 1);
    return date.toLocaleString('es-ES', { month: 'long' });
  };

  const toggleClient = (clientId) => {
    setActiveClientId(prev => (prev === clientId ? null : clientId));
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

  // Master Grouping: Client -> Plans (Ordered by Year/Month DESC)
  const plansGroupedByClient = useMemo(() => {
    if (!plans) return {};

    const grouped = plans.reduce((acc, plan) => {
      const clientId = plan.clientId;
      if (!acc[clientId]) {
        acc[clientId] = {
          id: clientId,
          client: plan.client,
          plans: []
        };
      }
      acc[clientId].plans.push(plan);
      return acc;
    }, {});

    // Sort plans within each client (Desc chronological)
    Object.values(grouped).forEach(clientGroup => {
      clientGroup.plans.sort((a, b) => {
        if (b.year !== a.year) return b.year - a.year;
        return b.month - a.month;
      });
    });

    // Sort clients by most recent activity
    return Object.values(grouped).sort((a, b) => {
      const aDate = new Date(a.plans[0].updatedAt);
      const bDate = new Date(b.plans[0].updatedAt);
      return bDate - aDate;
    });
  }, [plans]);

  const filteredClientGroups = useMemo(() => {
    if (!searchTerm) return plansGroupedByClient;
    const term = searchTerm.toLowerCase();

    return plansGroupedByClient.filter(group => {
      const clientName = group.client?.name?.toLowerCase() || '';
      const matchesClient = clientName.includes(term);
      const matchesPlan = group.plans.some(p =>
        getMonthName(p.month).toLowerCase().includes(term) ||
        p.year.toString().includes(term)
      );
      return matchesClient || matchesPlan;
    });
  }, [plansGroupedByClient, searchTerm]);

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
    if (window.confirm(`¿Estás seguro de que deseas eliminar la parrilla de ${clientName}? Esta acción ocultará la parrilla.`)) {
      deleteMutation.mutate(id);
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <PageHeader
        title="Parrillas de Contenido"
        subtitle="Estructura jerárquica organizada por clientes."
      >
        <Button
          size="lg"
          onClick={() => setIsModalOpen(true)}
          className="w-full sm:w-auto shadow-lg shadow-indigo-500/20"
        >
          <Plus className="w-4 h-4 mr-2" />
          Nuevo Plan
        </Button>
      </PageHeader>

      {/* Control Bar */}
      <div className="p-4 rounded-2xl bg-white/50 dark:bg-zinc-900/50 border border-zinc-200/50 dark:border-white/5 backdrop-blur-sm flex flex-col md:flex-row items-center gap-4">
        <div className="relative flex-1 w-full">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
          <input
            type="text"
            placeholder="Buscar por cliente, mes o año..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 bg-zinc-100 dark:bg-white/5 border-transparent focus:border-indigo-600/50 focus:ring-0 rounded-xl text-sm transition-all text-zinc-900 dark:text-zinc-100"
          />
        </div>
        <div className="flex items-center gap-2 w-full md:w-auto">
          <div className="px-4 py-2 bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 dark:text-indigo-400 rounded-xl text-xs font-bold uppercase tracking-wider flex items-center gap-2 whitespace-nowrap">
            <Folder className="w-3 h-3" />
            {filteredClientGroups.length} Clientes
          </div>
        </div>
      </div>

      {/* Main Folder View */}
      {isLoading ? (
        <div className="p-20 flex flex-col items-center justify-center gap-4">
          <Loader2 className="w-10 h-10 text-indigo-600 animate-spin" />
          <p className="text-zinc-500 animate-pulse">Cargando carpetas de clientes...</p>
        </div>
      ) : filteredClientGroups.length > 0 ? (
        <div ref={gridRef} className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
          <AnimatePresence mode="popLayout">
            {filteredClientGroups.map((group) => (
              <motion.div
                key={group.id}
                layout
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="group flex flex-col h-fit"
              >
                {/* Client Card (Accordion Trigger) */}
                <div
                  onClick={() => toggleClient(group.id)}
                  className={`
                    p-5 rounded-2xl border transition-all cursor-pointer relative overflow-hidden
                    ${activeClientId === group.id
                      ? 'bg-white dark:bg-zinc-900 border-indigo-600/30 ring-1 ring-indigo-600/20 shadow-xl'
                      : 'bg-white/50 dark:bg-zinc-900/50 border-zinc-200/50 dark:border-white/5 hover:border-indigo-600/30 shadow-sm'}
                  `}
                >
                  <div className="flex items-center justify-between relative z-10">
                    <div className="flex items-center gap-4">
                      <ClientAvatar client={group.client} size={48} className="rounded-2xl border border-zinc-200 dark:border-white/10 shadow-sm" />
                      <div>
                        <h3 className="font-bold text-zinc-900 dark:text-white leading-tight">
                          {group.client?.name}
                        </h3>
                        <p className="text-xs text-zinc-500 flex items-center gap-1 mt-1 font-medium tracking-tight">
                          {group.plans.length} {group.plans.length === 1 ? 'Plan' : 'Planes'} • Actividad: {new Date(group.plans[0].updatedAt).toLocaleDateString()}
                        </p>
                      </div>
                    </div>
                    {activeClientId === group.id ? (
                      <ChevronDown className="w-5 h-5 text-indigo-600" />
                    ) : (
                      <ChevronRight className="w-5 h-5 text-zinc-400 group-hover:text-indigo-600 transition-colors" />
                    )}
                  </div>
                </div>

                {/* Expanded Plan List */}
                <AnimatePresence>
                  {activeClientId === group.id && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      className="overflow-hidden"
                    >
                      <div className="mt-2 space-y-2 px-3 pb-2 border-l-2 border-indigo-600/10 ml-6 pt-2">
                        {group.plans.map((plan) => (
                          <div
                            key={plan.id}
                            onClick={() => navigateToPlan(plan)}
                            className="flex items-center justify-between p-3 rounded-xl bg-zinc-50 dark:bg-white/2 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 border border-transparent hover:border-indigo-600/20 transition-all cursor-pointer group/item"
                          >
                            <div className="flex items-center gap-3">
                              <div className="p-2 rounded-lg bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-white/5 shadow-sm">
                                <Calendar className="w-3.5 h-3.5 text-indigo-600" />
                              </div>
                              <div className="flex flex-col">
                                <span className="text-sm font-bold text-zinc-900 dark:text-zinc-100 capitalize">
                                  {getMonthName(plan.month)} {plan.year}
                                </span>
                                <span className={`text-[9px] font-bold uppercase tracking-widest mt-0.5 ${
                                  plan.status === 'FINALIZADO' ? 'text-emerald-500' : 'text-zinc-400'
                                }`}>
                                  {plan.status.replace('_', ' ')}
                                </span>
                              </div>
                            </div>

                            <div className="flex items-center gap-2">
                              {isAdmin && (
                                <DropdownMenu>
                                  <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                                    <button className="p-1.5 opacity-0 group-hover/item:opacity-100 hover:bg-zinc-200 dark:hover:bg-white/10 rounded-lg transition-all text-zinc-500">
                                      <MoreHorizontal className="w-3.5 h-3.5" />
                                    </button>
                                  </DropdownMenuTrigger>
                                  <DropdownMenuContent align="end" className="w-48 bg-white dark:bg-zinc-900 border-zinc-200 dark:border-white/10 shadow-xl">
                                    <DropdownMenuItem onClick={() => navigateToPlan(plan)} className="flex items-center gap-2 cursor-pointer py-2 text-zinc-600 dark:text-zinc-300">
                                      <Eye className="w-4 h-4" />
                                      <span>Ver Plan</span>
                                    </DropdownMenuItem>
                                    <DropdownMenuSeparator className="bg-zinc-100 dark:bg-white/5" />
                                    <DropdownMenuItem
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleDelete(plan.id, group.client?.name);
                                      }}
                                      className="flex items-center gap-2 cursor-pointer py-2 text-red-600 dark:text-red-400 focus:bg-red-50 dark:focus:bg-red-900/10"
                                    >
                                      <Trash2 className="w-4 h-4" />
                                      <span>Eliminar</span>
                                    </DropdownMenuItem>
                                  </DropdownMenuContent>
                                </DropdownMenu>
                              )}
                              <ChevronRight className="w-4 h-4 text-zinc-300 dark:text-zinc-600" />
                            </div>
                          </div>
                        ))}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      ) : (
        <div className="p-20 flex flex-col items-center justify-center gap-6 text-center bg-white/50 dark:bg-zinc-900/50 border border-zinc-200/50 dark:border-white/5 backdrop-blur-md rounded-3xl overflow-hidden shadow-xl shadow-black/5">
          <div className="w-20 h-20 rounded-full bg-zinc-100 dark:bg-white/5 flex items-center justify-center">
            <Search className="w-10 h-10 text-zinc-300 dark:text-zinc-600" />
          </div>
          <div className="space-y-2 max-w-sm">
            <h3 className="text-xl font-bold text-zinc-900 dark:text-white">
              {searchTerm ? 'Sin coincidencias' : 'Comienza con tu primera parrilla'}
            </h3>
            <p className="text-zinc-500 dark:text-zinc-400 text-sm">
              {searchTerm
                ? `No pudimos encontrar carpetas o periodos que coincidan con "${searchTerm}".`
                : 'Organiza la estrategia de contenido por carpetas de clientes. Crea una nueva para verla aquí.'
              }
            </p>
          </div>
          <Button
            size="lg"
            onClick={() => setIsModalOpen(true)}
          >
            <Plus className="w-5 h-5 mr-2" />
            Crear primera carpeta
          </Button>
        </div>
      )}

      <CreatePlanModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
      />
    </div>
  );
};

export default ContentGrids;
