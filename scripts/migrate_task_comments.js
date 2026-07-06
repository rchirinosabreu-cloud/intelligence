
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function migrate() {
  console.log("--- INICIANDO MIGRACIÓN DE COMENTARIOS DE TAREAS ---");

  const tasks = await prisma.task.findMany({
    where: {
      OR: [
        { comments: { not: null } },
        { comments: { not: "" } }
      ]
    },
    select: {
      id: true,
      comments: true,
      creatorId: true,
      assigneeId: true
    }
  });

  console.log(`Encontradas ${tasks.length} tareas con comentarios para analizar.`);

  let migratedCount = 0;

  for (const task of tasks) {
    if (!task.comments) continue;

    // Split comments by newlines to handle multiple entries if they exist
    const commentLines = task.comments.split('\n').filter(line => line.trim() !== "");

    for (const line of commentLines) {
      let type = 'human';
      let content = line.trim();
      let authorId = task.creatorId;

      // Regex patterns
      const returnRegex = /\[DEVOLUCIÓN\s*-\s*([^\]]+)\]:\s*(.*)/i;
      const reintegrateRegex = /\[REINTEGRADA\s*-\s*([^\]]+)\]/i;

      const returnMatch = line.match(returnRegex);
      const reintegrateMatch = line.match(reintegrateRegex);

      if (returnMatch) {
        type = 'system_return';
        content = returnMatch[2] || `Devolución registrada el ${returnMatch[1]}`;
        // Usually returns are done by the person who assigned it or an admin
        authorId = task.creatorId;
      } else if (reintegrateMatch) {
        type = 'system_reintegrate';
        content = `Tarea reintegrada el ${reintegrateMatch[1]}`;
        // Reintegration is usually done by the creator when they fix it
        authorId = task.assigneeId;
      }

      try {
        await prisma.taskComment.create({
          data: {
            taskId: task.id,
            authorId: authorId,
            content: content,
            type: type
          }
        });
        migratedCount++;
      } catch (err) {
        console.error(`Error migrando comentario para tarea ${task.id}:`, err.message);
      }
    }
  }

  console.log(`--- MIGRACIÓN COMPLETADA ---`);
  console.log(`Comentarios procesados e inyectados: ${migratedCount}`);
}

migrate()
  .catch(e => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
