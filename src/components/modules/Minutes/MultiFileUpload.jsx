
import React, { useCallback, useState } from 'react';
import { useDropzone } from 'react-dropzone';
import { UploadCloud, Loader2 } from '@/components/ui/icons';
import toast from 'react-hot-toast';
import { processAudio } from '../../../utils/audioProcessor';
import { processDocument } from '../../../utils/documentProcessor';

const MultiFileUpload = ({ onFilesAdded }) => {
  const [isProcessing, setIsProcessing] = useState(false);

  const onDrop = useCallback(async (acceptedFiles) => {
    if (acceptedFiles.length === 0) return;

    setIsProcessing(true);
    toast.loading(`Procesando ${acceptedFiles.length} archivos...`, { id: 'batch-process' });

    const processedFiles = [];
    let errors = 0;

    for (const file of acceptedFiles) {
      try {
        // Validation: Max 25MB
        if (file.size > 25 * 1024 * 1024) {
          throw new Error('El archivo excede el límite de 25MB');
        }

        let textContent = '';
        let type = 'unknown';

        if (file.type.startsWith('audio/')) {
           type = 'audio';
           textContent = await processAudio(file);
        } else {
           type = 'document';
           textContent = await processDocument(file);
        }

        processedFiles.push({
          id: Date.now().toString() + Math.random().toString(),
          title: file.name,
          type: type,
          fileType: file.type,
          size: file.size,
          text: textContent,
          uploadedAt: new Date().toISOString()
        });

      } catch (err) {
        console.error(`Error processing ${file.name}:`, err);
        toast.error(`Error en ${file.name}: ${err.message}`);
        errors++;
      }
    }

    if (processedFiles.length > 0) {
      onFilesAdded(processedFiles);
      toast.success(`✅ ${processedFiles.length} archivos procesados correctamente`);
    }

    if (errors > 0 && processedFiles.length === 0) {
        toast.error("No se pudo procesar ningún archivo.");
    }

    toast.dismiss('batch-process');
    setIsProcessing(false);

  }, [onFilesAdded]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    maxSize: 25 * 1024 * 1024, // 25MB check in dropzone too
    accept: {
      'audio/*': ['.mp3', '.wav', '.m4a', '.ogg', '.flac'],
      'application/pdf': ['.pdf'],
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
      'text/csv': ['.csv'],
      'text/plain': ['.txt']
    }
  });

  return (
    <div className="w-full">
      <div
        {...getRootProps()}
        className={`
          relative border-2 border-dashed rounded-xl p-8 transition-all duration-300
          flex flex-col items-center justify-center text-center cursor-pointer min-h-[200px]
          ${isDragActive
            ? 'border-primary/80 bg-muted/50 shadow-[0_0_15px_rgba(var(--primary),0.3)]'
            : 'border-border bg-white dark:bg-zinc-900 hover:border-border hover:bg-white dark:bg-zinc-900'}
        `}
      >
        <input {...getInputProps()} />

        {isProcessing ? (
           <div className="flex flex-col items-center animate-pulse">
             <Loader2 className="w-12 h-12 text-muted-foreground animate-spin mb-4" />
             <h3 className="text-lg font-semibold text-zinc-900 dark:text-white">Procesando archivos...</h3>
             <p className="text-muted-foreground text-sm mt-2">Transcribiendo audio y extrayendo texto</p>
           </div>
        ) : (
           <>
             <div className="bg-muted/50 p-4 rounded-full mb-4 group-hover:scale-110 transition-transform">
               <UploadCloud className={`w-10 h-10 ${isDragActive ? 'text-zinc-900 dark:text-white' : 'text-muted-foreground'}`} />
             </div>
             <h3 className="text-lg font-semibold text-zinc-900 dark:text-white mb-2">
               {isDragActive ? '¡Suelta los archivos aquí!' : 'Arrastra archivos o haz clic'}
             </h3>
             <p className="text-zinc-500 dark:text-zinc-400 text-sm max-w-xs mb-4">
               Soporta audio (MP3, WAV, M4A) y documentos (PDF, DOCX, CSV)
             </p>
             <span className="inline-block px-3 py-1 bg-zinc-100 dark:bg-zinc-800 text-xs text-zinc-600 dark:text-zinc-300 rounded-full border border-zinc-200 dark:border-zinc-700">
               Máx 25MB por archivo
             </span>
           </>
        )}
      </div>
    </div>
  );
};

export default MultiFileUpload;
