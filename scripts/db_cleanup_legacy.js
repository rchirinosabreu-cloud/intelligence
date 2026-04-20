import prisma from '../src/lib/prisma.js';

async function cleanup() {
  console.log('🧹 Iniciando limpieza de datos operativos malformados...');

  try {
    // 1. Eliminar eventos con IDs de mock o inconsistentes
    const mockIds = ['e1', 'e2'];
    const { count: deletedMocks } = await prisma.operationalEvent.deleteMany({
      where: {
        id: { in: mockIds }
      }
    });
    console.log(`✅ Eliminados ${deletedMocks} eventos de mock.`);

    // 2. Eliminar eventos con fechas inválidas (Postgres suele prevenir esto, pero por si acaso)
    // En Prisma, esto se hace mejor consultando y filtrando
    const events = await prisma.operationalEvent.findMany();
    let malformedCount = 0;

    for (const event of events) {
      const start = new Date(event.startAt);
      const end = new Date(event.endAt);

      if (isNaN(start.getTime()) || isNaN(end.getTime())) {
        await prisma.operationalEvent.delete({ where: { id: event.id } });
        malformedCount++;
      }
    }
    console.log(`✅ Eliminados ${malformedCount} eventos con fechas malformadas.`);

    console.log('🎉 LIMPIEZA COMPLETADA.');
  } catch (error) {
    console.error('❌ Error durante la limpieza:', error);
  } finally {
    await prisma.$disconnect();
  }
}

cleanup();
