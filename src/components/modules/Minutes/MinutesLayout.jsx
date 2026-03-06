
import React, { useState, useCallback } from 'react';
import SourcePanel from './SourcePanel';
import WorkspacePanel from './WorkspacePanel';

const MinutesLayout = () => {
  const [selectedSource, setSelectedSource] = useState(null);
  const [analysisReady, setAnalysisReady] = useState(false);

  const handleSelectSource = useCallback((source) => {
    setSelectedSource(source);
    setAnalysisReady(false);
  }, []);

  return (
    <div className="w-full max-w-7xl mx-auto animate-fade-in font-sans">
        <div className="mb-8">
          <h1 className="text-3xl font-bold tracking-tight text-zinc-950 dark:text-zinc-900 dark:text-white mb-2 font-sans">Minutas</h1>
          <p className="text-zinc-500 dark:text-zinc-400 font-light">Genera reportes y analiza reuniones automáticamente.</p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 h-[calc(100vh-12rem)] min-h-[600px]">
          <SourcePanel
            selectedSource={selectedSource}
            onSelectSource={handleSelectSource}
            analysisReady={analysisReady}
            onStartAnalysis={() => setAnalysisReady(true)}
          />

          <WorkspacePanel selectedSource={selectedSource} analysisReady={analysisReady} />
        </div>
    </div>
  );
};

export default MinutesLayout;
