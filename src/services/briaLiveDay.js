// Quien lee el estado vivo del día para Bria (etapa 3, 21 de noviembre de 2026): Actividad y el calendario de hoy,
// los correos importantes que esperan respuesta y las tareas terminadas o creadas en la última hora. Cada parte se
// lee solo si quien pregunta tiene el permiso de esa sección; una parte que falla no tumba las demás. Solo lectura.

import prisma from '../lib/prisma.js';
import { hasModulePermission, isManagerRole } from '../config/security.js';
import { canUseBria } from '../lib/briaLivingMemory.js';
import { bogotaDate } from '../lib/colombiaBusinessDays.js';
import { activeTaskSourceWhere } from '../lib/taskRetirement.js';
import { isVisibleOperationalEvent } from './operationalEventVisibility.js';
import { getTeamActivityStatus } from './activityStatusService.js';
import { getOperationalEvents } from './operationalEventService.js';
import { liveDayState, LIVE_DAY_WINDOW_MS } from '../lib/briaLiveDay.js';

// El título, el responsable y la cuenta de una tarea los ve todo el equipo, también si es privada (`taskPrivacy.js`).
const CHANGE_SELECT = { id: true, title: true, completedAt: true, createdAt: true, client: { select: { name: true } }, assignee: { select: { name: true } } };

export const createLiveDayReader = ({ db = prisma, readActivity = getTeamActivityStatus, readEvents = getOperationalEvents, mail = null, logger = console } = {}) => async (user, at = new Date()) => {
  const since = new Date(at.getTime() - LIVE_DAY_WINDOW_MS);
  let events = [];
  // Actividad ya lee el calendario de hoy: se guarda esa misma lectura para la agenda, sin consultar dos veces.
  const capture = async (start, end) => (events = await readEvents(start, end));
  const mailbox = canUseBria(user) && isManagerRole(user?.role) ? (typeof mail === 'function' ? mail() : mail) : null;
  const [activity, waiting, tasks] = await Promise.allSettled([
    hasModulePermission(user, 'actividad') ? readActivity({ db, readEvents: capture, now: at }) : null,
    typeof mailbox?.waitingMail === 'function' ? mailbox.waitingMail() : null,
    hasModulePermission(user, 'gestion') ? db.task.findMany({
      where: { AND: [activeTaskSourceWhere], OR: [{ completedAt: { gte: since } }, { createdAt: { gte: since } }] },
      select: CHANGE_SELECT, orderBy: { updatedAt: 'desc' }, take: 60
    }) : null
  ]);
  for (const [name, read] of [['Actividad', activity], ['los correos', waiting], ['los cambios recientes', tasks]]) {
    if (read.status === 'rejected') logger.error?.(`[BriaLiveDay] No se pudo leer ${name}:`, read.reason?.message || read.reason);
  }
  const value = (read) => (read.status === 'fulfilled' ? read.value : null);
  return liveDayState({ activity: value(activity), events: events.filter(isVisibleOperationalEvent), mail: value(waiting), tasks: value(tasks), today: bogotaDate(at), at, since });
};
