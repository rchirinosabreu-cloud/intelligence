import React from 'react';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { ExternalLink, Eye, MousePointer2 } from 'lucide-react';

const TopContentTable = ({ content }) => {
    if (!content || content.length === 0) {
        return (
            <Card className="p-8 text-center text-zinc-500 italic text-sm border-dashed">
                No hay datos de contenido reciente para mostrar.
            </Card>
        );
    }

    return (
        <Card className="overflow-hidden border-zinc-200 dark:border-zinc-800">
            <div className="overflow-x-auto">
                <table className="w-full text-left text-sm border-collapse">
                    <thead className="bg-zinc-50 dark:bg-zinc-900/50 text-zinc-500 uppercase text-[10px] font-bold tracking-widest border-b border-zinc-200 dark:border-zinc-800">
                        <tr>
                            <th className="px-6 py-4">Contenido</th>
                            <th className="px-6 py-4 text-center">Tipo</th>
                            <th className="px-6 py-4 text-right">Alcance</th>
                            <th className="px-6 py-4 text-right">Engagement</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800/50">
                        {content.map((item, idx) => (
                            <tr key={item.id || idx} className="hover:bg-zinc-50/50 dark:hover:bg-zinc-900/30 transition-colors">
                                <td className="px-6 py-4">
                                    <div className="flex flex-col gap-1 max-w-xs md:max-w-md">
                                        <span className="font-medium text-zinc-900 dark:text-zinc-100 line-clamp-2 leading-relaxed">
                                            {item.content}
                                        </span>
                                        <span className="text-[10px] text-zinc-400 flex items-center gap-1 uppercase">
                                            {item.platform === 'facebook' ? 'Facebook' : 'Instagram'} • {new Date(item.date).toLocaleDateString()}
                                        </span>
                                    </div>
                                </td>
                                <td className="px-6 py-4 text-center">
                                    <Badge variant="default" className="text-[10px]">
                                        {item.type}
                                    </Badge>
                                </td>
                                <td className="px-6 py-4 text-right font-mono font-medium text-zinc-700 dark:text-zinc-300">
                                    <div className="flex items-center justify-end gap-1.5">
                                        {item.reach.toLocaleString()}
                                        <Eye className="w-3 h-3 text-zinc-400" />
                                    </div>
                                </td>
                                <td className="px-6 py-4 text-right font-mono font-medium text-indigo-600 dark:text-indigo-400">
                                    <div className="flex items-center justify-end gap-1.5">
                                        {item.engagement.toLocaleString()}
                                        <MousePointer2 className="w-3 h-3" />
                                    </div>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </Card>
    );
};

export default TopContentTable;
