
import React, { useState, useCallback } from 'react';
import { motion } from 'framer-motion';
import { useDropzone } from 'react-dropzone';
import { Mic, FileAudio, Loader2, CheckCircle2 } from 'lucide-react';
import { processAudio } from '../../../utils/audioProcessor';
import toast from 'react-hot-toast';

const AudioUpload = ({ onSelectAudio, selectedAudio }) => {
  const [processing, setProcessing] = useState(false);
  const [uploadedAudios, setUploadedAudios] = useState([]);

  const onDrop = useCallback(async acceptedFiles => {
    if (acceptedFiles.length === 0) return;

    setProcessing(true);
    toast.loading(`Transcribiendo ${acceptedFiles.length} archivo(s)...`, { id: "transcription-toast" });

    const newAudios = [];
    let errorCount = 0;

    for (const file of acceptedFiles) {
        // Validate file type
        const validTypes = ['audio/mpeg', 'audio/wav', 'audio/x-m4a', 'audio/ogg', 'audio/flac', 'audio/mp4'];
        const validExtensions = ['mp3', 'wav', 'm4a', 'ogg', 'flac'];
        const fileExtension = file.name.split('.').pop().toLowerCase();

        if (!validTypes.includes(file.type) && !validExtensions.includes(fileExtension)) {
            toast.error(`Formato no válido: ${file.name}`);
            errorCount++;
            continue;
        }

        if (file.size > 25 * 1024 * 1024) {
            toast.error(`${file.name} excede 25MB`);
            errorCount++;
            continue;
        }

        try {
            const transcriptionText = await processAudio(file);
            const audioData = {
                id: Date.now().toString() + Math.random().toString(),
                title: file.name,
                type: 'audio',
                fileType: file.type || 'audio/' + fileExtension,
                size: file.size,
                text: transcriptionText,
                uploadedAt: new Date().toISOString()
            };
            newAudios.push(audioData);
        } catch (err) {
            console.error(err);
            toast.error(`Error en ${file.name}: ${err.message}`);
            errorCount++;
        }
    }

    toast.dismiss("transcription-toast");

    if (newAudios.length > 0) {
        setUploadedAudios(prev => [...prev, ...newAudios]);
        // For backwards compatibility, select the first new one if single selection is expected by parent
        if (onSelectAudio) {
           // If parent expects a single object, send first. If array support was added to parent, send array.
           // Current parent SourcePanel (old version) expected single. New version will use MultiFileUpload.
           // This component is updated for Task 2 requirements.
           onSelectAudio(newAudios[0]);
        }
        toast.success(`✅ ${newAudios.length} audio(s) procesado(s)`);
    } else if (errorCount > 0) {
        toast.error("No se pudieron procesar los archivos");
    }

    setProcessing(false);
  }, [onSelectAudio]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'audio/mpeg': ['.mp3'],
      'audio/wav': ['.wav'],
      'audio/x-m4a': ['.m4a'],
      'audio/ogg': ['.ogg'],
      'audio/flac': ['.flac'],
      'audio/mp4': ['.m4a']
    },
    multiple: true // Enabled multiple
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 mb-2">
        <Mic className="w-5 h-5 text-primary" />
        <h3 className="text-lg font-semibold text-zinc-900 dark:text-white">Subir Audios</h3>
      </div>

      <div {...getRootProps()} className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-all duration-200 h-48 flex flex-col justify-center items-center ${isDragActive ? 'border-indigo-500 bg-primary/10' : 'border-border/50 bg-white dark:bg-zinc-900 hover:border-primary/50 hover:bg-white dark:bg-zinc-900'}`}>
        <input {...getInputProps()} />

        {processing ? (
          <div className="flex flex-col items-center gap-3">
            <Loader2 className="w-10 h-10 text-primary animate-spin" />
            <p className="text-zinc-900 dark:text-white font-medium">Procesando audios...</p>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-3">
            <Mic className="w-12 h-12 text-gray-500" />
            <div>
              <p className="text-zinc-900 dark:text-white font-medium mb-1">
                {isDragActive ? 'Suelta los audios aquí' : 'Sube tus grabaciones'}
              </p>
              <p className="text-sm text-zinc-500 dark:text-zinc-400">MP3, WAV, M4A (Max 25MB)</p>
            </div>
          </div>
        )}
      </div>

      <div className="space-y-2">
      {uploadedAudios.map(audio => (
        <motion.div
            key={audio.id}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            onClick={() => onSelectAudio && onSelectAudio(audio)}
            className={`p-4 rounded-lg border cursor-pointer transition-all duration-200 ${selectedAudio?.id === audio.id ? 'bg-primary/20 border-primary shadow-lg shadow-primary/20' : 'bg-white dark:bg-zinc-900 border-border/50 hover:border-primary/50 hover:bg-white dark:bg-zinc-900'}`}
        >
          <div className="flex items-center gap-3">
            <FileAudio className="w-5 h-5 text-primary" />
            <div className="flex-1 min-w-0">
              <h4 className="font-medium text-zinc-900 dark:text-white truncate">{audio.title}</h4>
              <p className="text-sm text-zinc-500 dark:text-zinc-400">
                {(audio.size / 1024 / 1024).toFixed(2)} MB • Transcrito
              </p>
            </div>
            {selectedAudio?.id === audio.id && <CheckCircle2 className="w-5 h-5 text-primary" />}
          </div>
        </motion.div>
      ))}
      </div>
    </div>
  );
};

export default AudioUpload;
