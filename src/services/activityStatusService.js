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
          comments: true,
          isPriority: true,
          isSpecial: true,
          client: { select: { name: true } }
        }
      }
    }
  });

  // Unified agency time (America/Bogota) as absolute Source of Truth (UTC-5)
  const now = new Date();

  // Robust calculation of Bogota 'today' boundaries in UTC
  // Bogota Day starts when UTC is 05:00:00 (since UTC = Bog + 5)
  const bogotaNow = new Date(now.getTime() - (5 * 3600000));
  const startOfToday = new Date(Date.UTC(bogotaNow.getUTCFullYear(), bogotaNow.getUTCMonth(), bogotaNow.getUTCDate(), 5, 0, 0, 0));
  const endOfToday = new Date(startOfToday.getTime() + (24 * 3600000) - 1);

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

  return members.map(member => calculateMemberStatus(member, todayEvents, now));
}

export function calculateMemberStatus(member, todayEvents, now) {
  const BUFFER_MS = 5 * 60 * 1000;

  const checkEventActive = (event, time) => {
    const eventStart = new Date(event.startAt);
    const eventEnd = new Date(event.endAt);
    const checkTime = time.getTime();
    const isMeeting = event.type === 'MEETING' || event.title?.toLowerCase().includes('sala de juntas');
    const currentBuffer = isMeeting ? 0 : BUFFER_MS;

    if (event.recurrence === 'NONE' || !event.recurrence) {
      return (checkTime >= eventStart.getTime() - currentBuffer) && (checkTime <= eventEnd.getTime() + currentBuffer);
    }
    if (event.recurrence === 'WEEKLY') {
      if (checkTime < eventStart.getTime() - currentBuffer) return false;
      if (event.recurrenceEnd && checkTime > new Date(event.recurrenceEnd).getTime() + currentBuffer) return false;

      // Use absolute UTC offsets to avoid local server time interference
      const getBogotaDayAndMinutes = (d) => {
          const bogotaTime = new Date(d.getTime() - (5 * 3600000));
          return {
              day: bogotaTime.getUTCDay(),
              minutes: bogotaTime.getUTCHours() * 60 + bogotaTime.getUTCMinutes()
          };
      };

      const eventTime = getBogotaDayAndMinutes(eventStart);
      const currentTime = getBogotaDayAndMinutes(time);

      if (eventTime.day !== currentTime.day) return false;

      const bufferMin = currentBuffer / 60000;
      const eventEndMin = getBogotaDayAndMinutes(eventEnd).minutes;

      return currentTime.minutes >= eventTime.minutes - bufferMin && currentTime.minutes <= eventEndMin + bufferMin;
    }
    return false;
  };

  // NEW HIERARCHY (BS-OFFICE-V4-FINAL):
  // 1. MEETING (Active Now) -> Sala de Juntas
  // 2. ABSENCE (Active Now) -> De permiso
  // 3. PRODUCTION (Active Now) -> Producción
  // 4. BREAK / CAFE (Active Now) -> Cafecito Time
  // 5. WORK_DAY / JORNADA (Active Now) -> Oficina Central
  // 6. DEFAULT -> Libre (Oficina Central)

  let status = 'LIBRE'; // Default: Always visible as Libre
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
  const absenceEvent = memberEvents.find(e => (e.type === 'ABSENCE' || e.title?.toLowerCase().includes('permiso')) && checkEventActive(e, now));
  const productionEvent = memberEvents.find(e => (e.type === 'PRODUCTION' || e.title?.toLowerCase().includes('producción')) && checkEventActive(e, now));

  // Priority Resolution Logic (BS-OFFICE-V4-FINAL)
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
    status = 'LIBRE'; // In logic, CAFE is LIBRE zone
    prioritizedEvent = breakEvent;
  } else if (workDayEvent) {
    status = currentTask?.isSpecial ? 'ENFOCADO' : 'OCUPADO';
    prioritizedEvent = workDayEvent;
  } else if (currentTask) {
    status = currentTask.isSpecial ? 'ENFOCADO' : 'OCUPADO';
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
    currentTask: currentTask ? {
      id: currentTask.id,
      title: currentTask.title,
      description: currentTask.comments,
      clientName: currentTask.client?.name
    } : null,
    currentEvent: prioritizedEvent ? {
      id: prioritizedEvent.id,
      title: prioritizedEvent.title,
      type: prioritizedEvent.type,
      startAt: prioritizedEvent.startAt,
      endAt: prioritizedEvent.endAt,
      isAllDay: Boolean(prioritizedEvent.isAllDay),
      recurrence: prioritizedEvent.recurrence,
      meetingLink: prioritizedEvent.meetingLink,
      description: prioritizedEvent.description
    } : null
  };
}
