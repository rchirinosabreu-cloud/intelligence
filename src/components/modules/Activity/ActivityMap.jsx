import React, { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Coffee, Video, Users, User, Zap, Lock, Info, Monitor, MousePointer2 } from 'lucide-react';
import { getApiBaseUrl } from '@/lib/apiBaseUrl';
import TeamAvatar from '@/components/ui/TeamAvatar';
import { cn } from '@/lib/utils';
import { motion, AnimatePresence } from 'framer-motion';

const ActivityMap = () => {
  const [hoveredMember, setHoveredMember] = useState(null);

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

  const teamStatus = apiStatus;

  // Areas definition (normalized 0-100 coordinates)
  // Adjusted for safe margins
  const areas = [
    { id: 'estudio', name: 'Jornadas de producción', icon: Video, x: 8, y: 35, w: 22, h: 35, color: 'fuchsia' },
    { id: 'nave', name: 'Oficina central', icon: Zap, x: 36, y: 20, w: 28, h: 65, color: 'indigo' },
    { id: 'bunker', name: 'Sala de juntas', icon: Lock, x: 36, y: 5, w: 28, h: 10, color: 'slate' },
    { id: 'cafe', name: 'Cafecito time', icon: Coffee, x: 70, y: 35, w: 22, h: 35, color: 'orange' },
    { id: 'permiso', name: 'De permiso', icon: User, x: 8, y: 5, w: 22, h: 22, color: 'red' },
  ];

  // Helper to get status color
  const getStatusColor = (status) => {
    switch (status) {
      case 'LIBRE': return 'bg-green-500';
      case 'ENFOCADO': return 'bg-purple-500 shadow-[0_0_15px_rgba(168,85,247,0.5)]';
      case 'OCUPADO': return 'bg-orange-500';
      case 'REUNION': return 'bg-white'; // White dot for meeting
      case 'PRODUCCION': return 'bg-fuchsia-500';
      case 'AUSENTE': return 'bg-red-500';
      default: return 'bg-zinc-400';
    }
  };

  const getStatusText = (status) => {
    switch (status) {
      case 'LIBRE': return 'DISPONIBLE';
      case 'ENFOCADO': return 'ENFOCADO';
      case 'OCUPADO': return 'OCUPADO';
      case 'REUNION': return 'EN REUNIÓN';
      case 'PRODUCCION': return 'EN PRODUCCIÓN';
      case 'AUSENTE': return 'DE PERMISO';
      default: return status;
    }
  };

  const getStatusTextColorClass = (status) => {
    switch (status) {
      case 'LIBRE': return 'text-green-600 dark:text-green-400';
      case 'ENFOCADO': return 'text-purple-600 dark:text-purple-400';
      case 'OCUPADO': return 'text-orange-600 dark:text-orange-400';
      case 'REUNION': return 'text-zinc-600 dark:text-zinc-400';
      case 'PRODUCCION': return 'text-fuchsia-600 dark:text-fuchsia-400';
      case 'AUSENTE': return 'text-red-600 dark:text-red-400';
      default: return 'text-zinc-500';
    }
  };

  // Helper to determine position with clustering logic
  const getAvatarPosition = (member) => {
    let basePos = { x: 50, y: 50 };

    if (member.status === 'AUSENTE') {
      basePos = { x: 19, y: 16 }; // De permiso
    } else if (member.status === 'PRODUCCION') {
      basePos = { x: 19, y: 52 }; // Jornadas de producción
    } else if (member.status === 'REUNION') {
      basePos = { x: 50, y: 10 };  // Sala de juntas
    } else if (member.status === 'LIBRE') {
      basePos = { x: 81, y: 52 }; // Cafecito time
    } else {
      // Oficina central (Escritorio)
      if (member.desktopX && member.desktopY) {
        return { x: member.desktopX, y: member.desktopY };
      }
      const idx = teamStatus.indexOf(member);
      basePos = {
        x: 42 + (idx % 3) * 8,
        y: 35 + Math.floor(idx / 3) * 12
      };
      return basePos;
    }

    const membersInZone = teamStatus.filter(m => m.status === member.status);
    const memberIndex = membersInZone.findIndex(m => m.id === member.id);
    const count = membersInZone.length;

    if (count > 1) {
      const isLargeZone = member.status === 'LIBRE' || member.status === 'AUSENTE';
      const angle = (memberIndex / count) * Math.PI * 2;
      const radius = isLargeZone ? 5 : 3.5;

      return {
        x: basePos.x + Math.cos(angle) * radius,
        y: basePos.y + Math.sin(angle) * radius
      };
    }

    return basePos;
  };

  if (isLoading) {
    return (
      <div className="w-full aspect-[16/9] flex flex-col items-center justify-center bg-white dark:bg-zinc-900 rounded-3xl border border-zinc-200 dark:border-zinc-800">
        <div className="w-12 h-12 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin mb-4" />
        <span className="text-zinc-500 font-medium">Sincronizando Oficina Virtual...</span>
      </div>
    );
  }

  const isProductionActive = teamStatus.some(m => m.status === 'PRODUCCION');

  return (
    <div className="relative w-full aspect-[16/9] bg-[#fdfbff] dark:bg-zinc-950 rounded-[40px] border border-zinc-200/60 dark:border-zinc-800/60 overflow-hidden shadow-[0_20px_70px_-15px_rgba(0,0,0,0.1)] transition-all duration-700">

      {/* Global Dotted Grid cover entire area */}
      <div className="absolute inset-0 opacity-[0.1] dark:opacity-[0.15] pointer-events-none"
           style={{
             backgroundImage: 'radial-gradient(circle, currentColor 1.2px, transparent 1.2px)',
             backgroundSize: '24px 24px'
           }}
      />

      {/* Areas Render */}
      {areas.map(area => (
        <React.Fragment key={area.id}>
          {/* Section Header Label (Floating above area) */}
          <div
            className="absolute -translate-x-1/2 flex items-center justify-center z-20"
            style={{
              left: `${area.x + area.w / 2}%`,
              top: `${area.y - 4.5}%`
            }}
          >
            <div className="bg-white/90 dark:bg-zinc-900/90 backdrop-blur-md px-4 py-1.5 rounded-full border border-zinc-200/50 dark:border-zinc-800/50 shadow-sm flex items-center gap-2">
              <area.icon className="w-3.5 h-3.5 text-zinc-400" />
              <span className="text-[10px] font-black uppercase tracking-[0.15em] text-zinc-500 dark:text-zinc-400">
                {area.name}
              </span>
            </div>
          </div>

          <div
            className={cn(
              "absolute border-2 border-dashed transition-all duration-700 rounded-[32px] flex flex-col items-center justify-center overflow-hidden",
              area.id === 'estudio' && isProductionActive ? "border-fuchsia-500 bg-fuchsia-500/5" : "border-zinc-200/40 dark:border-zinc-800/40",
              area.id === 'nave' && "bg-indigo-50/20 dark:bg-indigo-900/5"
            )}
            style={{
              left: `${area.x}%`,
              top: `${area.y}%`,
              width: `${area.w}%`,
              height: `${area.h}%`
            }}
          >
            {/* Context Details (Subtle background geometry / furniture) */}
            <div className="absolute inset-0 pointer-events-none overflow-hidden">
               {area.id === 'nave' && (
                 <div className="grid grid-cols-3 grid-rows-3 gap-8 p-6 opacity-10 dark:opacity-[0.05]">
                    {[...Array(9)].map((_, i) => (
                      <div key={i} className="bg-zinc-400 dark:bg-white rounded-lg aspect-square flex items-center justify-center">
                        <Monitor className="w-6 h-6" />
                      </div>
                    ))}
                 </div>
               )}
               {area.id === 'cafe' && (
                 <div className="absolute inset-0 flex items-center justify-center opacity-10 dark:opacity-[0.05]">
                    <div className="w-20 h-20 border-[6px] border-zinc-400 dark:border-white rounded-full" />
                 </div>
               )}
               {area.id === 'bunker' && (
                 <div className="absolute inset-x-4 inset-y-2 bg-zinc-400/20 dark:bg-white/10 rounded-full" />
               )}
            </div>

            {/* Studio Neon Effect */}
            {area.id === 'estudio' && isProductionActive && (
               <motion.div
                 animate={{
                   opacity: [0.2, 0.5, 0.2],
                   scale: [1, 1.01, 1]
                 }}
                 transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
                 className="absolute inset-0 shadow-[inset_0_0_80px_rgba(217,70,239,0.3)] pointer-events-none rounded-[32px] border-2 border-fuchsia-500"
               />
            )}
          </div>
        </React.Fragment>
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
              initial={{ opacity: 0, y: 20, scale: 0.8 }}
              animate={{
                opacity: isAusente ? 0.6 : 1,
                y: 0,
                scale: 1,
                left: `${pos.x}%`,
                top: `${pos.y}%`,
              }}
              transition={{
                layout: { type: "spring", stiffness: 60, damping: 25, mass: 1.2 },
                initial: { duration: 0.6, ease: "easeOut" }
              }}
              onMouseEnter={() => setHoveredMember(member.id)}
              onMouseLeave={() => setHoveredMember(null)}
              className={cn(
                "absolute -translate-x-1/2 -translate-y-1/2 cursor-pointer transition-all",
                hoveredMember === member.id ? "z-[100] scale-110" : "z-10"
              )}
            >
              <motion.div
                className="relative"
                animate={{
                  y: [0, -3, 0],
                }}
                transition={{
                  duration: 4 + (Math.random() * 2),
                  repeat: Infinity,
                  ease: "easeInOut"
                }}
              >
              <div className="relative">
                {/* Focused Aura */}
                {isEnfocado && (
                   <motion.div
                    animate={{ scale: [1, 1.3, 1], opacity: [0.1, 0.4, 0.1] }}
                    transition={{ duration: 4, repeat: Infinity }}
                    className="absolute -inset-8 bg-purple-500/20 rounded-full blur-3xl"
                   />
                )}

                {/* Avatar Shadow Circle (Organic feel) */}
                <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-8 h-2 bg-black/5 dark:bg-white/5 blur-sm rounded-full" />

                <TeamAvatar
                  member={member}
                  className={cn(
                    "w-14 h-14 ring-4 transition-all duration-700 ease-in-out",
                    isAusente ? "grayscale opacity-50 ring-zinc-100 dark:ring-zinc-800" : "ring-white dark:ring-zinc-900 shadow-[0_15px_35px_-10px_rgba(0,0,0,0.1)] scale-100 group-hover:scale-105"
                  )}
                />

                {/* Status Dot */}
                <div className={cn(
                  "absolute bottom-0 right-0 w-4 h-4 rounded-full border-[3px] border-white dark:border-zinc-900",
                  getStatusColor(member.status)
                )} />

                {/* Refined Tooltip - wider, shorter, matching label style */}
                <AnimatePresence>
                  {hoveredMember === member.id && (
                    <motion.div
                      initial={{ opacity: 0, y: 10, scale: 0.95 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: 10, scale: 0.95 }}
                      transition={{ type: "spring", stiffness: 400, damping: 30 }}
                      className="absolute -top-16 left-1/2 -translate-x-1/2 pointer-events-none whitespace-nowrap"
                    >
                      <div className="bg-white/95 dark:bg-zinc-900/95 text-zinc-900 dark:text-white px-5 py-3 rounded-2xl shadow-[0_20px_50px_-12px_rgba(0,0,0,0.25)] backdrop-blur-xl border border-white/40 dark:border-zinc-800/40 flex items-center gap-4 min-w-[320px]">
                        <div className="flex flex-col gap-0.5">
                           <span className="font-bold tracking-tight text-[13px]">{member.name}</span>
                           <div className="flex items-center gap-1.5">
                              <div className={cn("w-1.5 h-1.5 rounded-full", getStatusColor(member.status))} />
                              <span className={cn("text-[8px] font-black uppercase tracking-wider", getStatusTextColorClass(member.status))}>
                                {getStatusText(member.status)}
                              </span>
                           </div>
                        </div>

                        <div className="h-6 w-px bg-zinc-200 dark:bg-zinc-800" />

                        <div className="flex-1 flex flex-col justify-center">
                          <span className="text-zinc-600 dark:text-zinc-300 text-[11px] font-bold truncate max-w-[140px]">
                            {member.currentTask?.title || member.currentEvent?.title || member.role}
                          </span>
                        </div>

                        {member.currentEvent?.meetingLink && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              window.open(member.currentEvent.meetingLink, '_blank');
                            }}
                            className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 transition-colors cursor-pointer pointer-events-auto shadow-sm"
                          >
                            <Video className="w-3 h-3 text-white" />
                            <span className="text-[9px] font-bold uppercase tracking-tight">Unirse</span>
                          </button>
                        )}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
              </motion.div>
            </motion.div>
          );
        })}
      </AnimatePresence>

      {/* Legend */}
      <div className="absolute bottom-8 left-8 flex items-center gap-5 bg-white/70 dark:bg-zinc-900/70 backdrop-blur-md px-5 py-2.5 rounded-2xl border border-white/40 dark:border-zinc-800/40 shadow-sm">
         {[
           { color: 'bg-green-500', label: 'Libre' },
           { color: 'bg-purple-500', label: 'Foco' },
           { color: 'bg-orange-500', label: 'Ocupado' },
           { color: 'bg-slate-200', label: 'Reunión' },
           { color: 'bg-red-500', label: 'Permiso' },
         ].map((item, idx) => (
           <div key={idx} className="flex items-center gap-2">
             <div className={cn("w-2 h-2 rounded-full", item.color)} />
             <span className="text-[10px] font-black uppercase tracking-wider text-zinc-500 dark:text-zinc-400">{item.label}</span>
           </div>
         ))}
      </div>

      <button
        onClick={() => refetch()}
        className="absolute bottom-8 right-8 p-3 bg-white/80 dark:bg-zinc-900/80 hover:bg-white dark:hover:bg-zinc-800 border border-zinc-200/50 dark:border-zinc-800/50 rounded-2xl transition-all shadow-sm"
      >
        <Zap className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
      </button>
    </div>
  );
};

export default ActivityMap;
