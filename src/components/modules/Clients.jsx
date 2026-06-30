import React, { useState, useEffect, useMemo } from 'react';
import {
  Plus, Search, MoreVertical, Loader2, Edit,
  Archive, RotateCcw, ChevronDown, ChevronUp,
  Thermometer, User as UserIcon, MessageSquare
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import PageHeader from '@/components/ui/PageHeader';
import { Button } from '@/components/ui/button';
import * as Dialog from '@radix-ui/react-dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from '@/lib/utils';
import { getApiBaseUrl } from '@/lib/apiBaseUrl';
import { useNavigate } from 'react-router-dom';
import ClientAvatar from '@/components/ui/ClientAvatar';
import { toast } from 'react-hot-toast';
import { Badge } from '@/components/ui/Badge';

const Clients = () => {
  const navigate = useNavigate();
  const [clients, setClients] = useState([]);
  const [pms, setPms] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedPmId, setSelectedPmId] = useState('all');
  const [selectedTemperature, setSelectedTemperature] = useState('all'); // Verde, Amarillo, Rojo
  const [isArchivedExpanded, setIsArchivedExpanded] = useState(false);

  // Modal States
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [newClientName, setNewClientName] = useState('');
  const [newClientSlug, setNewClientSlug] = useState('');
  const [isManualSlugCreate, setIsManualSlugCreate] = useState(false);
  const [isCreating, setIsCreating] = useState(false);

  const fetchClients = async () => {
    try {
      setLoading(true);
      const baseUrl = getApiBaseUrl();
      const params = new URLSearchParams();
      if (selectedPmId !== 'all') params.append('responsibleId', selectedPmId);
      params.append('isArchived', 'false'); // Get active by default

      const res = await fetch(`${baseUrl}/api/clients?${params.toString()}`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('authToken')}` }
      });
      const activeData = await res.json();

      params.set('isArchived', 'true');
      const resArchived = await fetch(`${baseUrl}/api/clients?${params.toString()}`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('authToken')}` }
      });
      const archivedData = await resArchived.json();

      setClients([...activeData, ...archivedData]);
    } catch (err) {
      toast.error("Error al cargar clientes");
    } finally {
      setLoading(false);
    }
  };

  const fetchPms = async () => {
    try {
      const baseUrl = getApiBaseUrl();
      const res = await fetch(`${baseUrl}/api/team`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('authToken')}` }
      });
      const data = await res.json();
      // Filter PMs/Admins or just all active team members
      setPms(data.filter(m => m.isActive));
    } catch (err) {
      console.error("Error fetching PMs:", err);
    }
  };

  // Click Outside Behavior
  const gridRef = useRef(null);
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (gridRef.current && !gridRef.current.contains(event.target)) {
        setIsArchivedExpanded(false);
      }
    };
    document.addEventListener("click", handleClickOutside);
    return () => document.removeEventListener("click", handleClickOutside);
  }, []);

  useEffect(() => {
    fetchClients();
    fetchPms();
  }, [selectedPmId]);

  const handleArchiveToggle = async (client) => {
    try {
      const baseUrl = getApiBaseUrl();
      const res = await fetch(`${baseUrl}/api/clients/${client.id}/archive`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('authToken')}`
        },
        body: JSON.stringify({ isArchived: !client.isArchived }),
      });

      if (!res.ok) throw new Error();

      const updated = await res.json();
      setClients(prev => prev.map(c => c.id === updated.id ? { ...c, isArchived: updated.isArchived } : c));
      toast.success(updated.isArchived ? "Cliente archivado" : "Cliente reactivado");
    } catch (err) {
      toast.error("Error al procesar solicitud");
    }
  };

  const getScoreColor = (score) => {
    if (score >= 80) return 'bg-emerald-500';
    if (score >= 50) return 'bg-amber-500';
    return 'bg-red-500';
  };

  const activeClients = useMemo(() => {
    return clients
      .filter(c => !c.isArchived)
      .filter(c => c.name.toLowerCase().includes(searchQuery.toLowerCase()))
      .filter(c => {
        if (selectedTemperature === 'all') return true;
        const score = c.healthRecords?.[0]?.score || 0;
        if (selectedTemperature === 'sano') return score >= 80;
        if (selectedTemperature === 'alerta') return score >= 50 && score < 80;
        if (selectedTemperature === 'critico') return score < 50;
        return true;
      })
      .sort((a, b) => {
        const scoreA = a.healthRecords?.[0]?.score || 0;
        const scoreB = b.healthRecords?.[0]?.score || 0;
        return scoreA - scoreB; // Menor score arriba (fuego primero)
      });
  }, [clients, searchQuery, selectedTemperature]);

  const archivedClients = useMemo(() => {
    return clients.filter(c => c.isArchived);
  }, [clients]);

  return (
    <div className="space-y-6 pb-20 animate-in fade-in duration-500">
      <PageHeader
        title="Clientes"
        subtitle="Tablero de salud y gestión de espacios de trabajo."
      >
        <Button onClick={() => setIsModalOpen(true)} size="lg" className="shadow-lg shadow-indigo-500/20">
          <Plus className="w-4 h-4 mr-2" />
          Nuevo Cliente
        </Button>
      </PageHeader>

      {/* Filter Bar */}
      <div className="p-4 rounded-2xl bg-white/50 dark:bg-zinc-900/50 border border-zinc-200/50 dark:border-white/5 backdrop-blur-sm flex flex-col lg:flex-row items-center gap-4">
        {/* Search */}
        <div className="relative flex-1 w-full">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
          <input
            type="text"
            placeholder="Buscar por nombre de marca..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 bg-zinc-100 dark:bg-white/5 border-transparent focus:border-indigo-600/50 focus:ring-0 rounded-xl text-sm transition-all text-zinc-900 dark:text-zinc-100"
          />
        </div>

        <div className="flex flex-wrap items-center gap-3 w-full lg:w-auto">
          {/* PM Selector */}
          <div className="flex items-center gap-2 bg-zinc-100 dark:bg-white/5 p-1 rounded-xl border border-transparent focus-within:border-indigo-500/30 transition-all">
            <UserIcon className="w-4 h-4 ml-2 text-zinc-400" />
            <select
              value={selectedPmId}
              onChange={(e) => setSelectedPmId(e.target.value)}
              className="bg-transparent border-none focus:ring-0 text-sm py-1.5 pr-8 text-zinc-700 dark:text-zinc-300"
            >
              <option value="all">Todos los PMs</option>
              {pms.map(pm => (
                <option key={pm.id} value={pm.id}>{pm.name}</option>
              ))}
            </select>
          </div>

          {/* Temperature Filter */}
          <div className="flex items-center gap-2 bg-zinc-100 dark:bg-white/5 p-1 rounded-xl border border-transparent focus-within:border-indigo-500/30 transition-all">
            <Thermometer className="w-4 h-4 ml-2 text-zinc-400" />
            <select
              value={selectedTemperature}
              onChange={(e) => setSelectedTemperature(e.target.value)}
              className="bg-transparent border-none focus:ring-0 text-sm py-1.5 pr-8 text-zinc-700 dark:text-zinc-300"
            >
              <option value="all">Cualquier Temperatura</option>
              <option value="sano">Verde (Sano)</option>
              <option value="alerta">Amarillo (Alerta)</option>
              <option value="critico">Rojo (Crítico)</option>
            </select>
          </div>
        </div>
      </div>

      {/* Active Clients Table */}
      <div ref={gridRef} className="bg-white/50 dark:bg-zinc-900/50 border border-zinc-200/50 dark:border-white/5 backdrop-blur-md rounded-3xl overflow-hidden shadow-xl shadow-black/5">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-zinc-200/50 dark:border-white/5 bg-zinc-50/50 dark:bg-white/2">
                <th className="px-6 py-4 text-xs font-bold text-zinc-500 uppercase tracking-widest">Cliente</th>
                <th className="px-6 py-4 text-xs font-bold text-zinc-500 uppercase tracking-widest">Estado Salud</th>
                <th className="px-6 py-4 text-xs font-bold text-zinc-500 uppercase tracking-widest text-center">Responsable</th>
                <th className="px-6 py-4 text-xs font-bold text-zinc-500 uppercase tracking-widest">Último Comentario</th>
                <th className="px-6 py-4 text-xs font-bold text-zinc-500 uppercase tracking-widest text-right"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-200/50 dark:divide-white/5">
              {loading ? (
                <tr>
                  <td colSpan={5} className="p-20 text-center">
                    <Loader2 className="w-8 h-8 text-indigo-600 animate-spin mx-auto mb-4" />
                    <p className="text-zinc-500">Analizando métricas de salud...</p>
                  </td>
                </tr>
              ) : activeClients.length > 0 ? (
                <AnimatePresence mode="popLayout">
                  {activeClients.map((client) => {
                    const score = client.healthRecords?.[0]?.score || 0;
                    const lastComment = client.agencyContexts?.[0]?.content || "Sin observaciones recientes.";

                    return (
                      <motion.tr
                        layout
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0, x: -20 }}
                        key={client.id}
                        className="group hover:bg-zinc-100/30 dark:hover:bg-white/2 transition-colors cursor-pointer"
                        onClick={() => navigate(`/cliente/${client.slug}`)}
                      >
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-3">
                            <ClientAvatar client={client} size={32} className="rounded-lg border border-zinc-200 dark:border-white/10" />
                            <span className="font-bold text-zinc-900 dark:text-zinc-100 whitespace-nowrap">{client.name}</span>
                          </div>
                        </td>
                        <td className="px-6 py-4 min-w-[180px]">
                          <div className="flex items-center gap-3">
                            <div className="flex-1 h-1.5 rounded-full bg-zinc-200 dark:bg-zinc-800 overflow-hidden max-w-[100px]">
                              <motion.div
                                initial={{ width: 0 }}
                                animate={{ width: `${score}%` }}
                                className={cn("h-full", getScoreColor(score))}
                              />
                            </div>
                            <span className="text-sm font-bold text-zinc-700 dark:text-zinc-300">{score}</span>
                          </div>
                        </td>
                        <td className="px-6 py-4 text-center">
                          {client.responsible?.name ? (
                            <Badge variant="outline" className="bg-indigo-50/50 dark:bg-indigo-900/10 text-indigo-600 dark:text-indigo-400 border-indigo-200/50 dark:border-indigo-500/20">
                              {client.responsible.name}
                            </Badge>
                          ) : (
                            <span className="text-xs text-zinc-400">—</span>
                          )}
                        </td>
                        <td className="px-6 py-4 max-w-xs">
                          <div className="flex items-center gap-2 text-zinc-500 dark:text-zinc-400 text-sm">
                            <MessageSquare className="w-3.5 h-3.5 shrink-0 opacity-50" />
                            <p className="truncate italic">"{lastComment}"</p>
                          </div>
                        </td>
                        <td className="px-6 py-4 text-right" onClick={(e) => e.stopPropagation()}>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <button className="p-2 hover:bg-zinc-200/50 dark:hover:bg-white/10 rounded-xl transition-colors text-zinc-500 opacity-0 group-hover:opacity-100">
                                <MoreVertical className="w-4 h-4" />
                              </button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-48 bg-white dark:bg-zinc-900 border-zinc-200 dark:border-white/10 shadow-xl">
                              <DropdownMenuItem className="gap-2 py-2.5">
                                <Edit className="w-4 h-4" />
                                <span>Editar Cliente</span>
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={() => handleArchiveToggle(client)}
                                className="gap-2 py-2.5 text-amber-600 dark:text-amber-400"
                              >
                                <Archive className="w-4 h-4" />
                                <span>Archivar Cliente</span>
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </td>
                      </motion.tr>
                    );
                  })}
                </AnimatePresence>
              ) : (
                <tr>
                  <td colSpan={5} className="p-20 text-center text-zinc-500">
                    No se encontraron clientes activos con los filtros aplicados.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Archived Section */}
      <div className="mt-12 pt-6 border-t border-zinc-200 dark:border-white/5">
        <button
          onClick={() => setIsArchivedExpanded(!isArchivedExpanded)}
          className="flex items-center gap-2 text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors font-bold text-sm uppercase tracking-widest"
        >
          {isArchivedExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          Clientes Inactivos / Archivados ({archivedClients.length})
        </button>

        <AnimatePresence>
          {isArchivedExpanded && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="overflow-hidden mt-4"
            >
              <div className="bg-zinc-50/50 dark:bg-white/1 border border-zinc-200/50 dark:border-white/5 rounded-3xl overflow-hidden opacity-60 grayscale-[0.5]">
                <table className="w-full text-left border-collapse">
                  <tbody className="divide-y divide-zinc-200/50 dark:divide-white/5">
                    {archivedClients.map((client) => (
                      <tr key={client.id} className="hover:bg-zinc-100/50 dark:hover:bg-white/2 transition-colors">
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-3">
                            <ClientAvatar client={client} size={32} className="rounded-lg border border-zinc-200 dark:border-white/10" />
                            <span className="font-bold text-zinc-900 dark:text-zinc-100">{client.name}</span>
                          </div>
                        </td>
                        <td className="px-6 py-4 text-right">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="gap-2 text-indigo-600 dark:text-indigo-400"
                            onClick={() => handleArchiveToggle(client)}
                          >
                            <RotateCcw className="w-4 h-4" />
                            Reactivar
                          </Button>
                        </td>
                      </tr>
                    ))}
                    {archivedClients.length === 0 && (
                      <tr>
                        <td className="p-10 text-center text-zinc-400 text-sm">No hay clientes archivados.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Modals placeholders - to be implemented/refactored if needed */}
    </div>
  );
};

export default Clients;
