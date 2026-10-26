import prisma from '../lib/prisma.js';
import { activeTeamUserWhere } from './teamRosterService.js';
import { createNotification } from './notificationService.js';
import {
    TEAM_COMPLETION_NOTIFICATION_TYPE,
    teamCompletionMessage,
    teamCompletionRecipients
} from '../lib/teamNotifications.js';

// «Avísame cuando el equipo termine un pendiente» (26 de octubre de 2026).
//
// Seguir un pendiente ya avisaba al cerrarse; esto solo añade a quien encendió el
// interruptor, sin tener que pulsar la campana una por una. Por eso corre **después** del
// aviso a los seguidores y nunca se lo repite a quien ya lo recibió por ahí.

const taskForNotice = {
    id: true,
    title: true,
    isPrivate: true,
    creatorId: true,
    assignee: { select: { userId: true } },
    viewers: { select: { userId: true } },
    collaborators: { select: { member: { select: { userId: true } } } },
    client: { select: { name: true } }
};

/**
 * Avisa del cierre a quien sigue todo. Nunca lanza hacia fuera: un aviso que no sale no
 * puede deshacer un pendiente que la persona sí terminó.
 */
export const notifyTeamCompletion = async (
    { taskId, completedById, followerIds = [] },
    { db = prisma, notifier = createNotification } = {}
) => {
    try {
        if (!taskId) return [];

        const [task, candidates, actor] = await Promise.all([
            db.task.findUnique({ where: { id: taskId }, select: taskForNotice }),
            db.user.findMany({
                where: activeTeamUserWhere(),
                select: { id: true, notificationPreferences: true }
            }),
            completedById
                ? db.user.findUnique({ where: { id: completedById }, select: { name: true } })
                : null
        ]);
        if (!task) return [];

        const recipients = teamCompletionRecipients({ candidates, task, followerIds, completedById });
        if (recipients.length === 0) return [];

        const message = teamCompletionMessage({
            actorName: actor?.name,
            taskTitle: task.title,
            clientName: task.client?.name
        });

        for (const userId of recipients) {
            // Una falla no frena a los demás: cada quien tiene su aviso.
            await notifier({
                userId,
                message,
                type: TEAM_COMPLETION_NOTIFICATION_TYPE,
                relatedId: task.id,
                taskId: task.id,
                actorId: completedById || null
            }).catch((error) => {
                console.error('[TeamCompletionNotice] Failed for one recipient:', error?.message || error);
            });
        }

        return recipients;
    } catch (error) {
        console.error('[TeamCompletionNotice] Failed:', error?.message || error);
        return [];
    }
};
