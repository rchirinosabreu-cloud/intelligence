import { Clock, Trash2, Video } from '@/components/ui/icons';
import TeamAvatar from '@/components/ui/TeamAvatar';
import { cn } from '@/lib/utils';
import { formatActivityEventSchedule } from './calendarPresentation';

const MemberActivityCard = ({ isOpen, member, isAdmin, onDeleteEvent, cardRef, cardPosition, handlePointerEnter, handlePointerLeave }) => {
  if (!member) return null;
  const { currentEvent, currentTask } = member;
  return (
    <aside ref={cardRef} data-activity-floating-card="member"
      className={cn('brain-popover-surface fixed z-[60] w-72 overflow-y-auto p-4', isOpen ? 'block pointer-events-auto' : 'hidden pointer-events-none')}
      style={{ left: cardPosition?.left || 0, top: cardPosition?.top || 0 }}
      onPointerEnter={handlePointerEnter} onPointerLeave={handlePointerLeave}
      role="dialog" aria-label={`Detalles de ${member.name}`}>
      <div className="flex items-center gap-2.5">
        <TeamAvatar member={member} size={32} showTitle={false} className="h-8 w-8 shrink-0" />
        <h4 className="min-w-0 text-sm font-semibold leading-5">{member.name}</h4>
      </div>
      {currentEvent ? (
        <div className="mt-3 space-y-2">
          <p className="text-xs text-zinc-500 dark:text-zinc-400">Actividad actual</p>
          <h5 className="text-sm font-medium leading-5">{currentEvent.title}</h5>
          <div className="flex items-center justify-between gap-2 border-t border-zinc-100 pt-2 dark:border-zinc-800">
            <p className="flex min-w-0 items-start gap-2 text-xs leading-5 text-zinc-600 dark:text-zinc-300">
              <Clock className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>{formatActivityEventSchedule(currentEvent)}</span>
            </p>
            {isAdmin && <button type="button" aria-label="Eliminar evento" title="Eliminar evento"
              onClick={e => { e.stopPropagation(); onDeleteEvent(currentEvent.id); }}
              className="brain-danger-button-icon flex h-11 w-11 shrink-0 items-center justify-center rounded-lg">
              <Trash2 className="h-4 w-4" />
            </button>}
          </div>
          {currentEvent.meetingLink && <a href={currentEvent.meetingLink} target="_blank" rel="noopener noreferrer"
            className="flex min-h-11 items-center justify-center gap-2 rounded-lg border border-zinc-200 px-3 text-xs font-medium hover:bg-zinc-50 focus-visible:outline focus-visible:outline-2 dark:border-zinc-700 dark:hover:bg-zinc-800">
            <Video className="h-4 w-4" /> Entrar a reunión
          </a>}
        </div>
      ) : currentTask ? (
        <div className="mt-3 space-y-1 border-t border-zinc-100 pt-3 dark:border-zinc-800">
          <p className="text-xs text-zinc-500 dark:text-zinc-400">{currentTask.clientName || 'Agencia'}</p>
          <h5 className="text-sm font-medium leading-5">{currentTask.title}</h5>
        </div>
      ) : <p className="mt-3 text-xs text-zinc-600 dark:text-zinc-300">Disponible en oficina</p>}
    </aside>
  );
};
export default MemberActivityCard;
