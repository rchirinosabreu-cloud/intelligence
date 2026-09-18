import React from 'react';
import { Flame, Loader2 } from '@/components/ui/icons';
import { getApiBaseUrl } from '@/lib/apiBaseUrl';
import { useQuery } from '@tanstack/react-query';
import { cn } from '@/lib/utils';

const getAuthHeaders = () => {
    const token = localStorage.getItem('authToken');
    return token ? { Authorization: `Bearer ${token}` } : {};
};

/** Racha de calidad del equipo en el pie de la barra lateral, con la paleta oficial. */
const ChaosMeter = () => {
    const {
        data: streakData = { currentStreak: 0, maxStreak: 0, currentStreakDays: 0, currentReturnedTasksCount: 0 },
        isLoading
    } = useQuery({
        queryKey: ['quality-streak'],
        queryFn: async () => {
            const baseUrl = getApiBaseUrl();
            const response = await fetch(`${baseUrl}/api/metrics/quality-streak`, { cache: 'no-store', headers: getAuthHeaders() });
            if (!response.ok) throw new Error("Failed to fetch streak");
            return await response.json();
        },
        refetchInterval: 60000, // 1 minute
        staleTime: 30000,
    });

    if (isLoading) {
        return (
            <div className="brain-glass flex w-full items-center justify-center p-4">
                <Loader2 className="w-4 h-4 animate-spin text-zinc-400" />
            </div>
        );
    }

    const isChaosMode = streakData.currentReturnedTasksCount > 0;
    const currentStreak = streakData.currentStreak !== undefined ? streakData.currentStreak : streakData.currentStreakDays;
    const maxStreak = streakData.maxStreak !== undefined ? streakData.maxStreak : 0;

    if (isChaosMode) {
        return (
            <div className="brain-alert-surface w-full rounded-2xl p-4 transition-all duration-500" role="status">
                <div className="flex items-start gap-3">
                    <div className="rounded-xl bg-destructive p-2 text-destructive-foreground">
                        <Flame className="w-5 h-5 animate-pulse" />
                    </div>
                    <div className="flex flex-col">
                        <span className="text-lg font-bold leading-none tracking-tight text-destructive">
                            {streakData.currentReturnedTasksCount} {streakData.currentReturnedTasksCount === 1 ? 'tarea devuelta' : 'tareas devueltas'}
                        </span>
                        <span className="mt-1 text-[10px] font-semibold uppercase tracking-widest text-destructive/80">
                            Atención requerida
                        </span>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="brain-glass w-full p-4 transition-all duration-500" role="status">
            <div className="flex items-start gap-3">
                <div className={cn('brain-gradient-sunrise rounded-xl p-2 shadow-sm shadow-brand-coral/30')}>
                    <Flame className="w-5 h-5 text-white animate-pulse" />
                </div>
                <div className="flex flex-col">
                    <span className="text-lg font-bold leading-none tracking-tight text-zinc-900 dark:text-zinc-100">
                        {currentStreak} {currentStreak === 1 ? 'día' : 'días'} de racha
                    </span>
                    <span className="mt-1 text-[10px] font-semibold uppercase tracking-widest text-brand-yellow-deep dark:text-brand-yellow">
                        Récord histórico: {maxStreak}
                    </span>
                </div>
            </div>
        </div>
    );
};

export default ChaosMeter;
