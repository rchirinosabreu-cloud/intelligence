import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('--- SEEDING TEAM DATA (SQLITE) ---');

  // Create a Team Member linked to the Admin user
  const adminUser = await prisma.user.findUnique({ where: { email: 'admin@brainstudio.com' } });

  if (adminUser) {
    await prisma.teamMember.upsert({
      where: { userId: adminUser.id },
      update: {
        name: 'Rodny Admin',
        role: 'Director',
        isActive: true
      },
      create: {
        name: 'Rodny Admin',
        role: 'Director',
        email: adminUser.email,
        isActive: true,
        userId: adminUser.id
      }
    });
    console.log('Team Member: Rodny Admin created/updated');
  }

  // Create another dummy team member
  await prisma.teamMember.create({
    data: {
      name: 'Jules Dev',
      role: 'Diseñador',
      isActive: true,
      email: 'jules@brainstudio.com'
    }
  });
  console.log('Team Member: Jules Dev created');

  console.log('--- SEED COMPLETE ---');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
