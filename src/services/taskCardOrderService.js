import { Prisma } from '@prisma/client';
import { activeTaskSourceWhere } from '../lib/taskRetirement.js';
import { hasModuleAccess } from '../lib/platformModules.js';
import { taskParticipations, hasTaskParticipations } from '../lib/taskParticipation.js';
import { projectTaskParticipations } from '../lib/taskParticipationBoard.js';
import { compareTaskBoardOrder } from '../lib/taskOrder.js';
import { taskOrderKey, taskOrderDescriptor } from '../lib/taskCardOrder.js';
import { recognitionTransaction } from './recognitionService.js';

const fail = (message, statusCode = 409) => Object.assign(new Error(message), { statusCode });
const managers = ['ADMIN', 'PROJECT_MANAGER', 'PM'];

async function boardColumn(tx, status) {
  const tasks = await tx.task.findMany({ where: activeTaskSourceWhere,
    include: { collaborators: true, workSessions: { where: { endedAt: null } } } });
  const hydrated = await hydrateTaskCardOrder(tx, tasks.map(task => ({ ...task,
    sharedProgress: hasTaskParticipations(task), participants: hasTaskParticipations(task) ? taskParticipations(task) : undefined })));
  return projectTaskParticipations(hydrated).filter(c => c.status === status).sort(compareTaskBoardOrder);
}

async function saveCardColumn(tx, cards) {
  const values = cards.map((card, sortOrder) => Prisma.sql`(${card.id}, ${card.participation?.memberId || ''}, ${card.status}::"TaskStatus", ${sortOrder}, 1)`);
  return tx.$queryRaw(Prisma.sql`INSERT INTO "TaskCardOrder" ("taskId", "memberId", status, "sortOrder", revision)
    VALUES ${Prisma.join(values)}
    ON CONFLICT ("taskId", "memberId") DO UPDATE SET status = EXCLUDED.status, "sortOrder" = EXCLUDED."sortOrder",
      revision = "TaskCardOrder".revision + 1 RETURNING "taskId" AS id, "memberId", status, "sortOrder", revision`);
}

// La colocación horizontal individual conserva su ancla aunque la columna ya tenga prioridades personales.
export async function placeIndividualTaskCard(tx, taskId, status, { anchor, index }) {
  const existing = await tx.$queryRaw`SELECT 1 FROM "TaskCardOrder" WHERE status = ${status}::"TaskStatus" LIMIT 1`;
  if (!existing.length) return undefined;
  const column = await boardColumn(tx, status);
  const moving = column.find(card => card.id === taskId && !card.participation);
  if (!moving) return undefined;
  const rest = column.filter(card => card !== moving);
  const position = anchor !== undefined
    ? (anchor === null ? rest.length : rest.findIndex(card => card.id === anchor && !card.participation))
    : Math.min(index, rest.length);
  if (position < 0) throw fail('El destino cambió. Actualiza el tablero.');
  rest.splice(position, 0, moving);
  return (await saveCardColumn(tx, rest)).filter(row => row.id === taskId);
}

export async function hydrateTaskCardOrder(db, tasks) {
  if (!tasks.length) return tasks;
  const rows = await db.$queryRaw(Prisma.sql`SELECT * FROM "TaskCardOrder" WHERE "taskId" IN (${Prisma.join(tasks.map(t => t.id))})`);
  const byTask = new Map();
  for (const row of rows) {
    if (!byTask.has(row.taskId)) byTask.set(row.taskId, []);
    byTask.get(row.taskId).push(row);
  }
  return tasks.map(task => ({ ...task, cardOrders: byTask.get(task.id) || [] }));
}

// Cambiar el trabajo de columna o retirar una participación elimina solo su posición, nunca su historia.
export async function clearTaskCardOrder(tx, taskId, memberId = null) {
  if (memberId === null) await tx.$executeRaw`DELETE FROM "TaskCardOrder" WHERE "taskId" = ${taskId}`;
  else await tx.$executeRaw`DELETE FROM "TaskCardOrder" WHERE "taskId" = ${taskId} AND "memberId" = ${memberId}`;
}

export async function reorderTaskCards({ db, user, cards, previousCards }) {
  if (!managers.includes(user?.role)) throw fail('Solo PM y administradores pueden reordenar tareas.', 403);
  const valid = value => value && typeof value.id === 'string' && value.id.length > 0 && typeof value.memberId === 'string'
    && ['PENDIENTE', 'EN_CURSO', 'DEVUELTA', 'REALIZADA'].includes(value.status)
    && Number.isSafeInteger(value.revision) && value.revision >= 0;
  if (!Array.isArray(cards) || !cards.length || cards.length > 2000 || !cards.every(valid)
    || !Array.isArray(previousCards) || previousCards.length !== cards.length || !previousCards.every(valid)
    || new Set(cards.map(taskOrderKey)).size !== cards.length
    || new Set(previousCards.map(taskOrderKey)).size !== cards.length
    || new Set(cards.map(c => c.status)).size !== 1
    || previousCards.some(c => !cards.some(next => taskOrderKey(c) === taskOrderKey(next)))) {
    throw fail('La selección de tarjetas no es válida.', 400);
  }
  return recognitionTransaction(db, async tx => {
    const actor = await tx.user.findUnique({ where: { id: user.userId || user.id }, select: { role: true, isActive: true, modulePermissions: true } });
    if (!actor?.isActive || !managers.includes(actor.role) || !hasModuleAccess(actor, 'gestion')) throw fail('Ya no tienes permiso para ordenar tareas.', 403);
    const column = await boardColumn(tx, cards[0].status);
    const byKey = new Map(column.map(c => [taskOrderKey(c), c]));
    const equal = (a, b) => ['id','memberId','status','revision','participantRevision','rosterVersion','taskRevision'].every(key => a[key] === b[key]);
    for (const descriptor of [...previousCards, ...cards]) {
      const current = byKey.get(taskOrderKey(descriptor));
      if (!current || !equal(taskOrderDescriptor(current), descriptor)) throw fail('La tarea o su prioridad cambió. Actualiza el tablero antes de ordenar.');
    }
    const selected = new Set(cards.map(taskOrderKey));
    const currentSelection = column.filter(c => selected.has(taskOrderKey(c)));
    if (currentSelection.some((c, i) => taskOrderKey(c) !== taskOrderKey(previousCards[i]))) throw fail('La prioridad cambió. Actualiza el tablero antes de ordenar.');
    let index = 0;
    const reordered = column.map(c => selected.has(taskOrderKey(c)) ? byKey.get(taskOrderKey(cards[index++])) : c);
    const saved = await saveCardColumn(tx, reordered);
    // El recibo nunca revela IDs de tarjetas fuera de la selección solicitada.
    return saved.filter(row => selected.has(taskOrderKey(row)));
  });
}
