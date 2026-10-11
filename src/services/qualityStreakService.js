import prisma from '../lib/prisma.js';
import { recognitionTransaction } from './recognitionService.js';

const DAY_MS = 24 * 60 * 60 * 1000;
const H = 60 * 60 * 1000;
const bogotaDate = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Bogota', year: 'numeric', month: '2-digit', day: '2-digit',
});

// La jornada que cuenta (Rodny, 10 de octubre de 2026: «la racha de devueltas debe cubrir todo, desde las 8am hasta
// las 6pm»): un día suma cuando su franja de 8:00 a 18:00 de Bogotá pasó entera sin devueltas. Antes se contaba de
// medianoche a medianoche, así que un día limpio solo se veía al día siguiente y una devolución a las 7 de la mañana,
// corregida antes de las 8, costaba el día completo.
export const STREAK_WORKDAY = Object.freeze({ start: 8, end: 18 });
const midnight = (value) => new Date(`${bogotaDate.format(new Date(value))}T00:00:00-05:00`).getTime();

export function completedCleanDays(since, at) {
  if (!since) return 0;
  const start = new Date(since).getTime();
  const startMidnight = midnight(start);
  // Si el periodo limpio empezó antes de las 8, el día de hoy cuenta; si no, el primero es mañana.
  const firstDay = start <= startMidnight + STREAK_WORKDAY.start * H ? startMidnight : startMidnight + DAY_MS;
  const now = new Date(at).getTime();
  let count = 0;
  for (let day = firstDay; day + STREAK_WORKDAY.end * H <= now; day += DAY_MS) count += 1;
  return count;
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
