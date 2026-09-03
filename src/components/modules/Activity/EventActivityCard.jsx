import { useEffect } from 'react';
import { Clock, Trash2 } from '@/components/ui/icons';
import { format } from 'date-fns';
import TeamAvatar from '@/components/ui/TeamAvatar';
import UserAvatarPopover from '@/components/ui/UserAvatarPopover';
import { cn } from '@/lib/utils';

const EVENT_TYPE_LABELS = {
  'PRODUCTION': 'Producción',
  'ABSENCE': 'Permiso / Ausencia',
  'PROJECT': 'Proyecto Especial',
  'MEETING': 'Reunión',
  'BREAK': 'Descanso / Café'
};

const EventActivityCard = ({
  isOpen,
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
  const eventTitle = event?.title;
  useEffect(() => {
    if (process.env.NODE_ENV === 'development' && eventTitle) {
        console.log(`[Lifecycle] EventActivityCard MOUNTED for ${eventTitle}`);
    }
  }, [eventTitle]);

  if (!event) return null;

  const involvedMembers = team.filter(m => (event.memberIds || []).includes(m.id));
  const typeLabel = EVENT_TYPE_LABELS[event.type] || event.type;

  return (
    <aside
      ref={cardRef}
      data-activity-floating-card="event"
      className={cn(
        "fixed w-64 bg-white/95 dark:bg-zinc-900/95 backdrop-blur-xl border border-zinc-200 dark:border-white/10 rounded-2xl shadow-2xl p-3 z-[60]",
        isOpen ? "block pointer-events-auto" : "hidden pointer-events-none"
      )}
      style={{ left: cardPosition.left, top: cardPosition.top }}
      onPointerEnter={handlePointerEnter}
      onPointerLeave={handlePointerLeave}
      role="dialog"
      aria-label={`Detalles de ${event.title}`}
    >
      <div className="space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-1 flex-1 min-w-0">
            <h4 className="text-[12px] font-black text-zinc-900 dark:text-white leading-tight truncate uppercase tracking-tight">
              {event.title}
            </h4>
            <div className="text-[9px] font-black uppercase text-indigo-600 tracking-widest">
              {typeLabel}
            </div>
          </div>
          {isAdmin && (
            <button
              onClick={(e) => { e.stopPropagation(); onDelete(event.id); }}
              className="brain-danger-button-icon rounded-xl p-2"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          )}
        </div>

        <div className="flex items-center gap-2 text-[11px] font-bold text-zinc-600 dark:text-zinc-400 bg-zinc-50 dark:bg-white/5 p-2.5 rounded-xl border">
          <Clock className="w-3.5 h-3.5 text-indigo-500" />
          {format(new Date(event.startAt), 'HH:mm')} - {format(new Date(event.endAt), 'HH:mm')}
        </div>

        {event.description && (
          <p className="text-[10px] text-zinc-500 dark:text-zinc-400 leading-relaxed italic">
            {event.description}
          </p>
        )}

        <div className="pt-1">
          <div className="flex flex-wrap gap-1">
            {involvedMembers.map(m => (
              <div key={m.id} className="text-[9px] font-bold text-zinc-500 bg-zinc-100 dark:bg-zinc-800 px-1.5 py-0.5 rounded-md">
                {m.name.split(' ')[0]}
              </div>
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
