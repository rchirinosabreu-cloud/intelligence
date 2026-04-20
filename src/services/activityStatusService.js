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

  const now = new Date();
  const activeEvents = await prisma.operationalEvent.findMany({
    where: {
      OR: [
        { startAt: { lte: now }, endAt: { gte: now } },
        { recurrence: 'WEEKLY', startAt: { lte: now } }
      ]
    }
  });

  // Filter recurring events that match current time in their cycle
  const currentEvents = activeEvents.filter(event => {
    if (event.recurrence === 'NONE' || !event.recurrence) {
      return event.startAt <= now && event.endAt >= now;
    }
    if (event.recurrence === 'WEEKLY') {
      const start = new Date(event.startAt);
      const end = new Date(event.endAt);
      const duration = end.getTime() - start.getTime();
      const msPerWeek = 7 * 24 * 60 * 60 * 1000;
      const timeDiff = now.getTime() - start.getTime();
      const offsetInWeek = timeDiff % msPerWeek;
      return offsetInWeek >= 0 && offsetInWeek <= duration;
    }
    return false;
  });

  return members.map(member => {
    let status = 'LIBRE'; // Default: 🟢 Libre
    let currentTask = member.nativeTasks[0] || null;
    let currentEvent = currentEvents.find(e => e.memberIds.includes(member.id));

    // Priority 1: Events (Meeting or Absence)
    if (currentEvent) {
      if (currentEvent.type === 'ABSENCE') {
        status = 'AUSENTE'; // ❌ Ausente
      } else if (currentEvent.type === 'MEETING') {
        status = 'REUNION'; // ⚪ En reunión
      } else if (currentEvent.type === 'PRODUCTION') {
        status = 'PRODUCCION'; // Part of Production Set
      }
    }
    // Priority 2: Kanban Tasks
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
      status,
      currentTask: currentTask ? { title: currentTask.title } : null,
      currentEvent: currentEvent ? {
        title: currentEvent.title,
        type: currentEvent.type,
        meetingLink: currentEvent.meetingLink,
        description: currentEvent.description
      } : null
    };
  });
}
