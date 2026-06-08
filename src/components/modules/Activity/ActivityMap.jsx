import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Coffee, Video, Zap, Lock, Monitor, X, User, UserX, Trash2, Clock, FileText } from 'lucide-react';
import { getApiBaseUrl } from '@/lib/apiBaseUrl';
import TeamAvatar from '@/components/ui/TeamAvatar';
import { cn } from '@/lib/utils';
import { motion } from 'framer-motion';
import { toast } from 'react-hot-toast';
import { useAuth } from '@/context/AuthContext';
import { getFloatingCardPosition } from '@/lib/floatingCardPosition';

const Zone = ({ id, name, icon: Icon, children, className, isActive }) => (
  <div className={cn(
    "relative flex flex-col min-h-[180px] p-10 transition-all duration-700 rounded-[32px] border-2 border-dashed overflow-visible",
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
    <div className="relative flex-1 flex flex-wrap items-center justify-center gap-4">
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

const MemberActivityCard = ({
  member, isAdmin, onDeleteEvent, cardRef, cardPosition, handleMouseEnter, handleMouseLeave, getStatusColor, getStatusTextColorClass, getStatusText
}) => (
  <aside
    ref={cardRef}
    data-activity-floating-card="member"
    className="fixed pointer-events-auto animate-in fade-in duration-150 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-white p-5 rounded-[2rem] shadow-[0_30px_60px_rgba(0,0,0,0.4)] border border-zinc-200 dark:border-zinc-800 flex flex-col gap-4 min-w-[340px]"
    style={{
      left: cardPosition.left,
      top: cardPosition.top,
      zIndex: 2147483647
    }}
    onMouseEnter={handleMouseEnter}
    onMouseLeave={handleMouseLeave}
    onPointerEnter={handleMouseEnter}
    onPointerLeave={handleMouseLeave}
    role="dialog"
    aria-label={`Actividad de ${member.name}`}
  >
      {/* Header Info */}
      <div className="flex items-center justify-between">
        <div className="flex flex-col gap-1">
           <span className="font-bold text-sm tracking-tight">{member.name}</span>
           <div className="flex items-center gap-2">
              <div className={cn("w-2 h-2 rounded-full", getStatusColor(member.status))} />
              <span className={cn("text-[9px] font-black uppercase tracking-[0.1em]", getStatusTextColorClass(member.status))}>
                {getStatusText(member.status)}
              </span>
           </div>
        </div>
        {isAdmin && member.currentEvent?.id && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onDeleteEvent(member.currentEvent.id);
            }}
            className="p-2 bg-red-50 dark:bg-red-900/20 text-red-500 hover:bg-red-100 rounded-xl transition-all shadow-sm"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        )}
      </div>

      <div className="h-px w-full bg-zinc-100 dark:bg-zinc-800" />

      {/* Event/Task Content */}
      <div className="space-y-3">
        <div className="flex items-start gap-3">
           <div className="p-2 bg-indigo-50 dark:bg-indigo-900/20 rounded-lg">
              <FileText className="w-3.5 h-3.5 text-indigo-500" />
           </div>
           <div className="flex-1">
              <p className="text-zinc-800 dark:text-zinc-200 text-[11px] font-bold leading-tight">
                {member.currentTask?.title || member.currentEvent?.title || member.role}
              </p>
              {member.currentEvent?.type && (
                 <span className="text-[9px] font-black uppercase tracking-widest text-zinc-400 mt-1 block">
                    {member.currentEvent.type}
                 </span>
              )}
           </div>
        </div>

        {member.currentEvent && (
          <div className="flex items-center gap-2 text-[10px] font-bold text-zinc-500 dark:text-zinc-400 bg-zinc-50 dark:bg-zinc-800/40 p-2 rounded-xl">
            <Clock className="w-3 h-3" />
            <span>Actividad Programada</span>
          </div>
        )}

        {(member.currentEvent?.description || member.currentTask?.description) && (
          <p className="text-[10px] text-zinc-500 dark:text-zinc-400 leading-relaxed line-clamp-3 pl-1">
            {member.currentEvent?.description || member.currentTask?.description}
          </p>
        )}
      </div>

      {/* Action Buttons */}
      <div className="flex gap-2">
        {member.status === 'REUNION' && member.currentEvent?.meetingLink && (
          <a
            href={member.currentEvent.meetingLink}
            target="_blank"
            rel="noopener noreferrer"
            className="flex-1 px-4 py-2 bg-indigo-600 text-white text-[10px] font-black uppercase tracking-widest rounded-xl hover:bg-indigo-700 transition-all flex items-center justify-center gap-2 shadow-lg shadow-indigo-600/20"
          >
            <Video className="w-3.5 h-3.5" />
            Entrar a Reunión
          </a>
        )}
      </div>
  </aside>
);

