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
      try {
        const baseUrl = getApiBaseUrl();
        const response = await fetch(`${baseUrl}/api/mission-control/status`);
        if (!response.ok) throw new Error("Failed to fetch mission control status");
        return await response.json();
      } catch (err) {
        console.error("Fetch Error:", err);
        // Fallback for demo/dev if API is down
        return {
          team: [
            { id: '1', name: 'Rodny Perez', role: 'Director', isActive: true },
            { id: '2', name: 'Melissa', role: 'Editora Senior', isActive: true },
            { id: '3', name: 'Camila', role: 'Content Creator', isActive: true },
            { id: '4', name: 'Gabriel', role: 'Editor', isActive: true },
            { id: '5', name: 'Pablo Hoff', role: 'Estratega', isActive: true },
            { id: '6', name: 'Nájera', role: 'Project Manager', isActive: true },
          ],
          production: { isActive: true, clients: ['Brieva'] },
          meetings: [{ participants: ['1', '6'] }],
          projects: []
        };
      }
    },
    refetchInterval: 15000, // Sync every 15 seconds
  });

  const handleMemberClick = (member) => {
    setSelectedMember(member);
    setIsDrawerOpen(true);
  };

  return (
    <div className="flex flex-col h-full overflow-hidden bg-white dark:bg-zinc-950">
      <div className="px-8 pt-8 pb-4">
        <PageHeader
          title="Mission Control"
          subtitle="Brain-OS V2: Habitación Virtual de Operaciones"
        />
      </div>

      <div className="flex-1 relative overflow-hidden bg-slate-50 dark:bg-zinc-900/50">
        {isLoading && !status.team.length ? (
          <div className="absolute inset-0 flex items-center justify-center bg-white/50 dark:bg-zinc-950/50 backdrop-blur-md z-10">
            <div className="flex flex-col items-center gap-4">
              <div className="w-12 h-12 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin" />
              <p className="text-sm font-black text-slate-500 animate-pulse uppercase tracking-widest">Cargando Brain-OS...</p>
            </div>
          </div>
        ) : (
          <VirtualOffice
            team={status.team}
            activeMeetings={status.meetings}
            productionActive={status.production.isActive}
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
