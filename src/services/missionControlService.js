import prisma from '../lib/prisma.js';

/**
 * Service to aggregate data for Mission Control
 */
export async function getMissionControlStatus() {
  try {
    // 1. Get Team Members (The Base)
    const team = await prisma.teamMember.findMany({
      where: { isActive: true },
      include: {
        nativeTasks: {
          where: {
            status: { not: 'REALIZADA' }
          },
          take: 5,
          orderBy: { dueDate: 'asc' }
        }
      }
    });

    // 2. Identify Production Clients
    const productionClients = await prisma.client.findMany({
      where: {
        OR: [
          { name: { contains: 'Martínez y Nájera', mode: 'insensitive' } },
          { name: { contains: 'Pablo Hoff', mode: 'insensitive' } }
        ]
      },
      include: {
        nativeTasks: {
          where: {
             OR: [
               { title: { contains: 'Rodaje', mode: 'insensitive' } },
               { title: { contains: 'Producción', mode: 'insensitive' } }
             ],
             status: { not: 'REALIZADA' }
          }
        }
      }
    });

    const isProductionActive = productionClients.some(client => client.nativeTasks.length > 0);

    // 3. Detect Meetings
    // For now, we simulate meetings based on tasks labeled [REUNIÓN] or similar internal logic
    // In a real scenario, this would check a 'Meetings' table or specific task categories
    const meetings = [];
    const meetingTasks = await prisma.task.findMany({
      where: {
        title: { contains: '[REUNIÓN]', mode: 'insensitive' },
        status: 'EN_CURSO'
      }
    });

    if (meetingTasks.length > 0) {
      meetings.push({
        id: 'current-meeting',
        title: meetingTasks[0].title,
        participants: meetingTasks.map(t => t.assigneeId).filter(Boolean)
      });
    }

    // 4. Critical Deadlines (Proyectos Importantes)
    // Filter tasks for specific high-priority projects
    const projectsData = await prisma.task.findMany({
      where: {
        isPriority: true,
        status: { not: 'REALIZADA' }
      },
      include: {
        client: true,
        assignee: true
      },
      take: 10
    });

    return {
      team: team.map(member => ({
        ...member,
        isAvailable: member.isActive, // This can be expanded with real "Permisos" logic
        currentTasks: member.nativeTasks
      })),
      production: {
        isActive: isProductionActive,
        clients: productionClients.filter(c => c.nativeTasks.length > 0).map(c => c.name)
      },
      meetings,
      projects: projectsData
    };
  } catch (error) {
    console.error("[MissionControlService] Error:", error);
    throw error;
  }
}
