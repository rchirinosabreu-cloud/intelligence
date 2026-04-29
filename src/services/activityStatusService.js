import prisma from '../lib/prisma.js';

/**
 * Calculates the current activity status of all team members.
 * Combines Kanban tasks (EN_CURSO) and Operational Events.
 */
export async function getTeamActivityStatus() {
  const members = await prisma.teamMember.findMany({
    where: { isActive: true },
    select: {
      id: true,
      name: true,
      role: true,
      avatarUrl: true,
      desktopX: true,
      desktopY: true,
      statusMessage: true,
      nativeTasks: {
        where: { status: 'EN_CURSO' },
        select: {
          id: true,
          title: true,
          isPriority: true,
          isSpecial: true
        }
      }
    }
  });

  // Unified agency time (UTC)
  const now = new Date();
  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);
  const endOfToday = new Date(now);
  endOfToday.setHours(23, 59, 59, 999);

  const BUFFER_MS = 5 * 60 * 1000; // 5 minute safety buffer

  // Fetch all events for today (to detect ABSENCE and PRODUCTION)
  // and recurring events
  const todayEvents = await prisma.operationalEvent.findMany({
    where: {
      OR: [
        {
          startAt: { lte: endOfToday },
          endAt: { gte: startOfToday }
        },
        {
          recurrence: 'WEEKLY',
          startAt: { lte: endOfToday },
          OR: [
            { recurrenceEnd: null },
            { recurrenceEnd: { gte: startOfToday } }
          ]
        }
      ]
    }
  });

  const checkEventActive = (event, time) => {
    const eventStart = new Date(event.startAt).getTime();
    const eventEnd = new Date(event.endAt).getTime();
    const checkTime = time.getTime();

    // Meetings require strict time validation (no buffer) to avoid "ghost meetings"
    const isMeeting = event.type === 'MEETING';
    const currentBuffer = isMeeting ? 0 : BUFFER_MS;

    if (event.recurrence === 'NONE' || !event.recurrence) {
      return eventStart - currentBuffer <= checkTime && eventEnd + currentBuffer >= checkTime;
    }
    if (event.recurrence === 'WEEKLY') {
      if (event.recurrenceEnd && new Date(event.recurrenceEnd).getTime() + currentBuffer < checkTime) return false;
      const start = new Date(event.startAt).getTime();
      const end = new Date(event.endAt).getTime();
      const duration = end - start;
      const msPerWeek = 7 * 24 * 60 * 60 * 1000;
      const timeDiff = checkTime - start;
      const offsetInWeek = ((timeDiff % msPerWeek) + msPerWeek) % msPerWeek;
      return offsetInWeek <= duration + currentBuffer || offsetInWeek >= msPerWeek - currentBuffer;
    }
    return false;
  };

  // Helper to check if event happens at any point "today"
  const checkEventToday = (event) => {
    // If it's not recurring, we already filtered it by startAt/endAt in the query
    if (event.recurrence === 'NONE' || !event.recurrence) return true;

    if (event.recurrence === 'WEEKLY') {
        const eventDate = new Date(event.startAt);
        const dayOfWeek = eventDate.getDay();
        return now.getDay() === dayOfWeek;
    }
    return false;
  };

  return members.map(member => {
    // FIXED: Strict Location Logic (BS-OPS-007)
    // Fallback order: MEETING (Active Now) > ABSENCE (Today) > PRODUCTION (Today) > TASK (In Progress) > LIBRE (Cafecito)
    let status = 'LIBRE';
    let currentTask = member.nativeTasks[0] || null;

    const memberEvents = todayEvents.filter(e => e.memberIds.includes(member.id));

    // VALIDACIÓN ESTRICTA: Solo si la reunión está sucediendo en este preciso instante.
    const meetingEvent = memberEvents.find(e => e.type === 'MEETING' && checkEventActive(e, now));

    // Eventos de día completo (o que ocurren hoy)
    const absenceEvent = memberEvents.find(e => (e.type === 'ABSENCE' || e.title?.toLowerCase().includes('permiso')) && checkEventToday(e));
    const productionEvent = memberEvents.find(e => e.type === 'PRODUCTION' && checkEventToday(e));

    let prioritizedEvent = null;

    if (meetingEvent) {
      // Prioridad Máxima: En reunión (Bunker/Sala de Juntas)
      status = 'REUNION';
      prioritizedEvent = meetingEvent;
    } else if (absenceEvent) {
      // De permiso
      status = 'AUSENTE';
      prioritizedEvent = absenceEvent;
    } else if (productionEvent) {
      // En jornada de producción
      status = 'PRODUCCION';
      prioritizedEvent = productionEvent;
    }
    else if (currentTask) {
      // Trabajando en la oficina central
      status = currentTask.isSpecial ? 'ENFOCADO' : 'OCUPADO';
    }
    // Fallback: Si no hay nada de lo anterior, queda como LIBRE (Cafecito Time)

    return {
      id: member.id,
      name: member.name,
      role: member.role,
      avatarUrl: member.avatarUrl,
      desktopX: member.desktopX,
      desktopY: member.desktopY,
      statusMessage: member.statusMessage,
      status,
      currentTask: currentTask ? { title: currentTask.title } : null,
      currentEvent: prioritizedEvent ? {
        title: prioritizedEvent.title,
        type: prioritizedEvent.type,
        meetingLink: prioritizedEvent.meetingLink,
        description: prioritizedEvent.description
      } : null
    };
  });
}
