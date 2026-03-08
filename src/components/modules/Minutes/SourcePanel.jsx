
import React, { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import { PlayCircle } from 'lucide-react';
import FirefliesPanel from './FirefliesPanel';
import MultiFileUpload from './MultiFileUpload';
import FileList from './FileList';
import { Button } from './ui/button';
import { toast } from 'react-hot-toast';

const SourcePanel = ({ onSelectSource, selectedSource, analysisReady, onStartAnalysis }) => {
  // Local state to manage the list of all files/sources
  const [files, setFiles] = useState([]);

  // Sync internal files if selectedSource comes from parent as multi-source
  // (Optional consistency check, mostly we drive parent from here)
  useEffect(() => {
     if (selectedSource?.type === 'multi-source' && selectedSource.files) {
         setFiles(selectedSource.files);
     }
     // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Keep as mount-only to avoid circular updates if parent changes reference

  // Update parent whenever files change
  useEffect(() => {
    if (files.length > 0) {
        onSelectSource({
            type: 'multi-source',
            files: files,
            title: 'Análisis Integrado',
            // Concatenated text for backwards compatibility with single-source components if needed
            text: files.map(f => f.text).join('\n\n')
        });
    } else {
        // If no files, we can clear the selection or keep it empty
        onSelectSource(null);
    }
  }, [files, onSelectSource]);


  const handleFilesAdded = useCallback((newFiles) => {
    setFiles(prev => [...prev, ...newFiles]);
  }, []);

  const handleRemoveFile = useCallback((fileId) => {
    setFiles(prev => prev.filter(f => f.id !== fileId));
  }, []);

  const handleSelectMeeting = useCallback((meeting) => {
    // Treat Fireflies meeting as just another file in the list
    const meetingAsFile = {
        id: meeting.id,
        title: meeting.title || 'Reunión Fireflies',
        type: 'meeting',
        text: meeting.text, // Assuming text is available in the object passed back
        uploadedAt: new Date().toISOString(),
        size: 0 // Metadata
    };
    // Add to list instead of replacing
    setFiles(prev => [...prev, meetingAsFile]);
  }, []);

  const handleStartAnalysis = () => {
    if (files.length === 0) {
      toast.error('Agrega al menos una fuente antes de iniciar el análisis.');
      return;
    }

    const confirmed = window.confirm('¿Deseas iniciar el análisis con las fuentes cargadas?');
    if (confirmed) {
      onStartAnalysis();
      toast.success('Análisis iniciado. Ya puedes generar reportes.');
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.5 }}
      className="h-full bg-card  rounded-2xl p-6 border border-border shadow-sm flex flex-col overflow-y-auto"
    >
      <h2 className="text-2xl font-bold text-zinc-900 dark:text-white mb-6">Fuentes de Datos</h2>

      <div className="flex-1 overflow-y-auto custom-scrollbar space-y-8 pr-2">

        {/* Unified Upload Area */}
        <section>
             <MultiFileUpload onFilesAdded={handleFilesAdded} />
        </section>

        {/* File List */}
        <FileList files={files} onRemove={handleRemoveFile} />

        <div className="bg-white dark:bg-zinc-900 rounded-xl border border-border p-4 space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-zinc-900 dark:text-white">Listo para analizar</p>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                Confirma cuando estés listo para iniciar el análisis de las fuentes cargadas.
              </p>
            </div>
            {analysisReady && (
              <span className="text-[10px] uppercase tracking-wide bg-green-500/10 text-green-300 px-2 py-1 rounded-full border border-green-500/30">
                Activo
              </span>
            )}
          </div>
          <Button
            onClick={handleStartAnalysis}
            disabled={files.length === 0}
            className="w-full bg-primary text-primary-foreground hover:bg-primary/90 font-medium"
          >
            <PlayCircle className="w-4 h-4 mr-2" />
            Iniciar el análisis
          </Button>
        </div>

        {/* Fireflies Integration */}
        <div className="border-t border-border pt-8">
           <h3 className="text-sm font-semibold text-zinc-500 dark:text-zinc-400 mb-4 uppercase tracking-wider">Integraciones</h3>
           <FirefliesPanel
             onSelectMeeting={handleSelectMeeting}
             // We pass null as selectedMeeting because we don't want highlighting logic to conflict with list logic
             // or we could find if any file in 'files' matches meeting ID
             selectedMeeting={null}
           />
        </div>

      </div>
    </motion.div>
  );
};

export default SourcePanel;
