import React, { useEffect } from 'react';
import { motion } from 'framer-motion';
import { FileText, Trash2, Video, Clock } from 'lucide-react';
import { cn } from '@/lib/utils';

const getStatusBgColor = (status) => {
  switch (status) {
    case 'LIBRE': return 'bg-green-500';
    case 'ENFOCADO': return 'bg-purple-500';
    case 'OCUPADO': return 'bg-orange-500';
    case 'REUNION': return 'bg-zinc-400';
    case 'PRODUCCION': return 'bg-fuchsia-500';
    case 'AUSENTE': return 'bg-red-900';
    default: return 'bg-zinc-200';
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

const MemberActivityCard = ({
  member,
  isAdmin,
  onDeleteEvent,
  cardRef,
  cardPosition,
  handlePointerEnter,
  handlePointerLeave
}) => {
  useEffect(() => {
    if (process.env.NODE_ENV === 'development') {
        console.log(`[Lifecycle] MemberActivityCard MOUNTED for ${member?.name}`);
    }
    return () => {
        if (process.env.NODE_ENV === 'development') {
            console.log(`[Lifecycle] MemberActivityCard UNMOUNTED for ${member?.name}`);
        }
    };
  }, [member?.name]);

  if (!member) return null;

  return (
    <aside
      ref={cardRef}
      data-activity-floating-card="member"
      className="fixed pointer-events-auto bg-white dark:bg-zinc-900 text-zinc-900 dark:text-white p-5 rounded-[2rem] shadow-[0_30px_60px_rgba(0,0,0,0.4)] border border-zinc-200 dark:border-zinc-800 flex flex-col gap-4 min-w-[340px] origin-bottom z-[2147483647]"
      style={{
        left: cardPosition.left,
        top: cardPosition.top,
      }}
      onPointerEnter={handlePointerEnter}
      onPointerLeave={handlePointerLeave}
      role="dialog"
      aria-label={`Actividad de ${member.name}`}
    >
      <div className="flex items-center justify-between">
        <div className="flex flex-col gap-1">
          <span className="font-bold text-sm tracking-tight">{member.name}</span>
          <span className="text-[10px] text-zinc-400 font-semibold">{member.role || 'Colaborador'}</span>
          <div className="flex items-center gap-2 mt-0.5">
            <div className={cn("w-2 h-2 rounded-full", getStatusBgColor(member.status))} />
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
      {(member.currentTask || member.currentEvent) ? (
        <div className="bg-indigo-50 dark:bg-indigo-900/10 p-3 rounded-2xl border border-indigo-100/50 dark:border-indigo-500/10">
          <div className="flex items-center gap-2 mb-1">
            <FileText className="w-3 h-3 text-indigo-500" />
            <span className="text-[9px] font-black uppercase tracking-widest text-indigo-600 dark:text-indigo-400">
              Actividad Actual
            </span>
          </div>
          <p className="text-[11px] font-bold text-zinc-800 dark:text-zinc-100 leading-tight">
            {member.currentTask?.title || member.currentEvent?.title}
          </p>
        </div>
      ) : (
        <div className="flex items-center gap-3 py-2 px-1">
           <div className="p-2 bg-zinc-50 dark:bg-zinc-800 rounded-lg"><Clock className="w-3.5 h-3.5 text-zinc-400" /></div>
           <p className="text-zinc-400 text-[11px] font-medium italic">Sin actividad registrada</p>
        </div>
      )}
      <div className="flex gap-2">
        {member.status === 'REUNION' && member.currentEvent?.meetingLink && (
          <a
            href={member.currentEvent.meetingLink}
            target="_blank"
            rel="noopener noreferrer"
            className="flex-1 px-4 py-2 bg-indigo-600 text-white text-[10px] font-black uppercase tracking-widest rounded-xl hover:bg-indigo-700 transition-all flex items-center justify-center gap-2 shadow-lg shadow-indigo-600/20"
          >
            <Video className="w-3.5 h-3.5" /> Entrar a Reunión
          </a>
        )}
      </div>
    </aside>
  );
};

export default MemberActivityCard;
