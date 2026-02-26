import React from 'react';
import { Card } from '@/components/ui/Card';
import { Flame, Maximize2 } from 'lucide-react';

const CampfireWidget = () => {
    return (
        <Card className="flex flex-col h-full min-h-[160px] relative p-6">
            <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                    <div className="p-1.5 bg-orange-500/10 rounded-lg">
                        <Flame className="w-4 h-4 text-orange-500" />
                    </div>
                    <h3 className="font-semibold text-zinc-900 dark:text-white">Campfire</h3>
                </div>
                <button className="text-zinc-400 hover:text-zinc-600 transition-colors">
                    <Maximize2 className="w-4 h-4" />
                </button>
            </div>

            <div className="flex-1 flex flex-col justify-between">
                <div>
                    <p className="text-sm text-zinc-600 dark:text-zinc-300">
                        <span className="font-bold text-zinc-900 dark:text-white">Jarlan:</span> Ojo con el logo en el slide...
                    </p>
                    <p className="text-xs text-zinc-400 mt-1">Hace un momento</p>
                </div>

                <div className="flex -space-x-2 mt-4">
                    <div className="w-7 h-7 rounded-full bg-blue-500 flex items-center justify-center text-[10px] font-bold text-white border-2 border-white dark:border-zinc-900">RQ</div>
                    <div className="w-7 h-7 rounded-full bg-pink-500 flex items-center justify-center text-[10px] font-bold text-white border-2 border-white dark:border-zinc-900">CI</div>
                    <div className="w-7 h-7 rounded-full bg-green-500 flex items-center justify-center text-[10px] font-bold text-white border-2 border-white dark:border-zinc-900">JA</div>
                </div>
            </div>
        </Card>
    );
};

export default CampfireWidget;
