import React, { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Coffee, Video, Users, User, Zap, Lock, Info } from 'lucide-react';
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
  const areas = [
    { id: 'estudio', name: 'Jornadas de producción', icon: Video, x: 5, y: 30, w: 25, h: 40, color: 'fuchsia' },
    { id: 'nave', name: 'Oficina central', icon: Zap, x: 35, y: 15, w: 30, h: 70, color: 'indigo' },
    { id: 'bunker', name: 'Sala de juntas', icon: Lock, x: 35, y: 2, w: 30, h: 10, color: 'slate' },
    { id: 'cafe', name: 'Cafecito time', icon: Coffee, x: 70, y: 30, w: 25, h: 40, color: 'orange' },
    { id: 'permiso', name: 'De permiso', icon: User, x: 5, y: 2, w: 25, h: 20, color: 'red' },
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
    // 1. Determine Zone base position
    let basePos = { x: 50, y: 50 };

    if (member.status === 'AUSENTE') {
      basePos = { x: 17, y: 12 }; // De permiso
    } else if (member.status === 'PRODUCCION') {
      basePos = { x: 17, y: 50 }; // Jornadas de producción
    } else if (member.status === 'REUNION') {
      basePos = { x: 50, y: 7 };  // Sala de juntas
    } else if (member.status === 'LIBRE') {
      basePos = { x: 82, y: 50 }; // Cafecito time
    } else {
      // Oficina central (Escritorio)
      if (member.desktopX && member.desktopY) {
        return { x: member.desktopX, y: member.desktopY };
      }
      const idx = teamStatus.indexOf(member);
      basePos = {
        x: 40 + (idx % 3) * 10,
        y: 25 + Math.floor(idx / 3) * 12
      };
      return basePos; // Desks are fixed, no clustering needed
    }

    // 2. Apply Clustering (Separación Orgánica) for shared areas
    // Find how many people are in the same status/zone
    const membersInZone = teamStatus.filter(m => m.status === member.status);
    const memberIndex = membersInZone.findIndex(m => m.id === member.id);
    const count = membersInZone.length;

    if (count > 1) {
      // Use distinct radius and spacing for different zones
      const isLargeZone = member.status === 'LIBRE' || member.status === 'AUSENTE';
      const angle = (memberIndex / count) * Math.PI * 2;
      const radius = isLargeZone ? 6 : 4;

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
            "absolute border-2 border-dashed transition-all duration-700 rounded-3xl flex flex-col items-center justify-start pt-4",
            area.id === 'estudio' && isProductionActive ? "border-fuchsia-500 bg-fuchsia-500/5" : "border-zinc-200 dark:border-zinc-800",
            area.id === 'nave' && "bg-slate-50/30 dark:bg-zinc-800/10"
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

          {/* Studio Neon Effect (Soft Glow Pulse - "Latido Creativo") */}
          {area.id === 'estudio' && isProductionActive && (
             <motion.div
               animate={{
                 opacity: [0.3, 0.6, 0.3],
                 scale: [1, 1.02, 1]
               }}
               transition={{
                 duration: 4,
                 repeat: Infinity,
                 ease: "easeInOut"
               }}
               className="absolute inset-0 shadow-[inset_0_0_60px_rgba(217,70,239,0.4)] pointer-events-none rounded-3xl border-2 border-fuchsia-500"
             />
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
              initial={{ opacity: 0, y: 20, scale: 0.8 }}
              animate={{
                opacity: isAusente ? 0.6 : 1,
                y: 0,
                scale: 1,
                left: `${pos.x}%`,
                top: `${pos.y}%`,
              }}
              transition={{
                layout: { type: "spring", stiffness: 50, damping: 20, mass: 1.5 },
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
                  y: [0, -4, 0],
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
                    animate={{ scale: [1, 1.2, 1], opacity: [0.1, 0.3, 0.1] }}
                    transition={{ duration: 4, repeat: Infinity }}
                    className="absolute -inset-6 bg-purple-500/20 rounded-full blur-2xl"
                   />
                )}

                {/* Desktop Background (only in Nave - "Oficina Central") */}
                {!['AUSENTE', 'REUNION', 'PRODUCCION', 'LIBRE'].includes(member.status) && (
                  <div className="absolute top-8 left-1/2 -translate-x-1/2 w-8 h-4 bg-zinc-100 dark:bg-zinc-800 rounded-t-sm border border-zinc-200 dark:border-zinc-700 opacity-50" />
                )}

                <TeamAvatar
                  member={member}
                  className={cn(
                    "w-12 h-12 ring-4 transition-all duration-700 ease-in-out",
                    isAusente ? "grayscale opacity-60 ring-zinc-100 dark:ring-zinc-800" : "ring-white dark:ring-zinc-900 shadow-2xl scale-100 group-hover:scale-110"
                  )}
                />

                {/* Status Dot */}
                <div className={cn(
                  "absolute bottom-0 right-0 w-3.5 h-3.5 rounded-full border-2 border-white dark:border-zinc-900",
                  getStatusColor(member.status)
                )} />

                {/* Clean UI Tooltip (Hover-First) - ZEN Style */}
                <AnimatePresence>
                  {hoveredMember === member.id && (
                    <motion.div
                      initial={{ opacity: 0, y: 10, scale: 0.9 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: 10, scale: 0.9 }}
                      transition={{ type: "spring", stiffness: 300, damping: 25 }}
                      className="absolute -top-24 left-1/2 -translate-x-1/2 pointer-events-none whitespace-nowrap"
                    >
                      <div className="bg-white/95 dark:bg-zinc-900/95 text-zinc-900 dark:text-white text-[11px] px-6 py-4 rounded-[24px] shadow-[0_25px_60px_-15px_rgba(0,0,0,0.2)] backdrop-blur-2xl border border-white/20 dark:border-zinc-800/50 flex flex-col items-center gap-2 min-w-[220px]">
                        <span className="font-bold tracking-tight text-sm">{member.name}</span>

                        <div className="flex items-center gap-2 px-2.5 py-1 bg-zinc-100 dark:bg-zinc-800/50 rounded-full">
                           <div className={cn("w-1.5 h-1.5 rounded-full", getStatusColor(member.status))} />
                           <span className={cn("text-[9px] font-black uppercase tracking-[0.1em]", getStatusTextColorClass(member.status))}>
                            {getStatusText(member.status)}
                           </span>
                        </div>

                        <div className="flex flex-col items-center max-w-[200px]">
                          <span className="text-zinc-600 dark:text-zinc-300 text-[11px] font-bold text-center leading-snug whitespace-normal">
                            {member.currentTask?.title || member.currentEvent?.title || member.role}
                          </span>

                          {member.currentEvent?.description && (
                            <p className="text-[10px] text-zinc-400 dark:text-zinc-500 font-medium text-center mt-1.5 leading-relaxed whitespace-normal opacity-80">
                              {member.currentEvent.description}
                            </p>
                          )}
                        </div>

                        {member.currentEvent?.meetingLink && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              window.open(member.currentEvent.meetingLink, '_blank');
                            }}
                            className="mt-2 flex items-center gap-1.5 px-4 py-1.5 bg-indigo-600 text-white rounded-full animate-pulse-subtle hover:bg-indigo-700 transition-colors cursor-pointer pointer-events-auto"
                          >
                            <Video className="w-3 h-3 text-white" />
                            <span className="text-[9px] font-bold uppercase tracking-tighter">¿Quieres unirte?</span>
                          </button>
                        )}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
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
