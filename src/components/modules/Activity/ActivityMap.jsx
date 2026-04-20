import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Coffee, Video, Zap, Lock, Monitor, X, User } from 'lucide-react';
import { getApiBaseUrl } from '@/lib/apiBaseUrl';
import TeamAvatar from '@/components/ui/TeamAvatar';
import { cn } from '@/lib/utils';
import { motion, AnimatePresence } from 'framer-motion';

const Zone = ({ id, name, icon: Icon, children, className, isActive }) => (
  <div className={cn(
    "relative flex flex-col min-h-[180px] p-8 transition-all duration-700 rounded-[32px] border-2 border-dashed overflow-visible",
    isActive ? "border-fuchsia-500 bg-fuchsia-500/5 shadow-[0_0_40px_rgba(217,70,239,0.1)]" : "border-zinc-200/40 dark:border-zinc-800/40 bg-white/40 dark:bg-zinc-900/40",
    className
  )}>
    {/* Unified White Capsule Label - Top Left */}
    <div className="absolute -top-4 left-6 z-20">
      <div className="bg-white dark:bg-zinc-900 px-4 py-1.5 rounded-full border border-zinc-200/60 dark:border-zinc-800/60 shadow-sm flex items-center gap-2">
        <Icon className={cn("w-3.5 h-3.5", isActive ? "text-fuchsia-500" : "text-zinc-400")} />
        <span className="text-[10px] font-black uppercase tracking-[0.15em] text-zinc-500 dark:text-zinc-400">
          {name}
        </span>
      </div>
    </div>

    {/* Content Container */}
    <div className="relative flex-1 flex flex-wrap items-center justify-center gap-6">
      {children}
    </div>

    {/* Studio Neon Pulse Effect */}
    {id === 'estudio' && isActive && (
      <motion.div
        animate={{ opacity: [0.3, 0.6, 0.3] }}
        transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
        className="absolute inset-0 shadow-[inset_0_0_60px_rgba(217,70,239,0.2)] pointer-events-none rounded-[32px]"
      />
    )}
  </div>
);

const MemberAvatar = ({ member, hoveredMember, setHoveredMember }) => {
  const isEnfocado = member.status === 'ENFOCADO';
  const isAusente = member.status === 'AUSENTE';
  const timeoutRef = React.useRef(null);

  const handleMouseEnter = () => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    setHoveredMember(member.id);
  };

  const handleMouseLeave = () => {
    timeoutRef.current = setTimeout(() => {
      setHoveredMember(prev => prev === member.id ? null : prev);
    }, 300);
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'LIBRE': return 'bg-green-500';
      case 'ENFOCADO': return 'bg-purple-500 shadow-[0_0_15px_rgba(168,85,247,0.5)]';
      case 'OCUPADO': return 'bg-orange-500';
      case 'REUNION': return 'bg-zinc-300';
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
      case 'REUNION': return 'text-zinc-500';
      case 'PRODUCCION': return 'text-fuchsia-600 dark:text-fuchsia-400';
      case 'AUSENTE': return 'text-red-600 dark:text-red-400';
      default: return 'text-zinc-500';
    }
  };

  return (
    <motion.div
      layoutId={`member-${member.id}`}
      initial={{ opacity: 0, scale: 0.8 }}
      animate={{
        opacity: isAusente ? 0.6 : 1,
        scale: 1,
        y: [0, -4, 0] // Floating Latido effect
      }}
      exit={{ opacity: 0, scale: 0.8 }}
      transition={{
        type: "spring",
        stiffness: 150,
        damping: 20,
        y: {
          duration: 3 + Math.random() * 2,
          repeat: Infinity,
          ease: "easeInOut"
        }
      }}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      className={cn(
        "relative cursor-pointer transition-all",
        hoveredMember === member.id ? "z-[100] scale-110" : "z-30"
      )}
    >
      <div className="relative">
        {/* Aura Enfoque */}
        {isEnfocado && (
           <motion.div
            animate={{ scale: [1, 1.3, 1], opacity: [0.1, 0.3, 0.1] }}
            transition={{ duration: 4, repeat: Infinity }}
            className="absolute -inset-6 bg-purple-500/20 rounded-full blur-2xl"
           />
        )}

        <TeamAvatar
          member={member}
          className={cn(
            "w-12 h-12 ring-4 transition-all duration-700 ease-in-out",
            isAusente ? "grayscale opacity-50 ring-zinc-100 dark:ring-zinc-800" : "ring-white dark:ring-zinc-900 shadow-xl"
          )}
        />

        <div className={cn(
          "absolute bottom-0 right-0 w-3.5 h-3.5 rounded-full border-[2px] border-white dark:border-zinc-900",
          getStatusColor(member.status)
        )} />

        {/* Tooltip */}
        <AnimatePresence>
          {hoveredMember === member.id && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 10 }}
              transition={{ duration: 0.2 }}
              className="absolute bottom-full left-1/2 -translate-x-1/2 pb-4 z-[999]"
            >
              <div
                className="bg-white/95 dark:bg-zinc-900/95 text-zinc-900 dark:text-white px-4 py-3 rounded-2xl shadow-2xl backdrop-blur-xl border border-white/40 dark:border-zinc-800/40 flex items-center gap-3 min-w-[300px] pointer-events-auto"
                onMouseEnter={handleMouseEnter}
              >
                <div className="flex flex-col gap-0.5 flex-shrink-0">
                   <span className="font-bold text-[12px]">{member.name}</span>
                   <div className="flex items-center gap-1.5">
                      <div className={cn("w-1.5 h-1.5 rounded-full", getStatusColor(member.status))} />
                      <span className={cn("text-[8px] font-black uppercase tracking-wider", getStatusTextColorClass(member.status))}>
                        {getStatusText(member.status)}
                      </span>
                   </div>
                </div>
                <div className="h-4 w-px bg-zinc-200 dark:bg-zinc-800" />
                <div className="flex-1 flex items-center justify-between gap-4">
                  <p className="text-zinc-500 dark:text-zinc-400 text-[10px] font-medium leading-snug line-clamp-2">
                    {member.currentTask?.title || member.currentEvent?.title || member.role}
                  </p>

                  {/* UNIRSE Button for Meetings */}
                  {member.status === 'REUNION' && member.currentEvent?.meetingLink && (
                    <a
                      href={member.currentEvent.meetingLink}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex-shrink-0 px-3 py-1.5 bg-indigo-600 text-white text-[9px] font-bold rounded-xl hover:bg-indigo-700 transition-colors flex items-center gap-1.5"
                    >
                      <Video className="w-3 h-3" />
                      UNIRSE
                    </a>
                  )}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
};

