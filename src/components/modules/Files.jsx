import React from 'react';
import { MOCK_DATA } from '@/data';
import { Card } from '@/components/ui/Card';
import { FileText, FileSpreadsheet, FileArchive, Folder, Image, MoreVertical, Presentation, File } from 'lucide-react';
import { motion } from 'framer-motion';

const Files = () => {
  const { files } = MOCK_DATA;

  const getFileIcon = (type) => {
    switch (type) {
      case 'pdf': return <FileText className="w-12 h-12 text-rose-500/80" />;
      case 'xls': return <FileSpreadsheet className="w-12 h-12 text-emerald-500/80" />;
      case 'ppt': return <Presentation className="w-12 h-12 text-orange-500/80" />;
      case 'zip': return <FileArchive className="w-12 h-12 text-amber-500/80" />;
      case 'folder': return <Folder className="w-12 h-12 text-indigo-500/80 fill-indigo-500/20" />;
      case 'img': return <Image className="w-12 h-12 text-purple-500/80" />;
      case 'doc': return <FileText className="w-12 h-12 text-blue-500/80" />;
      default: return <File className="w-12 h-12 text-zinc-500/80" />;
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between mb-8">
         <div>
            <h2 className="text-2xl font-bold text-white mb-1">Archivos</h2>
            <p className="text-zinc-400 text-sm">Base de conocimiento y entregables.</p>
         </div>
         <button className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg font-medium transition-colors shadow-lg shadow-indigo-500/20 text-sm">
            Subir Archivo
         </button>
      </div>

      <motion.div
        layout
        className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6"
      >
        {files.map((file) => (
          <motion.div
            key={file.id}
            whileHover={{ y: -5 }}
            transition={{ type: "spring", stiffness: 300 }}
          >
            <Card className="group h-48 flex flex-col items-center justify-center text-center relative hover:bg-zinc-800/50 hover:border-indigo-500/30 cursor-pointer overflow-hidden">
                <div className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button className="p-1 hover:bg-zinc-700 rounded text-zinc-400 hover:text-white">
                        <MoreVertical className="w-4 h-4" />
                    </button>
                </div>

                <div className="mb-4 p-4 rounded-full bg-zinc-900/50 group-hover:bg-zinc-900 transition-colors border border-zinc-800/50 group-hover:border-zinc-700">
                    {getFileIcon(file.type)}
                </div>

                <h3 className="font-medium text-zinc-200 text-sm mb-1 truncate w-full px-4 group-hover:text-white transition-colors">
                    {file.name}
                </h3>
                <span className="text-xs text-zinc-500 font-medium">
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
