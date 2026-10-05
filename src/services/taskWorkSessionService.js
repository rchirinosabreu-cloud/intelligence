const asDate = (value) => value instanceof Date ? value : new Date(value);

// Colaboradores (Rodny, 5 de octubre de 2026): una tarea tiene dos clases de reloj. El del
// responsable sigue atado al estado de la tarea (`isCollaborator: false`, como todas las sesiones
// anteriores a este cambio); cada colaborador abre y pausa el suyo (`isCollaborator: true`). Las
// búsquedas siempre dicen de cuál hablan: pausar al responsable no puede cerrar la sesión de otro.
const sessionScope = ({ workerId, isCollaborator }) => (isCollaborator
  ? { workerId, isCollaborator: true }
  : { isCollaborator: false });

const durationUntil = (session, endedAt) => Math.max(0, endedAt.getTime() - asDate(session.startedAt).getTime());

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
  workerId = task?.assigneeId || null,
  isCollaborator = false,
} = {}) => {
  const existing = await tx.taskWorkSession.findFirst({
    where: { taskId: task.id, endedAt: null, ...sessionScope({ workerId, isCollaborator }) },
    orderBy: { startedAt: 'desc' },
  });
  if (existing) return existing;

  const overlapping = workerId
    ? await tx.taskWorkSession.findFirst({
        where: {
          workerId,
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
      workerId: workerId || null,
      isCollaborator: Boolean(isCollaborator),
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
  workerId = null,
  isCollaborator = false,
} = {}) => {
  const activeSession = await tx.taskWorkSession.findFirst({
    where: { taskId, endedAt: null, ...sessionScope({ workerId, isCollaborator }) },
    orderBy: { startedAt: 'desc' },
  });
  if (!activeSession) return null;

  const endedAt = asDate(at);
  return tx.taskWorkSession.update({
    where: { id: activeSession.id },
    data: { endedAt, durationMs: durationUntil(activeSession, endedAt), closeReason, endedById: actorId },
  });
};

/** Al cerrar o devolver la tarea se paran todos los relojes: el del responsable y los de los colaboradores. */
export const closeAllOpenTaskWorkSessions = async (tx, {
  taskId,
  actorId = null,
  at = new Date(),
  closeReason,
} = {}) => {
  const open = await tx.taskWorkSession.findMany({ where: { taskId, endedAt: null } });
  const endedAt = asDate(at);
  const closed = [];
  for (const session of open) {
    closed.push(await tx.taskWorkSession.update({
      where: { id: session.id },
      data: { endedAt, durationMs: durationUntil(session, endedAt), closeReason, endedById: actorId },
    }));
  }
  return closed;
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
  // `accumulatedWorkMs` es el reloj del responsable: lo que pusieron los colaboradores no entra en
  // esta cuenta, o la base histórica saldría negativa y se recortaría a cero.
  const recordedSessionMs = cycles.reduce((cycleTotal, cycle) => cycleTotal
    + cycle.sessions
      .filter((session) => !session.isCollaborator)
      .reduce((sessionTotal, session) => sessionTotal + Number(session.durationMs || 0), 0), 0);
  const historicalBaselineMs = Math.max(0, Number(task.accumulatedWorkMs || 0) - recordedSessionMs);
  return { task, cycles, recordedSessionMs, historicalBaselineMs };
};
