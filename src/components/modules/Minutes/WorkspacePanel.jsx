
import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Sparkles, AlertCircle, Layers, Info } from 'lucide-react';
import GeneralSummary from './GeneralSummary';
import CompleteAnalysis from './CompleteAnalysis';

const WorkspacePanel = ({ selectedSource, analysisReady }) => {
  const [reportTitle, setReportTitle] = useState('');
  const [projectSubtitle, setProjectSubtitle] = useState('');

  // Helper to determine what we are looking at
  const isMultiSource = selectedSource?.type === 'multi-source';
  const files = isMultiSource ? selectedSource.files : (selectedSource ? [selectedSource] : []);
  const fileCount = files.length;

  const getSourceTitle = () => {
    if (!selectedSource) return 'Sin selección';
    if (isMultiSource) return 'Análisis Integrado';
    return selectedSource.data?.title || selectedSource.title || 'Documento';
  };

  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.5 }}
      className="h-full bg-white dark:bg-zinc-900 bg-opacity-60 backdrop-blur-xl rounded-2xl p-6 border border-purple-500/20 shadow-xl flex flex-col"
    >
      <div className="mb-6 border-b border-purple-800/30 pb-4">
        <h2 className="text-2xl font-bold text-zinc-900 dark:text-white mb-2">Espacio de Trabajo</h2>
        <div className="flex items-center gap-2 text-purple-300 h-6">
          {selectedSource ? (
            <>
               <Layers className="w-4 h-4" />
               <span className="text-sm font-medium truncate">{getSourceTitle()}</span>
               <span className="text-xs text-gray-500 bg-purple-900/30 px-2 py-0.5 rounded">
                 {fileCount} fuente(s)
               </span>
            </>
          ) : (
             <span className="text-sm text-gray-500 italic">Añade archivos para comenzar el análisis</span>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto custom-scrollbar pr-2">
        {!selectedSource || fileCount === 0 ? (
           <div className="flex flex-col items-center justify-center h-full text-gray-500 opacity-60">
             <Sparkles className="w-16 h-16 mb-4 text-purple-400" />
             <p className="text-lg font-medium">Esperando contenido...</p>
             <p className="text-sm">Sube audios o documentos en el panel izquierdo</p>
           </div>
        ) : (
           <div className="space-y-8">
              {/* Context Info */}
              <div className="bg-white dark:bg-zinc-900 rounded-lg p-4 border border-purple-900/20 flex items-start gap-3">
                  <Info className="w-5 h-5 text-purple-400 flex-shrink-0 mt-0.5" />
                  <div>
                    <h4 className="text-sm font-bold text-gray-300 mb-1">Contexto de Análisis</h4>
                    <p className="text-xs text-zinc-500 dark:text-zinc-400">
                      Se analizarán {fileCount} archivo(s) conjuntamente. La IA integrará la información de todas las fuentes para generar reportes unificados.
                    </p>
                    <div className="mt-2 flex flex-wrap gap-2">
                        {files.slice(0, 3).map((f, i) => (
                            <span key={i} className="text-[10px] bg-purple-900/40 text-purple-200 px-2 py-0.5 rounded border border-purple-500/20 truncate max-w-[150px]">
                                {f.title}
                            </span>
                        ))}
                        {fileCount > 3 && <span className="text-[10px] text-gray-500">+{fileCount - 3} más</span>}
                    </div>
                  </div>
              </div>

              <div className="bg-white dark:bg-zinc-900 rounded-lg p-4 border border-purple-900/20 space-y-4">
                <div>
                  <label className="text-xs uppercase tracking-wide text-purple-300">Título del documento</label>
                  <input
                    type="text"
                    value={reportTitle}
                    onChange={(event) => setReportTitle(event.target.value)}
                    placeholder="Ej. Reporte Ejecutivo de Talento"
                    className="mt-2 w-full rounded-lg bg-white dark:bg-zinc-900 border border-purple-900/30 px-3 py-2 text-sm text-zinc-900 dark:text-white placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-purple-500/40"
                  />
                </div>
                <div>
                  <label className="text-xs uppercase tracking-wide text-purple-300">Subtítulo del proyecto</label>
                  <input
                    type="text"
                    value={projectSubtitle}
                    onChange={(event) => setProjectSubtitle(event.target.value)}
                    placeholder="Ej. Horizonte 2026"
                    className="mt-2 w-full rounded-lg bg-white dark:bg-zinc-900 border border-purple-900/30 px-3 py-2 text-sm text-zinc-900 dark:text-white placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-purple-500/40"
                  />
                </div>
              </div>

              {!analysisReady ? (
                <div className="bg-white dark:bg-zinc-900 rounded-lg p-5 border border-purple-900/30 flex items-start gap-3">
                  <AlertCircle className="w-5 h-5 text-purple-300 mt-0.5" />
                  <div>
                    <p className="text-sm font-semibold text-zinc-900 dark:text-white">Confirma el inicio del análisis</p>
                    <p className="text-xs text-zinc-500 dark:text-zinc-400">
                      Para generar el resumen y el análisis, presiona <strong>“Iniciar el análisis”</strong> en la sección de fuentes de datos.
                    </p>
                  </div>
                </div>
              ) : (
                <div className="grid gap-6">
                  {/*
                     We pass 'files' array to the components.
                     They will handle generating the batch prompt.
                  */}
                  <GeneralSummary
                    files={files}
                    sourceTitle={getSourceTitle()}
                    reportMeta={{ reportTitle, projectSubtitle }}
                  />
                  <CompleteAnalysis
                    files={files}
                    sourceTitle={getSourceTitle()}
                    reportMeta={{ reportTitle, projectSubtitle }}
                  />
                </div>
              )}
           </div>
        )}
      </div>
    </motion.div>
  );
};

export default WorkspacePanel;
