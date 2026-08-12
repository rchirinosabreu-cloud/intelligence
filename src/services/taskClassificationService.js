import prisma from '../lib/prisma.js';
import { classifyTaskDeterministically } from './deterministicTaskClassifier.js';

const BATCH_SIZE = 500;

export const processUnclassifiedTasks = async ({ db = prisma } = {}) => {
  try {
    const unclassifiedTasks = await db.task.findMany({
      where: {
        OR: [
          { aiCategory: null },
          { aiCategory: 'Sin Clasificar' },
          { aiCategory: 'IA_DESACTIVADA' },
          { aiComplexity: null }
        ]
      },
      select: {
        id: true,
        title: true,
        comments: true,
        taskComments: {
          orderBy: { createdAt: 'asc' },
          take: 1,
          select: { content: true }
        },
        _count: {
          select: { taskAttachments: true }
        }
      },
      take: BATCH_SIZE
    });

    if (unclassifiedTasks.length === 0) return { processed: 0 };

    let processed = 0;
    for (const task of unclassifiedTasks) {
      try {
        const classification = classifyTaskDeterministically({
          title: task.title,
          description: [task.comments, task.taskComments?.[0]?.content].filter(Boolean).join(' '),
          attachmentCount: task._count?.taskAttachments || 0
        });

        await db.task.update({
          where: { id: task.id },
          data: {
            aiCategory: classification.category,
            aiComplexity: classification.complexity
          }
        });
        processed += 1;
      } catch (updateError) {
        console.error(`[ClassificationService] Failed to classify task ${task.id}:`, updateError.message);
      }
    }

    console.log(`[ClassificationService] Classified ${processed} tasks with local rules.`);
    return { processed };
  } catch (error) {
    console.error('[ClassificationService] Local classification batch failed:', error.message);
    return { error: error.message, processed: 0 };
  }
};

export const initTaskClassificationCron = () => {
  console.log('[ClassificationService] Local rules backfill initialized (Interval: 1 hour).');

  const startupTimeout = setTimeout(() => {
    processUnclassifiedTasks().catch((error) => {
      console.error('[ClassificationService] Initial local backfill failed:', error.message);
    });
  }, 5000);
  startupTimeout.unref?.();

  const interval = setInterval(() => {
    processUnclassifiedTasks().catch((error) => {
      console.error('[ClassificationService] Periodic local backfill failed:', error.message);
    });
  }, 1000 * 60 * 60);
  interval.unref?.();
};
