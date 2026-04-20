import prisma from '../lib/prisma.js';

export async function getOperationalEvents(start, end) {
  return await prisma.operationalEvent.findMany({
    where: {
      startAt: { gte: new Date(start) },
      endAt: { lte: new Date(end) }
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
      meetingLink: data.meetingLink
    }
  });
}

export async function deleteOperationalEvent(id) {
  return await prisma.operationalEvent.delete({
    where: { id }
  });
}
