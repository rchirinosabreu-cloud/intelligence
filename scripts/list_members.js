import 'dotenv/config';
import prisma from '../src/lib/prisma.js';

async function main() {
  try {
    const members = await prisma.teamMember.findMany({
      select: { name: true, avatarUrl: true }
    });
    console.log(JSON.stringify(members, null, 2));
  } catch (err) {
    console.error(err);
  } finally {
    await prisma.$disconnect();
  }
}

main();
