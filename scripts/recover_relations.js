import prisma from '../src/lib/prisma.js';

async function main() {
  console.log('--- STARTING RECOVERY SCRIPT (v2) ---');
  const june17 = new Date('2026-06-17T00:00:00.000Z');

  // 1. Fix Inconsistent Plan-Client relationships
  console.log('1. Checking for plans associated with wrong clients based on tasks...');
  const plans = await prisma.contentPlan.findMany({
    where: {
      updatedAt: { gte: june17 },
      deletedAt: null
    },
    include: {
      client: true,
      contentItems: {
        include: {
          tasks: {
            take: 5
          }
        }
      }
    }
  });

  for (const plan of plans) {
    const taskClientIds = new Set();
    plan.contentItems.forEach(item => {
      item.tasks.forEach(task => {
        taskClientIds.add(task.clientId);
      });
    });

    if (taskClientIds.size === 1) {
      const realClientId = Array.from(taskClientIds)[0];
      if (realClientId !== plan.clientId) {
        const realClient = await prisma.client.findUnique({ where: { id: realClientId } });
        console.log(`Plan ${plan.id} (${plan.month}/${plan.year}) belongs to Client ${plan.client.name} but its tasks belong to ${realClient?.name || realClientId}. Relinking...`);

        await prisma.contentPlan.update({
          where: { id: plan.id },
          data: { clientId: realClientId }
        });
      }
    } else if (taskClientIds.size > 1) {
      console.warn(`Plan ${plan.id} has tasks from multiple clients: ${Array.from(taskClientIds).join(', ')}. Manual intervention suggested.`);
    }
  }

  // 2. Restore Client Names if they were accidentally changed
  console.log('2. Checking for accidentally renamed clients...');
  const renamedClients = await prisma.client.findMany({
    where: {
      name: 'New Pueblito',
      slug: { not: 'new-pueblito' }
    }
  });

  for (const client of renamedClients) {
    let originalName = '';
    if (client.slug === 'colegio-de-las-americas') originalName = 'Colegio de las Américas';
    else if (client.slug === 'muebles-nuva') originalName = 'Muebles Nuva';
    else {
      originalName = client.slug.split('-').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
    }
    console.log(`Restoring client name for slug ${client.slug}: -> ${originalName}`);
    await prisma.client.update({
      where: { id: client.id },
      data: { name: originalName }
    });
  }

  // 3. Purge Duplicate Plans for New Pueblito
  console.log('3. Purging duplicate New Pueblito plans...');
  const pueblito = await prisma.client.findUnique({ where: { slug: 'new-pueblito' } });
  if (pueblito) {
    const pueblitoPlans = await prisma.contentPlan.findMany({
      where: {
        clientId: pueblito.id,
        deletedAt: null
      },
      include: {
        contentItems: {
          include: { tasks: true }
        }
      },
      orderBy: { createdAt: 'asc' }
    });

    const groups = {};
    pueblitoPlans.forEach(p => {
      const key = `${p.month}-${p.year}`;
      if (!groups[key]) groups[key] = [];
      groups[key].push(p);
    });

    for (const [key, group] of Object.entries(groups)) {
      if (group.length > 1) {
        console.log(`Found ${group.length} plans for New Pueblito in ${key}`);

        // Criterio: Prioriza el que tenga tareas reales.
        let planToKeep = group[0];
        let maxTasks = -1;

        for (const p of group) {
            const tasksCount = p.contentItems.reduce((acc, item) => acc + item.tasks.length, 0);
            if (tasksCount > maxTasks) {
                maxTasks = tasksCount;
                planToKeep = p;
            }
        }

        console.log(`  Keeping plan ${planToKeep.id} (Tasks: ${maxTasks})`);

        for (const plan of group) {
          if (plan.id === planToKeep.id) continue;

          console.log(`  Merging and deleting duplicate plan ${plan.id}...`);
          for (const item of plan.contentItems) {
            if (item.tasks.length > 0) {
              // Move tasks to a matching item in planToKeep or just move the item
              // Check if an item with same objective/format exists in planToKeep
              const matchingItem = planToKeep.contentItems.find(i => i.objective === item.objective && i.format === item.format);
              if (matchingItem) {
                console.log(`    Moving ${item.tasks.length} tasks from item ${item.id} to matching item ${matchingItem.id}`);
                for (const task of item.tasks) {
                  await prisma.task.update({
                    where: { id: task.id },
                    data: { contentItemId: matchingItem.id }
                  });
                }
                await prisma.contentItem.delete({ where: { id: item.id } });
              } else {
                console.log(`    Relinking item ${item.id} to plan ${planToKeep.id}`);
                await prisma.contentItem.update({
                  where: { id: item.id },
                  data: { planId: planToKeep.id }
                });
              }
            } else {
              await prisma.contentItem.delete({ where: { id: item.id } });
            }
          }
          await prisma.contentPlan.delete({ where: { id: plan.id } });
        }
      }
    }
  }

  console.log('--- RECOVERY COMPLETED ---');
}

main()
  .catch(e => console.error(e))
  .finally(async () => await prisma.$disconnect());
