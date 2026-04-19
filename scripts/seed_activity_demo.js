
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function seedActivity() {
  console.log('Seeding activity data...');

  // 1. Ensure we have team members with coordinates
  const members = await prisma.teamMember.findMany();
  if (members.length === 0) {
    console.log('No members found. Please run main seed first.');
    return;
  }

  const coords = [
    { x: 100, y: 100 }, { x: 200, y: 100 }, { x: 300, y: 100 },
    { x: 100, y: 200 }, { x: 200, y: 200 }, { x: 300, y: 200 }
  ];

  for (let i = 0; i < members.length; i++) {
    await prisma.teamMember.update({
      where: { id: members[i].id },
      data: {
        desktopX: coords[i % coords.length].x,
        desktopY: coords[i % coords.length].y
      }
    });
  }

  // 2. Create some operational events
  const today = new Date();
  const start = new Date(today.setHours(today.getHours() - 1));
  const end = new Date(today.setHours(today.getHours() + 4));

  // Production Event (to trigger neon lights)
  await prisma.operationalEvent.create({
    data: {
      title: 'Jornada de Producción: Podcast Brain',
      type: 'PRODUCTION',
      startDate: start,
      endDate: end,
      description: 'Grabación de episodios 4 y 5'
    }
  });

  // Meeting Event
  await prisma.operationalEvent.create({
    data: {
      title: 'Daily Sync',
      type: 'MEETING',
      startDate: start,
      endDate: end,
      description: 'Alineación matutina'
    }
  });

  // 3. Ensure some tasks are "In Process" with Special/Priority tags
  // We'll just check if any exist or simulate status in the service if needed,
  // but better to have real tasks.

  console.log('Activity data seeded successfully.');
}

seedActivity()
  .catch(e => console.error(e))
  .finally(() => prisma.$disconnect());
