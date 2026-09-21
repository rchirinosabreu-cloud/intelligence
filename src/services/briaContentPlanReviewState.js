import prisma from '../lib/prisma.js';
import { randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';

export const BRIA_REVIEW_LEASE_MS = 5 * 60 * 1000;
export const BRIA_REVIEW_MAX_ATTEMPTS = 3;
export const BRIA_CONTENT_PLAN_REVIEW_DEBOUNCE_MS = 45 * 1000;
// Technical causes kept per plan: enough to see a pattern, bounded so the row never grows unchecked.
export const BRIA_REVIEW_DIAGNOSTICS_LIMIT = 5;

export const buildReviewDiagnostic = (error, lease, now = new Date(), { retry = false } = {}) => {
  const status = Number(error?.status || error?.response?.status) || null;
  return {
    attempt: Number.isFinite(Number(lease?.attempts)) ? Number(lease.attempts) : null,
    at: now.toISOString(),
    code: error?.code || (status ? `HTTP_${status}` : 'UNKNOWN'),
    status,
    message: String(error?.message || '').trim().slice(0, 300),
    requestId: error?.requestId || null,
    retry
  };
};

export const buildContentPlanReviewPendingData = (requestedAt = new Date()) => ({
  briaReviewState: 'PENDING', briaReviewRequestedAt: requestedAt,
  briaReviewStartedAt: null, briaReviewError: null, briaReviewLeaseToken: null,
  briaReviewAttempts: 0, briaReviewNextAttemptAt: null, briaReviewCheckpoint: Prisma.DbNull
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
    briaReviewLeaseToken: null, briaReviewNextAttemptAt: null, briaReviewError: null, briaReviewCheckpoint: Prisma.DbNull,
    briaReviewDiagnostics: Prisma.DbNull
  } });
  if (!result.count) throw supersededReviewError();
};

export const saveContentPlanReviewCheckpoint = async (db, lease, checkpoint, now = new Date()) => {
  if (!lease?.token) throw supersededReviewError();
  const saved = await db.contentPlan.updateMany({ where: {
    ...leaseWhere(lease), briaReviewStartedAt: { gt: new Date(now.getTime() - BRIA_REVIEW_LEASE_MS) }
  }, data: { briaReviewCheckpoint: checkpoint } });
  if (!saved.count) throw supersededReviewError();
};

export const failContentPlanReview = async (lease, error, { db = prisma, now = new Date() } = {}) => {
  // A superseded review is not a failure: the plan changed and will be reviewed again.
  if (error.code === 'BRIA_REVIEW_SUPERSEDED') {
    return db.contentPlan.updateMany({ where: leaseWhere(lease), data: buildContentPlanReviewPendingData(now) });
  }
  const status = Number(error.status || error.response?.status);
  const permanent = error.code === 'OPENAI_NOT_CONFIGURED' || (status >= 400 && status < 500 && ![408, 429].includes(status));
  const retry = !permanent && lease.attempts < BRIA_REVIEW_MAX_ATTEMPTS;
  // The human message stays short; the technical cause of every attempt is kept beside it.
  const current = await db.contentPlan.findUnique({ where: { id: lease.planId }, select: { briaReviewDiagnostics: true } });
  const previous = Array.isArray(current?.briaReviewDiagnostics) ? current.briaReviewDiagnostics : [];
  const briaReviewDiagnostics = [...previous, buildReviewDiagnostic(error, lease, now, { retry })].slice(-BRIA_REVIEW_DIAGNOSTICS_LIMIT);
  return db.contentPlan.updateMany({ where: leaseWhere(lease), data: {
    briaReviewState: retry ? 'PENDING' : 'FAILED', briaReviewStartedAt: null, briaReviewLeaseToken: null,
    briaReviewNextAttemptAt: retry ? new Date(now.getTime() + 60000 * (2 ** (lease.attempts - 1))) : null,
    briaReviewError: error.code === 'BRIA_REVIEW_CONTEXT_TOO_LARGE' ? error.message
      : retry ? 'Bria reintentará la revisión automáticamente.' : 'No se pudo completar la revisión. Puedes revisar nuevamente.',
    briaReviewDiagnostics
  } });
};

// Finalized or deleted plans are no longer reviewed automatically: their open
// findings become STALE and a pending review stops looking like queued work.
// Corrections the team asked to verify (VERIFYING) are kept; the scheduler
// still serves those plans.
export const archiveStaleContentPlanReviews = async ({ db = prisma, now = new Date() } = {}) => {
  const findings = await db.contentPlanReviewFinding.updateMany({
    where: { status: 'OPEN', plan: { OR: [{ status: 'FINALIZADO' }, { deletedAt: { not: null } }] } },
    data: { status: 'STALE', actionReason: 'Parrilla finalizada', lastActionAt: now, lastActionById: null }
  });
  const plans = await db.contentPlan.updateMany({
    where: { status: 'FINALIZADO', deletedAt: null, briaReviewState: 'PENDING', briaReviewFindings: { none: { status: 'VERIFYING' } } },
    data: { briaReviewState: 'STALE', briaReviewLeaseToken: null, briaReviewNextAttemptAt: null, briaReviewStartedAt: null }
  });
  return { findings: findings.count, plans: plans.count };
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
