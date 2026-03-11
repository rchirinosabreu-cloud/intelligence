import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  console.log('Iniciando recuperación de tareas completadas...');
  try {
    const result = await prisma.task.updateMany({
      where: {
        completedAt: { not: null }
      },
      data: {
        status: 'REALIZADA' // Mapeo exacto al Enum de Prisma
      }
    });
    console.log(`¡Éxito! ${result.count} tareas fueron actualizadas al estado 'REALIZADA'.`);
  } catch (e) {
    console.error('Error durante la actualización:', e);
  } finally {
    await prisma.$disconnect();
  }
}
main();
