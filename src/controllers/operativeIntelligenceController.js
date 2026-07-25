import prisma from '../lib/prisma.js';

export const getPersonalThreats = async (req, res) => {
    try {
        // Feature Gate: Only Admin or PM can access this intelligence engine
        if (req.user?.role !== 'ADMIN' && req.user?.role !== 'PROJECT_MANAGER' && req.user?.role !== 'PM') {
            return res.status(403).json({ error: "Acceso denegado. Este cockpit es exclusivo para la administración central." });
        }

        const { userId } = req.params;

        // 1. Resolve TeamMember from userId
        const member = await prisma.teamMember.findUnique({
            where: { userId },
            include: {
                nativeTasks: {
                    where: {
                        status: { in: ['PENDIENTE', 'EN_CURSO', 'DEVUELTA'] }
                    },
                    include: {
                        taskComments: {
                            orderBy: { createdAt: 'desc' },
                            include: { author: true }
                        }
                    }
                }
            }
        });

        if (!member) {
            return res.status(404).json({ error: "Colaborador no encontrado en el equipo operativo." });
        }

        const isCommunityManager = member.role?.toLowerCase().includes('community manager');
        const threats = [];
        const now = new Date();

        // 2. Count Overdue Tasks
        const overdueTasks = member.nativeTasks.filter(t => t.dueDate && new Date(t.dueDate) < now && t.status !== 'REALIZADA');

        if (overdueTasks.length > 3) {
            threats.push({
                id: `threat-overdue-${userId}`,
                type: 'AMENAZA',
                title: 'Sobrecarga de Tareas Vencidas',
                content: `El colaborador tiene ${overdueTasks.length} tareas fuera de plazo. Riesgo alto de cuello de botella operativo.`,
                severity: 'critical',
                timestamp: now.toISOString(),
                metadata: {
                    count: overdueTasks.length,
                    category: 'OVERDUE'
                }
            });
        }

        // 3. Process "Devuelta" tasks for feedback threats
        const returnedTasks = member.nativeTasks.filter(t => t.status === 'DEVUELTA');

        for (const task of returnedTasks) {
            // Grab the absolute latest comment where the author is NOT the current assigneeId (member.id)
            // Note: taskComments authorId is a User ID, not a TeamMember ID.
            // We need the User ID of the TeamMember to compare.
            const latestPMComment = task.taskComments.find(c => c.authorId !== userId);

            if (latestPMComment) {
                threats.push({
                    id: `threat-returned-${task.id}`,
                    type: 'AMENAZA',
                    title: `Corrección Pendiente: ${task.title}`,
                    content: `Feedback del PM: "${latestPMComment.content}"`,
                    severity: 'warning',
                    timestamp: task.updatedAt.toISOString(),
                    metadata: {
                        taskId: task.id,
                        category: 'RETURNED',
                        lastFeedback: latestPMComment.content
                    }
                });
            }
        }

        // 4. Resolve PM IDs dynamically
        const pms = await prisma.teamMember.findMany({
            where: {
                OR: [
                    { name: { contains: 'Francisco', mode: 'insensitive' } },
                    { name: { contains: 'Kamila', mode: 'insensitive' } }
                ],
                isActive: true
            },
            select: {
                id: true,
                name: true
            }
        });

        // 5. Operational Stats for counters
        const stats = {
            pending: member.nativeTasks.filter(t => t.status === 'PENDIENTE' || t.status === 'EN_CURSO').length,
            overdue: overdueTasks.length,
            returned: returnedTasks.length,
            priority: member.nativeTasks.filter(t => t.isPriority).length
        };

        return res.json({
            member: {
                id: member.id,
                name: member.name,
                isCommunityManager
            },
            threats,
            stats,
            pmRecipients: pms
        });

    } catch (error) {
        console.error("[OperativeIntelligenceController] Error:", error);
        return res.status(500).json({ error: "Error al procesar amenazas personales." });
    }
};
