import React, { useState, useMemo } from 'react';
import { useLocation, useSearchParams } from 'react-router-dom';
import { useNavigateFrom } from '@/components/layout/BackToOrigin';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';
import { getApiBaseUrl } from '@/lib/apiBaseUrl';
import { getContentPlanMonthName, planPeriodName, planPeriodRange } from '@/lib/contentPlanPeriod';
import {
  Plus, Search, MoreHorizontal, ChevronRight, ChevronDown, ChevronUp,
  Loader2, Trash2, Eye, FileSpreadsheet
} from '@/components/ui/icons';
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
import { useConfirmDialog } from '@/components/ui/ConfirmDialog';

// Todas las tarjetas de cliente arrancan cerradas y del mismo alto; un clic en la cabecera despliega sus
// parrillas (Rodny, 23 de noviembre de 2026: con tres filas a la vista las tarjetas quedaban disparejas).
const ROW = 'flex min-h-14 min-w-0 flex-1 items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-zinc-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-cyan/30 dark:hover:bg-white/5 sm:px-5';
const PLAN_STATUS = {
  PLANIFICACION: { label: 'Planificación', chip: 'bg-zinc-100 text-zinc-600 dark:bg-white/10 dark:text-zinc-300' },
  EN_APROBACION: { label: 'En aprobación', chip: 'bg-brand-yellow-soft text-brand-yellow-deep dark:bg-brand-yellow/15 dark:text-brand-yellow' },
  ACTIVO: { label: 'Activa', chip: 'bg-brand-cyan-soft text-brand-cyan-deep dark:bg-brand-cyan/15 dark:text-brand-cyan' },
  FINALIZADO: { label: 'Finalizada', chip: 'bg-brand-green-soft text-brand-green-deep dark:bg-brand-green/15 dark:text-brand-green' }
};

