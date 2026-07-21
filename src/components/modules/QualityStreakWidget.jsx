import React, { useState, useEffect } from 'react';
import { Card } from '@/components/ui/Card';
import { Flame, Trophy, Loader2 } from 'lucide-react';
import { getApiBaseUrl } from '@/lib/apiBaseUrl';
import { cn } from '@/lib/utils';

const QualityStreakWidget = () => {
    const [data, setData] = useState({ currentStreak: 0, maxStreak: 0, currentStreakDays: 0, currentReturnedTasksCount: 0 });
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
    }, []);

    const isAlertMode = data.currentReturnedTasksCount > 0;
    const currentStreak = data.currentStreak !== undefined ? data.currentStreak : data.currentStreakDays;
    const maxStreak = data.maxStreak !== undefined ? data.maxStreak : 0;

    return (
        <Card className="bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 py-4 px-6 hover:border-zinc-300 dark:hover:border-zinc-700 transition-colors shadow-sm overflow-hidden relative">
            {/* Background Decorative Element */}
            <div className="absolute -right-8 -top-8 w-32 h-32 bg-orange-500/5 rounded-full blur-3xl pointer-events-none" />

            <div className="flex items-center justify-between relative z-10">
                <div className="flex items-center gap-6">
                    {/* Glowing Flame Icon */}
                    <div className={cn(
                        "p-3 rounded-xl transition-all duration-700",
                        loading ? "bg-zinc-100 dark:bg-zinc-800" :
                        !isAlertMode
                            ? "bg-orange-50 dark:bg-orange-500/10"
                            : "bg-zinc-100 dark:bg-zinc-800"
                    )}>
                        {loading ? (
                            <Loader2 className="w-6 h-6 animate-spin text-zinc-400" />
                        ) : (
                            <Flame
                                className={cn(
                                    "w-8 h-8 transition-all duration-700",
                                    !isAlertMode
                                        ? "text-orange-500 fill-orange-500 drop-shadow-[0_0_12px_rgba(249,115,22,0.9)] animate-pulse"
                                        : "text-zinc-400"
                                )}
                            />
                        )}
                    </div>

                    {/* Protagonist: The Number */}
                    <div className="flex flex-col">
                        <div className="flex items-baseline gap-2">
                            <span className="text-4xl font-black tracking-tighter text-zinc-900 dark:text-white leading-none">
                                {loading ? '...' : (isAlertMode ? data.currentReturnedTasksCount : currentStreak)}
                            </span>
                            <span className="text-base font-bold text-zinc-900 dark:text-white leading-none">
                                {isAlertMode ? 'Aún tenemos tareas devueltas por corregir' : 'días sin devoluciones'}
                            </span>
                        </div>
                        <p className="text-[10px] font-semibold text-orange-600 dark:text-orange-400 mt-2 uppercase tracking-widest">
                            {isAlertMode ? 'Atención Requerida' : 'Racha de calidad actual'}
                        </p>
                    </div>
                </div>

                {/* Historical Record Badge */}
                <div className="flex items-center gap-3 px-4 py-2 bg-zinc-50 dark:bg-zinc-800/50 rounded-xl border border-zinc-100 dark:border-zinc-800/50 shadow-inner">
                    <div className="p-1.5 bg-amber-100 dark:bg-amber-500/10 rounded-xl">
                        <Trophy className="w-4 h-4 text-amber-600 dark:text-amber-500" />
                    </div>
                    <div>
                        <p className="text-[9px] uppercase tracking-widest font-black text-zinc-400 dark:text-zinc-500 leading-tight">
                            Récord
                        </p>
                        <p className="text-sm font-black text-zinc-900 dark:text-zinc-100 tracking-tight leading-tight">
                            {maxStreak} {maxStreak === 1 ? 'día' : 'días'}
                        </p>
                    </div>
                </div>
            </div>
        </Card>
    );
};

export default QualityStreakWidget;
