// El historial de cada tarea (19 de noviembre de 2026). Se escribe dentro de la misma transacción que el cambio y
// nunca se edita (catálogo de auditoría inmutable). Escribir el historial nunca tumba el cambio: si la tabla aún no
// existe, se anota y se sigue.
import prisma from '../lib/prisma.js';
import { CLIENT_DUE_DATE_KIND, taskChangesBetween } from '../lib/taskChanges.js';

const HISTORY_LIMIT = 100;

export async function recordTaskChanges(db, { taskId, actorId = null, changes, at = new Date() }) {
  if (!taskId || !changes?.length) return 0;
  try {
    const { count } = await db.taskChangeEvent.createMany({
      data: changes.map((change) => ({ taskId, actorId: actorId || null, kind: change.kind,
        fromValue: change.fromValue ?? null, toValue: change.toValue ?? null, occurredAt: at }))
    });
    return count;
  } catch (error) {
    console.error('[Historial de tareas] No se pudo anotar el cambio:', error?.message || error);
    return 0;
  }
}

export const recordTaskDiff = (db, { taskId, actorId, before, after }) =>
  recordTaskChanges(db, { taskId, actorId, changes: taskChangesBetween(before, after) });

/**
 * La fecha la movió el cliente (Rodny, 26 de noviembre de 2026, por Francisco: «hay tareas que se vencen por el cliente y
 * no es justo que no les dé punto si ellos las mueven»). Quien cambia la fecha lo marca al guardar; queda en el historial
 * de la tarea, con su nombre, junto al cambio de fecha. Con esa marca, mover la fecha no resta en «Al día» ni en «A tiempo».
 */
export const recordClientDueDateMove = (db, { taskId, actorId, before, after, reason }) => {
  if (reason !== 'CLIENTE') return 0;
  const move = taskChangesBetween(before, after).find((change) => change.kind === 'DUE_DATE');
  return move?.toValue ? recordTaskChanges(db, { taskId, actorId, changes: [{ ...move, kind: CLIENT_DUE_DATE_KIND }] }) : 0;
};

export const recordTaskCreated = (db, { taskId, actorId = null, assigneeId = null }) =>
  recordTaskChanges(db, { taskId, actorId, changes: [{ kind: 'CREATED', fromValue: null, toValue: assigneeId || null }] });

/** El historial con los nombres ya resueltos: quien lo hizo, las personas y los clientes que aparecen. */
export async function getTaskChangeHistory(taskId, { db = prisma } = {}) {
  const events = await db.taskChangeEvent.findMany({
    where: { taskId }, orderBy: { occurredAt: 'desc' }, take: HISTORY_LIMIT,
    select: { id: true, kind: true, fromValue: true, toValue: true, occurredAt: true, actor: { select: { name: true } } }
  });
  const memberIds = new Set(), clientIds = new Set();
  for (const event of events) {
    const bucket = event.kind === 'CLIENT' ? clientIds : (event.kind === 'ASSIGNEE' || event.kind === 'CREATED') ? memberIds : null;
    if (!bucket) continue;
    if (event.fromValue) bucket.add(event.fromValue);
    if (event.toValue) bucket.add(event.toValue);
  }
  const [members, clients] = await Promise.all([
    memberIds.size ? db.teamMember.findMany({ where: { id: { in: [...memberIds] } }, select: { id: true, name: true } }) : [],
    clientIds.size ? db.client.findMany({ where: { id: { in: [...clientIds] } }, select: { id: true, name: true } }) : []
  ]);
  const names = Object.fromEntries([...members, ...clients].map((row) => [row.id, row.name]));
  return {
    events: events.map((event) => ({ id: event.id, kind: event.kind, fromValue: event.fromValue, toValue: event.toValue,
      occurredAt: event.occurredAt, actorName: event.actor?.name || null })),
    names
  };
}
