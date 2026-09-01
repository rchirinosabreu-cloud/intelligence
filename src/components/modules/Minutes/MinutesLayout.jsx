
import React, { useState, useCallback } from 'react';
import PageHeader from '@/components/ui/PageHeader';
import SourcePanel from './SourcePanel';
import WorkspacePanel from './WorkspacePanel';
import AutomaticMinutesPanel from './AutomaticMinutesPanel';

const MinutesLayout = () => {
  const [selectedSource, setSelectedSource] = useState(null);
  const [analysisReady, setAnalysisReady] = useState(false);

  const handleSelectSource = useCallback((source) => {
    setSelectedSource(source);
    setAnalysisReady(false);
  }, []);

  return (
    <div className="w-full max-w-7xl mx-auto animate-fade-in font-sans">
        <PageHeader
          title="Minutas"
          subtitle="Genera reportes y analiza reuniones automáticamente."
        />

        <AutomaticMinutesPanel />

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 min-h-[600px] h-full pb-12">
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
