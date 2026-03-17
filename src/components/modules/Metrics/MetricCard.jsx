import React from 'react';
import { Card } from '@/components/ui/Card';
import { ArrowUp, ArrowDown, Minus, Info } from 'lucide-react';

const MetricCard = ({ title, current, previous, icon: Icon, color }) => {
    const diff = current - previous;
    const percentage = previous > 0 ? ((diff / previous) * 100).toFixed(1) : 0;
    const isPositive = diff > 0;
    const isZero = diff === 0;

    return (
        <Card className="h-full flex flex-col justify-between hover:border-zinc-300 dark:hover:border-zinc-700 transition-colors group">
            <div className="flex justify-between items-start mb-4">
                <span className="text-sm font-medium text-zinc-500 group-hover:text-zinc-600 dark:text-zinc-500 dark:group-hover:text-zinc-400 transition-colors uppercase tracking-wider">
                    {title}
                </span>
                {previous > 0 && (
                    <div className={`flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-full border ${
                        isPositive ? 'bg-emerald-50 text-emerald-600 border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/20' :
                        isZero ? 'bg-zinc-50 text-zinc-600 border-zinc-200 dark:bg-zinc-500/10 dark:text-zinc-400 dark:border-zinc-500/20' :
                        'bg-red-50 text-red-600 border-red-200 dark:bg-red-500/10 dark:text-red-400 dark:border-red-500/20'
                    }`}>
                        {isPositive ? <ArrowUp className="w-3 h-3" /> : isZero ? <Minus className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />}
                        {Math.abs(percentage)}%
                    </div>
                )}
            </div>
            <div>
                <div className="flex items-end gap-2 mb-2">
                    <span className="text-4xl font-bold text-zinc-900 dark:text-white tracking-tight tabular-nums">
                        {current.toLocaleString()}
                    </span>
                </div>
                <p className="text-xs text-zinc-400 mt-2">
                    vs. {previous.toLocaleString()} mes anterior
                </p>
            </div>
        </Card>
    );
};

export default MetricCard;
