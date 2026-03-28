import { PrismaClient } from '@prisma/client';
import { Storage } from '@google-cloud/storage';

const prisma = new PrismaClient();
const storage = new Storage({
    projectId: process.env.GOOGLE_CLOUD_PROJECT,
    credentials: JSON.parse(process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON),
});
const bucketName = process.env.GCS_BUCKET_NAME || 'brainstudio-unstructured-v2';

async function cleanup() {
    console.log("Starting ghost file cleanup...");
    const files = await prisma.clientFile.findMany();
    console.log(`Found ${files.length} records in Prisma.`);

    for (const file of files) {
        try {
            const [exists] = await storage.bucket(bucketName).file(file.bucketUrl).exists();
            if (!exists) {
                console.log(`Ghost file detected: ${file.name} (ID: ${file.id}). Deleting from Prisma...`);
                await prisma.clientFile.delete({ where: { id: file.id } });
            }
        } catch (error) {
            console.error(`Error checking ${file.bucketUrl}:`, error.message);
        }
    }
    console.log("Cleanup finished.");
    await prisma.$disconnect();
}

cleanup();
