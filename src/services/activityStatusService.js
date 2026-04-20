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
  const BUFFER_MS = 5 * 60 * 1000; // 5 minute safety buffer

  const activeEvents = await prisma.operationalEvent.findMany({
    where: {
      OR: [
        {
          startAt: { lte: new Date(now.getTime() + BUFFER_MS) },
          endAt: { gte: new Date(now.getTime() - BUFFER_MS) }
        },
        {
          recurrence: 'WEEKLY',
          startAt: { lte: new Date(now.getTime() + BUFFER_MS) },
          OR: [
            { recurrenceEnd: null },
            { recurrenceEnd: { gte: new Date(now.getTime() - BUFFER_MS) } }
          ]
        }
      ]
    }
  });

  // Filter recurring events that match current time in their cycle (with buffer)
  const currentEvents = activeEvents.filter(event => {
    const eventStart = new Date(event.startAt).getTime();
    const eventEnd = new Date(event.endAt).getTime();
    const nowTime = now.getTime();

    if (event.recurrence === 'NONE' || !event.recurrence) {
      return eventStart - BUFFER_MS <= nowTime && eventEnd + BUFFER_MS >= nowTime;
    }
    if (event.recurrence === 'WEEKLY') {
      // Final boundary check (with buffer)
      if (event.recurrenceEnd && new Date(event.recurrenceEnd).getTime() + BUFFER_MS < nowTime) return false;

      const start = new Date(event.startAt).getTime();
      const end = new Date(event.endAt).getTime();
      const duration = end - start;
      const msPerWeek = 7 * 24 * 60 * 60 * 1000;

      // Calculate offset within the weekly cycle, ensuring it's positive
      const timeDiff = nowTime - start;
      const offsetInWeek = ((timeDiff % msPerWeek) + msPerWeek) % msPerWeek;

      // Check if current time falls within event duration + buffer
      // We check if it's within [0, duration] or in the buffers [msPerWeek - buffer, msPerWeek] or [0, buffer]
      return offsetInWeek <= duration + BUFFER_MS || offsetInWeek >= msPerWeek - BUFFER_MS;
    }
    return false;
  });

  return members.map(member => {
    let status = 'LIBRE'; // Default: 🟢 Libre
    let currentTask = member.nativeTasks[0] || null;

    // Find all events for this member
    const memberEvents = currentEvents.filter(e => e.memberIds.includes(member.id));

    // Priority 1: ABSENCE (Absolute priority, red dot)
    const absenceEvent = memberEvents.find(e => e.type === 'ABSENCE');
    const meetingEvent = memberEvents.find(e => e.type === 'MEETING' && e.meetingLink);
    const productionEvent = memberEvents.find(e => e.type === 'PRODUCTION');

    let prioritizedEvent = null;

    if (absenceEvent) {
      status = 'AUSENTE';
      prioritizedEvent = absenceEvent;
    } else if (meetingEvent) {
      status = 'REUNION';
      prioritizedEvent = meetingEvent;
    } else if (productionEvent) {
      status = 'PRODUCCION';
      prioritizedEvent = productionEvent;
    }

    // Priority 2: Kanban Tasks (only if no high-priority calendar events)
    else if (currentTask) {
      if (currentTask.isSpecial) {
        status = 'ENFOCADO'; // 🟣 Enfocado
      } else if (currentTask.isPriority) {
        status = 'OCUPADO'; // 🟠 Ocupado
      } else {
        status = 'OCUPADO'; // Standard "En proceso"
      }
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
  });
}
