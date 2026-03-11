import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  console.log('--- INICIANDO ESCANEO PROFUNDO ---');
  try {
    // 1. Buscamos TODO lo que no sea explícitamente null o tenga status legacy
    // Note: If the column is already Enum, we might not be able to query by string 'Realizado'
    // unless we cast it, but completedAt is the safest bet.
    const tasks = await prisma.task.findMany({
      where: {
        OR: [
          { completedAt: { not: null } }
        ]
      }
    });

    console.log(`Se encontraron ${tasks.length} tareas candidatas basándose en completedAt.`);

    // 2. Actualizamos una por una para asegurar el cambio de Enum
    let count = 0;
    for (const task of tasks) {
      await prisma.task.update({
        where: { id: task.id },
        data: { status: 'REALIZADA' }
      });
      count++;
    }
    console.log(`¡ÉXITO! ${count} tareas actualizadas a REALIZADA.`);
  } catch (e) {
    console.error('Error en el escaneo:', e.message);
  } finally {
    await prisma.$disconnect();
  }
}
main();
