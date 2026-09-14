import { randomUUID } from 'node:crypto';
import { recognitionCalendar, recognitionDueDay, isRecognitionOverdue, taskAwardKinds, planIsApproved } from './recognitionRules.js';
import { recognitionMessages } from '../lib/recognitionPresentation.js';
import { hasModulePermission } from '../config/security.js';

const identitySelect = { id: true, userId: true, isActive: true };
const failure = (message, statusCode) => Object.assign(new Error(message), { statusCode });

// All recognition-bearing task/content writes acquire this lock BEFORE reading their old state.
// Serializable retries also cover readers whose snapshot began while another writer held the lock.
export async function recognitionTransaction(db, work) {
  for (let attempt = 0; ; attempt++) {
    try {
      return await db.$transaction(async tx => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(20260910, 1)`;
        return work(tx);
      }, { isolationLevel: 'Serializable', maxWait: 15000, timeout: 20000 });
    } catch (error) {
      if (error.code !== 'P2034' || attempt >= 5) throw error;
      await new Promise(resolve => setTimeout(resolve, 15 * (attempt + 1)));
    }
  }
}

async function trackDebt(tx, userId, at) {
  if (!userId) return;
  const user = await tx.user.findUnique({ where: { id: userId }, select: { isActive: true } });
  if (!user?.isActive) return;
  const tasks = await tx.task.findMany({ where: { assignee: { userId }, status: { not: 'REALIZADA' }, dueDate: { lt: new Date(`${recognitionCalendar(at).day}T00:00:00Z`) } }, select: { id: true } });
  const debt = await tx.recognitionDebtState.upsert({ where: { userId }, create: { userId }, update: {} });
  const ids = [...new Set([...debt.taskIds, ...tasks.map(task => task.id)])];
  if (ids.length) await tx.recognitionDebtState.update({ where: { userId }, data: { taskIds: ids } });
}

export async function prepareTaskRecognition(tx, taskId, at = new Date()) {
  const task = await tx.task.findUnique({ where: { id: taskId }, include: { assignee: { select: identitySelect } } });
  if (!task) return null;
  const calendar = task.completedAt ? recognitionCalendar(task.completedAt) : {};
  const state = await tx.recognitionTaskState.upsert({ where: { taskId }, update: {}, create: {
    taskId, originalDueDate: task.dueDate, firstCompletedAt: task.completedAt,
    recipientId: task.completedAt ? task.assignee?.userId : null, dayKey: calendar.day, weekKey: calendar.week,
  } });
  await trackDebt(tx, task.assignee?.userId, at);
  return { task, state };
}

async function finishDebt(tx, userId, changedTask, at, mayAward) {
  if (!userId) return false;
  const debt = await tx.recognitionDebtState.findUnique({ where: { userId } });
  if (!debt?.taskIds.length) return false;
  const tracked = await tx.task.findMany({ where: { id: { in: debt.taskIds } }, include: { assignee: { select: identitySelect } } });
  // Missing/reassigned/postponed tasks cannot silently disappear from an episode.
  const blocked = debt.blocked || tracked.length !== debt.taskIds.length || tracked.some(task => task.assignee?.userId !== userId
    || (task.status !== 'REALIZADA' && !isRecognitionOverdue(task, at)));
  const remaining = await tx.task.count({ where: { assignee: { userId }, status: { not: 'REALIZADA' }, dueDate: { lt: new Date(`${recognitionCalendar(at).day}T00:00:00Z`) } } });
  const cleared = remaining === 0;
  const earned = mayAward && !blocked && cleared && debt.taskIds.includes(changedTask?.id) && tracked.every(task => task.status === 'REALIZADA');
  await tx.recognitionDebtState.update({ where: { userId }, data: cleared ? { taskIds: [], blocked: false } : { blocked } });
  return earned;
}

async function insertAward(tx, { kind, recipientId, taskId = null, planId = null, at, evidence }) {
  const { day, week } = recognitionCalendar(at);
  const key = kind === 'FIRST_TASK' ? day : kind === 'EARLY_DELIVERY' ? taskId : kind === 'PLAN_APPROVED' ? planId : `${recipientId}:${kind === 'WEEKLY_FIFTY' ? week : day}`;
  const id = randomUUID();
  const inserted = await tx.recognitionAward.createMany({ data: [{ id, dedupeKey: `v1:${kind}:${key}`, kind, recipientId, taskId, planId, occurredAt: at, dayKey: day, weekKey: week, evidence }], skipDuplicates: true });
  if (inserted.count) await tx.operationalTraceEvent.create({ data: {
    eventType: 'RECOGNITION_GRANTED', actorId: null, subjectUserId: recipientId, taskId, occurredAt: at,
    metadata: { recognitionId: id, kind, planId },
  } });
}

export async function finishTaskRecognition(tx, before, after, at = new Date()) {
  if (!before) return;
  const { task, state } = before;
  const userId = task.assignee?.isActive ? task.assignee.userId : null;
  const user = userId ? await tx.user.findUnique({ where: { id: userId }, select: { isActive: true } }) : null;
  const first = after?.status === 'REALIZADA' && task.status !== 'REALIZADA' && !state.firstCompletedAt;
  const eligible = first && after.assigneeId === task.assigneeId && user?.isActive;
  // Record the first completion even without an eligible recipient: later assignment cannot invent a completion.
  if (first) {
    const { day, week } = recognitionCalendar(at);
    await tx.recognitionTaskState.update({ where: { taskId: task.id }, data: { firstCompletedAt: at, recipientId: eligible ? userId : null, dayKey: day, weekKey: week } });
  } else if (!state.originalDueDate && after?.dueDate) {
    await tx.recognitionTaskState.update({ where: { taskId: task.id }, data: { originalDueDate: after.dueDate } });
  }
  const caughtUp = await finishDebt(tx, userId, after, at, Boolean(eligible && isRecognitionOverdue(task, at)));
  if (!eligible) return;
  const { day, week } = recognitionCalendar(at);
  const [teamDayCount, userDayCount, userWeekCount] = await Promise.all([
    tx.recognitionTaskState.count({ where: { dayKey: day } }),
    tx.recognitionTaskState.count({ where: { recipientId: userId, dayKey: day } }),
    tx.recognitionTaskState.count({ where: { recipientId: userId, weekKey: week } }),
  ]);
  const originalDue = recognitionDueDay(state.originalDueDate);
  const currentDue = recognitionDueDay(after.dueDate);
  const early = Boolean(originalDue && currentDue && day < originalDue && day < currentDue);
  for (const kind of taskAwardKinds({ teamDayCount, userDayCount, userWeekCount, early, caughtUp })) {
    await insertAward(tx, { kind, recipientId: userId, taskId: task.id, at,
      evidence: { teamDayCount, userDayCount, userWeekCount, originalDue, completedDay: day, clearedOverdue: caughtUp } });
  }
}

export async function recordPlanRecognition(tx, planId, at = new Date(), { allowAward = true } = {}) {
  const plan = await tx.contentPlan.findUnique({ where: { id: planId }, include: { owner: { select: identitySelect }, contentItems: { where: { deletedAt: null }, select: { id: true, status: true } } } });
  if (!plan || plan.deletedAt) return;
  const state = await tx.recognitionPlanState.upsert({ where: { planId }, create: { planId }, update: {} });
  const approvedIds = plan.contentItems.filter(item => item.status === 'APROBADO'
    || (state.approvedIds.includes(item.id) && ['EN_PRODUCCION', 'REALIZADO', 'PUBLICADO'].includes(item.status))).map(item => item.id);
  await tx.recognitionPlanState.update({ where: { planId }, data: { approvedIds } });
  if (!allowAward || state.awarded || !plan.owner?.isActive || !plan.owner.userId || !planIsApproved(plan.contentItems, approvedIds)) return;
  const user = await tx.user.findUnique({ where: { id: plan.owner.userId }, select: { isActive: true } });
  if (!user?.isActive) return;
  await insertAward(tx, { kind: 'PLAN_APPROVED', recipientId: plan.owner.userId, planId, at, evidence: { itemIds: approvedIds, ownerId: plan.owner.id } });
  await tx.recognitionPlanState.update({ where: { planId }, data: { awarded: true } });
}

const serialize = award => ({ id: award.id, kind: award.kind, taskId: award.taskId, planId: award.planId,
  recipient: { id: award.recipient.id, name: award.recipient.name }, occurredAt: award.occurredAt,
  description: recognitionMessages[award.kind], personalMessage: recognitionMessages[award.kind] });
export async function attachTaskRecognitions(db, tasks) {
  if (!tasks.length) return tasks;
  const awards = await db.recognitionAward.findMany({ where: { taskId: { in: tasks.map(task => task.id) }, recipient: { isActive: true } }, include: { recipient: { select: { id: true, name: true } } }, orderBy: { occurredAt: 'asc' } });
  const byTask = new Map();
  for (const award of awards) { if (!byTask.has(award.taskId)) byTask.set(award.taskId, []); byTask.get(award.taskId).push(award); }
  return tasks.map(task => ({ ...task, recognitions: (byTask.get(task.id) || []).filter(award => award.recipientId === task.assignee?.userId).map(serialize) }));
}

async function activeRecipient(tx, userId) {
  const user = await tx.user.findUnique({ where: { id: userId } });
  if (!user?.isActive) throw failure('Usuario no disponible.', 401);
  return user;
}
async function validRecipientResource(tx, award, userId) {
  return award.taskId ? tx.task.findFirst({ where: { id: award.taskId, status: 'REALIZADA', assignee: { userId, isActive: true } } })
    : tx.contentPlan.findFirst({ where: { id: award.planId, deletedAt: null, owner: { userId, isActive: true } } });
}
export async function claimRecognition(db, userId, at = new Date()) {
  return recognitionTransaction(db, async tx => {
    const user = await activeRecipient(tx, userId);
    const recent = await tx.recognitionAward.findFirst({ where: { recipientId: userId, seenAt: { gt: new Date(at.getTime() - 30000) } } });
    if (recent) return null;
    const inFlight = await tx.recognitionAward.findFirst({ where: { recipientId: userId, seenAt: null, leaseUntil: { gt: at } } });
    if (inFlight) return null;
    const kinds = [];
    if (hasModulePermission(user, 'gestion')) kinds.push('FIRST_TASK', 'EARLY_DELIVERY', 'DAILY_EIGHT', 'CAUGHT_UP', 'WEEKLY_FIFTY');
    if (hasModulePermission(user, 'parrillas')) kinds.push('PLAN_APPROVED');
    const candidates = await tx.recognitionAward.findMany({ where: { recipientId: userId, kind: { in: kinds }, seenAt: null, occurredAt: { gte: new Date(at.getTime() - 86400000), lte: at } }, include: { recipient: { select: { id: true, name: true } } }, orderBy: [{ occurredAt: 'asc' }, { id: 'asc' }], take: 20 });
    for (const award of candidates) {
      const valid = await validRecipientResource(tx, award, userId);
      if (!valid) { await tx.recognitionAward.update({ where: { id: award.id }, data: { seenAt: at } }); continue; }
      const leaseToken = randomUUID();
      await tx.recognitionAward.update({ where: { id: award.id }, data: { leaseToken, leaseUntil: new Date(at.getTime() + 60000) } });
      return { ...serialize(award), leaseToken };
    }
    return null;
  });
}
export async function acknowledgeRecognition(db, userId, id, leaseToken, at = new Date()) {
  return recognitionTransaction(db, async tx => {
    const user = await activeRecipient(tx, userId);
    const award = await tx.recognitionAward.findFirst({ where: { id, recipientId: userId } });
    if (!award) throw failure('Reconocimiento no encontrado.', 404);
    if (!hasModulePermission(user, award.planId ? 'parrillas' : 'gestion')) throw failure('Acceso denegado.', 403);
    if (award.leaseToken !== leaseToken || (!award.seenAt && (!award.leaseUntil || award.leaseUntil < at))) throw failure('La reserva del aviso expiró.', 409);
    if (!award.seenAt && !(await validRecipientResource(tx, award, userId))) throw failure('La tarea o parrilla cambió antes de mostrar el reconocimiento.', 409);
    if (!award.seenAt) await tx.recognitionAward.update({ where: { id }, data: { seenAt: at, leaseUntil: null } });
    return { success: true };
  });
}
