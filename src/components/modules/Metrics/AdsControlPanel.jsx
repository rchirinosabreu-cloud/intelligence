import React from 'react';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Target, DollarSign, TrendingUp, Zap, ArrowUpRight, ArrowDownRight } from 'lucide-react';

const AdsControlPanel = ({ data }) => {
    if (!data) return (
        <Card className="p-12 text-center text-zinc-400 border-dashed border-2">
            Configura una cuenta de Ads para ver el rendimiento de pauta.
        </Card>
    );

    const { current, previous } = data;

    const calculateDiff = (curr, prev) => {
        if (!prev) return 0;
        return (((curr - prev) / prev) * 100).toFixed(1);
    };

    const diffSpend = calculateDiff(current.spend, previous.spend);
    const diffResults = calculateDiff(current.results, previous.results);
    const isEfficient = current.efficiency <= (previous.efficiency || Infinity) && current.results > 0;

    return (
        <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                {/* Inversión */}
                <Card className="p-5 border-zinc-200 dark:border-zinc-800 shadow-none">
                    <div className="flex justify-between items-start mb-4">
                        <div className="p-2 rounded-lg bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                            <DollarSign className="w-5 h-5" />
                        </div>
                        <Badge variant="secondary" className="text-[10px]">
                            Últimos 30 días
                        </Badge>
                    </div>
                    <p className="text-[10px] uppercase tracking-wider text-zinc-500 mb-1">Inversión Total</p>
                    <h3 className="text-2xl font-bold mb-1 text-zinc-900 dark:text-zinc-100">${current.spend.toLocaleString()}</h3>
                    <div className="flex items-center gap-1 text-[10px]">
                        {parseFloat(diffSpend) > 0 ? (
                            <ArrowUpRight className="w-3 h-3 text-red-400" />
                        ) : (
                            <ArrowDownRight className="w-3 h-3 text-emerald-400" />
                        )}
                        <span className={parseFloat(diffSpend) > 0 ? 'text-red-400' : 'text-emerald-400'}>
                            {Math.abs(diffSpend)}% vs mes ant.
                        </span>
                    </div>
                </Card>

                {/* Resultados */}
                <Card className="p-5 border-zinc-200 dark:border-zinc-800 shadow-none">
                    <div className="flex justify-between items-start mb-4">
                        <div className="p-2 rounded-lg bg-indigo-50 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400">
                            <Target className="w-5 h-5" />
                        </div>
                    </div>
                    <p className="text-[10px] uppercase tracking-wider text-zinc-500 mb-1">Resultados (Conv.)</p>
                    <h3 className="text-2xl font-bold mb-1 text-zinc-900 dark:text-zinc-100">{current.results.toLocaleString()}</h3>
                    <div className="flex items-center gap-1 text-[10px]">
                        {parseFloat(diffResults) > 0 ? (
                            <ArrowUpRight className="w-3 h-3 text-emerald-500" />
                        ) : (
                            <ArrowDownRight className="w-3 h-3 text-red-500" />
                        )}
                        <span className={parseFloat(diffResults) > 0 ? 'text-emerald-500' : 'text-red-500'}>
                            {Math.abs(diffResults)}% vs mes ant.
                        </span>
                    </div>
                </Card>

                {/* CPA / Eficiencia */}
                <Card className="p-5 border-zinc-200 dark:border-zinc-800 shadow-none relative overflow-hidden group">
                    <div className="flex justify-between items-start mb-4">
                        <div className={`p-2 rounded-lg ${isEfficient ? 'bg-indigo-50 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400' : 'bg-amber-50 dark:bg-amber-500/10 text-amber-600 dark:text-amber-400'}`}>
                            <Zap className={`w-5 h-5 ${isEfficient ? 'animate-pulse' : ''}`} />
                        </div>
                        {isEfficient && (
                            <Badge className="bg-indigo-500/10 text-indigo-600 border-indigo-500/20 text-[9px] font-bold uppercase tracking-tighter animate-in fade-in zoom-in duration-300">
                                Eficiencia Alta
                            </Badge>
                        )}
                    </div>
                    <p className="text-[10px] uppercase tracking-wider text-zinc-500 mb-1">Costo por Resultado</p>
                    <h3 className="text-2xl font-bold mb-1 text-zinc-900 dark:text-zinc-100">${current.efficiency}</h3>
                    <p className="text-[10px] text-zinc-400 flex items-center gap-1">
                        {isEfficient ? 'CPA Optimizado' : 'Eficiencia de pauta'}
                    </p>
                    {isEfficient && (
                        <div className="absolute -right-4 -bottom-4 opacity-5 group-hover:opacity-10 transition-opacity">
                            <Zap className="w-20 h-20 text-indigo-500" />
                        </div>
                    )}
                </Card>

                {/* Alcance Ads */}
                <Card className="p-5 border-zinc-200 dark:border-zinc-800 shadow-none">
                    <div className="flex justify-between items-start mb-4">
                        <div className="p-2 rounded-lg bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                            <TrendingUp className="w-5 h-5" />
                        </div>
                    </div>
                    <p className="text-[10px] uppercase tracking-wider text-zinc-500 mb-1">Alcance Pagado</p>
                    <h3 className="text-2xl font-bold mb-1 text-zinc-900 dark:text-zinc-100">{current.reach.toLocaleString()}</h3>
                    <p className="text-[10px] text-zinc-400">Impacto total de anuncios</p>
                </Card>
            </div>
        </div>
    );
};

export default AdsControlPanel;
