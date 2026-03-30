import prisma from '../src/lib/prisma.js';
import { classifyTaskWithAI } from '../src/services/aiService.js';
import dotenv from 'dotenv';

dotenv.config();

async function classifyPastTasks() {
    console.log("--- INICIANDO CLASIFICACIÓN RETROACTIVA ---");

    try {
        // Lógica 1: Buscar tareas viejas sin aiCategory
        const pendingTasks = await prisma.task.findMany({
            where: {
                aiCategory: null
            }
        });

        console.log(`Encontradas ${pendingTasks.length} tareas pendientes de clasificación.`);

        for (const task of pendingTasks) {
            console.log(`Clasificando: [${task.id}] ${task.title}`);
            try {
                const classification = await classifyTaskWithAI(task.title, task.comments || "");
                if (classification.category) {
                    await prisma.task.update({
                        where: { id: task.id },
                        data: {
                            aiCategory: classification.category,
                            aiComplexity: classification.complexity
                        }
                    });
                    console.log(`   OK: ${classification.category} / ${classification.complexity}`);
                } else {
                    console.log(`   AVISO: La IA no pudo clasificar esta tarea.`);
                }
            } catch (err) {
                console.error(`   ERROR: Falló clasificación para ${task.id}:`, err.message);
            }
        }

        // Lógica 2: Calcular el returnCount histórico
        console.log("\n--- CALCULANDO RETURN COUNT HISTÓRICO ---");
        const tasksWithComments = await prisma.task.findMany({
            where: {
                comments: {
                    contains: "[DEVOLUCIÓN"
                }
            }
        });

        console.log(`Encontradas ${tasksWithComments.length} tareas con posibles devoluciones.`);

        for (const task of tasksWithComments) {
            const comments = task.comments || "";
            // Contamos ocurrencias de "[DEVOLUCIÓN"
            const count = (comments.match(/\[DEVOLUCIÓN/g) || []).length;

            if (count > 0 && count !== task.returnCount) {
                await prisma.task.update({
                    where: { id: task.id },
                    data: { returnCount: count }
                });
                console.log(`[${task.id}] Actualizado returnCount a: ${count}`);
            }
        }

        console.log("\n--- CLASIFICACIÓN COMPLETADA EXITOSAMENTE ---");

    } catch (err) {
        console.error("Fallo crítico en el script:", err);
        process.exit(1);
    } finally {
        await prisma.$disconnect();
    }
}

classifyPastTasks();
