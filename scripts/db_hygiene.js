
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function cleanupOrphanedFiles() {
  try {
    console.log("Starting DB hygiene check for ClientFile...");

    // Check for ClientFile records where the client record no longer exists
    const files = await prisma.clientFile.findMany({
        include: { client: true }
    });

    console.log(`Analyzing ${files.length} database records...`);

    const orphanedRecords = files.filter(f => !f.client);

    if (orphanedRecords.length > 0) {
        console.log(`Found ${orphanedRecords.length} orphaned file records (no client relation). Deleting...`);
        const result = await prisma.clientFile.deleteMany({
            where: { id: { in: orphanedRecords.map(r => r.id) } }
        });
        console.log(`Deleted ${result.count} orphaned records.`);
    } else {
        console.log("No orphaned records (missing clients) found.");
    }

    // Check for duplicate or empty names (optional hygiene)
    const emptyNames = await prisma.clientFile.findMany({
        where: { name: "" }
    });

    if (emptyNames.length > 0) {
        console.log(`Found ${emptyNames.length} files with empty names. Deleting...`);
        await prisma.clientFile.deleteMany({
            where: { id: { in: emptyNames.map(r => r.id) } }
        });
    }

  } catch (error) {
    console.error("Cleanup failed:", error);
  } finally {
    await prisma.$disconnect();
  }
}

cleanupOrphanedFiles();
