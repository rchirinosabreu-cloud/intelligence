import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  console.log('--- INICIANDO RECUPERACIÓN DE DEVOLUCIONES ---');
  try {
    const tasks = await prisma.task.findMany({
      where: {
        comments: { contains: '[DEVOLUCIÓN' }
      }
    });

    console.log(`Se encontraron ${tasks.length} tareas devueltas basándose en comentarios.`);

    let count = 0;
    for (const task of tasks) {
      await prisma.task.update({
        where: { id: task.id },
        data: { status: 'DEVUELTA' }
      });
      count++;
    }
    console.log(`¡ÉXITO! ${count} tareas actualizadas a DEVUELTA.`);
  } catch (e) {
    console.error('Error en la recuperación:', e.message);
  } finally {
    await prisma.$disconnect();
  }
}
main();
