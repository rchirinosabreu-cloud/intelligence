import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import axios from 'axios';
import { getApiBaseUrl } from '@/lib/apiBaseUrl';
import { Loader2, Plus, Calendar, Clock, Rocket, Video, Users, Coffee } from 'lucide-react';
import PageHeader from '@/components/ui/PageHeader';
import { Button } from '@/components/ui/button';
import PixelAvatar from './PixelAvatar';
import { cn } from '@/lib/utils';

const MissionControl = () => {
  // Mock data for TBD / Manual entries
  const [manualEntries, setManualEntries] = useState({
    production: [
      { id: 'p1', client: 'Martínez y Nájera', type: 'Rodaje Social Media', time: '09:00 AM', logo: 'https://ui-avatars.com/api/?name=Martinez+Najera' },
      { id: 'p2', client: 'Pablo Hoff', type: 'Sesión de Podcast', time: '02:00 PM', logo: 'https://ui-avatars.com/api/?name=Pablo+Hoff' }
    ],
    projects: [
      { id: 'm1', title: 'Línea gráfica Mío', status: 'En Diseño', progress: 65 },
      { id: 'm2', title: 'Landing Grupo Rincón', status: 'Review Cliente', progress: 90 },
      { id: 'm3', title: 'Brochure Brieva', status: 'Bocetación', progress: 30 }
    ],
    meetings: [
      { id: 'mt1', title: 'Mapas ANDI', time: '10:30 AM', type: 'Estratégica' },
      { id: 'mt2', title: 'Tráfico Brain Studio', time: '05:00 PM', type: 'Sync Interna' }
    ]
  });

  // Dynamic team data
  const { data: team, isLoading: teamLoading } = useQuery({
    queryKey: ['team-list'],
    queryFn: async () => {
      const response = await axios.get(`${getApiBaseUrl()}/api/team`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('authToken')}` }
      });
      return response.data;
    }
  });

  // Dynamic active tasks to determine "Current Traffic"
  const { data: tasks } = useQuery({
    queryKey: ['native-tasks-mission'],
    queryFn: async () => {
      const response = await axios.get(`${getApiBaseUrl()}/api/tasks`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('authToken')}` }
      });
      return response.data;
    }
  });

  // Filter specific team members for Mission Control
  const coreTeamNames = ['rodny', 'melissa', 'camila', 'gabriel', 'pablo'];
  const coreTeam = team?.filter(m =>
    coreTeamNames.includes(m.name.toLowerCase())
  ) || [];

  const getMemberStatus = (memberId) => {
    const activeTask = tasks?.find(t => t.assigneeId === memberId && t.status === 'EN_CURSO');
    return activeTask ? 'active' : 'idle';
  };

  const PixelCard = ({ title, icon: Icon, children, className }) => (
    <div className={cn(
      "bg-[#fdfcf0] border-4 border-black p-6 shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] flex flex-col gap-4 transition-transform hover:-translate-y-1",
      className
    )}>
      <div className="flex items-center gap-3 border-b-4 border-black pb-3">
        <div className="p-2 bg-black text-white">
          <Icon className="w-5 h-5" />
        </div>
        <h2 className="text-xl font-bold uppercase tracking-tighter" style={{ fontFamily: '"Press Start 2P", cursive, sans-serif' }}>
          {title}
        </h2>
      </div>
      <div className="flex-1">
        {children}
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-[#e0f2f1] p-4 lg:p-8 space-y-8 animate-in fade-in duration-500 overflow-x-hidden relative">
      {/* Pixel Art Font Import */}
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Press+Start+2P&display=swap');
        .pixel-font { font-family: 'Press Start 2P', cursive; }
        .isometric-grid {
          background-image:
            linear-gradient(30deg, #b2dfdb 12%, transparent 12.5%, transparent 87%, #b2dfdb 87.5%, #b2dfdb),
            linear-gradient(150deg, #b2dfdb 12%, transparent 12.5%, transparent 87%, #b2dfdb 87.5%, #b2dfdb),
            linear-gradient(30deg, #b2dfdb 12%, transparent 12.5%, transparent 87%, #b2dfdb 87.5%, #b2dfdb),
            linear-gradient(150deg, #b2dfdb 12%, transparent 12.5%, transparent 87%, #b2dfdb 87.5%, #b2dfdb),
            linear-gradient(60deg, #b2dfdb 25%, transparent 25.5%, transparent 75%, #b2dfdb 75%, #b2dfdb),
            linear-gradient(60deg, #b2dfdb 25%, transparent 25.5%, transparent 75%, #b2dfdb 75%, #b2dfdb);
          background-size: 80px 140px;
          background-position: 0 0, 0 0, 40px 70px, 40px 70px, 0 0, 40px 70px;
        }
      `}</style>

      <PageHeader
        title="MISSION CONTROL"
        subtitle="Operational Hub & Real-time Traffic."
        className="[&_h1]:pixel-font [&_h1]:text-2xl [&_h1]:tracking-widest [&_h1]:text-black"
      >
        <Button
          className="bg-black text-white hover:bg-zinc-800 border-b-4 border-r-4 border-zinc-600 active:border-0 active:translate-y-1 transition-all rounded-none px-6"
        >
          <Plus className="w-4 h-4 mr-2" />
          NUEVA ENTRADA
        </Button>
      </PageHeader>

      <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-4 gap-8">
        {/* Pillar 1: Jornada de Producción */}
        <PixelCard title="Producción" icon={Video}>
          <div className="space-y-4">
            {manualEntries.production.map(item => (
              <div key={item.id} className="flex items-center gap-4 bg-white/50 border-2 border-black p-3 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]">
                <img src={item.logo} className="w-10 h-10 border-2 border-black rounded-full" alt={item.client} />
                <div>
                  <h4 className="font-bold text-sm uppercase">{item.client}</h4>
                  <p className="text-[10px] font-bold text-indigo-600">{item.type}</p>
                  <div className="flex items-center gap-1 mt-1">
                    <Clock className="w-3 h-3" />
                    <span className="text-[9px] font-black">{item.time}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </PixelCard>

        {/* Pillar 2: Equipo / Ausencias */}
        <PixelCard title="Equipo" icon={Users}>
          <div className="grid grid-cols-2 gap-4">
            {teamLoading ? <Loader2 className="animate-spin" /> : coreTeam.map(member => {
              const status = getMemberStatus(member.id);
              const isAbsent = !member.isActive;
              return (
                <div key={member.id} className="flex flex-col items-center gap-2 p-3 bg-white/50 border-2 border-black hover:bg-white transition-colors cursor-help group relative">
                  <PixelAvatar
                    name={member.name}
                    status={isAbsent ? 'unavailable' : 'available'}
                  />
                  <span className="text-[9px] font-black uppercase text-center">{member.name}</span>

                  {isAbsent ? (
                    <span className="text-[8px] bg-red-100 text-red-600 px-1 border border-red-200 font-bold">AUSENTE</span>
                  ) : status === 'active' ? (
                    <div className="flex items-center gap-1">
                      <div className="w-2 h-2 bg-emerald-500 animate-pulse border border-black" />
                      <span className="text-[8px] font-bold text-emerald-600">EN TRÁFICO</span>
                    </div>
                  ) : (
                    <span className="text-[8px] text-zinc-400 font-bold italic">DISPONIBLE</span>
                  )}
                </div>
              );
            })}
            {/* Manual Entry for absences */}
            <div className="flex flex-col items-center justify-center gap-2 p-3 bg-white/20 border-2 border-black border-dashed opacity-50 hover:opacity-100 transition-opacity cursor-pointer">
               <Plus className="w-6 h-6 text-zinc-400" />
               <span className="text-[8px] font-black uppercase text-center">Anotar Permiso</span>
            </div>
          </div>
        </PixelCard>

        {/* Pillar 3: Proyectos Importantes */}
        <PixelCard title="Proyectos" icon={Rocket}>
          <div className="space-y-4">
            {manualEntries.projects.map(project => (
              <div key={project.id} className="space-y-1">
                <div className="flex justify-between items-end">
                  <h4 className="font-bold text-xs uppercase">{project.title}</h4>
                  <span className="text-[9px] font-black">{project.progress}%</span>
                </div>
                <div className="h-4 w-full bg-white border-2 border-black overflow-hidden">
                  <div
                    className="h-full bg-emerald-400 border-r-2 border-black"
                    style={{ width: `${project.progress}%` }}
                  />
                </div>
                <p className="text-[8px] font-bold uppercase text-zinc-500">{project.status}</p>
              </div>
            ))}
          </div>
        </PixelCard>

        {/* Pillar 4: Reuniones */}
        <PixelCard title="Sync" icon={Calendar}>
          <div className="space-y-3">
            {manualEntries.meetings.map(meeting => (
              <div key={meeting.id} className="bg-indigo-50 border-2 border-black p-3 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] relative overflow-hidden group">
                <div className="absolute top-0 right-0 w-8 h-8 bg-indigo-600 text-white flex items-center justify-center translate-x-4 -translate-y-4 rotate-45 group-hover:translate-x-0 group-hover:translate-y-0 transition-all">
                  <Clock className="w-3 h-3 -rotate-45" />
                </div>
                <h4 className="font-bold text-xs uppercase mb-1">{meeting.title}</h4>
                <div className="flex items-center gap-2">
                  <span className="text-[9px] bg-black text-white px-1 font-bold">{meeting.time}</span>
                  <span className="text-[9px] font-bold text-indigo-600 uppercase">{meeting.type}</span>
                </div>
              </div>
            ))}
          </div>
        </PixelCard>
      </div>

      {/* Decorative Isometric Floor */}
      <div className="fixed bottom-0 left-0 w-full h-32 isometric-grid opacity-30 pointer-events-none -z-10" />
    </div>
  );
};

export default MissionControl;
