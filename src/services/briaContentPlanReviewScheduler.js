import prisma from '../lib/prisma.js';
import { reviewContentPlanWithBria, createContentPlanReviewRepository } from './briaContentPlanReviewService.js';
import {
  claimContentPlanReview, failContentPlanReview,
  BRIA_REVIEW_LEASE_MS, BRIA_CONTENT_PLAN_REVIEW_DEBOUNCE_MS
} from './briaContentPlanReviewState.js';

export const BRIA_CONTENT_PLAN_REVIEW_INTERVAL_MS = 60 * 1000;
export const BRIA_CONTENT_PLAN_REVIEW_START_DELAY_MS = 15 * 1000;
export { BRIA_CONTENT_PLAN_REVIEW_DEBOUNCE_MS };
export const BRIA_REVIEW_JOB_TIMEOUT_MS = 4 * 60 * 1000;

export const runContentPlanReviewJob = async ({
  planId, trigger = 'MANUAL', db = prisma, now = () => new Date(),
  review = reviewContentPlanWithBria, reviewOptions = {},
  timeoutMs = BRIA_REVIEW_JOB_TIMEOUT_MS, logger = console
}) => {
  const execution = await claimContentPlanReview(planId, { db, now: now(), trigger });
  if (!execution) return { planId, status: 'SKIPPED' };
  const controller = new AbortController();
  let timer;
  try {
    const deadline = new Promise((_, reject) => {
      timer = setTimeout(() => {
        const error = Object.assign(new Error('La revisión superó su tiempo máximo.'), { code: 'BRIA_REVIEW_TIMEOUT', status: 504 });
        controller.abort(error);
        reject(error);
      }, Math.min(timeoutMs, BRIA_REVIEW_JOB_TIMEOUT_MS));
    });
    const result = await Promise.race([review({
      ...reviewOptions, planId, trigger, execution, now,
      repository: createContentPlanReviewRepository(db), signal: controller.signal
    }), deadline]);
    return { planId, status: 'COMPLETED', result, cached: Boolean(result.meta?.cached) };
  } catch (error) {
    if (error.code !== 'BRIA_REVIEW_SUPERSEDED') {
      logger.error('[BriaContentReview] Review failed:', error.response?.data || error.message || error);
    }
    await failContentPlanReview(execution, error, { db, now: now() });
    return { planId, status: error.code === 'BRIA_REVIEW_SUPERSEDED' ? 'SUPERSEDED' : 'FAILED', error };
  } finally {
    clearTimeout(timer);
  }
};

export const reconcilePendingContentPlanReviews = async ({
  db = prisma,
  review = reviewContentPlanWithBria,
  now = () => new Date(),
  limit = 2,
  reviewOptions = {},
  logger = console
} = {}) => {
  const cutoff = new Date(now().getTime() - BRIA_CONTENT_PLAN_REVIEW_DEBOUNCE_MS);
  const plans = await db.contentPlan.findMany({
    where: {
      deletedAt: null,
      AND: [{ OR: [
        { status: { in: ['PLANIFICACION', 'EN_APROBACION', 'ACTIVO'] } },
        { briaReviewFindings: { some: { status: 'VERIFYING' } } }
      ] }],
      OR: [
        { briaReviewState: 'PENDING', briaReviewRequestedAt: { lte: cutoff },
          OR: [{ briaReviewNextAttemptAt: null }, { briaReviewNextAttemptAt: { lte: now() } }] },
        { briaReviewState: 'RUNNING', OR: [
          { briaReviewStartedAt: null },
          { briaReviewStartedAt: { lte: new Date(now().getTime() - BRIA_REVIEW_LEASE_MS) } }
        ] }
      ]
    },
    select: { id: true, briaReviewRequestedAt: true },
    orderBy: { briaReviewRequestedAt: 'asc' },
    take: limit
  });
  const outcomes = [];
  for (const plan of plans) {
    outcomes.push(await runContentPlanReviewJob({ planId: plan.id, trigger: 'AUTOMATIC', db, review, reviewOptions, now, logger }));
  }
  return outcomes;
};

export function initBriaContentPlanReviewScheduler({
  reconcile = reconcilePendingContentPlanReviews,
  setTimeoutFn = setTimeout,
  setIntervalFn = setInterval,
  logger = console
} = {}) {
  let running = false;
  const run = async () => {
    if (running) return { skipped: true };
    running = true;
    try {
      return await reconcile();
    } catch (error) {
      logger.error('[BriaContentReview] Falló el ciclo automático:', error.response?.data || error.message || error);
      return { error: error.message };
    } finally {
      running = false;
    }
  };
  const startupTimer = setTimeoutFn(run, BRIA_CONTENT_PLAN_REVIEW_START_DELAY_MS);
  startupTimer.unref?.();
  const intervalTimer = setIntervalFn(run, BRIA_CONTENT_PLAN_REVIEW_INTERVAL_MS);
  intervalTimer.unref?.();
  logger.info('[BriaContentReview] Revisión automática configurada cada minuto con 45 segundos de espera tras cambios.');
  return { startupTimer, intervalTimer, run };
}
