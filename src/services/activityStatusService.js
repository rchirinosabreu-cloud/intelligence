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

      const eventStartDate = new Date(event.startAt);
      const eventEndDate = new Date(event.endAt);
      const sameWeekDay = eventStartDate.getDay() === time.getDay();
      if (!sameWeekDay) return false;

      const minutesOfDay = (d) => d.getHours() * 60 + d.getMinutes();
      const nowMinutes = minutesOfDay(time);
      const startMinutes = minutesOfDay(eventStartDate);
      const endMinutes = minutesOfDay(eventEndDate);
      const bufferMinutes = Math.floor(currentBuffer / 60000);

      return nowMinutes >= startMinutes - bufferMinutes && nowMinutes <= endMinutes + bufferMinutes;
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

      const eventStartDate = new Date(event.startAt);
      const eventEndDate = new Date(event.endAt);
      const sameWeekDay = eventStartDate.getDay() === time.getDay();
      if (!sameWeekDay) return false;

      const minutesOfDay = (d) => d.getHours() * 60 + d.getMinutes();
      const nowMinutes = minutesOfDay(time);
      const startMinutes = minutesOfDay(eventStartDate);
      const endMinutes = minutesOfDay(eventEndDate);
      const bufferMinutes = Math.floor(currentBuffer / 60000);

      return nowMinutes >= startMinutes - bufferMinutes && nowMinutes <= endMinutes + bufferMinutes;
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

  // JERARQUÍA BS-MAP-PRO-V3 (6 ESTADOS):
  // 1. PERMISSION / VACATION -> AUSENTE
  // 2. MEETING -> REUNION
  // 3. PRODUCTION -> PRODUCCION
  // 4. TECHNICAL TASK / FOCUS EVENT -> PRODUCCION / ENFOCADO
  // 5. TASK IN PROGRESS / BREAK -> OCUPADO
  // 6. DEFAULT -> LIBRE

  let status = 'LIBRE';
  let currentTask = (member.nativeTasks && member.nativeTasks[0]) || null;
  let prioritizedEvent = null;

  const memberEvents = todayEvents.filter(e => e.memberIds?.includes(member.id));

  // Active Events (Right now)
  const permissionEvent = memberEvents.find(e =>
    (e.type === 'PERMISSION' || e.type === 'VACATION' || e.type === 'ABSENCE' ||
      e.title?.toLowerCase().includes('permiso') || e.title?.toLowerCase().includes('vacaciones')) &&
    checkEventActive(e, now)
  );
  const meetingEvent = memberEvents.find(e =>
    (e.type === 'MEETING' || e.title?.toLowerCase().includes('sala de juntas')) &&
    checkEventActive(e, now)
  );
  const productionEvent = memberEvents.find(e =>
    (e.type === 'PRODUCTION' || e.title?.toLowerCase().includes('producción') || e.title?.toLowerCase().includes('produccion')) &&
    checkEventActive(e, now)
  );
  const focusEvent = memberEvents.find(e =>
    (e.type === 'DEEP_WORK' || e.type === 'FOCUS' || e.title?.toLowerCase().includes('foco') || e.title?.toLowerCase().includes('concentración')) &&
    checkEventActive(e, now)
  );
  const breakEvent = memberEvents.find(e =>
    (e.type === 'BREAK' || e.title?.toLowerCase().includes('descanso') || e.title?.toLowerCase().includes('café') || e.title?.toLowerCase().includes('cafe')) &&
    checkEventActive(e, now)
  );

  const isTechnicalTask = Boolean(currentTask?.title && /deploy|infra|devops|arquitectura|pipeline|producci[oó]n/i.test(currentTask.title));

  // Priority Resolution Logic
  if (permissionEvent) {
    status = 'AUSENTE';
    prioritizedEvent = permissionEvent;
  } else if (meetingEvent) {
    status = 'REUNION';
    prioritizedEvent = meetingEvent;
  } else if (productionEvent || isTechnicalTask) {
    status = 'PRODUCCION';
    prioritizedEvent = productionEvent;
  } else if (focusEvent || currentTask?.isSpecial) {
    status = 'ENFOCADO';
    prioritizedEvent = focusEvent;
  } else if (breakEvent || currentTask) {
    status = 'OCUPADO';
    prioritizedEvent = breakEvent;
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
