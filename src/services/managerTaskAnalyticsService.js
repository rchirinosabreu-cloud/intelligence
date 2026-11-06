import prisma from '../lib/prisma.js';
import { hasTaskParticipations, taskParticipations } from '../lib/taskParticipation.js';
import { taskParticipationSelect } from '../lib/taskParticipationMetrics.js';

const DAY_MS = 24 * 60 * 60 * 1000;

const asDateMs = (value) => {
  if (!value) return null;
  const timestamp = value instanceof Date ? value.getTime() : new Date(value).getTime();
  return Number.isFinite(timestamp) ? timestamp : null;
};

const asDuration = (session, nowMs) => {
  const stored = session?.durationMs === null || session?.durationMs === undefined
    ? null
    : Number(session.durationMs);
  if (stored !== null && Number.isFinite(stored) && stored >= 0) return stored;
  const startedAt = asDateMs(session?.startedAt);
  const endedAt = asDateMs(session?.endedAt) ?? nowMs;
  if (startedAt === null || endedAt === null) return 0;
  return Math.max(0, endedAt - startedAt);
};

const humanize = (value, fallback = 'Sin clasificar') => {
  const text = String(value || '').trim();
  if (!text) return fallback;
  return text
    .toLowerCase()
    .replaceAll('_', ' ')
    .replace(/(^|\s)\p{L}/gu, (letter) => letter.toUpperCase());
};

export const percentile = (values, ratio) => {
  const sorted = values
    .map(Number)
    .filter((value) => Number.isFinite(value) && value >= 0)
    .sort((a, b) => a - b);
  if (sorted.length === 0) return 0;
  const rank = Math.max(1, Math.ceil(Math.min(1, Math.max(0, ratio)) * sorted.length));
  return sorted[rank - 1];
};

const groupSessions = ({ sessions, tasksById, durationBySession, labelFor }) => {
  const grouped = new Map();
  for (const session of sessions) {
    const task = tasksById.get(session.taskId);
    const label = labelFor(task, session);
    const key = String(label || 'Sin clasificar');
    const current = grouped.get(key) || { label: key, workMs: 0, sessions: 0, taskIds: new Set() };
    current.workMs += durationBySession.get(session.id) || 0;
    current.sessions += 1;
    if (session.taskId) current.taskIds.add(session.taskId);
    grouped.set(key, current);
  }
  return [...grouped.values()]
    .map(({ taskIds, ...item }) => ({ ...item, tasks: taskIds.size }))
    .sort((a, b) => b.workMs - a.workMs || a.label.localeCompare(b.label));
};

const buildObserverSnapshot = ({ overview, dataQuality }) => {
  const signals = [];
  const addSignal = (code, severity, title, evidence) => signals.push({ code, severity, title, evidence });

  if (dataQuality.overlappingSessions > 0) {
    addSignal(
      'OVERLAPPING_SESSIONS',
      'critical',
      'Hay sesiones de trabajo simultáneas',
      `${dataQuality.overlappingSessions} ${dataQuality.overlappingSessions === 1 ? 'sesión está activa' : 'sesiones están activas'} ahora para una misma persona.`
    );
  }
  if (dataQuality.inProgressWithoutSession > 0) {
    addSignal(
      'ACTIVE_WITHOUT_SESSION',
      'warning',
      'Hay trabajo en curso sin trazabilidad activa',
      `${dataQuality.inProgressWithoutSession} ${dataQuality.inProgressWithoutSession === 1 ? 'tarea está' : 'tareas están'} en curso sin una sesión abierta.`
    );
  }
  if (dataQuality.unclassifiedTasks > 0) {
    addSignal(
      'UNCLASSIFIED_TASKS',
      'warning',
      'Falta contexto para interpretar parte del trabajo',
      `${dataQuality.unclassifiedTasks} ${dataQuality.unclassifiedTasks === 1 ? 'tarea no tiene' : 'tareas no tienen'} categoría o complejidad completa.`
    );
  }
  if (overview.reworkRate >= 0.25 && overview.reworkMs > 0) {
    addSignal(
      'HIGH_REWORK',
      'attention',
      'El retrabajo merece revisión contextual',
      `${Math.round(overview.reworkRate * 100)} % del esfuerzo registrado ocurrió después del ciclo inicial.`
    );
  }
  if (overview.sessionCount < 10) {
    addSignal(
      'LIMITED_SAMPLE',
      'info',
      'Muestra insuficiente para predecir',
      `Bria observa ${overview.sessionCount} ${overview.sessionCount === 1 ? 'sesión' : 'sesiones'}; necesita al menos 10 para habilitar una base comparativa inicial.`
    );
  }
  if (signals.length === 0) {
    addSignal(
      'STABLE_BASELINE',
      'positive',
      'No hay desviaciones operativas evidentes',
      `${overview.sessionCount} sesiones forman una base descriptiva sin alertas de calidad ni retrabajo elevado.`
    );
  }

  return {
    mode: 'OBSERVE_ONLY',
    generatedFrom: 'task_work_sessions',
    sample: {
      sessionCount: overview.sessionCount,
      minimumSessions: 10,
      readyForPrediction: overview.sessionCount >= 10,
    },
    signals,
  };
};

