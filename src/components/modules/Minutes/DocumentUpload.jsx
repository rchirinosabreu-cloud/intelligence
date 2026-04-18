
import React, { useState, useCallback } from 'react';
import { motion } from 'framer-motion';
import { useDropzone } from 'react-dropzone';
import { Upload, FileText, File, Loader2, CheckCircle2 } from 'lucide-react';
import { processDocument } from '../../../utils/documentProcessor';
import toast from 'react-hot-toast';

const DocumentUpload = ({ onSelectDocument, selectedDocument }) => {
  const [processing, setProcessing] = useState(false);
  const [uploadedDocs, setUploadedDocs] = useState([]);

  const onDrop = useCallback(async (acceptedFiles) => {
    if (acceptedFiles.length === 0) return;

    setProcessing(true);
    toast.loading(`Procesando ${acceptedFiles.length} documento(s)...`, { id: "doc-toast" });

    const newDocs = [];
    let errorCount = 0;

    for (const file of acceptedFiles) {
        // Validate file type
        const validTypes = [
        'application/pdf',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'text/plain',
        'text/csv'
        ];

        // Basic CSV check by extension if mime type fails
        if (!validTypes.includes(file.type) && !file.name.endsWith('.csv')) {
            toast.error(`Tipo inválido: ${file.name}`);
            errorCount++;
            continue;
        }

        try {
            const extractedText = await processDocument(file);
            const docData = {
                id: Date.now().toString() + Math.random().toString(),
                title: file.name,
                type: 'document',
                fileType: file.type,
                size: file.size,
                text: extractedText,
                uploadedAt: new Date().toISOString()
            };
            newDocs.push(docData);
        } catch (err) {
            console.error(err);
            toast.error(`Error en ${file.name}: ${err.message}`);
            errorCount++;
        }
    }

    toast.dismiss("doc-toast");

    if (newDocs.length > 0) {
        setUploadedDocs(prev => [...prev, ...newDocs]);
        if (onSelectDocument) {
            onSelectDocument(newDocs[0]); // Select first by default for backwards compatibility
        }
        toast.success(`✅ ${newDocs.length} documento(s) listo(s)`);
    } else if (errorCount > 0) {
        toast.error("No se pudieron procesar los archivos");
    }

    setProcessing(false);
  }, [onSelectDocument]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'application/pdf': ['.pdf'],
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
      'text/plain': ['.txt'],
      'text/csv': ['.csv']
    },
    multiple: true // Enable multiple
  });

  const getFileIcon = (type, name) => {
    if (type?.includes('pdf')) return <File className="w-5 h-5 text-red-400" />;
    if (type?.includes('word')) return <FileText className="w-5 h-5 text-blue-400" />;
    if (name?.endsWith('.csv') || type?.includes('csv')) return <FileText className="w-5 h-5 text-green-400" />;
    return <FileText className="w-5 h-5 text-zinc-500 dark:text-zinc-400" />;
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 mb-2">
        <Upload className="w-5 h-5 text-muted-foreground" />
        <h3 className="text-lg font-semibold text-zinc-900 dark:text-white">Subir Documentos</h3>
      </div>

      <div
        {...getRootProps()}
        className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all duration-200 ${
          isDragActive
            ? 'border-primary bg-muted/50'
            : 'border-border bg-white dark:bg-zinc-900 hover:border-border hover:bg-white dark:bg-zinc-900'
        }`}
      >
        <input {...getInputProps()} />

        {processing ? (
          <div className="flex flex-col items-center gap-3">
            <Loader2 className="w-10 h-10 text-muted-foreground animate-spin" />
            <p className="text-zinc-900 dark:text-white font-medium">Extrayendo texto...</p>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-3">
            <Upload className="w-12 h-12 text-gray-500" />
            <div>
              <p className="text-zinc-900 dark:text-white font-medium mb-1">
                {isDragActive ? 'Suelta los archivos aquí' : 'Arrastra y suelta tus documentos'}
              </p>
              <p className="text-sm text-zinc-500 dark:text-zinc-400">PDF, Word, CSV, TXT</p>
            </div>
          </div>
        )}
      </div>

      <div className="space-y-2">
      {uploadedDocs.map(doc => (
        <motion.div
          key={doc.id}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          onClick={() => onSelectDocument && onSelectDocument(doc)}
          className={`p-4 rounded-xl border cursor-pointer transition-all duration-200 ${
            selectedDocument?.id === doc.id
              ? 'bg-muted/50 border-primary shadow-sm '
              : 'bg-white dark:bg-zinc-900 border-border hover:border-border hover:bg-white dark:bg-zinc-900'
          }`}
        >
          <div className="flex items-center gap-3">
            {getFileIcon(doc.fileType, doc.title)}
            <div className="flex-1 min-w-0">
              <h4 className="font-medium text-zinc-900 dark:text-white truncate">{doc.title}</h4>
              <p className="text-sm text-zinc-500 dark:text-zinc-400">
                {(doc.size / 1024).toFixed(2)} KB • {doc.text.length} chars
              </p>
            </div>
            {selectedDocument?.id === doc.id && (
              <CheckCircle2 className="w-5 h-5 text-muted-foreground" />
            )}
          </div>
        </motion.div>
      ))}
      </div>
    </div>
  );
};

export default DocumentUpload;
