import { processUnclassifiedTasks } from '../src/services/taskClassificationService.js';
import prisma from '../src/lib/prisma.js';

async function main() {
    console.log("🚀 Starting manual batch regularization...");

    let totalProcessed = 0;
    let hasMore = true;

    while (hasMore) {
        const result = await processUnclassifiedTasks();

        if (result.processed > 0) {
            totalProcessed += result.processed;
            console.log(`✅ Processed ${result.processed} tasks. Total: ${totalProcessed}`);
        } else {
            hasMore = false;
            if (result.error) {
                console.error(`❌ Error during batch: ${result.error}`);
            } else {
                console.log("🏁 No more tasks to classify.");
            }
        }

        // Small cooldown to respect rate limits if many batches are needed
        if (hasMore) {
            await new Promise(resolve => setTimeout(resolve, 2000));
        }
    }

    console.log(`✨ Regularization finished. Total tasks updated: ${totalProcessed}`);
}

main()
    .catch(e => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
