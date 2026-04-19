
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function seedActivity() {
  console.log('Seeding activity data (Refined)...');

  // 1. Ensure we have team members with coordinates
  const members = await prisma.teamMember.findMany();
  if (members.length === 0) {
    console.log('No members found. Please run main seed first.');
    return;
  }

  // Use normalized 0-100 coordinates for the 2D map
  const coords = [
    { x: 45, y: 35 }, { x: 55, y: 35 }, { x: 45, y: 55 },
    { x: 55, y: 55 }, { x: 45, y: 75 }, { x: 55, y: 75 }
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
  const now = new Date();
  const start = new Date(now.getTime() - 3600000); // 1 hour ago
  const end = new Date(now.getTime() + 14400000); // 4 hours from now

  // Delete existing events to avoid clutter during demo seeding
  await prisma.operationalEvent.deleteMany({});

  // Production Event (to trigger neon pulse)
  await prisma.operationalEvent.create({
    data: {
      title: 'Jornada de Producción: Podcast Brain',
      type: 'PRODUCTION',
      startAt: start,
      endAt: end,
      description: 'Grabación de episodios 4 y 5',
      memberIds: [members[0]?.id].filter(Boolean)
    }
  });

  // Meeting Event
  await prisma.operationalEvent.create({
    data: {
      title: 'Daily Sync Estratégico',
      type: 'MEETING',
      startAt: start,
      endAt: end,
      description: 'Alineación matutina',
      memberIds: [members[1]?.id].filter(Boolean),
      meetLink: 'https://meet.google.com/abc-defg-hij'
    }
  });

  console.log('Activity data seeded successfully.');
}

seedActivity()
  .catch(e => console.error(e))
  .finally(() => prisma.$disconnect());
