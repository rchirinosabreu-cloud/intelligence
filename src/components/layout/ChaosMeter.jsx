import React, { useState, useEffect } from 'react';
import { Flame, CheckCircle2, Leaf, Loader2 } from 'lucide-react';
import { getApiBaseUrl } from '@/lib/apiBaseUrl';
import { cn } from '@/lib/utils';

const ChaosMeter = () => {
    const [data, setData] = useState({ currentStreakDays: 0, currentReturnedTasksCount: 0 });
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchStreak = async () => {
            try {
                const baseUrl = getApiBaseUrl();
                const response = await fetch(`${baseUrl}/api/metrics/quality-streak`, { cache: 'no-store' });
                if (response.ok) {
                    const result = await response.json();
                    setData(result);
                }
            } catch (err) {
                console.error("Failed to fetch quality streak:", err);
            } finally {
                setLoading(false);
            }
        };

        fetchStreak();
        // Polling every 5 minutes
        const interval = setInterval(() => localStorage.getItem("authToken") && fetchStreak(), 300000);
        return () => clearInterval(interval);
    }, []);

    if (loading) {
        return (
            <div className="w-full p-4 rounded-xl bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-100 dark:border-white/5 flex items-center justify-center">
                <Loader2 className="w-4 h-4 animate-spin text-zinc-400" />
            </div>
        );
    }

    const isChaosMode = data.currentReturnedTasksCount > 0;
    const historicalRecord = 4;

    if (isChaosMode) {
        return (
            <div className="w-full p-4 rounded-xl bg-gradient-to-br from-orange-400 to-red-500 shadow-lg shadow-red-500/20 border border-red-400/20 transition-all duration-500">
                <div className="flex items-start gap-3">
                    <div className="p-2 bg-white/20 rounded-xl backdrop-blur-sm">
                        <Flame className="w-5 h-5 text-white animate-pulse fill-white" />
                    </div>
                    <div className="flex flex-col">
                        <span className="text-lg font-black text-white leading-none tracking-tight">
                            {data.currentReturnedTasksCount} {data.currentReturnedTasksCount === 1 ? 'tarea devuelta' : 'tareas devueltas'}
                        </span>
                        <span className="text-[10px] font-bold text-white/90 uppercase tracking-widest mt-1">
                            Atención requerida
                        </span>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="w-full p-4 rounded-xl bg-violet-50 dark:bg-zinc-800/80 border border-violet-100/50 dark:border-white/5 transition-all duration-500">
            <div className="flex items-start gap-3">
                <div className="p-2 bg-emerald-100 dark:bg-emerald-500/10 rounded-xl">
                    <Leaf className="w-5 h-5 text-emerald-600 dark:text-emerald-500" />
                </div>
                <div className="flex flex-col">
                    <span className="text-lg font-black text-zinc-900 dark:text-zinc-100 leading-none tracking-tight">
                        {data.currentStreakDays} {data.currentStreakDays === 1 ? 'día' : 'días'} de racha
                    </span>
                    <span className="text-[10px] font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-widest mt-1">
                        Récord histórico: {historicalRecord}
                    </span>
                </div>
            </div>
        </div>
    );
};

export default ChaosMeter;
