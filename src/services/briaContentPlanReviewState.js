import prisma from '../lib/prisma.js';

export const markContentPlanReviewPending = async (planId, {
  db = prisma,
  requestedAt = new Date()
} = {}) => {
  if (!planId) return null;
  return db.contentPlan.update({
    where: { id: planId },
    data: {
      briaReviewState: 'PENDING',
      briaReviewRequestedAt: requestedAt,
      briaReviewStartedAt: null,
      briaReviewError: null
    },
    select: { id: true, briaReviewState: true, briaReviewRequestedAt: true }
  });
};
