import React, { useState, useEffect } from 'react';
import { Card } from '@/components/ui/Card';
import { Loader2, Activity, AlertTriangle, CheckCircle2, Wrench, FolderOpen, HelpCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

const HealthCheckWidget = () => {
    const [clients, setClients] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    useEffect(() => {
        const fetchHealth = async () => {
            try {
                // Use relative URL to leverage proxy or fallback to env var
                const baseUrl = (import.meta.env.VITE_API_URL || "https://api.brainstudioagencia.com").replace(/\/$/, '');
                // If running on same origin (dev/prod), relative path works best if proxy is set up,
                // but here we likely need the full URL if VITE_API_URL is defined.
                // Fallback logic in case VITE_API_URL is missing in dev:
                const url = `${baseUrl}/api/clients/health`;

                const response = await fetch(url);

                if (!response.ok) {
                    throw new Error(`Error ${response.status}: ${response.statusText}`);
                }

                const data = await response.json();
                setClients(data);
            } catch (err) {
                console.error("Failed to fetch client health:", err);
                setError(err.message);
            } finally {
                setLoading(false);
            }
        };

        fetchHealth();
        // Refresh periodically (e.g., every 5 minutes)
        const interval = setInterval(fetchHealth, 5 * 60 * 1000);
        return () => clearInterval(interval);
    }, []);

    const getStatusConfig = (status) => {
        switch (status) {
            case 'critical':
                return {
                    label: 'Crítico',
                    Icon: AlertTriangle,
                    // bg-red-100 text-red-800
                    badgeClass: 'bg-red-100 text-red-800 border-red-200 dark:bg-red-900/50 dark:text-red-200 dark:border-red-800',
                    rowClass: 'bg-red-50/30 hover:bg-red-50/50 dark:bg-red-900/10 dark:hover:bg-red-900/20'
                };
            case 'ok':
                return {
                    label: 'Al día',
                    Icon: CheckCircle2,
                    // bg-green-100 text-green-800
                    badgeClass: 'bg-green-100 text-green-800 border-green-200 dark:bg-green-900/50 dark:text-green-200 dark:border-green-800',
                    rowClass: 'hover:bg-zinc-50 dark:hover:bg-zinc-800/50'
                };
            case 'services':
                return {
                    label: 'Servicios',
                    Icon: Wrench,
                    // bg-yellow-100 text-yellow-800
                    badgeClass: 'bg-yellow-100 text-yellow-800 border-yellow-200 dark:bg-yellow-900/50 dark:text-yellow-200 dark:border-yellow-800',
                    rowClass: 'hover:bg-zinc-50 dark:hover:bg-zinc-800/50'
                };
            case 'no_grid':
                return {
                    label: 'Sin parrilla',
                    Icon: FolderOpen,
                    // bg-orange-100 text-orange-800
                    badgeClass: 'bg-orange-100 text-orange-800 border-orange-200 dark:bg-orange-900/50 dark:text-orange-200 dark:border-orange-800',
                    rowClass: 'hover:bg-zinc-50 dark:hover:bg-zinc-800/50'
                };
            default:
                return {
                    label: 'Neutro',
                    Icon: HelpCircle,
                    badgeClass: 'bg-zinc-100 text-zinc-600 border-zinc-200 dark:bg-zinc-800 dark:text-zinc-400 dark:border-zinc-700',
                    rowClass: 'hover:bg-zinc-50 dark:hover:bg-zinc-800/50'
                };
        }
    };

    if (loading) {
        return (
             <Card className="p-4 bg-white/50 dark:bg-zinc-900/50 backdrop-blur-xl border-zinc-200/50 dark:border-zinc-800/50 h-full flex items-center justify-center min-h-[200px]">
                <Loader2 className="w-6 h-6 text-indigo-500 animate-spin" />
            </Card>
        );
    }

    if (error) {
         return (
             <Card className="p-4 bg-white/50 dark:bg-zinc-900/50 backdrop-blur-xl border-zinc-200/50 dark:border-zinc-800/50 h-full min-h-[200px]">
                <div className="flex items-center gap-2 mb-3">
                    <Activity className="w-5 h-5 text-zinc-400" />
                    <h3 className="font-semibold text-zinc-700 dark:text-zinc-200 text-sm">Salud de Clientes</h3>
                </div>
                <div className="text-xs text-red-500 bg-red-50 dark:bg-red-900/20 p-2 rounded border border-red-100 dark:border-red-900/30">
                    No se pudo cargar el estado de los clientes.
                </div>
            </Card>
         );
    }

    return (
        <Card className="flex flex-col h-full bg-white/50 dark:bg-zinc-900/50 backdrop-blur-xl border-zinc-200/50 dark:border-zinc-800/50 shadow-sm">
            {/* Header */}
            <div className="p-4 border-b border-zinc-100 dark:border-zinc-800/50 flex items-center justify-between bg-white/40 dark:bg-zinc-900/40 rounded-t-xl">
                <div className="flex items-center gap-2">
                    <Activity className="w-5 h-5 text-indigo-500" />
                    <h3 className="font-semibold text-zinc-800 dark:text-zinc-100 text-sm">Salud de Clientes</h3>
                </div>
                <span className="text-[10px] text-zinc-500 font-medium px-2 py-0.5 bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-full">
                    {clients.length} Clientes
                </span>
            </div>

            {/* Content List with Scroll */}
            <div className="flex-1 overflow-y-auto max-h-[400px] p-2 space-y-1 custom-scrollbar">
                {clients.length === 0 ? (
                    <div className="text-center py-8 text-zinc-400 text-xs flex flex-col items-center gap-2">
                        <FolderOpen className="w-8 h-8 opacity-20" />
                        No hay datos disponibles.
                    </div>
                ) : (
                    clients.map((client, idx) => {
                        const config = getStatusConfig(client.status);
                        const Icon = config.Icon;

                        return (
                            <div
                                key={idx}
                                className={cn(
                                    "flex items-center justify-between p-2 rounded-lg border border-transparent transition-all",
                                    config.rowClass
                                )}
                            >
                                <span className={cn(
                                    "text-sm font-medium transition-colors truncate max-w-[55%]",
                                    client.status === 'critical' ? "text-red-700 dark:text-red-400 font-bold" : "text-zinc-700 dark:text-zinc-300"
                                )}>
                                    {client.name}
                                </span>

                                <div className={cn(
                                    "flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold border shadow-sm flex-shrink-0",
                                    config.badgeClass
                                )}>
                                    <Icon className="w-3.5 h-3.5" />
                                    <span className="leading-none pb-[1px]">
                                        {config.label}
                                    </span>
                                </div>
                            </div>
                        );
                    })
                )}
            </div>
        </Card>
    );
};

export default HealthCheckWidget;
