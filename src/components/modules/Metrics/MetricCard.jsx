import React from 'react';
import { Card } from '@/components/ui/Card';
import { ArrowUp, ArrowDown, Minus, Info } from 'lucide-react';

const MetricCard = ({ title, current, previous, icon: Icon, color }) => {
    const diff = current - previous;
    const percentage = previous > 0 ? ((diff / previous) * 100).toFixed(1) : 0;
    const isPositive = diff > 0;
    const isZero = diff === 0;

    return (
        <Card className="p-4 md:p-6 hover:shadow-md transition-all border-l-4" style={{ borderLeftColor: color }}>
            <div className="flex justify-between items-start mb-4">
                <div className={`p-2 rounded-lg bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400`}>
                    <Icon className="w-5 h-5" />
                </div>
                {previous > 0 && (
                    <div className={`flex items-center gap-1 text-xs font-bold ${isPositive ? 'text-emerald-500' : isZero ? 'text-zinc-400' : 'text-red-500'}`}>
                        {isPositive ? <ArrowUp className="w-3 h-3" /> : isZero ? <Minus className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />}
                        {Math.abs(percentage)}%
                    </div>
                )}
            </div>
            <div>
                <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wider mb-1">{title}</p>
                <h3 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100 tabular-nums">
                    {current.toLocaleString()}
                </h3>
                <p className="text-[10px] text-zinc-400 mt-1">
                    vs. {previous.toLocaleString()} mes ant.
                </p>
            </div>
        </Card>
    );
};

export default MetricCard;
