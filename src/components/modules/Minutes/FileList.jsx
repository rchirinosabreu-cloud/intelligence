
import React from 'react';
import { FileText, Mic, File, Trash2, Music, FileSpreadsheet } from '@/components/ui/icons';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from './ui/button';

const FileList = ({ files, onRemove }) => {
  if (!files || files.length === 0) return null;

  const getIcon = (type, title) => {
    if (type === 'audio') return <Music className="w-4 h-4 text-muted-foreground" />;
    if (title.endsWith('.pdf')) return <File className="w-4 h-4 text-red-400" />;
    if (title.endsWith('.csv')) return <FileSpreadsheet className="w-4 h-4 text-green-400" />;
    if (title.endsWith('.docx')) return <FileText className="w-4 h-4 text-blue-400" />;
    return <FileText className="w-4 h-4 text-zinc-500 dark:text-zinc-400" />;
  };

  return (
    <div className="space-y-3 mt-6">
      <h4 className="text-sm font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider pl-1">
        Archivos cargados ({files.length})
      </h4>
      <div className="space-y-2">
        <AnimatePresence>
          {files.map((file) => (
            <motion.div
              key={file.id}
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="group flex items-center justify-between p-3 rounded-xl bg-white dark:bg-zinc-900 border border-border hover:border-border transition-colors"
            >
              <div className="flex items-center gap-3 overflow-hidden">
                <div className="p-2 bg-muted/50 rounded-md">
                   {getIcon(file.type, file.title)}
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-200 truncate">{file.title}</p>
                  <div className="flex items-center gap-2 text-xs text-gray-500">
                    <span className="capitalize">{file.type === 'meeting' ? 'Reunión' : file.type}</span>
                    {file.size && <span>• {(file.size / 1024 / 1024).toFixed(2)} MB</span>}
                  </div>
                </div>
              </div>

              <Button
                variant="ghost"
                size="icon"
                onClick={(e) => { e.stopPropagation(); onRemove(file.id); }}
                className="text-gray-500 hover:text-red-400 hover:bg-red-900/20 h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity"
              >
                <Trash2 className="w-4 h-4" />
              </Button>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
};

export default FileList;
