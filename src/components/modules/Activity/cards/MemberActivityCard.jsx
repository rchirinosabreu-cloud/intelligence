import { Clock, FileText, Trash2, Video } from 'lucide-react';
import { cn } from '@/lib/utils';

const MemberActivityCard = ({
  member, isAdmin, onDeleteEvent, cardRef, cardPosition, handlePointerEnter, handlePointerLeave, getStatusColor, getStatusTextColorClass, getStatusText
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
    onPointerEnter={handlePointerEnter}
    onPointerLeave={handlePointerLeave}
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

export default MemberActivityCard;
