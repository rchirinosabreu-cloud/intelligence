import React, { useEffect } from 'react';
import { Clock, User, Trash2 } from 'lucide-react';
import TeamAvatar from '@/components/ui/TeamAvatar';
import { cn } from '@/lib/utils';

const MemberActivityCard = ({
  isOpen,
  member,
  isAdmin,
  onDeleteEvent,
  cardRef,
  cardPosition,
  handlePointerEnter,
  handlePointerLeave
}) => {
  useEffect(() => {
    if (process.env.NODE_ENV === 'development' && member) {
        console.log(`[Lifecycle] MemberActivityCard MOUNTED for ${member.name}`);
    }
  }, [member?.name]);

  if (!member) return null;

  const currentEvent = member.currentEvent;
  const currentTask = member.currentTask;

  const getStatusColor = (status) => {
    switch (status) {
      case 'LIBRE': return 'bg-green-500';
      case 'ENFOCADO': return 'bg-purple-500 shadow-[0_0_15px_rgba(168,85,247,0.5)]';
      case 'OCUPADO': return 'bg-orange-500';
      case 'REUNION': return 'bg-zinc-400';
      case 'PRODUCCION': return 'bg-fuchsia-500';
      case 'AUSENTE': return 'bg-red-900';
      default: return 'bg-zinc-200';
    }
  };

  return (
    <aside
      ref={cardRef}
      data-activity-floating-card="member"
      className={cn(
        "fixed w-72 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-white/10 rounded-3xl shadow-2xl p-5 origin-bottom z-[60]",
        isOpen ? "block pointer-events-auto" : "hidden pointer-events-none"
      )}
      style={{ left: cardPosition?.left || 0, top: cardPosition?.top || 0 }}
      onPointerEnter={handlePointerEnter}
      onPointerLeave={handlePointerLeave}
      role="dialog"
      aria-label={`Detalles de ${member.name}`}
    >
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <TeamAvatar member={member} showTitle={false} className="w-10 h-10 border-2 border-indigo-100" />
          <div className="flex-1 min-w-0">
            <h4 className="text-[13px] font-bold text-zinc-900 dark:text-white truncate">{member.name}</h4>
          </div>
        </div>

        {currentEvent ? (
          <div className="space-y-3 pt-2">
            <div className="space-y-1">
              <span className="text-[9px] font-black uppercase text-zinc-400 tracking-wider">Actividad Actual</span>
              <h5 className="text-[11px] font-bold text-indigo-600 dark:text-indigo-400 leading-tight">
                {currentEvent.title}
              </h5>
            </div>

            <div className="flex items-center justify-between gap-2 p-2.5 bg-zinc-50 dark:bg-white/5 rounded-xl border border-zinc-100 dark:border-white/5">
              <div className="flex items-center gap-2 text-[10px] font-bold text-zinc-600 dark:text-zinc-400">
                <Clock className="w-3.5 h-3.5 text-indigo-500" />
                {new Date(currentEvent.startAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </div>
              {isAdmin && (
                <button
                  onClick={(e) => { e.stopPropagation(); onDeleteEvent(currentEvent.id); }}
                  className="p-1.5 text-red-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 rounded-lg"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {currentEvent.meetingLink && (
              <a
                href={currentEvent.meetingLink}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center gap-2 w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-[10px] font-black uppercase shadow-lg shadow-indigo-600/20"
              >
                Entrar a Reunión
              </a>
            )}
          </div>
        ) : currentTask ? (
           <div className="space-y-2 pt-2">
              <div className="p-3 bg-indigo-50/50 dark:bg-indigo-900/10 rounded-2xl border border-indigo-100/50 dark:border-indigo-900/20">
                  <h5 className="text-[12px] font-bold text-zinc-900 dark:text-white leading-tight mb-1">
                    {currentTask.title}
                  </h5>
                  <p className="text-[10px] font-bold text-indigo-500 dark:text-indigo-400 uppercase tracking-wider">
                    {currentTask.clientName || 'Agencia'}
                  </p>
              </div>
           </div>
        ) : (
          <div className="flex items-center gap-2 p-3 bg-emerald-50 dark:bg-emerald-900/10 rounded-2xl border border-emerald-100 dark:border-emerald-900/20">
            <User className="w-4 h-4 text-emerald-500" />
            <span className="text-[10px] font-bold text-emerald-700 dark:text-emerald-400 uppercase tracking-tight">Activo en Oficina</span>
          </div>
        )}
      </div>
      <div className="absolute top-full left-1/2 -translate-x-1/2 border-[10px] border-transparent border-t-white dark:border-t-zinc-900" />
    </aside>
  );
};

export default MemberActivityCard;
