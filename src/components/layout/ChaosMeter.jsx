import React from 'react';
import { Flame, Loader2 } from '@/components/ui/icons';
import { getApiBaseUrl } from '@/lib/apiBaseUrl';
import { useQuery } from '@tanstack/react-query';

const ChaosMeter = () => {
    const {
        data: streakData = { currentStreak: 0, maxStreak: 0, currentStreakDays: 0, currentReturnedTasksCount: 0 },
        isLoading
    } = useQuery({
        queryKey: ['quality-streak'],
        queryFn: async () => {
            const baseUrl = getApiBaseUrl();
            const response = await fetch(`${baseUrl}/api/metrics/quality-streak`, { cache: 'no-store' });
            if (!response.ok) throw new Error("Failed to fetch streak");
            return await response.json();
        },
        refetchInterval: 60000, // 1 minute
        staleTime: 30000,
    });

    if (isLoading) {
        return (
            <div className="w-full p-4 rounded-xl bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-100 dark:border-white/5 flex items-center justify-center">
                <Loader2 className="w-4 h-4 animate-spin text-zinc-400" />
            </div>
        );
    }

    const isChaosMode = streakData.currentReturnedTasksCount > 0;
    const currentStreak = streakData.currentStreak !== undefined ? streakData.currentStreak : streakData.currentStreakDays;
    const maxStreak = streakData.maxStreak !== undefined ? streakData.maxStreak : 0;

    if (isChaosMode) {
        return (
            <div className="w-full p-4 rounded-xl bg-gradient-to-br from-orange-400 to-red-500 shadow-lg shadow-red-500/20 border border-red-400/20 transition-all duration-500">
                <div className="flex items-start gap-3">
                    <div className="p-2 bg-white/20 rounded-xl backdrop-blur-sm">
                        <Flame className="w-5 h-5 text-red-500 fill-red-500 animate-pulse" />
                    </div>
                    <div className="flex flex-col">
                        <span className="text-lg font-black text-white leading-none tracking-tight">
                            {streakData.currentReturnedTasksCount} {streakData.currentReturnedTasksCount === 1 ? 'tarea devuelta' : 'tareas devueltas'}
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
                <div className="p-2 bg-amber-100 dark:bg-amber-500/10 rounded-xl">
                    <Flame className="w-5 h-5 text-orange-500 fill-orange-500 animate-pulse" />
                </div>
                <div className="flex flex-col">
                    <span className="text-lg font-black text-zinc-900 dark:text-zinc-100 leading-none tracking-tight">
                        {currentStreak} {currentStreak === 1 ? 'día' : 'días'} de racha
                    </span>
                    <span className="text-[10px] font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-widest mt-1">
                        RÉCORD HISTÓRICO: {maxStreak}
                    </span>
                </div>
            </div>
        </div>
    );
};

export default ChaosMeter;
