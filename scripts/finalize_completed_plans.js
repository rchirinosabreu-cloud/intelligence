import prisma from '../src/lib/prisma.js';

async function finalizeCompletedPlans() {
  console.log('--- STARTING RETROACTIVE CONTENT PLAN FINALIZATION ---');

  try {
    // 1. Fetch all plans that are NOT finalized
    const openPlans = await prisma.contentPlan.findMany({
      where: {
        status: { not: 'FINALIZADO' },
        deletedAt: null
      },
      include: {
        contentItems: {
          where: { deletedAt: null }
        }
      }
    });

    console.log(`Analyzing ${openPlans.length} open content plans...`);

    let finalizedCount = 0;

    for (const plan of openPlans) {
      const items = plan.contentItems || [];

      // A plan can only be finalized if it has items and all are PUBLICADO
      if (items.length > 0 && items.every(item => item.status === 'PUBLICADO')) {
        console.log(`[Migration] Plan ${plan.id} (${plan.month}/${plan.year}) - 100% Published. Finalizing...`);

        await prisma.contentPlan.update({
          where: { id: plan.id },
          data: { status: 'FINALIZADO' }
        });

        finalizedCount++;
      }
    }

    console.log(`--- MIGRATION COMPLETED: ${finalizedCount} plans finalized ---`);
  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

finalizeCompletedPlans();
