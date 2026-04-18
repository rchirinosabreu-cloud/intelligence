import React, { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import PageHeader from '@/components/ui/PageHeader';
import VirtualOffice from './VirtualOffice';
import MissionControlDrawer from './MissionControlDrawer';
import { getApiBaseUrl } from '@/lib/apiBaseUrl';

const MissionControl = () => {
  const [selectedMember, setSelectedMember] = useState(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

  // --- REACT QUERY: MISSION CONTROL STATUS ---
  const {
    data: status = { team: [], production: { isActive: false }, meetings: [], projects: [] },
    isLoading
  } = useQuery({
    queryKey: ['missionControlStatus'],
    queryFn: async () => {
      const baseUrl = getApiBaseUrl();
      const response = await fetch(`${baseUrl}/api/mission-control/status`);
      if (!response.ok) throw new Error("Failed to fetch mission control status");
      return await response.json();
    },
    refetchInterval: 30000, // Sync every 30 seconds
  });

  const handleMemberClick = (member) => {
    setSelectedMember(member);
    setIsDrawerOpen(true);
  };

  return (
    <div className="flex flex-col h-full overflow-hidden bg-slate-50 dark:bg-zinc-950">
      <div className="px-6 py-2">
        <PageHeader
          title="Mission Control"
          subtitle="Brain-OS: Monitoreo operativo en tiempo real"
        />
      </div>

      <div className="flex-1 relative overflow-hidden rounded-t-[3rem] border-t border-x border-slate-200 dark:border-zinc-800 shadow-2xl">
        {isLoading ? (
          <div className="absolute inset-0 flex items-center justify-center bg-white/50 dark:bg-zinc-950/50 backdrop-blur-md z-10">
            <div className="flex flex-col items-center gap-4">
              <div className="w-12 h-12 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin" />
              <p className="text-sm font-bold text-slate-500 animate-pulse uppercase tracking-widest">Iniciando Sistemas...</p>
            </div>
          </div>
        ) : (
          <VirtualOffice
            team={status.team}
            activeMeetings={status.meetings}
            productionActive={status.production.isActive}
            productionClients={status.production.clients}
            onMemberClick={handleMemberClick}
          />
        )}
      </div>

      <MissionControlDrawer
        isOpen={isDrawerOpen}
        onClose={() => setIsDrawerOpen(false)}
        member={selectedMember}
        projects={status.projects}
      />
    </div>
  );
};

export default MissionControl;
