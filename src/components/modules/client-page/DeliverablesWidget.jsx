import React, { useState, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { Download, File, UploadCloud, X, FileText, Image, Film } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { cn } from '@/lib/utils';
import { AnimatePresence, motion } from 'framer-motion';

const FileIcon = ({ type }) => {
  if (type.includes('image')) return <Image className="w-4 h-4 text-purple-500" />;
  if (type.includes('video')) return <Film className="w-4 h-4 text-red-500" />;
  if (type.includes('pdf')) return <FileText className="w-4 h-4 text-orange-500" />;
  return <File className="w-4 h-4 text-blue-500" />;
};

const DeliverablesWidget = () => {
  const [files, setFiles] = useState([
    { id: 1, name: 'Reporte_Q3_2025.pdf', size: '2.4 MB', type: 'application/pdf', date: 'Hace 2 días' },
    { id: 2, name: 'Campaña_Navidad_Final.mp4', size: '150 MB', type: 'video/mp4', date: 'Hace 5 días' },
  ]);

  const onDrop = useCallback(acceptedFiles => {
    // Mock upload
    const newFiles = acceptedFiles.map(file => ({
      id: Math.random(),
      name: file.name,
      size: `${(file.size / 1024 / 1024).toFixed(2)} MB`,
      type: file.type,
      date: 'Justo ahora'
    }));
    setFiles(prev => [...newFiles, ...prev]);
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({ onDrop });

  const removeFile = (id) => {
    setFiles(prev => prev.filter(f => f.id !== id));
  };

  return (
    <Card className="h-full flex flex-col p-5 bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 relative overflow-hidden">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
            <div className="p-1.5 bg-green-500/10 rounded-lg">
                <Download className="w-4 h-4 text-green-500" />
            </div>
            <h3 className="font-semibold text-zinc-900 dark:text-white text-sm">Entregables</h3>
        </div>
        <span className="text-xs text-zinc-400 font-medium">{files.length} Archivos</span>
      </div>

      <div className="flex-1 flex flex-col gap-4 min-h-0">
        {/* Dropzone Area */}
        <div
            {...getRootProps()}
            className={cn(
                "border-2 border-dashed rounded-xl p-6 flex flex-col items-center justify-center text-center transition-all cursor-pointer",
                isDragActive
                    ? "border-green-500 bg-green-50 dark:bg-green-500/10"
                    : "border-zinc-200 dark:border-zinc-700 hover:border-zinc-400 dark:hover:border-zinc-600 bg-zinc-50/50 dark:bg-zinc-800/30"
            )}
        >
            <input {...getInputProps()} />
            <div className="p-3 bg-white dark:bg-zinc-800 rounded-full shadow-sm mb-3">
                <UploadCloud className={cn("w-6 h-6", isDragActive ? "text-green-500" : "text-zinc-400")} />
            </div>
            <p className="text-sm font-medium text-zinc-700 dark:text-zinc-200">
                {isDragActive ? "Suelta los archivos aquí" : "Arrastra entregables finales"}
            </p>
            <p className="text-xs text-zinc-400 mt-1">o haz clic para explorar</p>
        </div>

        {/* File List */}
        <div className="flex-1 overflow-y-auto space-y-2 pr-1 min-h-[100px]">
            <AnimatePresence initial={false}>
                {files.map(file => (
                    <motion.div
                        key={file.id}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, height: 0, marginTop: 0, marginBottom: 0 }}
                        className="flex items-center gap-3 p-3 bg-zinc-50 dark:bg-zinc-800/50 rounded-lg group border border-transparent hover:border-zinc-200 dark:hover:border-zinc-700 transition-colors"
                    >
                        <div className="p-2 bg-white dark:bg-zinc-900 rounded-md border border-zinc-100 dark:border-zinc-800 shadow-sm">
                            <FileIcon type={file.type} />
                        </div>
                        <div className="flex-1 min-w-0">
                            <h4 className="text-sm font-medium text-zinc-900 dark:text-zinc-200 truncate">{file.name}</h4>
                            <div className="flex items-center gap-2 text-[10px] text-zinc-500">
                                <span>{file.size}</span>
                                <span>•</span>
                                <span>{file.date}</span>
                            </div>
                        </div>
                        <button
                            onClick={(e) => { e.stopPropagation(); removeFile(file.id); }}
                            className="opacity-0 group-hover:opacity-100 p-1.5 hover:bg-red-100 dark:hover:bg-red-900/30 text-zinc-400 hover:text-red-500 rounded-md transition-all"
                        >
                            <X className="w-3.5 h-3.5" />
                        </button>
                    </motion.div>
                ))}
            </AnimatePresence>
            {files.length === 0 && (
                <div className="h-full flex items-center justify-center text-zinc-400 text-xs py-4">
                    Sin archivos recientes
                </div>
            )}
        </div>
      </div>
    </Card>
  );
};

export default DeliverablesWidget;