const MemberAvatar = ({ member, hoveredMember, setHoveredMember, onDeleteEvent }) => {
  const { currentUser } = useAuth();
  const isAdmin = currentUser?.role === 'ADMIN' || currentUser?.role === 'PM';
  const isEnfocado = member.status === 'ENFOCADO';
  const isAusente = member.status === 'AUSENTE';
  const timeoutRef = React.useRef(null);
  const [cardPosition, setCardPosition] = useState({ left: 16, top: 16, placement: 'bottom' });
  const avatarRef = React.useRef(null);
  const cardRef = React.useRef(null);
  const isCardOpen = hoveredMember === member.id;

  const handleMouseEnter = () => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    if (avatarRef.current) {
        const rect = avatarRef.current.getBoundingClientRect();
        setCardPosition(getFloatingCardPosition(
          rect,
          { width: 340, height: 300 },
          { width: window.innerWidth, height: window.innerHeight }
        ));
    }
    setHoveredMember(member.id);
  };

  const handleMouseLeave = () => {
    timeoutRef.current = setTimeout(() => {
      setHoveredMember(prev => prev === member.id ? null : prev);
    }, 300);
  };
  React.useLayoutEffect(() => {
    if (!isCardOpen || !avatarRef.current || !cardRef.current) return;

    const triggerRect = avatarRef.current.getBoundingClientRect();
    const cardRect = cardRef.current.getBoundingClientRect();
    setCardPosition(getFloatingCardPosition(
      triggerRect,
      { width: cardRect.width, height: cardRect.height },
      { width: window.innerWidth, height: window.innerHeight }
    ));
  }, [isCardOpen, member.id]);


  const getStatusColor = (status) => {
    switch (status) {
      case 'LIBRE': return 'border-green-500';
      case 'ENFOCADO': return 'border-purple-500 shadow-[0_0_15px_rgba(168,85,247,0.5)]';
      case 'OCUPADO': return 'border-orange-500';
      case 'REUNION': return 'border-zinc-400'; // Grayish
      case 'PRODUCCION': return 'border-fuchsia-500';
      case 'AUSENTE': return 'border-red-900'; // Dark Red
      default: return 'border-zinc-200';
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
      case 'OFFLINE': return 'DESCONECTADO';
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
      case 'OFFLINE': return 'text-zinc-500';
      default: return 'text-zinc-500';
    }
  };

  return (
    <>
      <motion.button
        ref={avatarRef}
        type="button"
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
        onPointerEnter={handleMouseEnter}
        onPointerLeave={handleMouseLeave}
        onFocus={handleMouseEnter}
        onClick={handleMouseEnter}
        onBlur={handleMouseLeave}
        aria-expanded={isCardOpen}
        aria-haspopup="dialog"
        aria-label={`Ver actividad de ${member.name}`}
        className={cn(
          "relative outline-none focus:outline-none focus:ring-0 focus-visible:ring-0 focus-visible:outline-none transition-all",
          isCardOpen ? "z-[100] scale-110" : "z-30"
        )}
      >
        <div className="relative pointer-events-none">
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
            showTitle={false}
            className={cn(
              "w-14 h-14 border-[3px] transition-all duration-700 ease-in-out bg-white dark:bg-zinc-900",
              getStatusColor(member.status)
            )}
          />
        </div>
      </motion.button>

      {/* Direct portal: avoid animation ownership interfering with hover visibility. */}
      {isCardOpen && createPortal(
          <MemberActivityCard
            member={member}
            isAdmin={isAdmin}
            onDeleteEvent={onDeleteEvent}
            cardRef={cardRef}
            cardPosition={cardPosition}
            handleMouseEnter={handleMouseEnter}
            handleMouseLeave={handleMouseLeave}
            getStatusColor={getStatusColor}
            getStatusTextColorClass={getStatusTextColorClass}
            getStatusText={getStatusText}
          />,
          document.body
        )}
    </>
  );
};

