import React, { useState, useRef, useLayoutEffect, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Coffee, Video, Zap, Lock, Monitor, User, Trash2 } from '@/components/ui/icons';
import { getApiBaseUrl } from '@/lib/apiBaseUrl';
import TeamAvatar from '@/components/ui/TeamAvatar';
import { cn } from '@/lib/utils';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'react-hot-toast';
import { useAuth } from '@/context/AuthContext';
import { getFloatingCardPosition } from '@/lib/floatingCardPosition';
import MemberActivityCard from './MemberActivityCard';

const getAuthHeaders = () => ({
  Authorization: `Bearer ${localStorage.getItem('authToken')}`
});

const Zone = ({ id, name, icon: Icon, children, className, isActive }) => (
  <div className={cn(
    "relative flex flex-col min-h-[180px] p-10 transition-all duration-700 rounded-[32px] border-2 border-dashed overflow-visible",
    isActive ? "border-fuchsia-500 bg-fuchsia-500/5 shadow-[0_0_40px_rgba(217,70,239,0.1)]" : "border-zinc-200/40 dark:border-zinc-800/40 bg-white/40 dark:bg-zinc-900/40",
    className
  )}>
    <div className="absolute -top-4 left-6 z-20">
      <div className="bg-white dark:bg-zinc-900 px-4 py-1.5 rounded-full border border-zinc-200/60 dark:border-zinc-800/60 shadow-sm flex items-center gap-2">
        <Icon className={cn("w-3.5 h-3.5", isActive ? "text-fuchsia-500" : "text-zinc-400")} />
        <span className="text-[10px] font-black uppercase tracking-[0.15em] text-zinc-500 dark:text-zinc-400">
          {name}
        </span>
      </div>
    </div>
    <div className="relative flex-1 flex flex-wrap items-center justify-center gap-4">
      {children}
    </div>
    {id === 'estudio' && isActive && (
      <motion.div
        animate={{ opacity: [0.3, 0.6, 0.3] }}
        transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
        className="absolute inset-0 shadow-[inset_0_0_60px_rgba(217,70,239,0.2)] pointer-events-none rounded-[32px]"
      />
    )}
  </div>
);

