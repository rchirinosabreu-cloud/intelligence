import React from 'react';
import { Card } from '@/components/ui/Card';
import { Download, CloudUpload, FileText, FileVideo } from 'lucide-react';

const DeliverablesWidget = () => {
    const files = [
        { name: 'Reporte_Q3_2025.pdf', size: '2.4 MB', date: 'Hace 2 días', type: 'pdf', icon: FileText, color: 'text-orange-500', bg: 'bg-orange-50' },
        { name: 'Campaña_Navidad_Final.mp4', size: '150 MB', date: 'Hace 5 días', type: 'video', icon: FileVideo, color: 'text-red-500', bg: 'bg-red-50' },
    ];

    return (
        <Card className="flex flex-col h-full min-h-[350px] p-6 space-y-6">
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <div className="p-1.5 bg-emerald-500/10 rounded-lg">
                        <Download className="w-4 h-4 text-emerald-500" />
                    </div>
                    <h3 className="font-semibold text-zinc-900 dark:text-white">Entregables</h3>
                </div>
                <span className="text-xs text-zinc-400 font-medium">2 Archivos</span>
            </div>

            {/* Dropzone */}
            <div className="border-2 border-dashed border-zinc-200 dark:border-zinc-800 rounded-xl p-8 flex flex-col items-center justify-center text-center hover:border-emerald-500/50 hover:bg-emerald-50/50 dark:hover:bg-emerald-900/10 transition-all cursor-pointer group">
                <div className="p-3 bg-zinc-100 dark:bg-zinc-800 rounded-full mb-3 group-hover:scale-110 transition-transform">
                    <CloudUpload className="w-6 h-6 text-zinc-400 group-hover:text-emerald-500 transition-colors" />
                </div>
                <p className="text-sm font-medium text-zinc-700 dark:text-zinc-200">Arrastra entregables finales</p>
                <p className="text-xs text-zinc-400 mt-1">o haz clic para explorar</p>
            </div>

            {/* File List */}
            <div className="space-y-3">
                {files.map((file, idx) => (
                    <div key={idx} className="flex items-center gap-3 p-3 rounded-xl bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-100 dark:border-zinc-800 hover:border-emerald-200 dark:hover:border-emerald-900/30 transition-colors group cursor-pointer">
                        <div className={`p-2.5 rounded-lg ${file.bg} dark:bg-zinc-800`}>
                            <file.icon className={`w-5 h-5 ${file.color}`} />
                        </div>
                        <div className="flex-1 min-w-0">
                            <h4 className="text-sm font-medium text-zinc-900 dark:text-white truncate group-hover:text-emerald-600 dark:group-hover:text-emerald-400 transition-colors">
                                {file.name}
                            </h4>
                            <div className="flex items-center gap-2 text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
                                <span>{file.size}</span>
                                <span className="w-1 h-1 rounded-full bg-zinc-300 dark:bg-zinc-600" />
                                <span>{file.date}</span>
                            </div>
                        </div>
                    </div>
                ))}
            </div>
        </Card>
    );
};

export default DeliverablesWidget;
