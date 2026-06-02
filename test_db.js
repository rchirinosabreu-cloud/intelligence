import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
async function main() {
  const user = await prisma.user.findFirst();
  console.log(JSON.stringify(user));
  await prisma.$disconnect();
}
main();
