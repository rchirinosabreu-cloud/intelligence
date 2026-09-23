import 'dotenv/config';
import prisma from '../src/lib/prisma.js';

/**
 * Horas registradas de una persona para un cliente en un rango de fechas. Solo lectura: no escribe nada.
 *
 *   node scripts/report-member-work-hours.js --member="Melissa" --client="2X Global" --from=2026-09-01 --to=2026-09-12
 *
 * Muestra las tareas de esa persona y ese cliente con vencimiento o cierre en el rango, y para cada una sus
 * sesiones de trabajo. Una tarea que nunca pasó por «En proceso» no tiene sesiones y por eso aparece en 00:00:00:
 * el cronómetro solo corre en esa columna (`openTaskWorkSession` al entrar, cierre al salir).
 */
const arg = (name, fallback = '') => {
  const found = process.argv.find((item) => item.startsWith(`--${name}=`));
  return found ? found.slice(name.length + 3).replace(/^"|"$/g, '') : fallback;
};

const memberQuery = arg('member');
const clientQuery = arg('client');
const from = new Date(`${arg('from', '2026-09-01')}T00:00:00-05:00`);
const to = new Date(`${arg('to', '2026-09-30')}T23:59:59-05:00`);

const hours = (ms) => `${Math.floor((ms || 0) / 3600000)}h ${Math.round(((ms || 0) % 3600000) / 60000)}m`;
const bogota = (date) => (date ? new Date(date).toLocaleString('es-CO', { timeZone: 'America/Bogota' }) : '—');

const main = async () => {
  const members = await prisma.teamMember.findMany({
    where: memberQuery ? { name: { contains: memberQuery, mode: 'insensitive' } } : {},
    select: { id: true, name: true, userId: true, isActive: true }
  });
  if (members.length === 0) throw new Error(`Sin miembros que coincidan con «${memberQuery}»`);

  const clients = await prisma.client.findMany({
    where: clientQuery ? { name: { contains: clientQuery, mode: 'insensitive' } } : {},
    select: { id: true, name: true }
  });
  if (clients.length === 0) throw new Error(`Sin clientes que coincidan con «${clientQuery}»`);

  console.log(`Personas: ${members.map((m) => m.name).join(', ')}`);
  console.log(`Clientes: ${clients.map((c) => c.name).join(', ')}`);
  console.log(`Rango (Bogotá): ${bogota(from)} → ${bogota(to)}\n`);

  const tasks = await prisma.task.findMany({
    where: {
      assigneeId: { in: members.map((m) => m.id) },
      clientId: { in: clients.map((c) => c.id) },
      OR: [
        { dueDate: { gte: from, lte: to } },
        { completedAt: { gte: from, lte: to } },
        { createdAt: { gte: from, lte: to } }
      ]
    },
    select: {
      id: true, title: true, status: true, dueDate: true, completedAt: true, createdAt: true,
      accumulatedWorkMs: true, startedAt: true,
      assignee: { select: { name: true } },
      client: { select: { name: true } },
      workSessions: {
        select: { startedAt: true, endedAt: true, durationMs: true, closeReason: true, isOverlapping: true },
        orderBy: { startedAt: 'asc' }
      }
    },
    orderBy: { dueDate: 'asc' }
  });

  if (tasks.length === 0) {
    console.log('No hay tareas de esa persona para ese cliente en el rango.');
    return;
  }

  let totalMs = 0;
  let withoutSessions = 0;
  for (const task of tasks) {
    const sessionsMs = task.workSessions.reduce((sum, session) => sum + (session.durationMs || 0), 0);
    totalMs += task.accumulatedWorkMs || sessionsMs;
    if (task.workSessions.length === 0) withoutSessions += 1;
    console.log(`• ${task.title}`);
    console.log(`  ${task.client?.name} · ${task.assignee?.name} · ${task.status}`);
    console.log(`  creada ${bogota(task.createdAt)} · vence ${bogota(task.dueDate)} · cerrada ${bogota(task.completedAt)}`);
    console.log(`  acumulado en la tarea: ${hours(task.accumulatedWorkMs)} · sesiones: ${task.workSessions.length} (${hours(sessionsMs)})`);
    for (const session of task.workSessions) {
      console.log(`    - ${bogota(session.startedAt)} → ${bogota(session.endedAt)} · ${hours(session.durationMs)} · ${session.closeReason || 'abierta'}${session.isOverlapping ? ' · simultánea' : ''}`);
    }
    console.log('');
  }

  console.log(`Tareas: ${tasks.length} · sin ninguna sesión (nunca pasaron por «En proceso»): ${withoutSessions}`);
  console.log(`Tiempo total registrado: ${hours(totalMs)}`);
};

main()
  .catch((error) => { console.error('[Horas] Falló la consulta:', error.message); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