const ActivityMap = () => {
  const [hoveredMember, setHoveredMember] = useState(null);

  const { data: teamStatus = [], isLoading, refetch } = useQuery({
    queryKey: ['team-activity-status'],
    queryFn: async () => {
      const res = await fetch(`${getApiBaseUrl()}/api/activity/status`);
      if (!res.ok) throw new Error('Failed to fetch status');
      return res.json();
    },
    refetchInterval: 15000,
  });

  if (isLoading) {
    return (
      <div className="w-full h-[600px] flex items-center justify-center bg-white dark:bg-zinc-900 rounded-[40px] border border-zinc-200">
        <div className="w-8 h-8 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  // Filtrado de miembros por zona
  const membersByZone = {
    permiso: teamStatus.filter(m => m.status === 'AUSENTE'),
    estudio: teamStatus.filter(m => m.status === 'PRODUCCION'),
    bunker: teamStatus.filter(m => m.status === 'REUNION'),
    cafe: [], // Pureza visual: café is for aesthetics or manual break (empty for now)
    nave: teamStatus.filter(m =>
      ['ENFOCADO', 'OCUPADO', 'LIBRE'].includes(m.status) ||
      (!m.status && m.status !== 'AUSENTE' && m.status !== 'PRODUCCION' && m.status !== 'REUNION')
    ),
  };

  const isProductionActive = membersByZone.estudio.length > 0;

  return (
    <div className="relative w-full p-16 md:p-24 min-h-[900px] bg-[#f8f9fc] dark:bg-zinc-950 rounded-[40px] border border-zinc-200/50 dark:border-zinc-800/50 shadow-xl overflow-hidden">
      {/* Background Dotted Grid */}
      <div className="absolute inset-0 opacity-[0.05] dark:opacity-[0.1] pointer-events-none"
           style={{ backgroundImage: 'radial-gradient(circle, currentColor 1.5px, transparent 1.5px)', backgroundSize: '32px 32px' }}
      />

      {/* Main Architectural Grid: 25% | 50% | 25% */}
      <div className="relative z-10 grid grid-cols-[1fr_2fr_1fr] gap-[60px]">

        {/* Columna Izquierda: Soporte (Permiso > Producción) */}
        <div className="flex flex-col gap-[60px]">
          <Zone id="permiso" name="De permiso" icon={User} className="h-[220px]">
            {membersByZone.permiso.map(m => (
              <MemberAvatar key={m.id} member={m} hoveredMember={hoveredMember} setHoveredMember={setHoveredMember} />
            ))}
          </Zone>

          <Zone id="estudio" name="Jornadas de producción" icon={Video} className="h-[380px]" isActive={isProductionActive}>
            {membersByZone.estudio.map(m => (
              <MemberAvatar key={m.id} member={m} hoveredMember={hoveredMember} setHoveredMember={setHoveredMember} />
            ))}
          </Zone>
        </div>

        {/* Columna Central: Operación Vertical (Sala de Juntas > Oficina Central) */}
        <div className="flex flex-col gap-[60px]">
          <Zone id="bunker" name="Sala de juntas" icon={Lock} className="h-[180px]">
            {membersByZone.bunker.map(m => (
              <MemberAvatar key={m.id} member={m} hoveredMember={hoveredMember} setHoveredMember={setHoveredMember} />
            ))}
          </Zone>

          <Zone id="nave" name="Oficina central" icon={Zap} className="h-[520px] bg-indigo-50/20 dark:bg-indigo-900/5">
            {/* Escritorios 3x3 */}
            <div className="absolute inset-0 p-10 grid grid-cols-3 grid-rows-3 gap-10 opacity-[0.03] dark:opacity-[0.06] pointer-events-none">
              {[...Array(9)].map((_, i) => (
                <div key={i} className="bg-zinc-400 dark:bg-white rounded-xl flex items-center justify-center border-2 border-zinc-300">
                  <Monitor className="w-8 h-8" />
                </div>
              ))}
            </div>

            {/* Miembros en Oficina */}
            <div className="relative z-10 grid grid-cols-3 gap-x-12 gap-y-16 p-6">
              {membersByZone.nave.map(m => (
                <div key={m.id} className="flex items-center justify-center">
                  <MemberAvatar member={m} hoveredMember={hoveredMember} setHoveredMember={setHoveredMember} />
                </div>
              ))}
            </div>
          </Zone>
        </div>

        {/* Columna Derecha: Wellness (Cafecito) */}
        <div className="flex flex-col justify-end">
          <Zone id="cafe" name="Cafecito time" icon={Coffee} className="h-[380px]">
            {/* Mesa Circular Decorativa */}
            <div className="absolute inset-0 flex items-center justify-center opacity-[0.03] dark:opacity-[0.06] pointer-events-none">
              <div className="w-40 h-40 border-[8px] border-zinc-400 dark:border-white rounded-full" />
            </div>
            {membersByZone.cafe.map(m => (
              <MemberAvatar key={m.id} member={m} hoveredMember={hoveredMember} setHoveredMember={setHoveredMember} />
            ))}
          </Zone>
        </div>
      </div>

      {/* Legend & Controls */}
      <div className="absolute bottom-10 left-10 flex items-center gap-6 bg-white/80 dark:bg-zinc-900/80 backdrop-blur-md px-6 py-3 rounded-2xl border border-zinc-200/50 dark:border-zinc-800/50 shadow-lg z-50">
        {[
          { color: 'bg-green-500', label: 'Libre' },
          { color: 'bg-purple-500', label: 'Foco' },
          { color: 'bg-orange-500', label: 'Ocupado' },
          { color: 'bg-zinc-300', label: 'Reunión' },
          { color: 'bg-fuchsia-500', label: 'Producción' },
          { color: 'bg-red-500', label: 'Permiso' },
        ].map((item, idx) => (
          <div key={idx} className="flex items-center gap-2">
            <div className={cn("w-2 h-2 rounded-full", item.color)} />
            <span className="text-[10px] font-black uppercase tracking-wider text-zinc-500">{item.label}</span>
          </div>
        ))}
      </div>

      <div className="absolute bottom-10 right-10 flex flex-col gap-3 z-50">
        <div className="flex gap-3 justify-end">
          <button onClick={() => refetch()} className="p-3.5 bg-white/80 dark:bg-zinc-900/80 hover:bg-white border border-zinc-200 rounded-2xl transition-all shadow-sm">
            <Zap className="w-4 h-4 text-indigo-600" />
          </button>
        </div>
      </div>
    </div>
  );
};

export default ActivityMap;