const ActivityMap = () => {
  const [hoveredMember, setHoveredMember] = useState(null);

  const queryClient = useQueryClient();
  const { data: teamStatus = [], isLoading, refetch } = useQuery({
    queryKey: ['team-activity-status'],
    queryFn: async () => {
      const res = await fetch(`${getApiBaseUrl()}/api/activity/status`);
      if (!res.ok) throw new Error('Failed to fetch status');
      return res.json();
    },
    refetchInterval: localStorage.getItem("authToken") ? 5000 : false, // Zero latency feel
  });

  const deleteMutation = useMutation({
    mutationFn: async (id) => {
      const res = await fetch(`${getApiBaseUrl()}/api/activity/events/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed to delete event');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries(['team-activity-status']);
      queryClient.invalidateQueries(['operational-events']);
      toast.success('Evento eliminado');
    }
  });

  const handleDeleteEvent = (id) => {
    if (window.confirm('¿Deseas eliminar este evento?')) {
        deleteMutation.mutate(id);
    }
  };

  if (isLoading) {
    return (
      <div className="w-full h-[600px] flex items-center justify-center bg-white dark:bg-zinc-900 rounded-[40px] border border-zinc-200">
        <div className="w-8 h-8 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  // Filtrado de miembros por zona (BS-OFFICE-V4-FINAL)
  // Siempre visibles. Default: Oficina Central (Libre)
  const membersByZone = {
    permiso: teamStatus.filter(m => m.status === 'AUSENTE'),
    bunker: teamStatus.filter(m => m.status === 'REUNION'),
    foco: teamStatus.filter(m => m.status === 'ENFOCADO'),
    estudio: teamStatus.filter(m => m.status === 'PRODUCCION'),
    nave: teamStatus.filter(m => m.status === 'OCUPADO' || m.status === 'LIBRE'),
    cafe: teamStatus.filter(m => m.currentEvent?.type === 'BREAK' || m.currentEvent?.title?.toLowerCase().includes('café')),
  };

  // Logic override: If in 'cafe' event but nave list includes them, prioritize cafe visualization
  const cafeIds = membersByZone.cafe.map(m => m.id);
  membersByZone.nave = membersByZone.nave.filter(m => !cafeIds.includes(m.id));

  const isProductionActive = membersByZone.estudio.length > 0;

  return (
    <div className="relative w-full p-12 md:p-16 min-h-[1000px] bg-[#fdfdfd] dark:bg-zinc-950 rounded-[40px] border border-zinc-200/50 dark:border-zinc-800/50 shadow-2xl overflow-visible">
      {/* Background Dotted Grid */}
      <div className="absolute inset-0 opacity-[0.03] dark:opacity-[0.08] pointer-events-none rounded-[40px] overflow-hidden"
           style={{ backgroundImage: 'radial-gradient(circle, currentColor 1.5px, transparent 1.5px)', backgroundSize: '40px 40px' }}
      />

      <div className="relative z-10 flex flex-col gap-8">

        {/* FILA SUPERIOR: Permiso | Bunker | Foco */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-10 items-start">
          <Zone id="permiso" name="Zona de Permiso" icon={User} className="h-[280px] bg-red-50/10 dark:bg-red-900/5">
            {membersByZone.permiso.map(m => (
              <MemberAvatar key={m.id} member={m} hoveredMember={hoveredMember} setHoveredMember={setHoveredMember} onDeleteEvent={handleDeleteEvent} />
            ))}
          </Zone>

          <Zone id="bunker" name="Sala de Juntas" icon={Lock} className="h-[280px] bg-zinc-50/50 dark:bg-zinc-900/50">
            {membersByZone.bunker.map(m => (
              <MemberAvatar key={m.id} member={m} hoveredMember={hoveredMember} setHoveredMember={setHoveredMember} onDeleteEvent={handleDeleteEvent} />
            ))}
          </Zone>

          <Zone id="foco" name="Zona de Foco" icon={Zap} className="h-[280px] bg-purple-50/10 dark:bg-purple-900/5">
            {membersByZone.foco.map(m => (
              <MemberAvatar key={m.id} member={m} hoveredMember={hoveredMember} setHoveredMember={setHoveredMember} onDeleteEvent={handleDeleteEvent} />
            ))}
          </Zone>
        </div>

        {/* FILA INFERIOR: Producción | Oficina Central (40%) | Cafecito */}
        <div className="grid grid-cols-1 lg:grid-cols-[28%_40%_28%] gap-10 items-stretch justify-center">
          <Zone id="estudio" name="Producción" icon={Video} className="h-[500px]" isActive={isProductionActive}>
            {membersByZone.estudio.map(m => (
              <MemberAvatar key={m.id} member={m} hoveredMember={hoveredMember} setHoveredMember={setHoveredMember} onDeleteEvent={handleDeleteEvent} />
            ))}
          </Zone>

          <Zone id="nave" name="Oficina Central" icon={Monitor} className="h-[500px] bg-indigo-50/5 dark:bg-indigo-900/5">
             {/* 40% Width implied by 2fr in the 1-2-1 grid */}
             <div className="absolute inset-0 p-10 grid grid-cols-4 grid-rows-3 gap-8 opacity-[0.02] pointer-events-none">
              {[...Array(12)].map((_, i) => (
                <div key={i} className="border-2 border-zinc-200 dark:border-zinc-800 rounded-2xl" />
              ))}
            </div>
            <div className="relative z-10 grid grid-cols-4 gap-8">
              {membersByZone.nave.map(m => (
                <MemberAvatar key={m.id} member={m} hoveredMember={hoveredMember} setHoveredMember={setHoveredMember} onDeleteEvent={handleDeleteEvent} />
              ))}
            </div>
          </Zone>

          <Zone id="cafe" name="Cafecito Time" icon={Coffee} className="h-[500px] bg-orange-50/10 dark:bg-orange-900/5">
            {membersByZone.cafe.map(m => (
              <MemberAvatar key={m.id} member={m} hoveredMember={hoveredMember} setHoveredMember={setHoveredMember} onDeleteEvent={handleDeleteEvent} />
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
          { color: 'bg-zinc-400', label: 'Reunión' },
          { color: 'bg-fuchsia-500', label: 'Producción' },
          { color: 'bg-red-900', label: 'Permiso' },
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