export const buildManagerTaskAnalytics = ({
  tasks = [],
  cycles = [],
  sessions = [],
  members = [],
  periodDays = 30,
  now = new Date(),
} = {}) => {
  const safePeriodDays = [7, 30, 90].includes(Number(periodDays)) ? Number(periodDays) : 30;
  const nowMs = asDateMs(now) ?? Date.now();
  const cutoffMs = nowMs - safePeriodDays * DAY_MS;
  const tasksById = new Map(tasks.map((task) => [task.id, task]));
  // Colaboradores (5 de octubre de 2026): el tiempo de un colaborador es suyo, no del responsable.
  const memberNames = new Map(members.map((member) => [member.id, member.name]));
  const workerNameFor = (task, session) => memberNames.get(session?.workerId)
    || (session?.workerId === task?.assignee?.id ? task.assignee.name : null)
    || (session?.isCollaborator ? 'Colaborador' : 'Sin responsable');
  const cyclesById = new Map(cycles.map((cycle) => [cycle.id, cycle]));
  const periodSessions = sessions.filter((session) => {
    const startedAt = asDateMs(session.startedAt);
    return startedAt !== null && startedAt >= cutoffMs && startedAt <= nowMs;
  });
  const durationBySession = new Map(periodSessions.map((session) => [session.id, asDuration(session, nowMs)]));
  const durations = [...durationBySession.values()];
  const totalWorkMs = durations.reduce((total, value) => total + value, 0);
  let reworkMs = 0;
  for (const session of periodSessions) {
    if (session.isRework || String(cyclesById.get(session.cycleId)?.kind || 'INITIAL').toUpperCase() !== 'INITIAL') {
      reworkMs += durationBySession.get(session.id) || 0;
    }
  }

  const openSessions = periodSessions.filter(session => !session.endedAt);
  const openSessionsByWorker = new Map();
  for (const session of periodSessions.filter((item) => !item.endedAt && item.workerId)) {
    const workerSessions = openSessionsByWorker.get(session.workerId) || [];
    workerSessions.push(session.id);
    openSessionsByWorker.set(session.workerId, workerSessions);
  }
  const currentOverlappingSessionIds = new Set(
    [...openSessionsByWorker.values()].filter((sessionIds) => sessionIds.length > 1).flat()
  );
  const completedTasks = tasks.filter((task) => {
    const completedAt = asDateMs(task.completedAt);
    return completedAt !== null && completedAt >= cutoffMs && completedAt <= nowMs;
  }).length;
  const activeParts = tasks.flatMap(task => hasTaskParticipations(task)
    ? taskParticipations({ ...task, workSessions: task.workSessions || openSessions.filter(session => session.taskId === task.id) })
      .filter(person => person.status === 'EN_CURSO').map(person => ({ taskId: task.id, memberId: person.memberId }))
    : String(task.status || '').toUpperCase() === 'EN_CURSO'
      ? [{ taskId: task.id, memberId: task.assigneeId || task.assignee?.id || null }] : []);

  const recentSessions = [...periodSessions]
    .sort((a, b) => (asDateMs(b.startedAt) || 0) - (asDateMs(a.startedAt) || 0))
    .slice(0, 12)
    .map((session) => {
      const task = tasksById.get(session.taskId);
      const cycle = cyclesById.get(session.cycleId);
      return {
        id: session.id,
        taskId: session.taskId,
        taskTitle: task?.title || 'Tarea sin título',
        clientName: task?.client?.name || 'Sin cliente',
        workerName: workerNameFor(task, session),
        startedAt: session.startedAt,
        endedAt: session.endedAt,
        durationMs: durationBySession.get(session.id) || 0,
        closeReason: session.closeReason || null,
        cycleKind: session.isRework ? 'REWORK' : cycle?.kind || 'INITIAL',
        isOverlapping: Boolean(session.isOverlapping),
      };
    });

  const overview = {
    totalWorkMs,
    initialWorkMs: Math.max(0, totalWorkMs - reworkMs),
    reworkMs,
    reworkRate: totalWorkMs > 0 ? reworkMs / totalWorkMs : 0,
    medianSessionMs: percentile(durations, 0.5),
    p75SessionMs: percentile(durations, 0.75),
    completedTasks,
    activeTasks: new Set(activeParts.map(part => part.taskId)).size,
    openSessions: periodSessions.filter((session) => !session.endedAt).length,
    sessionCount: periodSessions.length,
    taskCount: new Set(periodSessions.map((session) => session.taskId)).size,
  };
  const dataQuality = {
    inProgressWithoutSession: new Set(activeParts.filter(part => !openSessions.some(session => session.taskId === part.taskId
      && (!part.memberId || session.workerId === part.memberId))).map(part => part.taskId)).size,
    unclassifiedTasks: tasks.filter((task) => !task.aiCategory || !task.aiComplexity).length,
    sessionsWithoutTask: periodSessions.filter((session) => !tasksById.has(session.taskId)).length,
    overlappingSessions: currentOverlappingSessionIds.size,
    historicalOverlappingSessions: periodSessions.filter((session) => session.isOverlapping).length,
  };

  return {
    period: {
      days: safePeriodDays,
      from: new Date(cutoffMs).toISOString(),
      to: new Date(nowMs).toISOString(),
    },
    overview,
    byCategory: groupSessions({
      sessions: periodSessions,
      tasksById,
      durationBySession,
      labelFor: (task) => humanize(task?.aiCategory),
    }),
    byComplexity: groupSessions({
      sessions: periodSessions,
      tasksById,
      durationBySession,
      labelFor: (task) => humanize(task?.aiComplexity),
    }),
    byClient: groupSessions({
      sessions: periodSessions,
      tasksById,
      durationBySession,
      labelFor: (task) => task?.client?.name || 'Sin cliente',
    }),
    byResponsible: groupSessions({
      sessions: periodSessions,
      tasksById,
      durationBySession,
      labelFor: workerNameFor,
    }),
    dataQuality,
    observer: buildObserverSnapshot({ overview, dataQuality }),
    recentSessions,
  };
};

