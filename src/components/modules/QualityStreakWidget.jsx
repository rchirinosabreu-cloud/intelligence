import React, { useState, useEffect } from 'react';
import { Card } from '@/components/ui/Card';
import { Flame, Trophy, Loader2 } from 'lucide-react';
import { getApiBaseUrl } from '@/lib/apiBaseUrl';
import { cn } from '@/lib/utils';

const QualityStreakWidget = () => {
    const [streak, setStreak] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchStreak = async () => {
            try {
                const baseUrl = getApiBaseUrl();
                const response = await fetch(`${baseUrl}/api/metrics/quality-streak`, { cache: 'no-store' });
                if (response.ok) {
                    const data = await response.json();
                    setStreak(data.currentStreakDays);
                }
            } catch (err) {
                console.error("Failed to fetch quality streak:", err);
            } finally {
                setLoading(false);
            }
        };

        fetchStreak();
    }, []);

    const historicalRecord = 15; // Hardcoded as requested

    return (
        <Card className="bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 p-6 hover:border-zinc-300 dark:hover:border-zinc-700 transition-colors shadow-sm overflow-hidden relative">
            {/* Background Decorative Element */}
            <div className="absolute -right-8 -top-8 w-32 h-32 bg-orange-500/5 rounded-full blur-3xl pointer-events-none" />

            <div className="flex items-center justify-between relative z-10">
                <div className="flex items-center gap-6">
                    {/* Glowing Flame Icon */}
                    <div className={cn(
                        "p-4 rounded-2xl transition-all duration-700",
                        loading ? "bg-zinc-100 dark:bg-zinc-800" :
                        streak > 0
                            ? "bg-orange-50 dark:bg-orange-500/10"
                            : "bg-zinc-100 dark:bg-zinc-800"
                    )}>
                        {loading ? (
                            <Loader2 className="w-8 h-8 animate-spin text-zinc-400" />
                        ) : (
                            <Flame
                                className={cn(
                                    "w-10 h-10 transition-all duration-700",
                                    streak > 0
                                        ? "text-orange-500 fill-orange-500 drop-shadow-[0_0_12px_rgba(249,115,22,0.9)] animate-pulse"
                                        : "text-zinc-400"
                                )}
                            />
                        )}
                    </div>

                    {/* Protagonist: The Number */}
                    <div className="flex flex-col">
                        <div className="flex items-baseline gap-3">
                            <span className="text-6xl font-black tracking-tighter text-zinc-900 dark:text-white leading-none">
                                {loading ? '...' : streak ?? 0}
                            </span>
                            <div className="flex flex-col">
                                <span className="text-xl font-bold text-zinc-900 dark:text-white leading-tight">
                                    días
                                </span>
                                <span className="text-sm font-medium text-zinc-500 dark:text-zinc-400">
                                    sin devoluciones
                                </span>
                            </div>
                        </div>
                        <p className="text-xs font-semibold text-orange-600 dark:text-orange-400 mt-2 uppercase tracking-widest">
                            Racha de calidad actual
                        </p>
                    </div>
                </div>

                {/* Historical Record Badge */}
                <div className="flex items-center gap-4 px-5 py-3 bg-zinc-50 dark:bg-zinc-800/50 rounded-2xl border border-zinc-100 dark:border-zinc-800/50 shadow-inner">
                    <div className="p-2 bg-amber-100 dark:bg-amber-500/10 rounded-lg">
                        <Trophy className="w-5 h-5 text-amber-600 dark:text-amber-500" />
                    </div>
                    <div>
                        <p className="text-[10px] uppercase tracking-widest font-black text-zinc-400 dark:text-zinc-500">
                            Récord
                        </p>
                        <p className="text-lg font-black text-zinc-900 dark:text-zinc-100 tracking-tight">
                            {historicalRecord} días
                        </p>
                    </div>
                </div>
            </div>
        </Card>
    );
};

export default QualityStreakWidget;
