const asDate = (value) => value instanceof Date ? value : new Date(value);

export const ensureTaskWorkCycle = async (tx, {
  taskId,
  actorId = null,
  at = new Date(),
  kind = 'INITIAL',
  reason = null,
  note = null,
} = {}) => {
  const openCycle = await tx.taskWorkCycle.findFirst({
    where: { taskId, closedAt: null },
    orderBy: { sequence: 'desc' },
  });
  if (openCycle) return openCycle;

  const aggregate = await tx.taskWorkCycle.aggregate({
    where: { taskId },
    _max: { sequence: true },
  });
  return tx.taskWorkCycle.create({
    data: {
      taskId,
      sequence: (aggregate?._max?.sequence || 0) + 1,
      kind,
      reason,
      note,
      openedAt: asDate(at),
      openedById: actorId,
    },
  });
};

export const openTaskWorkSession = async (tx, {
  task,
  cycleId,
  actorId = null,
  at = new Date(),
} = {}) => {
  const existing = await tx.taskWorkSession.findFirst({
    where: { taskId: task.id, endedAt: null },
    orderBy: { startedAt: 'desc' },
  });
  if (existing) return existing;

  const overlapping = task.assigneeId
    ? await tx.taskWorkSession.findFirst({
        where: {
          workerId: task.assigneeId,
          endedAt: null,
          taskId: { not: task.id },
        },
        select: { id: true },
      })
    : null;

  return tx.taskWorkSession.create({
    data: {
      taskId: task.id,
      cycleId,
      workerId: task.assigneeId || null,
      startedById: actorId,
      startedAt: asDate(at),
      isOverlapping: Boolean(overlapping),
    },
  });
};

export const closeActiveTaskWorkSession = async (tx, {
  taskId,
  actorId = null,
  at = new Date(),
  closeReason,
} = {}) => {
  const activeSession = await tx.taskWorkSession.findFirst({
    where: { taskId, endedAt: null },
    orderBy: { startedAt: 'desc' },
  });
  if (!activeSession) return null;

  const endedAt = asDate(at);
  const durationMs = Math.max(0, endedAt.getTime() - asDate(activeSession.startedAt).getTime());
  return tx.taskWorkSession.update({
    where: { id: activeSession.id },
    data: { endedAt, durationMs, closeReason, endedById: actorId },
  });
};

export const closeActiveTaskWorkCycle = async (tx, {
  taskId,
  actorId = null,
  at = new Date(),
  closeReason,
} = {}) => {
  const cycle = await tx.taskWorkCycle.findFirst({
    where: { taskId, closedAt: null },
    orderBy: { sequence: 'desc' },
  });
  if (!cycle) return null;
  return tx.taskWorkCycle.update({
    where: { id: cycle.id },
    data: { closedAt: asDate(at), closedById: actorId, closeReason },
  });
};

export const listTaskWorkHistory = async (prismaClient, taskId) => {
  const [task, cycles] = await Promise.all([
    prismaClient.task.findUnique({
      where: { id: taskId },
      select: { id: true, status: true, startedAt: true, accumulatedWorkMs: true },
    }),
    prismaClient.taskWorkCycle.findMany({
      where: { taskId },
      orderBy: { sequence: 'asc' },
      include: { sessions: { orderBy: { startedAt: 'asc' } } },
    }),
  ]);
  if (!task) return null;
  const recordedSessionMs = cycles.reduce((cycleTotal, cycle) => cycleTotal
    + cycle.sessions.reduce((sessionTotal, session) => sessionTotal + Number(session.durationMs || 0), 0), 0);
  const historicalBaselineMs = Math.max(0, Number(task.accumulatedWorkMs || 0) - recordedSessionMs);
  return { task, cycles, recordedSessionMs, historicalBaselineMs };
};
