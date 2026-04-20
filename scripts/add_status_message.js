import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  try {
    console.log("Checking for statusMessage column in TeamMember...");
    await prisma.$executeRaw`ALTER TABLE "TeamMember" ADD COLUMN IF NOT EXISTS "statusMessage" TEXT;`;
    console.log("Successfully added statusMessage column (or it already exists).");
  } catch (error) {
    console.error("Error adding column:", error);
  } finally {
    await prisma.$disconnect();
  }
}

main();