const ContentGrids = () => {
  const confirm = useConfirmDialog();
  const navigate = useNavigateFrom();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const { currentUser } = useAuth();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const searchTerm = searchParams.get('q') || '';
  const activeClientId = searchParams.get('client') || null;
  const updateView = (key, value) => {
    const next = new URLSearchParams(location.search);
    if ((next.get(key) || '') === (value || '')) return;
    if (value) next.set(key, value); else next.delete(key);
    setSearchParams(next, { replace: true, state: location.state });
  };
  const setActiveClientId = value => updateView('client', value);

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

  // Las parrillas de MIO que viven en hojas de Google (29 de octubre de 2026): aparecen solas en la carpeta de su cliente.
  const { data: externalPlans } = useQuery({
    queryKey: ['external-plans'],
    queryFn: async () => {
      const response = await axios.get(`${getApiBaseUrl()}/api/content/external-plans`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('authToken')}` }
      });
      return response.data;
    },
    staleTime: 60_000
  });

  const toggleClient = (clientId) => {
    setActiveClientId(activeClientId === clientId ? null : clientId);
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
      for (const key of ['content-plan', 'nativeTasks', 'dashboardMetrics', 'client-operations', 'drive']) queryClient.invalidateQueries({ queryKey: [key] });
    },
    onError: () => {
      toast.error('Error al eliminar la parrilla');
    }
  });

  // Master Grouping: Client -> Plans (Ordered by Year/Month DESC)
  const plansGroupedByClient = useMemo(() => {
    if (!plans && !externalPlans) return [];

    const grouped = (plans || []).reduce((acc, plan) => {
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

    (externalPlans || []).forEach((external) => {
      const clientId = external.client.id;
      if (!grouped[clientId]) grouped[clientId] = { id: clientId, client: external.client, plans: [] };
      grouped[clientId].external = external;
      // Con hoja de MIO, solo la hoja: un cliente de MIO no lleva parrillas nativas.
      grouped[clientId].plans = [];
    });

    // Sort plans within each client (Desc chronological)
    Object.values(grouped).forEach(clientGroup => {
      clientGroup.plans.sort((a, b) => {
        if (b.year !== a.year) return b.year - a.year;
        return b.month - a.month;
      });
    });

    // Sort clients by most recent activity (una hoja de MIO cuenta por su última lectura)
    const lastActivity = (group) => Math.max(
      group.plans[0] ? new Date(group.plans[0].updatedAt).getTime() : 0,
      ...(group.external?.months || []).map((month) => (month.readAt ? new Date(month.readAt).getTime() : 0))
    );
    return Object.values(grouped).sort((a, b) => lastActivity(b) - lastActivity(a));
  }, [plans, externalPlans]);

  const filteredClientGroups = useMemo(() => {
    if (!searchTerm) return plansGroupedByClient;
    const term = searchTerm.toLowerCase();

    return plansGroupedByClient.filter(group => {
      const clientName = group.client?.name?.toLowerCase() || '';
      const matchesClient = clientName.includes(term);
      const matchesPlan = group.plans.some(p =>
        getContentPlanMonthName(p.month).includes(term) || planPeriodName(p).includes(term) ||
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

  const handleDelete = async (id, clientName) => {
    const accepted = await confirm({
      title: 'Eliminar parrilla',
      description: `La parrilla de ${clientName} dejará de estar visible.`,
      confirmLabel: 'Eliminar'
    });
    if (accepted) deleteMutation.mutate(id);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Parrillas"
        subtitle="La parrilla de cada cliente, por período."
      >
        <Button size="lg" onClick={() => setIsModalOpen(true)} className="w-full sm:w-auto">
          <Plus className="w-4 h-4 mr-2" />
          Nueva parrilla
        </Button>
      </PageHeader>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative w-full flex-1">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
          <input
            type="search"
            aria-label="Buscar parrillas"
            placeholder="Buscar por cliente, mes o año"
            value={searchTerm}
            onChange={(e) => updateView('q', e.target.value)}
            className="h-11 w-full rounded-xl border border-zinc-200 bg-white pl-10 pr-4 text-sm text-zinc-900 outline-none transition-colors focus:border-brand-cyan focus:ring-2 focus:ring-brand-cyan/20 dark:border-white/10 dark:bg-zinc-900 dark:text-zinc-100"
          />
        </div>
        <p className="shrink-0 text-sm text-zinc-500 dark:text-zinc-400" data-grids-count>
          {filteredClientGroups.length} {filteredClientGroups.length === 1 ? 'cliente' : 'clientes'}
        </p>
      </div>

      {isLoading ? (
        <div className="flex flex-col items-center justify-center gap-3 p-16">
          <Loader2 className="h-8 w-8 animate-spin text-brand-cyan-deep dark:text-brand-cyan" />
          <p className="text-sm text-zinc-500">Cargando parrillas…</p>
        </div>
      ) : filteredClientGroups.length > 0 ? (
        <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-2 2xl:grid-cols-3">
          {filteredClientGroups.map((group) => {
            const rows = group.plans.length + (group.external?.months.length || 0);
            // Una búsqueda que deja un solo cliente lo abre: no hay nada más que mirar.
            const expanded = activeClientId === group.id || (Boolean(searchTerm) && filteredClientGroups.length === 1);
            const externalMonths = group.external?.months || [];
            const visiblePlans = expanded ? group.plans : [];
            const latest = group.plans[0];
            return (
              <section key={group.id} data-client-card={group.id} aria-label={`Parrillas de ${group.client?.name || 'cliente'}`}
                className="min-w-0 overflow-hidden rounded-2xl border border-zinc-200 bg-white dark:border-white/10 dark:bg-zinc-900">
                <button type="button" data-client-toggle={group.id} onClick={() => toggleClient(group.id)} aria-expanded={expanded}
                  className="flex min-h-[4.5rem] w-full items-center gap-3 px-4 py-3.5 text-left transition-colors hover:bg-zinc-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-cyan dark:hover:bg-white/5 sm:px-5">
                  <ClientAvatar client={group.client} size={40} className="shrink-0 rounded-xl" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-base font-bold leading-tight text-zinc-900 dark:text-white">{group.client?.name}</span>
                    <span className="mt-0.5 flex items-center gap-x-2 text-xs text-zinc-500 dark:text-zinc-400">
                      <span className="truncate">{rows} {rows === 1 ? 'parrilla' : 'parrillas'}{latest ? ` · última: ${planPeriodName(latest)}` : ''}</span>
                      {group.external && (
                        <span className="inline-flex shrink-0 items-center gap-1 rounded-md bg-brand-green-soft px-1.5 py-0.5 text-xs font-semibold text-brand-green-deep dark:bg-brand-green/15 dark:text-brand-green">
                          <FileSpreadsheet className="h-3 w-3" />Hoja de MIO
                        </span>
                      )}
                    </span>
                  </span>
                  {expanded ? <ChevronUp className="h-5 w-5 shrink-0 text-zinc-400" /> : <ChevronDown className="h-5 w-5 shrink-0 text-zinc-400" />}
                </button>

                {expanded && <ul className="divide-y divide-zinc-100 border-t border-zinc-100 dark:divide-white/5 dark:border-white/5">
                  {externalMonths.map((month) => (
                    <li key={`hoja-${month.slug}`} className="flex items-stretch">
                      <button type="button" data-external-month={month.slug}
                        onClick={() => navigate(`/parrillas/hoja/${group.client.slug}/${month.slug}`)}
                        className={ROW}>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-semibold first-letter:uppercase text-zinc-900 dark:text-zinc-100">{month.label} {month.year}</span>
                          <span className="mt-0.5 block truncate text-xs text-zinc-500 dark:text-zinc-400">
                            {month.problem && !month.created ? month.problem : `Hoja de MIO · ${month.created} ${month.created === 1 ? 'pieza' : 'piezas'}`}
                          </span>
                        </span>
                        {month.changes > 0 && (
                          <span className="shrink-0 rounded-md bg-brand-yellow-soft px-2 py-0.5 text-xs font-semibold text-brand-yellow-deep dark:bg-brand-yellow/15 dark:text-brand-yellow" data-external-changes>
                            {month.changes} {month.changes === 1 ? 'cambio' : 'cambios'}
                          </span>
                        )}
                        <ChevronRight className="h-4 w-4 shrink-0 text-zinc-300 dark:text-zinc-600" />
                      </button>
                    </li>
                  ))}
                  {visiblePlans.map((plan) => {
                    const pieces = plan._count?.items ?? null;
                    const status = PLAN_STATUS[plan.status] || PLAN_STATUS.PLANIFICACION;
                    return (
                      <li key={plan.id} className="flex items-stretch">
                        <button type="button" data-plan-row={plan.id} onClick={() => navigateToPlan(plan)} className={ROW}>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-semibold first-letter:uppercase text-zinc-900 dark:text-zinc-100">{planPeriodName(plan)}</span>
                            <span className="mt-0.5 block truncate text-xs text-zinc-500 dark:text-zinc-400">
                              {[planPeriodRange(plan), pieces === null ? null : `${pieces} ${pieces === 1 ? 'pieza' : 'piezas'}`].filter(Boolean).join(' · ')}
                            </span>
                          </span>
                          <span className={`shrink-0 rounded-md px-2 py-0.5 text-xs font-semibold ${status.chip}`}>{status.label}</span>
                          <ChevronRight className="h-4 w-4 shrink-0 text-zinc-300 dark:text-zinc-600" />
                        </button>
                        {isAdmin && (
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <button type="button" aria-label={`Más acciones de ${planPeriodName(plan)}`}
                                className="flex w-11 shrink-0 items-center justify-center border-l border-zinc-100 text-zinc-400 transition-colors hover:bg-zinc-50 hover:text-zinc-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-cyan/30 dark:border-white/5 dark:hover:bg-white/5 dark:hover:text-zinc-200">
                                <MoreHorizontal className="h-4 w-4" />
                              </button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-48">
                              <DropdownMenuItem onClick={() => navigateToPlan(plan)} className="flex items-center gap-2 cursor-pointer py-2 text-zinc-600 dark:text-zinc-300">
                                <Eye className="w-4 h-4" />
                                <span>Abrir parrilla</span>
                              </DropdownMenuItem>
                              <DropdownMenuSeparator className="bg-zinc-100 dark:bg-white/5" />
                              <DropdownMenuItem
                                onClick={() => handleDelete(plan.id, group.client?.name)}
                                className="flex cursor-pointer items-center gap-2 py-2 text-destructive focus:bg-destructive/10"
                              >
                                <Trash2 className="w-4 h-4" />
                                <span>Eliminar</span>
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        )}
                      </li>
                    );
                  })}
                </ul>}
              </section>
            );
          })}
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center gap-4 rounded-2xl border border-dashed border-zinc-300 bg-white p-10 text-center dark:border-white/15 dark:bg-zinc-900 sm:p-16">
          <div className="space-y-1.5 max-w-sm">
            <h3 className="text-lg font-bold text-zinc-900 dark:text-white">
              {searchTerm ? 'Sin coincidencias' : 'Todavía no hay parrillas'}
            </h3>
            <p className="text-zinc-500 dark:text-zinc-400 text-sm">
              {searchTerm
                ? `Ningún cliente o período coincide con «${searchTerm}».`
                : 'Crea la primera parrilla de un cliente para verla aquí.'
              }
            </p>
          </div>
          {!searchTerm && (
            <Button size="lg" onClick={() => setIsModalOpen(true)}>
              <Plus className="w-4 h-4 mr-2" />
              Nueva parrilla
            </Button>
          )}
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
