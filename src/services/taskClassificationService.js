import prisma from '../lib/prisma.js';
import * as aiService from './aiService.js';
import { normalizeCategory } from './nativeTaskService.js';
import aiConfig from '../config/aiConfig.js';

const BATCH_SIZE = 50;

/**
 * Service to process unclassified tasks in batches.
 */
export const processUnclassifiedTasks = async () => {
    try {
        if (!aiService.isInitialized()) {
            console.log(`[ClassificationService] AI not initialized. Attempting initialization...`);
            await aiService.initialize();
        }

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

        const classifications = await aiService.classifyTasksBatch(unclassifiedTasks);

        // Defensive Check: Validate classifications structure
        if (!classifications || !Array.isArray(classifications)) {
            console.warn(`[ClassificationService] Batch result is not an array or is null.`);
            return { processed: 0 };
        }

        let updatedCount = 0;
        for (const item of classifications) {
            // Safe access using optional chaining
            const taskId = item?.id;
            const taskCategory = item?.category;
            const taskComplexity = item?.complexity;

            try {
                if (taskId && taskCategory) {
                    // Normalize category to match Enum if necessary
                    // (Assuming normalizeCategory already handles mapping or we do it here)
                    const normalizedCat = item.category.toUpperCase().replace(/\s+/g, '_');

                    // Critical: Use explicit primitive data to avoid relational duplication/unlinking
                    await prisma.task.update({
                        where: { id: taskId },
                        data: {
                            aiCategory: normalizeCategory(taskCategory),
                            aiComplexity: taskComplexity || "MEDIA"
                        }
                    });
                    updatedCount++;
                }
            } catch (updateErr) {
                console.error(`[ClassificationService] Failed to update task ${taskId || 'unknown'}:`, updateErr.message);
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
 * Enqueues a single task for classification.
 * Optimized for non-blocking execution during creation.
 */
export const enqueueTaskClassification = async (taskId, title, comments = "") => {
    try {
        const { apiKey, modelName } = aiConfig;

        if (!apiKey || !modelName) {
            console.warn(`[ClassificationService] IA_DESACTIVADA: Missing config for task ${taskId}`);
            await prisma.task.update({
                where: { id: taskId },
                data: {
                    aiCategory: "IA_DESACTIVADA",
                    aiComplexity: "MEDIA"
                }
            });
            return;
        }

        if (!aiService.isInitialized()) {
            await aiService.initialize();
        }

        const classification = await aiService.classifyTaskWithAI(title, comments);
        if (classification && classification.category) {
            // Critical: Use explicit primitive data to avoid relational duplication/unlinking
            await prisma.task.update({
                where: { id: taskId },
                data: {
                    aiCategory: normalizeCategory(classification.category),
                    aiComplexity: classification.complexity || "MEDIA"
                }
            });
            console.log(`[ClassificationService] Individual classification completed for task ${taskId}`);
        }
    } catch (error) {
        console.error(`[ClassificationService] Failed individual classification for task ${taskId}:`, error.message);
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
