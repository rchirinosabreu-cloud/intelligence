import prisma from '../lib/prisma.js';
import { reviewContentPlanWithBria } from './briaContentPlanReviewService.js';

export const BRIA_CONTENT_PLAN_REVIEW_INTERVAL_MS = 60 * 1000;
export const BRIA_CONTENT_PLAN_REVIEW_START_DELAY_MS = 15 * 1000;
export const BRIA_CONTENT_PLAN_REVIEW_DEBOUNCE_MS = 45 * 1000;

export const reconcilePendingContentPlanReviews = async ({
  db = prisma,
  review = reviewContentPlanWithBria,
  now = () => new Date(),
  limit = 2
} = {}) => {
  const cutoff = new Date(now().getTime() - BRIA_CONTENT_PLAN_REVIEW_DEBOUNCE_MS);
  const plans = await db.contentPlan.findMany({
    where: {
      deletedAt: null,
      status: { in: ['PLANIFICACION', 'EN_APROBACION', 'ACTIVO'] },
      briaReviewState: 'PENDING',
      briaReviewRequestedAt: { lte: cutoff }
    },
    select: { id: true, briaReviewRequestedAt: true },
    orderBy: { briaReviewRequestedAt: 'asc' },
    take: limit
  });
  const outcomes = [];
  for (const plan of plans) {
    const claimedAt = now();
    const claim = await db.contentPlan.updateMany({
      where: {
        id: plan.id,
        briaReviewState: 'PENDING',
        briaReviewRequestedAt: plan.briaReviewRequestedAt
      },
      data: { briaReviewState: 'RUNNING', briaReviewStartedAt: claimedAt, briaReviewError: null }
    });
    if (!claim.count) continue;
    try {
      const result = await review({ planId: plan.id, trigger: 'AUTOMATIC' });
      await db.contentPlan.updateMany({
        where: { id: plan.id, briaReviewState: 'RUNNING', briaReviewRequestedAt: plan.briaReviewRequestedAt },
        data: { briaReviewState: 'CURRENT', briaReviewStartedAt: null, briaReviewError: null }
      });
      outcomes.push({ planId: plan.id, status: 'COMPLETED', cached: Boolean(result.meta?.cached) });
    } catch (error) {
      console.error('[BriaContentReview] Automatic review failed:', error.response?.data || error.message || error);
      await db.contentPlan.updateMany({
        where: { id: plan.id, briaReviewState: 'RUNNING', briaReviewRequestedAt: plan.briaReviewRequestedAt },
        data: { briaReviewState: 'FAILED', briaReviewStartedAt: null, briaReviewError: String(error.message || error).slice(0, 1000) }
      });
      outcomes.push({ planId: plan.id, status: 'FAILED' });
    }
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
