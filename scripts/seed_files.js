
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function seedFiles() {
  try {
    await prisma.clientFile.create({
      data: {
        clientId: '89b57ba6-60fd-498d-9a4a-539d28e3c5c1',
        name: 'Reporte_Mensual_Marzo.pdf',
        bucketUrl: 'bonsai_ctg/test.pdf',
        size: 1542000,
        mimeType: 'application/pdf',
        category: 'Entregable'
      }
    });
    console.log("Mock file seeded.");
  } catch (error) {
    console.error(error);
  } finally {
    await prisma.$disconnect();
  }
}

seedFiles();
