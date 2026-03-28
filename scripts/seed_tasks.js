
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function seedTasks() {
  try {
    const client = await prisma.client.findFirst({ where: { slug: 'bonsai-ctg' } });
    if (!client) throw new Error("Client not found");

    await prisma.task.create({
      data: {
        clientId: client.id,
        title: 'Diseñar post de Instagram',
        status: 'PENDIENTE',
        dueDate: new Date()
      }
    });

    await prisma.task.create({
      data: {
        clientId: client.id,
        title: 'Revisar métricas semanales',
        status: 'REALIZADA',
        dueDate: new Date()
      }
    });

    console.log("Mock tasks seeded.");
  } catch (error) {
    console.error(error);
  } finally {
    await prisma.$disconnect();
  }
}

seedTasks();
