import { Clock, Trash2 } from '@/components/ui/icons';
import { cn } from '@/lib/utils';
import { formatActivityEventSchedule, normalizeCalendarDescription } from './calendarPresentation';

const EVENT_TYPE_LABELS = { PRODUCTION: 'Producción', ABSENCE: 'Permiso / Ausencia', PROJECT: 'Proyecto', MEETING: 'Reunión', BREAK: 'Descanso' };

const EventActivityCard = ({ isOpen, event, team = [], isAdmin, onDelete, onEdit, cardRef, cardPosition, handlePointerEnter, handlePointerLeave }) => {
  if (!event) return null;
  const members = team.filter(member => (event.memberIds || []).includes(member.id));
  return (
    <aside ref={cardRef} data-activity-floating-card="event"
      className={cn('brain-popover-surface fixed z-[60] w-72 overflow-y-auto p-4', isOpen ? 'block pointer-events-auto' : 'hidden pointer-events-none')}
      style={{ left: cardPosition?.left || 0, top: cardPosition?.top || 0 }}
      onPointerEnter={handlePointerEnter} onPointerLeave={handlePointerLeave}
      role="dialog" aria-label={`Detalles de ${event.title}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-xs text-zinc-500 dark:text-zinc-400">{EVENT_TYPE_LABELS[event.type] || event.type}</p>
          <h4 className="mt-1 text-sm font-semibold leading-5">{event.title}</h4>
        </div>
        {isAdmin && <button type="button" aria-label="Eliminar evento" title="Eliminar evento"
          onClick={e => { e.stopPropagation(); onDelete(event.id); }}
          className="brain-danger-button-icon flex h-11 w-11 shrink-0 items-center justify-center rounded-lg">
          <Trash2 className="h-4 w-4" />
        </button>}
      </div>
      <p className="mt-3 flex items-start gap-2 text-xs leading-5 text-zinc-600 dark:text-zinc-300">
        <Clock className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        <span>{formatActivityEventSchedule(event)}</span>
      </p>
      {event.description && <p className="mt-3 line-clamp-4 text-xs leading-5 text-zinc-600 dark:text-zinc-300">{normalizeCalendarDescription(event.description)}</p>}
      {members.length > 0 && <p className="mt-3 border-t border-zinc-100 pt-3 text-xs leading-5 text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">{members.map(member => member.name).join(' · ')}</p>}
      {isAdmin && <button type="button" onClick={e => { e.stopPropagation(); onEdit(event); }}
        className="mt-3 min-h-11 w-full rounded-lg border border-zinc-200 px-3 text-xs font-medium hover:bg-zinc-50 focus-visible:outline focus-visible:outline-2 dark:border-zinc-700 dark:hover:bg-zinc-800">Editar evento</button>}
    </aside>
  );
};
export default EventActivityCard;
