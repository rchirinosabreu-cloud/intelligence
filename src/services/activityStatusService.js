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

  // Unified agency time (America/Bogota)
  const bogotaTime = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Bogota',
    year: 'numeric', month: 'numeric', day: 'numeric',
    hour: 'numeric', minute: 'numeric', second: 'numeric',
    hour12: false
  }).format(new Date());

  const now = new Date(bogotaTime);
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
    const isMeeting = event.type === 'MEETING' || event.title?.toLowerCase().includes('sala de juntas');
    const currentBuffer = isMeeting ? 0 : BUFFER_MS;

    if (event.recurrence === 'NONE' || !event.recurrence) {
      // STRICT: Must be today and current time must be within bounds
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

  return members.map(member => calculateMemberStatus(member, todayEvents, now));
}

export function calculateMemberStatus(member, todayEvents, now) {
  const BUFFER_MS = 5 * 60 * 1000;

  const checkEventActive = (event, time) => {
    const eventStart = new Date(event.startAt).getTime();
    const eventEnd = new Date(event.endAt).getTime();
    const checkTime = time.getTime();
    const isMeeting = event.type === 'MEETING' || event.title?.toLowerCase().includes('sala de juntas');
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

  const checkEventToday = (event) => {
    if (event.recurrence === 'NONE' || !event.recurrence) return true;
    if (event.recurrence === 'WEEKLY') {
        const eventDate = new Date(event.startAt);
        const dayOfWeek = eventDate.getDay();
        return now.getDay() === dayOfWeek;
    }
    return false;
  };

  // NEW HIERARCHY (BS-MAP-REPAIR):
  // 1. MEETING (Active Now) -> Sala de Juntas
  // 2. ABSENCE (Today) -> De permiso
  // 3. PRODUCTION (Today) -> Producción
  // 4. BREAK / CAFE (Active Now) -> Cafecito Time
  // 5. WORK_DAY / JORNADA (Active Now) -> Oficina Central (Escritorio)
  // 6. TASK (In Progress) -> Oficina Central (if no calendar event)
  // 7. OFFLINE (Default) -> Invisible en el mapa

  let status = 'OFFLINE';
  let currentTask = (member.nativeTasks && member.nativeTasks[0]) || null;
  let prioritizedEvent = null;

  const memberEvents = todayEvents.filter(e => e.memberIds?.includes(member.id));

  // Active Events (Right now)
  const meetingEvent = memberEvents.find(e =>
    (e.type === 'MEETING' || e.title?.toLowerCase().includes('sala de juntas')) &&
    checkEventActive(e, now)
  );
  const workDayEvent = memberEvents.find(e =>
    (e.type === 'WORK_DAY' || e.type === 'JORNADA' || e.title?.toLowerCase().includes('jornada laboral')) &&
    checkEventActive(e, now)
  );
  const breakEvent = memberEvents.find(e =>
    (e.type === 'BREAK' || e.title?.toLowerCase().includes('descanso') || e.title?.toLowerCase().includes('café') || e.title?.toLowerCase().includes('cafe')) &&
    checkEventActive(e, now)
  );

  // STRICT TEMPORAL VALIDATION (BS-MAP-FINAL-V2)
  const absenceEvent = memberEvents.find(e => (e.type === 'ABSENCE' || e.title?.toLowerCase().includes('permiso')) && checkEventActive(e, now));
  const productionEvent = memberEvents.find(e => (e.type === 'PRODUCTION' || e.title?.toLowerCase().includes('producción')) && checkEventActive(e, now));

  // Priority Resolution Logic (BS-MAP-FINAL-V2)
  if (meetingEvent) {
    status = 'REUNION';
    prioritizedEvent = meetingEvent;
  } else if (absenceEvent) {
    status = 'AUSENTE';
    prioritizedEvent = absenceEvent;
  } else if (productionEvent) {
    status = 'PRODUCCION';
    prioritizedEvent = productionEvent;
  } else if (breakEvent) {
    status = 'LIBRE';
    prioritizedEvent = breakEvent;
  } else if (workDayEvent) {
    status = currentTask?.isSpecial ? 'ENFOCADO' : 'OCUPADO'; // In Central Office
    prioritizedEvent = workDayEvent;
  }

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
}
