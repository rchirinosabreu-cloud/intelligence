import prisma from '../lib/prisma.js';
import { randomUUID } from 'node:crypto';

export const BRIA_REVIEW_LEASE_MS = 5 * 60 * 1000;
export const BRIA_REVIEW_MAX_ATTEMPTS = 3;
export const BRIA_CONTENT_PLAN_REVIEW_DEBOUNCE_MS = 45 * 1000;

export const buildContentPlanReviewPendingData = (requestedAt = new Date()) => ({
  briaReviewState: 'PENDING', briaReviewRequestedAt: requestedAt,
  briaReviewStartedAt: null, briaReviewError: null, briaReviewLeaseToken: null,
  briaReviewAttempts: 0, briaReviewNextAttemptAt: null
});

export const supersededReviewError = () => Object.assign(
  new Error('La parrilla cambió o la revisión fue reemplazada; se verificará la versión actual.'),
  { code: 'BRIA_REVIEW_SUPERSEDED' }
);

const leaseWhere = (lease) => ({
  id: lease.planId, deletedAt: null, briaReviewState: 'RUNNING',
  briaReviewLeaseToken: lease.token, briaReviewRequestedAt: lease.requestedAt
});

// Compare-and-set is shared by HTTP requests and every scheduler replica.
export const claimContentPlanReview = async (planId, { db = prisma, now = new Date(), trigger = 'AUTOMATIC' } = {}) => {
  const plan = await db.contentPlan.findUnique({ where: { id: planId } });
  if (!plan || plan.deletedAt) throw Object.assign(new Error('La parrilla no existe o ya no está disponible.'), { code: 'CONTENT_PLAN_NOT_FOUND' });
  const expired = plan.briaReviewState === 'RUNNING'
    && (!plan.briaReviewStartedAt || plan.briaReviewStartedAt.getTime() <= now.getTime() - BRIA_REVIEW_LEASE_MS);
  if (plan.briaReviewState === 'RUNNING' && !expired) return null;
  const where = {
    id: planId, deletedAt: null, briaReviewState: plan.briaReviewState,
    briaReviewLeaseToken: plan.briaReviewLeaseToken,
    briaReviewRequestedAt: plan.briaReviewRequestedAt, briaReviewAttempts: plan.briaReviewAttempts
  };
  if (trigger === 'AUTOMATIC') {
    if (!expired && plan.briaReviewState !== 'PENDING') return null;
    if (!expired && (!plan.briaReviewRequestedAt
      || plan.briaReviewRequestedAt.getTime() > now.getTime() - BRIA_CONTENT_PLAN_REVIEW_DEBOUNCE_MS
      || plan.briaReviewNextAttemptAt > now)) return null;
    if (plan.briaReviewAttempts >= BRIA_REVIEW_MAX_ATTEMPTS) {
      await db.contentPlan.updateMany({ where, data: {
        briaReviewState: 'FAILED', briaReviewStartedAt: null, briaReviewLeaseToken: null,
        briaReviewNextAttemptAt: null, briaReviewError: 'Bria agotó los intentos. Puedes revisar nuevamente.'
      } });
      return null;
    }
  }
  const freshRequest = trigger === 'MANUAL' && !['PENDING', 'RUNNING'].includes(plan.briaReviewState);
  const lease = {
    planId, token: randomUUID(), startedAt: now,
    requestedAt: freshRequest ? now : (plan.briaReviewRequestedAt || now),
    attempts: freshRequest ? 1 : plan.briaReviewAttempts + 1
  };
  const claimed = await db.contentPlan.updateMany({ where, data: {
    briaReviewState: 'RUNNING', briaReviewRequestedAt: lease.requestedAt,
    briaReviewStartedAt: now, briaReviewLeaseToken: lease.token,
    briaReviewAttempts: lease.attempts, briaReviewNextAttemptAt: null, briaReviewError: null
  } });
  return claimed.count ? lease : null;
};

// Must run in the same short transaction as publishing the score/findings.
export const completeContentPlanReviewLease = async (tx, lease, now = new Date()) => {
  if (!lease?.token) throw supersededReviewError();
  const result = await tx.contentPlan.updateMany({ where: {
    ...leaseWhere(lease), briaReviewStartedAt: { gt: new Date(now.getTime() - BRIA_REVIEW_LEASE_MS) }
  }, data: {
    briaReviewState: 'CURRENT', briaReviewStartedAt: null,
    briaReviewLeaseToken: null, briaReviewNextAttemptAt: null, briaReviewError: null
  } });
  if (!result.count) throw supersededReviewError();
};

export const failContentPlanReview = async (lease, error, { db = prisma, now = new Date() } = {}) => {
  const status = Number(error.status || error.response?.status);
  const permanent = error.code === 'OPENAI_NOT_CONFIGURED' || (status >= 400 && status < 500 && ![408, 429].includes(status));
  const retry = !permanent && lease.attempts < BRIA_REVIEW_MAX_ATTEMPTS;
  return db.contentPlan.updateMany({ where: leaseWhere(lease), data:
    error.code === 'BRIA_REVIEW_SUPERSEDED' ? buildContentPlanReviewPendingData(now) : {
      briaReviewState: retry ? 'PENDING' : 'FAILED', briaReviewStartedAt: null, briaReviewLeaseToken: null,
      briaReviewNextAttemptAt: retry ? new Date(now.getTime() + 60000 * (2 ** (lease.attempts - 1))) : null,
      briaReviewError: retry ? 'Bria reintentará la revisión automáticamente.' : 'No se pudo completar la revisión. Puedes revisar nuevamente.'
    }
  });
};

export const markContentPlanReviewPending = async (planId, {
  db = prisma,
  requestedAt = new Date()
} = {}) => {
  if (!planId) return null;
  return db.contentPlan.update({
    where: { id: planId },
    data: buildContentPlanReviewPendingData(requestedAt),
    select: { id: true, briaReviewState: true, briaReviewRequestedAt: true }
  });
};
