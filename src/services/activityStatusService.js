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

    if (event.recurrence === 'NONE' || !event.recurrence) {
      return eventStart - BUFFER_MS <= checkTime && eventEnd + BUFFER_MS >= checkTime;
    }
    if (event.recurrence === 'WEEKLY') {
      if (event.recurrenceEnd && new Date(event.recurrenceEnd).getTime() + BUFFER_MS < checkTime) return false;
      const start = new Date(event.startAt).getTime();
      const end = new Date(event.endAt).getTime();
      const duration = end - start;
      const msPerWeek = 7 * 24 * 60 * 60 * 1000;
      const timeDiff = checkTime - start;
      const offsetInWeek = ((timeDiff % msPerWeek) + msPerWeek) % msPerWeek;
      return offsetInWeek <= duration + BUFFER_MS || offsetInWeek >= msPerWeek - BUFFER_MS;
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
    let status = 'LIBRE'; // Default: 🟢 Libre
    let currentTask = member.nativeTasks[0] || null;

    // Find all events for this member
    const memberEvents = todayEvents.filter(e => e.memberIds.includes(member.id));

    // Priority 1: REUNION REAL (Active NOW - specific time match)
    const meetingEvent = memberEvents.find(e => e.type === 'MEETING' && checkEventActive(e, now));

    // Priority 2: AUSENCIA/PERMISO (If any "Permiso" event today)
    const absenceEvent = memberEvents.find(e => (e.type === 'ABSENCE' || e.title?.toLowerCase().includes('permiso')) && checkEventToday(e));

    // Priority 3: PRODUCCION (If any production event today)
    const productionEvent = memberEvents.find(e => e.type === 'PRODUCTION' && checkEventToday(e));

    let prioritizedEvent = null;

    if (meetingEvent) {
      status = 'REUNION';
      prioritizedEvent = meetingEvent;
    } else if (absenceEvent) {
      status = 'AUSENTE';
      prioritizedEvent = absenceEvent;
    } else if (productionEvent) {
      status = 'PRODUCCION';
      prioritizedEvent = productionEvent;
    }
    // Priority 4: ENFOQUE (Tasks "En proceso")
    else if (currentTask) {
      if (currentTask.isSpecial) {
        status = 'ENFOCADO'; // 🟣 Enfocado
      } else {
        status = 'OCUPADO'; // Standard "En proceso" or priority
      }
    }
    // Priority 5: CAFECITO TIME (status remains LIBRE)

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
