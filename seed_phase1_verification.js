import prisma from './src/lib/prisma.js';

async function seed() {
  console.log('Seeding initial data for verification...');

  // 1. Get/Create Client
  let client = await prisma.client.findFirst();
  if (!client) {
    client = await prisma.client.create({
      data: {
        name: 'SunPartners',
        slug: 'sunpartners',
        status: 'active'
      }
    });
  }

  // 2. Get/Create TeamMember
  let member = await prisma.teamMember.findFirst();
  if (!member) {
    member = await prisma.teamMember.create({
      data: {
        name: 'Rodny',
        role: 'Director',
        email: 'rodny@brainstudio.com'
      }
    });
  }

  // 3. Create ContentPlan
  const plan = await prisma.contentPlan.create({
    data: {
      clientId: client.id,
      month: 3,
      year: 2026,
      status: 'PLANIFICACION',
      ownerId: member.id
    }
  });

  // 4. Create ContentItem
  await prisma.contentItem.create({
    data: {
      planId: plan.id,
      objective: 'Lanzamiento Nueva Colección',
      format: 'Reel',
      copyText: 'Video de 15s con música trending',
      captionText: '¡La espera terminó! 🚀 #SunPartners',
      publishDate: new Date('2026-03-25'),
      status: 'BORRADOR'
    }
  });

  console.log('Seed completed successfully');
}

seed().catch(e => {
  console.error(e);
  process.exit(1);
}).finally(async () => {
  await prisma.$disconnect();
});
