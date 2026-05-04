import prisma from '../lib/prisma.js';

export async function getOperationalEvents(start, end) {
  const startDate = new Date(start);
  const endDate = new Date(end);

  return await prisma.operationalEvent.findMany({
    where: {
      OR: [
        // Event starts within range
        { startAt: { gte: startDate, lte: endDate } },
        // Event ends within range
        { endAt: { gte: startDate, lte: endDate } },
        // Event spans across the entire range
        {
          AND: [
            { startAt: { lte: startDate } },
            { endAt: { gte: endDate } }
          ]
        }
      ]
    },
    orderBy: { startAt: 'asc' }
  });
}

export async function createOperationalEvent(data) {
  return await prisma.operationalEvent.create({
    data: {
      title: data.title,
      type: data.type,
      description: data.description,
      startAt: new Date(data.startAt),
      endAt: new Date(data.endAt),
      memberIds: data.memberIds || [],
      recurrence: data.recurrence || 'NONE',
      recurrenceEnd: data.recurrenceEnd ? new Date(data.recurrenceEnd) : null,
      meetingLink: data.meetingLink || null
    }
  });
}

export async function updateOperationalEvent(id, data) {
  return await prisma.operationalEvent.update({
    where: { id },
    data: {
      title: data.title,
      type: data.type,
      description: data.description,
      startAt: data.startAt ? new Date(data.startAt) : undefined,
      endAt: data.endAt ? new Date(data.endAt) : undefined,
      memberIds: data.memberIds,
      recurrence: data.recurrence,
      recurrenceEnd: data.recurrenceEnd ? new Date(data.recurrenceEnd) : null,
      meetingLink: data.meetingLink
    }
  });
}

export async function deleteOperationalEvent(id) {
  return await prisma.operationalEvent.delete({
    where: { id }
  });
}
