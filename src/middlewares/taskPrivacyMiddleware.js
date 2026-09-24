import prisma from '../lib/prisma.js';
import { TASK_PRIVACY_SELECT, canOpenTask } from '../lib/taskPrivacy.js';

// El tablero ya no manda el contenido de un pendiente privado a quien no puede abrirlo,
// pero los comentarios, los adjuntos y la propia tarea tienen rutas propias. «No poder
// abrirla» es una decisión del navegador; la cerradura tiene que estar aquí, porque el
// servidor entrega lo que le piden sin mirar qué pantalla lo pidió.
//
// Va como middleware y no repetida en cada controlador: son más de diez rutas, y una
// comprobación copiada diez veces es una comprobación que un día se olvida en la
// undécima.

export const TASK_PRIVATE_FORBIDDEN = 'Este pendiente es privado: solo pueden verlo quien lo creó, quien lo ejecuta y las personas elegidas.';

export const requireTaskAccess = (dependencies = {}) => async (req, res, next) => {
    const prismaClient = dependencies.prismaClient || prisma;
    const taskId = req.params.taskId || req.params.id;
    if (!taskId) return next();

    try {
        const task = await prismaClient.task.findUnique({
            where: { id: taskId },
            select: { id: true, ...TASK_PRIVACY_SELECT }
        });
        // Una tarea que no existe no es asunto de este guardián: cada controlador ya
        // responde su propio 404, y contestar aquí cambiaría respuestas que hoy se esperan.
        if (!task) return next();

        const viewerUserId = req.user?.userId || req.user?.id || null;
        if (!canOpenTask(task, viewerUserId)) {
            return res.status(403).json({ error: 'TASK_PRIVATE', message: TASK_PRIVATE_FORBIDDEN });
        }
        return next();
    } catch (error) {
        console.error('[Task privacy] No se pudo comprobar el acceso a la tarea:', error?.message || error);
        // Ante la duda no se abre: un fallo de lectura no puede convertirse en un permiso.
        return res.status(500).json({ error: 'TASK_PRIVACY_CHECK_FAILED', message: 'No fue posible comprobar el acceso a este pendiente.' });
    }
};
