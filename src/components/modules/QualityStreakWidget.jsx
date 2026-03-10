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
        <Card className="bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 p-4 hover:border-zinc-300 dark:hover:border-zinc-700 transition-colors">
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                    <div className={cn(
                        "p-3 rounded-2xl transition-all duration-500",
                        streak > 0
                            ? "bg-orange-100 dark:bg-orange-500/10 text-orange-600 dark:text-orange-400 animate-pulse-subtle"
                            : "bg-zinc-100 dark:bg-zinc-800 text-zinc-400"
                    )}>
                        <Flame className={cn("w-6 h-6", streak > 0 && "fill-current")} />
                    </div>
                    <div>
                        <div className="flex items-baseline gap-2">
                            <span className="text-2xl font-bold text-zinc-900 dark:text-white">
                                {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : streak}
                            </span>
                            <span className="text-sm font-medium text-zinc-500 dark:text-zinc-400">
                                días sin devoluciones
                            </span>
                        </div>
                        <p className="text-xs text-zinc-400 dark:text-zinc-500 mt-0.5">
                            Racha de calidad actual
                        </p>
                    </div>
                </div>

                <div className="flex items-center gap-3 px-4 py-2 bg-zinc-50 dark:bg-zinc-800/50 rounded-xl border border-zinc-100 dark:border-zinc-800/50">
                    <Trophy className="w-4 h-4 text-amber-500" />
                    <div>
                        <p className="text-[10px] uppercase tracking-wider font-bold text-zinc-400 dark:text-zinc-500">
                            Récord
                        </p>
                        <p className="text-sm font-bold text-zinc-700 dark:text-zinc-300">
                            {historicalRecord} días
                        </p>
                    </div>
                </div>
            </div>
        </Card>
    );
};

export default QualityStreakWidget;
