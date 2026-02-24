import React, { useState } from 'react';
import { Card } from '@/components/ui/Card';
import { Activity, ShieldCheck, ShieldAlert, ShieldX } from 'lucide-react';
import { cn } from '@/lib/utils';

const mockClients = [
    { name: "SunPartners", status: "ok" },
    { name: "TechFlow", status: "warning" },
    { name: "Urban Coffee", status: "ok" },
    { name: "Dr. Smile", status: "critical" },
    { name: "Velvet Hotel", status: "ok" },
    { name: "Muebles Nuva", status: "ok" },
];

const HealthCheckWidget = () => {
    return (
        <Card className="p-4 bg-white/50 dark:bg-zinc-900/50 backdrop-blur-xl border-zinc-200/50 dark:border-zinc-800/50 h-full flex flex-col">
            <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                    <Activity className="w-5 h-5 text-indigo-500" />
                    <h3 className="font-semibold text-zinc-800 dark:text-zinc-100 text-sm">Salud de Clientes</h3>
                </div>
                <span className="text-[10px] text-zinc-400 font-medium px-2 py-0.5 bg-zinc-100 dark:bg-zinc-800 rounded-full">
                    Estado Actual
                </span>
            </div>

            <div className="flex-1 space-y-2 overflow-y-auto pr-1 custom-scrollbar">
                {mockClients.map((client, idx) => {
                    let statusColor = "text-emerald-500 bg-emerald-50 border-emerald-100 dark:bg-emerald-900/20 dark:border-emerald-800/30";
                    let Icon = ShieldCheck;

                    if (client.status === 'warning') {
                        statusColor = "text-amber-500 bg-amber-50 border-amber-100 dark:bg-amber-900/20 dark:border-amber-800/30";
                        Icon = ShieldAlert;
                    } else if (client.status === 'critical') {
                        statusColor = "text-red-500 bg-red-50 border-red-100 dark:bg-red-900/20 dark:border-red-800/30";
                        Icon = ShieldX;
                    }

                    return (
                        <div
                            key={idx}
                            className="flex items-center justify-between p-2.5 rounded-lg border border-transparent hover:bg-white dark:hover:bg-zinc-800/50 hover:border-zinc-100 dark:hover:border-zinc-700/50 transition-all group"
                        >
                            <span className="text-sm font-medium text-zinc-600 dark:text-zinc-400 group-hover:text-zinc-900 dark:group-hover:text-zinc-200 transition-colors">
                                {client.name}
                            </span>

                            <div className={cn(
                                "flex items-center gap-1.5 px-2 py-1 rounded text-xs font-semibold border transition-colors",
                                statusColor
                            )}>
                                <Icon className="w-3.5 h-3.5" />
                                <span className="uppercase tracking-wider text-[10px]">
                                    {client.status === 'ok' ? 'Estable' : client.status === 'warning' ? 'Riesgo' : 'Crítico'}
                                </span>
                            </div>
                        </div>
                    );
                })}
            </div>
        </Card>
    );
};

export default HealthCheckWidget;
