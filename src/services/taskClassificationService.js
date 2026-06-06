import prisma from '../lib/prisma.js';
import { classifyTasksBatch } from './aiService.js';
import { normalizeCategory } from './nativeTaskService.js';

const BATCH_SIZE = 50;

/**
 * Service to process unclassified tasks in batches.
 */
export const processUnclassifiedTasks = async () => {
    try {
        console.log(`[ClassificationService] Checking for unclassified tasks...`);

        const unclassifiedTasks = await prisma.task.findMany({
            where: {
                OR: [
                    { aiCategory: null },
                    { aiCategory: "Sin Clasificar" },
                    { aiComplexity: null }
                ]
            },
            select: { id: true, title: true, comments: true },
            take: BATCH_SIZE // Process 50 at a time to stay within LLM limits
        });

        if (unclassifiedTasks.length === 0) {
            console.log(`[ClassificationService] No unclassified tasks found.`);
            return { processed: 0 };
        }

        console.log(`[ClassificationService] Processing batch of ${unclassifiedTasks.length} tasks...`);

        const classifications = await classifyTasksBatch(unclassifiedTasks);

        if (!classifications || !Array.isArray(classifications)) {
            console.warn(`[ClassificationService] Invalid response from AI service.`);
            return { processed: 0 };
        }

        let updatedCount = 0;
        for (const item of classifications) {
            try {
                if (item.id && item.categoria) {
                    await prisma.task.update({
                        where: { id: item.id },
                        data: {
                            aiCategory: normalizeCategory(item.categoria),
                            aiComplexity: item.complejidad || "MEDIA"
                        }
                    });
                    updatedCount++;
                }
            } catch (updateErr) {
                console.error(`[ClassificationService] Failed to update task ${item.id}:`, updateErr.message);
            }
        }

        console.log(`[ClassificationService] Successfully classified ${updatedCount} tasks.`);
        return { processed: updatedCount };

    } catch (error) {
        console.error(`[ClassificationService] Critical failure:`, error.message);
        return { error: error.message };
    }
};

/**
 * Initializes the automated classification cron job.
 * Runs every hour.
 */
export const initTaskClassificationCron = () => {
    console.log("[ClassificationService] Automated batch classification initialized (Interval: 1 hour).");

    // Initial run after 5 seconds to clear any pending tasks on startup
    setTimeout(processUnclassifiedTasks, 5000);

    // Run every hour
    setInterval(processUnclassifiedTasks, 1000 * 60 * 60);
};
