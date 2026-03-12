import prisma from '../lib/prisma.js';

/**
 * Get all feedback records for a collaborator, filtered by soft delete.
 * @param {string} collaboratorId
 * @param {boolean} isAdmin - If true, includes privateNotes.
 */
export const getFeedbackForCollaborator = async (collaboratorId, isAdmin = false) => {
    const feedback = await prisma.feedbackRecord.findMany({
        where: {
            collaboratorId,
            deletedAt: null
        },
        include: {
            author: {
                select: {
                    id: true,
                    name: true,
                    avatarUrl: true
                }
            }
        },
        orderBy: {
            date: 'desc'
        }
    });

    // Strip privateNote if not admin
    if (!isAdmin) {
        return feedback.map(({ privateNote, ...rest }) => rest);
    }

    return feedback;
};

/**
 * Create a new feedback record.
 */
export const createFeedbackRecord = async (data) => {
    return await prisma.feedbackRecord.create({
        data,
        include: {
            author: {
                select: {
                    id: true,
                    name: true,
                    avatarUrl: true
                }
            }
        }
    });
};

/**
 * Update an existing feedback record.
 */
export const updateFeedbackRecord = async (id, data) => {
    return await prisma.feedbackRecord.update({
        where: { id },
        data,
        include: {
            author: {
                select: {
                    id: true,
                    name: true,
                    avatarUrl: true
                }
            }
        }
    });
};

/**
 * Soft delete a feedback record.
 */
export const softDeleteFeedbackRecord = async (id) => {
    return await prisma.feedbackRecord.update({
        where: { id },
        data: {
            deletedAt: new Date()
        }
    });
};

/**
 * Get a single feedback record by ID.
 */
export const getFeedbackById = async (id) => {
    return await prisma.feedbackRecord.findUnique({
        where: { id }
    });
};
