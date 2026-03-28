
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function listFiles() {
  try {
    const files = await prisma.clientFile.findMany({
        orderBy: { createdAt: 'desc' }
    });
    console.log(JSON.stringify(files, null, 2));
  } catch (error) {
    console.error(error);
  } finally {
    await prisma.$disconnect();
  }
}

listFiles();
