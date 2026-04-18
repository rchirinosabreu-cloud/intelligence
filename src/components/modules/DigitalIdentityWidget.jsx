import React from 'react';
import { Card } from '@/components/ui/Card';
import { Palette, Image, Type, BookOpen } from 'lucide-react';

const DigitalIdentityWidget = () => {
    const items = [
        { label: 'Logos', icon: Image },
        { label: 'Colores', icon: Palette },
        { label: 'Tipografías', icon: Type },
        { label: 'Manual', icon: BookOpen },
    ];

    return (
        <Card className="w-full flex flex-col h-full min-h-[300px] p-6">
            <div className="flex items-center gap-2 mb-6">
                <div className="p-1.5 bg-purple-500/10 rounded-xl">
                    <Palette className="w-4 h-4 text-purple-500" />
                </div>
                <h3 className="font-semibold text-zinc-900 dark:text-white">Identidad Digital</h3>
            </div>

            <div className="grid grid-cols-2 gap-4 flex-1">
                {items.map((item, idx) => (
                    <button
                        key={idx}
                        className="flex flex-col items-center justify-center p-4 rounded-xl border-2 border-dashed border-zinc-200 dark:border-zinc-800 hover:border-purple-500/50 hover:bg-purple-50 dark:hover:bg-purple-900/10 transition-all group"
                    >
                        <div className="p-3 bg-zinc-100 dark:bg-zinc-800 rounded-full mb-3 group-hover:scale-110 transition-transform text-zinc-500 dark:text-zinc-400 group-hover:text-purple-600 dark:group-hover:text-purple-400">
                            <item.icon className="w-5 h-5" />
                        </div>
                        <span className="text-xs font-medium text-zinc-600 dark:text-zinc-300 group-hover:text-purple-700 dark:group-hover:text-purple-300">
                            {item.label}
                        </span>
                    </button>
                ))}
            </div>
        </Card>
    );
};

export default DigitalIdentityWidget;
