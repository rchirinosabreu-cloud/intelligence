import React, { useState, useEffect } from 'react';
import { Card } from '@/components/ui/Card';
import { Activity, ShieldCheck, ShieldAlert, ShieldX, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

const HealthCheckWidget = () => {
    const [clients, setClients] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    useEffect(() => {
        const fetchHealth = async () => {
            try {
                const baseUrl = (import.meta.env.VITE_API_URL || "https://api.brainstudioagencia.com").replace(/\/$/, '');
                const response = await fetch(`${baseUrl}/api/clients/health`);

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

    if (loading) {
        return (
             <Card className="p-4 bg-white/50 dark:bg-zinc-900/50 backdrop-blur-xl border-zinc-200/50 dark:border-zinc-800/50 h-full flex items-center justify-center">
                <Loader2 className="w-6 h-6 text-indigo-500 animate-spin" />
            </Card>
        );
    }

    if (error) {
         return (
             <Card className="p-4 bg-white/50 dark:bg-zinc-900/50 backdrop-blur-xl border-zinc-200/50 dark:border-zinc-800/50 h-full">
                <div className="flex items-center gap-2 mb-3">
                    <Activity className="w-5 h-5 text-zinc-400" />
                    <h3 className="font-semibold text-zinc-700 dark:text-zinc-200 text-sm">Salud de Clientes</h3>
                </div>
                <div className="text-xs text-red-500 bg-red-50 dark:bg-red-900/20 p-2 rounded">
                    No se pudo cargar el estado.
                </div>
            </Card>
         );
    }

    return (
        <Card className="p-4 bg-white/50 dark:bg-zinc-900/50 backdrop-blur-xl border-zinc-200/50 dark:border-zinc-800/50 h-full flex flex-col">
            <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                    <Activity className="w-5 h-5 text-indigo-500" />
                    <h3 className="font-semibold text-zinc-800 dark:text-zinc-100 text-sm">Salud de Clientes</h3>
                </div>
                <span className="text-[10px] text-zinc-400 font-medium px-2 py-0.5 bg-zinc-100 dark:bg-zinc-800 rounded-full">
                    En Tiempo Real
                </span>
            </div>

            <div className="flex-1 space-y-2 overflow-y-auto pr-1 custom-scrollbar">
                {clients.length === 0 ? (
                    <div className="text-center py-4 text-zinc-400 text-xs">
                        No hay datos disponibles.
                    </div>
                ) : (
                    clients.map((client, idx) => {
                        let statusColor = "text-zinc-500 bg-zinc-50 border-zinc-100 dark:bg-zinc-900/20 dark:border-zinc-800/30";
                        let Icon = ShieldCheck;
                        let statusLabel = "NEUTRO";

                        if (client.status === 'ok') {
                            statusColor = "text-emerald-500 bg-emerald-50 border-emerald-100 dark:bg-emerald-900/20 dark:border-emerald-800/30";
                            Icon = ShieldCheck;
                            statusLabel = "OK";
                        } else if (client.status === 'critical') {
                            statusColor = "text-red-600 bg-red-50 border-red-200 dark:bg-red-900/20 dark:border-red-800/30 animate-pulse";
                            Icon = ShieldX;
                            statusLabel = "CRÍTICO";
                        } else if (client.status === 'warning') {
                             statusColor = "text-amber-500 bg-amber-50 border-amber-100 dark:bg-amber-900/20 dark:border-amber-800/30";
                             Icon = ShieldAlert;
                             statusLabel = "RIESGO";
                        }

                        return (
                            <div
                                key={idx}
                                className={cn(
                                    "flex items-center justify-between p-2.5 rounded-lg border transition-all group",
                                    client.status === 'critical'
                                        ? "bg-red-50/50 border-red-100 dark:bg-red-900/10 dark:border-red-900/30"
                                        : "bg-transparent border-transparent hover:bg-white dark:hover:bg-zinc-800/50 hover:border-zinc-100 dark:hover:border-zinc-700/50"
                                )}
                            >
                                <span className={cn(
                                    "text-sm font-medium transition-colors truncate max-w-[60%]",
                                    client.status === 'critical' ? "text-red-700 dark:text-red-400 font-bold" : "text-zinc-600 dark:text-zinc-400 group-hover:text-zinc-900 dark:group-hover:text-zinc-200"
                                )}>
                                    {client.name}
                                </span>

                                <div className={cn(
                                    "flex items-center gap-1.5 px-2 py-1 rounded text-xs font-semibold border transition-colors flex-shrink-0",
                                    statusColor
                                )}>
                                    <Icon className="w-3.5 h-3.5" />
                                    <span className="uppercase tracking-wider text-[10px]">
                                        {statusLabel}
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
