import React from 'react';
import { MOCK_DATA } from '@/data';
import { Card } from '@/components/ui/Card';
import { FileText, FileSpreadsheet, FileArchive, Folder, Image, MoreVertical, Presentation, File as FileIcon } from '@/components/ui/icons';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';

const Files = () => {
  const files = MOCK_DATA.files || [];

  const getFileIcon = (type) => {
    switch (type) {
      case 'pdf': return <FileText className="w-8 h-8 md:w-10 md:h-10 text-rose-500/80" />;
      case 'xls': return <FileSpreadsheet className="w-8 h-8 md:w-10 md:h-10 text-emerald-500/80" />;
      case 'ppt': return <Presentation className="w-8 h-8 md:w-10 md:h-10 text-orange-500/80" />;
      case 'zip': return <FileArchive className="w-8 h-8 md:w-10 md:h-10 text-amber-500/80" />;
      case 'folder': return <Folder className="w-8 h-8 md:w-10 md:h-10 text-indigo-600/80 fill-indigo-600/20" />;
      case 'img': return <Image className="w-8 h-8 md:w-10 md:h-10 text-purple-500/80" />;
      case 'doc': return <FileText className="w-8 h-8 md:w-10 md:h-10 text-blue-500/80" />;
      default: return <FileIcon className="w-8 h-8 md:w-10 md:h-10 text-zinc-400 dark:text-zinc-500/80" />;
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between mb-8">
         <div>
            <h2 className="text-2xl font-bold text-zinc-900 dark:text-white mb-1 transition-colors">Archivos</h2>
            <p className="text-zinc-500 dark:text-zinc-400 text-sm transition-colors">Base de conocimiento y entregables.</p>
         </div>
         <button className="px-4 py-2 bg-indigo-600 hover:bg-indigo-600 text-white rounded-xl font-medium transition-colors shadow-lg shadow-indigo-600/20 text-sm">
            Subir Archivo
         </button>
      </div>

      <motion.div
        layout
        className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6"
      >
        {files?.map((file) => (
          <motion.div
            key={file.id}
            whileHover={{ y: -5 }}
            transition={{ type: "spring", stiffness: 300 }}
          >
            <Card className="group h-48 flex flex-col items-center justify-center text-center relative hover:bg-zinc-50 dark:hover:bg-zinc-800/50 hover:border-indigo-300 dark:hover:border-indigo-600/30 cursor-pointer overflow-hidden transition-all">
                <div className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button className="p-1 hover:bg-zinc-200 dark:hover:bg-zinc-700 rounded text-zinc-400 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white transition-colors">
                        <MoreVertical className="w-4 h-4" />
                    </button>
                </div>

                <div className="mb-4 p-4 rounded-full bg-zinc-50 dark:bg-zinc-900/50 group-hover:bg-white dark:group-hover:bg-zinc-900 transition-colors border border-zinc-100 dark:border-zinc-800/50 group-hover:border-zinc-200 dark:group-hover:border-zinc-700 shadow-sm">
                    {getFileIcon(file.type)}
                </div>

                <h3 className="font-medium text-zinc-700 dark:text-zinc-200 text-sm mb-1 truncate w-full px-4 group-hover:text-zinc-900 dark:group-hover:text-white transition-colors">
                    {file.name}
                </h3>
                <span className="text-xs text-zinc-400 dark:text-zinc-500 font-medium transition-colors">
                    {file.size} • {file.date}
                </span>
            </Card>
          </motion.div>
        ))}
      </motion.div>
    </div>
  );
};

export default Files;
