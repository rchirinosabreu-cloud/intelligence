import React, { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Coffee, Video, Users, User, Zap, Lock, Info } from 'lucide-react';
import { getApiBaseUrl } from '@/lib/apiBaseUrl';
import TeamAvatar from '@/components/ui/TeamAvatar';
import { cn } from '@/lib/utils';
import { motion, AnimatePresence } from 'framer-motion';

const ActivityMap = () => {
  const { data: apiStatus = [], isLoading, refetch } = useQuery({
    queryKey: ['team-activity-status'],
    queryFn: async () => {
      try {
        const res = await fetch(`${getApiBaseUrl()}/api/activity/status`);
        if (!res.ok) throw new Error('Failed to fetch status');
        return res.json();
      } catch (err) {
        console.error("API Fetch error, using mock data", err);
        return [];
      }
    },
    refetchInterval: 30000, // Sync every 30s
  });

  // Mock data for visual verification if API is empty
  const mockMembers = [
    { id: 'm1', name: 'Rodny Perez', role: 'CEO', status: 'PRODUCCION', avatarUrl: null, currentEvent: { title: 'Grabación Podcast' } },
    { id: 'm2', name: 'Melissa G.', role: 'PM', status: 'REUNION', avatarUrl: null, currentEvent: { title: 'Daily Sync' } },
    { id: 'm3', name: 'Camila R.', role: 'Designer', status: 'ENFOCADO', avatarUrl: null, desktopX: 45, desktopY: 40, currentTask: { title: 'Línea Gráfica Mío' } },
    { id: 'm4', name: 'Gabriel S.', role: 'Copywriter', status: 'OCUPADO', avatarUrl: null, desktopX: 55, desktopY: 40, currentTask: { title: 'Parrilla TruPeak' } },
    { id: 'm5', name: 'Pablo D.', role: 'Developer', status: 'LIBRE', avatarUrl: null },
    { id: 'm6', name: 'Nájera', role: 'Editor', status: 'AUSENTE', avatarUrl: null },
  ];

  const teamStatus = apiStatus.length > 0 ? apiStatus : mockMembers;

  // Areas definition (normalized 0-100 coordinates)
  const areas = [
    { id: 'estudio', name: 'El Estudio', icon: Video, x: 5, y: 30, w: 25, h: 40, color: 'fuchsia' },
    { id: 'nave', name: 'La Nave', icon: Zap, x: 35, y: 15, w: 30, h: 70, color: 'indigo' },
    { id: 'bunker', name: 'El Búnker', icon: Lock, x: 35, y: 2, w: 30, h: 10, color: 'slate' },
    { id: 'cafe', name: 'El Café Brain', icon: Coffee, x: 70, y: 30, w: 25, h: 40, color: 'orange' },
  ];

  // Helper to get status color
  const getStatusColor = (status) => {
    switch (status) {
      case 'LIBRE': return 'bg-green-500';
      case 'ENFOCADO': return 'bg-purple-500 shadow-[0_0_15px_rgba(168,85,247,0.5)]';
      case 'OCUPADO': return 'bg-orange-500';
      case 'REUNION': return 'bg-slate-200';
      case 'AUSENTE': return 'bg-red-500';
      default: return 'bg-zinc-400';
    }
  };

  // Helper to determine position
  const getAvatarPosition = (member) => {
    // If production event active, move to Estudio
    if (member.status === 'PRODUCCION') {
      return { x: 15, y: 50 }; // Center of Estudio
    }
    // If in meeting, move to Bunker
    if (member.status === 'REUNION') {
      return { x: 50, y: 7 }; // Center of Bunker
    }
    // If at Cafe
    if (member.status === 'LIBRE') {
       // Spread them out slightly in the cafe
       const offset = (parseInt(member.id.slice(-1), 16) || 0) % 5;
       return { x: 82 + offset, y: 50 + offset };
    }

    // Default: La Nave (Escritorio)
    // We use desktopX/Y if available, or generate a grid position
    if (member.desktopX && member.desktopY) {
      return { x: member.desktopX, y: member.desktopY };
    }

    // Fallback Grid in La Nave (35-65 x, 15-85 y)
    const idx = teamStatus.indexOf(member);
    const gridX = 40 + (idx % 3) * 10;
    const gridY = 25 + Math.floor(idx / 3) * 12;
    return { x: gridX, y: gridY };
  };

  const isProductionActive = teamStatus.some(m => m.status === 'PRODUCCION');

  return (
    <div className="relative w-full aspect-[16/9] bg-white dark:bg-zinc-900 rounded-3xl border border-zinc-200 dark:border-zinc-800 overflow-hidden shadow-2xl transition-all duration-700">
      {/* Background Grid */}
      <div className="absolute inset-0 opacity-[0.03] dark:opacity-[0.05] pointer-events-none"
           style={{ backgroundImage: 'radial-gradient(circle, currentColor 1px, transparent 1px)', backgroundSize: '30px 30px' }}
      />

      {/* Areas Render */}
      {areas.map(area => (
        <div
          key={area.id}
          className={cn(
            "absolute border-2 border-dashed transition-all duration-500 rounded-2xl flex flex-col items-center justify-start pt-4",
            area.id === 'estudio' && isProductionActive ? "border-fuchsia-500 bg-fuchsia-500/5 animate-pulse" : "border-zinc-200 dark:border-zinc-800",
            area.id === 'nave' && "bg-slate-50/30 dark:bg-zinc-800/20"
          )}
          style={{
            left: `${area.x}%`,
            top: `${area.y}%`,
            width: `${area.w}%`,
            height: `${area.h}%`
          }}
        >
          <div className="flex items-center gap-2 text-zinc-400 dark:text-zinc-600">
            <area.icon className="w-4 h-4" />
            <span className="text-[10px] font-bold uppercase tracking-widest">{area.name}</span>
          </div>

          {/* Studio Neon Effect */}
          {area.id === 'estudio' && isProductionActive && (
             <div className="absolute inset-0 shadow-[inset_0_0_50px_rgba(217,70,239,0.2)] pointer-events-none rounded-2xl" />
          )}
        </div>
      ))}

      {/* Avatars */}
      <AnimatePresence>
        {teamStatus.map((member) => {
          const pos = getAvatarPosition(member);
          const isAusente = member.status === 'AUSENTE';
          const isEnfocado = member.status === 'ENFOCADO';

          return (
            <motion.div
              key={member.id}
              layout
              initial={{ opacity: 0, scale: 0.5 }}
              animate={{
                opacity: isAusente ? 0.4 : 1,
                scale: 1,
                left: `${pos.x}%`,
                top: `${pos.y}%`,
              }}
              className="absolute -translate-x-1/2 -translate-y-1/2 z-10 group"
            >
              <div className="relative">
                {/* Focused Aura */}
                {isEnfocado && (
                   <div className="absolute -inset-4 bg-purple-500/20 rounded-full blur-xl animate-pulse" />
                )}

                {/* Desktop Background (only in Nave) */}
                {member.status !== 'AUSENTE' && member.status !== 'REUNION' && member.status !== 'PRODUCCION' && member.status !== 'LIBRE' && (
                  <div className="absolute top-8 left-1/2 -translate-x-1/2 w-8 h-4 bg-zinc-100 dark:bg-zinc-800 rounded-t-sm border border-zinc-200 dark:border-zinc-700" />
                )}

                <TeamAvatar
                  member={member}
                  className={cn(
                    "w-12 h-12 ring-4 transition-all duration-500",
                    isAusente ? "grayscale ring-zinc-300 dark:ring-zinc-800" : "ring-white dark:ring-zinc-900 shadow-xl"
                  )}
                />

                {/* Status Dot */}
                <div className={cn(
                  "absolute bottom-0 right-0 w-3.5 h-3.5 rounded-full border-2 border-white dark:border-zinc-900",
                  getStatusColor(member.status)
                )} />

                {/* Floating Tooltip/Label */}
                <div className="absolute -top-10 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-50">
                  <div className="bg-zinc-900 text-white text-[10px] px-2 py-1 rounded-lg shadow-xl flex flex-col items-center">
                    <span className="font-bold">{member.name}</span>
                    <span className="text-zinc-400">{member.currentTask?.title || member.currentEvent?.title || member.role}</span>
                  </div>
                </div>

                {/* Project Label (for Focused/Priority) */}
                {(isEnfocado || member.status === 'OCUPADO') && member.currentTask && (
                   <div className="absolute -bottom-8 left-1/2 -translate-x-1/2 bg-white/90 dark:bg-zinc-800/90 backdrop-blur-sm border border-zinc-200 dark:border-zinc-700 px-2 py-0.5 rounded-full shadow-sm whitespace-nowrap">
                      <span className="text-[9px] font-bold text-zinc-600 dark:text-zinc-300">{member.currentTask.title}</span>
                   </div>
                )}
              </div>
            </motion.div>
          );
        })}
      </AnimatePresence>

      {/* Legend */}
      <div className="absolute bottom-6 left-6 flex items-center gap-4 bg-white/80 dark:bg-zinc-900/80 backdrop-blur-md px-4 py-2 rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-sm">
         <div className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-green-500" /><span className="text-[10px] font-medium uppercase">Libre</span></div>
         <div className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-purple-500" /><span className="text-[10px] font-medium uppercase">Foco</span></div>
         <div className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-orange-500" /><span className="text-[10px] font-medium uppercase">Ocupado</span></div>
         <div className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-slate-200" /><span className="text-[10px] font-medium uppercase">Reunión</span></div>
         <div className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-red-500" /><span className="text-[10px] font-medium uppercase">Permiso</span></div>
      </div>

      <button
        onClick={() => refetch()}
        className="absolute bottom-6 right-6 p-2 bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 rounded-xl transition-colors"
      >
        <Zap className="w-4 h-4 text-zinc-500" />
      </button>
    </div>
  );
};

export default ActivityMap;
