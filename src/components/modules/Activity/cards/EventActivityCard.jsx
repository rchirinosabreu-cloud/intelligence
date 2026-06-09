import { format } from 'date-fns';
import { Clock, Trash2 } from 'lucide-react';
import TeamAvatar from '@/components/ui/TeamAvatar';
import { Badge } from '@/components/ui/Badge';

const EventActivityCard = ({
  hoveredEventData, eventCardRef, closeTimerRef, setHoveredEventData, handleDelete, handleEdit, team, isAdmin
}) => (
  <aside
    ref={eventCardRef}
    data-activity-floating-card="event"
    className="fixed pointer-events-auto animate-in fade-in duration-150 w-72 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-white/10 rounded-3xl shadow-2xl p-5"
    style={{
      left: hoveredEventData.position.left,
      top: hoveredEventData.position.top,
      zIndex: 2147483647
    }}
    onPointerEnter={() => cancelHoverClose(closeTimerRef)}
    onPointerLeave={() => scheduleHoverClose(closeTimerRef, () => setHoveredEventData(null))}
    onClick={(e) => e.stopPropagation()}
    role="dialog"
    aria-label={`Detalles de ${hoveredEventData.event.title}`}
  >
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1.5 flex-1 min-w-0">
          <h4 className="text-[13px] font-bold text-zinc-900 dark:text-white leading-tight truncate">
            {hoveredEventData.event.title}
          </h4>
          <div className="flex items-center gap-2">
            <Badge variant="indigo" className="text-[9px] font-black uppercase tracking-widest px-2 py-0.5">
              {hoveredEventData.event.type === 'PRODUCTION' ? 'Producción' :
               hoveredEventData.event.type === 'PROJECT' ? 'Proyecto' :
               hoveredEventData.event.type === 'MEETING' ? 'Reunión' :
               hoveredEventData.event.type === 'ABSENCE' ? 'Ausencia' :
               hoveredEventData.event.type === 'WORK_DAY' ? 'Jornada' : 'Descanso'}
            </Badge>
          </div>
        </div>
        {isAdmin && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              handleDelete(hoveredEventData.event.id);
            }}
            className="p-2 bg-red-50 dark:bg-red-900/20 text-red-500 hover:bg-red-100 rounded-xl transition-all shadow-sm shrink-0"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        )}
      </div>

      <div className="flex items-center gap-2 text-[11px] font-bold text-zinc-600 dark:text-zinc-400 bg-zinc-50 dark:bg-white/5 p-2.5 rounded-xl border border-zinc-100 dark:border-white/5">
        <Clock className="w-3.5 h-3.5 text-indigo-500" />
        {format(new Date(hoveredEventData.event.startAt), 'HH:mm')} - {format(new Date(hoveredEventData.event.endAt), 'HH:mm')}
      </div>

      {hoveredEventData.event.description && (
        <p className="text-[10px] text-zinc-500 dark:text-zinc-400 line-clamp-3 leading-relaxed">
          {hoveredEventData.event.description}
        </p>
      )}

      <div className="pt-2">
        <span className="text-[9px] font-black uppercase tracking-widest text-zinc-400 block mb-2">Involucrados</span>
        <div className="flex -space-x-2">
          {team.filter(m => (hoveredEventData.event.memberIds || []).includes(m.id)).map(m => (
            <TeamAvatar key={m.id} member={m} className="w-7 h-7 border-2 border-white dark:border-zinc-900 shadow-sm" />
          ))}
        </div>
      </div>

      {isAdmin && (
        <button
          onClick={() => handleEdit(hoveredEventData.event)}
          className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-[10px] font-black uppercase tracking-widest transition-all shadow-lg shadow-indigo-600/20 active:scale-95"
        >
          Editar Evento
        </button>
      )}
    </div>
    {/* Popover Arrow */}
    <div className="absolute top-full left-1/2 -translate-x-1/2 border-[10px] border-transparent border-t-white dark:border-t-zinc-900" />
  </aside>
);

export default EventActivityCard;
