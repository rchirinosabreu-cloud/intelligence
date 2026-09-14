import prisma from '../lib/prisma.js';
import { recognitionTransaction } from './recognitionService.js';

const DAY_MS = 24 * 60 * 60 * 1000;
const bogotaDate = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Bogota', year: 'numeric', month: '2-digit', day: '2-digit',
});

function completedCleanDays(since, at) {
  if (!since) return 0;
  const start = new Date(since);
  const startMidnight = new Date(`${bogotaDate.format(start)}T00:00:00-05:00`).getTime();
  const firstFullDay = startMidnight + (start.getTime() > startMidnight ? DAY_MS : 0);
  const today = new Date(`${bogotaDate.format(at)}T00:00:00-05:00`).getTime();
  return Math.max(0, Math.floor((today - firstFullDay) / DAY_MS));
}

// Use the same lock as task writes, so a reader cannot overwrite a concurrent return/deletion.
const inTransaction = (db, work) => typeof db.$transaction === 'function'
  ? recognitionTransaction(db, work) : work(db);

async function findOrCreate(tx) {
  const existing = await tx.systemStreak.findUnique({ where: { id: 'global' } });
  return existing || tx.systemStreak.create({ data: { id: 'global', currentStreak: 0, highestStreak: 0 } });
}

export const getOrCreateSystemStreak = (db = prisma) => inTransaction(db, findOrCreate);

export const resetSystemStreak = (db = prisma, at) => inTransaction(db, async tx => {
  const now = at || new Date();
  const streak = await findOrCreate(tx);
  return tx.systemStreak.update({ where: { id: streak.id }, data: {
    currentStreak: 0,
    highestStreak: Math.max(streak.highestStreak, streak.trackingStartedAt ? completedCleanDays(streak.cleanSinceAt, now) : 0),
    cleanSinceAt: null,
    trackingStartedAt: streak.trackingStartedAt || now,
    lastResetAt: now,
    lastIncrementedAt: now,
  } });
});

export const processSystemStreakDailyIncrement = (db = prisma, at) => inTransaction(db, async tx => {
  const now = at || new Date();
  const streak = await findOrCreate(tx);
  const currentReturnedTasksCount = await tx.task.count({ where: { status: 'DEVUELTA' } });
  const initializing = !streak.trackingStartedAt;
  const blocked = currentReturnedTasksCount > 0;
  // Legacy totals never recorded the end of a return. Start from observation, not invented history.
  const cleanSinceAt = blocked ? null : (initializing ? now : streak.cleanSinceAt || now);
  const currentStreak = completedCleanDays(cleanSinceAt, now);
  const highestStreak = Math.max(streak.highestStreak, currentStreak);
  const changed = initializing || currentStreak !== streak.currentStreak || highestStreak !== streak.highestStreak
    || (cleanSinceAt?.getTime() ?? null) !== (streak.cleanSinceAt?.getTime() ?? null);
  const updated = changed ? await tx.systemStreak.update({ where: { id: streak.id }, data: {
    currentStreak, highestStreak, cleanSinceAt,
    trackingStartedAt: streak.trackingStartedAt || now,
    lastIncrementedAt: now,
    ...(blocked ? { lastResetAt: now } : {}),
  } }) : streak;
  return { ...updated, currentReturnedTasksCount };
});

// Call AFTER the task mutation, inside its transaction. Even deleting the last return starts at zero.
export async function recordQualityStreakTransition(tx, before, after, at = new Date()) {
  if (before?.status === after?.status) return;
  if (before?.status !== 'DEVUELTA' && after?.status !== 'DEVUELTA') return;
  await resetSystemStreak(tx, at);
  return processSystemStreakDailyIncrement(tx, at);
}

export async function getQualityStreak(db = prisma, at) {
  const streak = await processSystemStreakDailyIncrement(db, at).catch(error => {
    console.error('[SystemStreak] Failed to read quality streak:', error.response?.data || error);
    throw error;
  });
  return {
    currentStreak: streak.currentStreak,
    maxStreak: streak.highestStreak,
    currentStreakDays: streak.currentStreak,
    currentReturnedTasksCount: streak.currentReturnedTasksCount,
  };
}
