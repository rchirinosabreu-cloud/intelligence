import prisma from '../src/lib/prisma.js';

async function globalSanitize() {
  console.log('--- STARTING GLOBAL CONTENT PLAN SANITIZATION ---');

  // 1. Fix Cross-Client Renaming and Mislinks (Recovery Logic)
  console.log('1. Checking for mislinked plans and renamed clients...');
  const allClients = await prisma.client.findMany();

  for (const client of allClients) {
    // Restore name if it was accidentally changed to "New Pueblito"
    if (client.name === 'New Pueblito' && client.slug !== 'new-pueblito') {
      let originalName = client.slug.split('-').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
      if (client.slug === 'colegio-de-las-americas') originalName = 'Colegio de las Américas';
      if (client.slug === 'muebles-nuva') originalName = 'Muebles Nuva';

      console.log(`[Recovery] Restoring client name for ${client.slug}: -> ${originalName}`);
      await prisma.client.update({
        where: { id: client.id },
        data: { name: originalName }
      });
    }
  }

  // 2. Identify and Consolidate Duplicate Plans (All Clients)
  console.log('2. Consolidation of duplicates for all clients...');
  const duplicateGroups = await prisma.contentPlan.groupBy({
    by: ['clientId', 'month', 'year'],
    where: { deletedAt: null },
    _count: { id: true },
    having: { id: { _count: { gt: 1 } } }
  });

  console.log(`Found ${duplicateGroups.length} combinations of client/month/year with duplicates.`);

  for (const group of duplicateGroups) {
    const { clientId, month, year } = group;
    const client = allClients.find(c => c.id === clientId);
    console.log(`Processing group: ${client?.name || clientId} | ${month}/${year}`);

    const plans = await prisma.contentPlan.findMany({
      where: { clientId, month, year, deletedAt: null },
      include: {
        contentItems: {
          include: { tasks: true }
        }
      },
      orderBy: [
        { contentItems: { _count: 'desc' } }, // Priority 1: Most items
        { updatedAt: 'desc' }               // Priority 2: Most recently updated (Tie-breaker)
      ]
    });

    const masterPlan = plans[0];
    const clones = plans.slice(1);

    console.log(`  Master Plan: ${masterPlan.id} (Items: ${masterPlan.contentItems.length})`);

    for (const clone of clones) {
      console.log(`  Merging clone ${clone.id} (Items: ${clone.contentItems.length})...`);

      for (const item of clone.contentItems) {
        // Find matching item in masterPlan to avoid duplicating items if they are the same
        const matchingItem = masterPlan.contentItems.find(i =>
          i.objective === item.objective &&
          i.format === item.format &&
          i.publishDate.getTime() === item.publishDate.getTime()
        );

        if (matchingItem) {
          if (item.tasks.length > 0) {
            console.log(`    Moving ${item.tasks.length} tasks from item ${item.id} to matching master item ${matchingItem.id}`);
            await prisma.task.updateMany({
              where: { contentItemId: item.id },
              data: { contentItemId: matchingItem.id }
            });
          }
          // Delete duplicate item
          await prisma.contentItem.delete({ where: { id: item.id } });
        } else {
          // No match, move the item itself to masterPlan
          console.log(`    Relinking item ${item.id} to master plan ${masterPlan.id}`);
          await prisma.contentItem.update({
            where: { id: item.id },
            data: { planId: masterPlan.id }
          });
        }
      }

      // Hard delete the empty clone
      await prisma.contentPlan.delete({ where: { id: clone.id } });
      console.log(`  Clone ${clone.id} deleted.`);
    }
  }

  console.log('--- GLOBAL SANITIZATION COMPLETED ---');
}

globalSanitize()
  .catch(e => {
    console.error('Critical error in global sanitize:', e);
    process.exit(1);
  })
  .finally(async () => await prisma.$disconnect());
