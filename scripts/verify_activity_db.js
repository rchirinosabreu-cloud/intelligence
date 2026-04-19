
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  try {
    const members = await prisma.teamMember.findMany();
    console.log(`Found ${members.length} members.`);
    members.forEach(m => {
      console.log(`- ${m.name}: Desk (${m.desktopX}, ${m.desktopY})`);
    });

    const events = await prisma.operationalEvent.findMany();
    console.log(`Found ${events.length} operational events.`);
  } catch (e) {
    console.error('Verification failed:', e);
  } finally {
    await prisma.$disconnect();
  }
}

main();
