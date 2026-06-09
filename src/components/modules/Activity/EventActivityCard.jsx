import React, { useEffect } from 'react';
import { Clock, Trash2 } from 'lucide-react';
import { format } from 'date-fns';
import TeamAvatar from '@/components/ui/TeamAvatar';
import UserAvatarPopover from '@/components/ui/UserAvatarPopover';

const EVENT_TYPE_LABELS = {
  'PRODUCTION': 'Producción',
  'ABSENCE': 'Permiso / Ausencia',
  'PROJECT': 'Proyecto Especial',
  'MEETING': 'Reunión',
  'BREAK': 'Descanso / Café'
};

const EventActivityCard = ({
  event,
  team,
  isAdmin,
  onDelete,
  onEdit,
  cardRef,
  cardPosition,
  handlePointerEnter,
  handlePointerLeave
}) => {
  useEffect(() => {
    if (process.env.NODE_ENV === 'development') {
        console.log(`[Lifecycle] EventActivityCard MOUNTED for ${event?.title}`);
    }
    return () => {
        if (process.env.NODE_ENV === 'development') {
            console.log(`[Lifecycle] EventActivityCard UNMOUNTED for ${event?.title}`);
        }
    };
  }, [event?.title]);

  if (!event) return null;

  const involvedMembers = team.filter(m => (event.memberIds || []).includes(m.id));
  const typeLabel = EVENT_TYPE_LABELS[event.type] || event.type;

  return (
    <aside
      ref={cardRef}
      data-activity-floating-card="event"
      className="fixed pointer-events-auto w-72 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-white/10 rounded-3xl shadow-2xl p-5 origin-bottom z-[2147483647]"
      style={{ left: cardPosition.left, top: cardPosition.top }}
      onPointerEnter={handlePointerEnter}
      onPointerLeave={handlePointerLeave}
      role="dialog"
      aria-label={`Detalles de ${event.title}`}
    >
      <div className="space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-1.5 flex-1 min-w-0">
            <h4 className="text-[13px] font-bold text-zinc-900 dark:text-white leading-tight truncate">
              {event.title}
            </h4>
            <div className="text-[9px] font-black uppercase text-indigo-600">
              {typeLabel}
            </div>
          </div>
          {isAdmin && (
            <button
              onClick={(e) => { e.stopPropagation(); onDelete(event.id); }}
              className="p-2 text-red-500 hover:bg-red-50 rounded-xl transition-colors"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          )}
        </div>

        <div className="flex items-center gap-2 text-[11px] font-bold text-zinc-600 dark:text-zinc-400 bg-zinc-50 dark:bg-white/5 p-2.5 rounded-xl border">
          <Clock className="w-3.5 h-3.5 text-indigo-500" />
          {format(new Date(event.startAt), 'HH:mm')} - {format(new Date(event.endAt), 'HH:mm')}
        </div>

        <div className="pt-2">
          <span className="text-[9px] font-black uppercase text-zinc-400 block mb-2">Involucrados</span>
          <div className="flex flex-wrap gap-1.5">
            {involvedMembers.map(m => (
              <UserAvatarPopover key={m.id} user={m}>
                <TeamAvatar
                  member={m}
                  showTitle={false}
                  className="w-7 h-7 border-2 border-white shadow-sm"
                />
              </UserAvatarPopover>
            ))}
          </div>
        </div>

        {isAdmin && (
          <button
            onClick={(e) => { e.stopPropagation(); onEdit(event); }}
            className="w-full py-2.5 bg-indigo-600 text-white rounded-xl text-[10px] font-black uppercase shadow-lg shadow-indigo-600/20 active:scale-95 transition-all"
          >
            Editar Evento
          </button>
        )}
      </div>
      <div className="absolute top-full left-1/2 -translate-x-1/2 border-[10px] border-transparent border-t-white dark:border-t-zinc-900" />
    </aside>
  );
};

export default EventActivityCard;