export const getManagerTaskAnalytics = async ({ periodDays = 30, now = new Date(), prismaClient = prisma } = {}) => {
  const safePeriodDays = [7, 30, 90].includes(Number(periodDays)) ? Number(periodDays) : 30;
  const cutoff = new Date(now.getTime() - safePeriodDays * DAY_MS);
  const [tasks, cycles, sessions, members] = await Promise.all([
    prismaClient.task.findMany({
      select: {
        id: true,
        title: true,
        status: true,
        assigneeId: true,
        startedAt: true,
        ...taskParticipationSelect,
        createdAt: true,
        completedAt: true,
        aiCategory: true,
        aiComplexity: true,
        client: { select: { id: true, name: true } },
        assignee: { select: { id: true, name: true } },
      },
    }),
    prismaClient.taskWorkCycle.findMany({
      where: { openedAt: { gte: cutoff } },
      select: { id: true, taskId: true, sequence: true, kind: true, reason: true, openedAt: true, closedAt: true },
    }),
    prismaClient.taskWorkSession.findMany({
      where: { startedAt: { gte: cutoff } },
      select: {
        id: true,
        taskId: true,
        cycleId: true,
        workerId: true,
        startedAt: true,
        endedAt: true,
        durationMs: true,
        closeReason: true,
        isOverlapping: true,
        isCollaborator: true,
        isRework: true,
      },
    }),
    prismaClient.teamMember.findMany({ select: { id: true, name: true } }),
  ]);
  return buildManagerTaskAnalytics({ tasks, cycles, sessions, members, periodDays: safePeriodDays, now });
};