const MemberAvatar = ({ member, hoveredMemberId, setHoveredMemberId, onDeleteEvent, onRectUpdate, handlePointerLeave }) => {
  const isEnfocado = member.status === 'ENFOCADO';
  const isAusente = member.status === 'AUSENTE';
  const avatarRef = useRef(null);

  const handlePointerEnter = () => {
    if (avatarRef.current) {
        onRectUpdate(member, avatarRef.current.getBoundingClientRect());
    }
    setHoveredMemberId(member.id);
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'LIBRE': return 'border-green-500';
      case 'ENFOCADO': return 'border-purple-500 shadow-[0_0_15px_rgba(168,85,247,0.5)]';
      case 'OCUPADO': return 'border-orange-500';
      case 'REUNION': return 'border-zinc-400';
      case 'PRODUCCION': return 'border-fuchsia-500';
      case 'AUSENTE': return 'border-red-900';
      default: return 'border-zinc-200';
    }
  };

  return (
    <motion.button
      ref={avatarRef}
      type="button"
      layoutId={`member-${member.id}`}
      initial={{ opacity: 0, scale: 0.8 }}
      animate={{
        opacity: isAusente ? 0.6 : 1,
        scale: 1,
        y: [0, -4, 0]
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
      onPointerEnter={handlePointerEnter}
      onPointerLeave={handlePointerLeave}
      onFocus={handlePointerEnter}
      onClick={handlePointerEnter}
      onBlur={handlePointerLeave}
      className={cn(
        "relative outline-none focus:outline-none focus:ring-0 transition-all",
        hoveredMemberId === member.id ? "z-[100] scale-110" : "z-30"
      )}
    >
      <div className="relative pointer-events-none">
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
  );
};

const ActivityMap = () => {
  const { currentUser } = useAuth();
  const isAdmin = currentUser?.role === 'ADMIN' || currentUser?.role === 'PROJECT_MANAGER';
  const queryClient = useQueryClient();

  const [hoveredMemberId, setHoveredMemberId] = useState(null);
  const [hoveredData, setHoveredData] = useState(null); // Working data for calculation
  const [activeCardData, setActiveCardData] = useState(null); // Data currently being rendered
  const [isCardOpen, setIsCardOpen] = useState(false);
  const cardRef = useRef(null);
  const closeTimerRef = useRef(null);

  const { data: teamStatus = [], isLoading, refetch } = useQuery({
    queryKey: ['team-activity-status'],
    queryFn: async () => {
      const res = await fetch(`${getApiBaseUrl()}/api/activity/status`, { headers: getAuthHeaders() });
      if (!res.ok) throw new Error('Failed to fetch status');
      return res.json();
    },
    refetchInterval: localStorage.getItem("authToken") ? 5000 : false,
  });

  const deleteMutation = useMutation({
    mutationFn: async (id) => {
      const res = await fetch(`${getApiBaseUrl()}/api/activity/events/${id}`, { method: 'DELETE', headers: getAuthHeaders() });
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

  const handlePointerLeave = () => {
    if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
    closeTimerRef.current = setTimeout(() => {
        setIsCardOpen(false);
        setHoveredMemberId(null);
        closeTimerRef.current = null;
    }, 300);
  };

  const handleRectUpdate = (member, rect) => {
    // Immediate position calculation to break the loop and prevent jumps
    const cardWidth = 320; // Estimated or standard width
    const cardHeight = 200; // Estimated or standard height

    const position = getFloatingCardPosition(
      rect,
      { width: cardWidth, height: cardHeight },
      { width: window.innerWidth, height: window.innerHeight }
    );

    setHoveredData({ member, rect });
    setActiveCardData({ member, position });
    setIsCardOpen(true);

    if (closeTimerRef.current) {
        clearTimeout(closeTimerRef.current);
        closeTimerRef.current = null;
    }
  };

  // Keep activeCardData stable during exit
  useLayoutEffect(() => {
    if (!isCardOpen) {
      // We keep activeCardData as is so the exit animation has valid coordinates
      return;
    }

    if (hoveredData?.rect && cardRef.current) {
      const cardRect = cardRef.current.getBoundingClientRect();
      const position = getFloatingCardPosition(
        hoveredData.rect,
        { width: cardRect.width, height: cardRect.height },
        { width: window.innerWidth, height: window.innerHeight }
      );

      setActiveCardData({
          member: hoveredData.member,
          position
      });
    }
  }, [isCardOpen, hoveredData?.member.id, hoveredData?.rect]);

  if (isLoading) {
    return (
      <div className="w-full h-[600px] flex items-center justify-center bg-white dark:bg-zinc-900 rounded-[40px] border border-zinc-200">
        <div className="w-8 h-8 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const membersByZone = {
    permiso: teamStatus.filter(m => m.status === 'AUSENTE'),
    bunker: teamStatus.filter(m => m.status === 'REUNION'),
    foco: teamStatus.filter(m => m.status === 'ENFOCADO'),
    estudio: teamStatus.filter(m => m.status === 'PRODUCCION'),
    nave: teamStatus.filter(m => m.status === 'OCUPADO' || m.status === 'LIBRE'),
    cafe: teamStatus.filter(m => m.currentEvent?.type === 'BREAK' || m.currentEvent?.title?.toLowerCase().includes('café')),
  };

  const cafeIds = membersByZone.cafe.map(m => m.id);
  membersByZone.nave = membersByZone.nave.filter(m => !cafeIds.includes(m.id));
  const isProductionActive = membersByZone.estudio.length > 0;

  return (
    <div className="relative w-full p-12 md:p-16 min-h-[1000px] bg-[#fdfdfd] dark:bg-zinc-950 rounded-[40px] border border-zinc-200/50 dark:border-zinc-800/50 shadow-2xl overflow-visible">
      <div className="absolute inset-0 opacity-[0.03] dark:opacity-[0.08] pointer-events-none rounded-[40px] overflow-hidden"
           style={{ backgroundImage: 'radial-gradient(circle, currentColor 1.5px, transparent 1.5px)', backgroundSize: '40px 40px' }}
      />
      <div className="relative z-10 flex flex-col gap-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-10 items-start">
          <Zone id="permiso" name="Zona de Permiso" icon={User} className="h-[280px] bg-red-50/10 dark:bg-red-900/5">
            {membersByZone.permiso.map(m => (
              <MemberAvatar key={m.id} member={m} hoveredMemberId={hoveredMemberId} setHoveredMemberId={setHoveredMemberId} onDeleteEvent={handleDeleteEvent} onRectUpdate={handleRectUpdate} handlePointerLeave={handlePointerLeave} />
            ))}
          </Zone>
          <Zone id="bunker" name="Sala de Juntas" icon={Lock} className="h-[280px] bg-zinc-50/50 dark:bg-zinc-900/50">
            {membersByZone.bunker.map(m => (
              <MemberAvatar key={m.id} member={m} hoveredMemberId={hoveredMemberId} setHoveredMemberId={setHoveredMemberId} onDeleteEvent={handleDeleteEvent} onRectUpdate={handleRectUpdate} handlePointerLeave={handlePointerLeave} />
            ))}
          </Zone>
          <Zone id="foco" name="Zona de Foco" icon={Zap} className="h-[280px] bg-purple-50/10 dark:bg-purple-900/5">
            {membersByZone.foco.map(m => (
              <MemberAvatar key={m.id} member={m} hoveredMemberId={hoveredMemberId} setHoveredMemberId={setHoveredMemberId} onDeleteEvent={handleDeleteEvent} onRectUpdate={handleRectUpdate} handlePointerLeave={handlePointerLeave} />
            ))}
          </Zone>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-[28%_40%_28%] gap-10 items-stretch justify-center">
          <Zone id="estudio" name="Producción" icon={Video} className="h-[500px]" isActive={isProductionActive}>
            {membersByZone.estudio.map(m => (
              <MemberAvatar key={m.id} member={m} hoveredMemberId={hoveredMemberId} setHoveredMemberId={setHoveredMemberId} onDeleteEvent={handleDeleteEvent} onRectUpdate={handleRectUpdate} handlePointerLeave={handlePointerLeave} />
            ))}
          </Zone>
          <Zone id="nave" name="Oficina Central" icon={Monitor} className="h-[500px] bg-indigo-50/5 dark:bg-indigo-900/5">
             <div className="absolute inset-0 p-10 grid grid-cols-4 grid-rows-3 gap-8 opacity-[0.02] pointer-events-none">
              {[...Array(12)].map((_, i) => (
                <div key={i} className="border-2 border-zinc-200 dark:border-zinc-800 rounded-2xl" />
              ))}
            </div>
            <div className="relative z-10 grid grid-cols-4 gap-8">
              {membersByZone.nave.map(m => (
                <MemberAvatar key={m.id} member={m} hoveredMemberId={hoveredMemberId} setHoveredMemberId={setHoveredMemberId} onDeleteEvent={handleDeleteEvent} onRectUpdate={handleRectUpdate} handlePointerLeave={handlePointerLeave} />
              ))}
            </div>
          </Zone>
          <Zone id="cafe" name="Cafecito Time" icon={Coffee} className="h-[500px] bg-orange-50/10 dark:bg-orange-900/5">
            {membersByZone.cafe.map(m => (
              <MemberAvatar key={m.id} member={m} hoveredMemberId={hoveredMemberId} setHoveredMemberId={setHoveredMemberId} onDeleteEvent={handleDeleteEvent} onRectUpdate={handleRectUpdate} handlePointerLeave={handlePointerLeave} />
            ))}
          </Zone>
        </div>
      </div>

      {activeCardData && createPortal(
        <AnimatePresence>
          {isCardOpen && (
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ duration: 0.1, ease: "easeOut" }}
              style={{
                position: 'fixed',
                left: 0,
                top: 0,
                width: '100%',
                height: '100%',
                zIndex: 2147483647,
                pointerEvents: 'none'
              }}
            >
              <MemberActivityCard
                isOpen={true}
                member={activeCardData.member}
                isAdmin={isAdmin}
                onDeleteEvent={handleDeleteEvent}
                cardRef={cardRef}
                cardPosition={activeCardData.position}
                handlePointerEnter={() => {
                  if (closeTimerRef.current) {
                      clearTimeout(closeTimerRef.current);
                      closeTimerRef.current = null;
                  }
                  setIsCardOpen(true);
                }}
                handlePointerLeave={() => {
                  closeTimerRef.current = setTimeout(() => {
                    setIsCardOpen(false);
                    closeTimerRef.current = null;
                  }, 300);
                }}
              />
            </motion.div>
          )}
        </AnimatePresence>,
        document.body
      )}

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
