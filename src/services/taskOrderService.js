import { compareTaskOrder, mergeFilteredTaskOrder, taskEntersNewQueue } from '../lib/taskOrder.js';
import { activeTaskSourceWhere } from '../lib/taskRetirement.js';
import { recognitionTransaction } from './recognitionService.js';
import { hasTaskParticipations, taskParticipations, aggregateParticipationStatus } from '../lib/taskParticipation.js';
import { clearTaskCardOrder, placeIndividualTaskCard } from './taskCardOrderService.js';

const fail = (message, statusCode = 400) => Object.assign(new Error(message), { statusCode });
const orderSelect = { id: true, status: true, sortOrder: true, dueDate: true, createdAt: true };
const managerRoles = ['ADMIN', 'PROJECT_MANAGER', 'PM'];
const validIndex = value => Number.isSafeInteger(value) && value >= 0;

// All callers must use recognitionTransaction: its existing lock and serializable
// retry protect creation, queue changes and manual ordering in the same transaction.
export const nextTaskOrder = async (tx, status) => {
  const result = await tx.task.aggregate({ where: { status }, _max: { sortOrder: true } });
  return Math.max(0, result._max.sortOrder ?? 0) + 1;
};

async function saveOrder(tx, tasks) {
  const order = [];
  for (const [sortOrder, task] of tasks.entries()) {
    if (task.sortOrder !== sortOrder) await tx.task.update({ where: { id: task.id }, data: { sortOrder } });
    order.push({ id: task.id, sortOrder });
  }
  return order;
}

export const reorderTaskSelection = async ({ db, user, reorderList, previousIds }) => {
  if (!managerRoles.includes(user?.role)) throw fail('Solo PM y administradores pueden reordenar pendientes.', 403);
  if (!Array.isArray(reorderList) || !reorderList.length
    || reorderList.some(item => typeof item?.id !== 'string' || !item.id || !validIndex(item.sortOrder))
    || new Set(reorderList.map(item => item.id)).size !== reorderList.length
    || new Set(reorderList.map(item => item.sortOrder)).size !== reorderList.length) {
    throw fail('La selección de pendientes no es válida.');
  }
  const orderedIds = [...reorderList].sort((a, b) => a.sortOrder - b.sortOrder).map(item => item.id);
  if (previousIds !== undefined && (!Array.isArray(previousIds) || previousIds.length !== orderedIds.length
    || new Set(previousIds).size !== orderedIds.length || previousIds.some(id => !orderedIds.includes(id)))) {
    throw fail('El orden anterior no corresponde a la selección.');
  }
  return recognitionTransaction(db, async tx => {
    const positions = await tx.$queryRaw`SELECT 1 FROM "TaskCardOrder" WHERE "taskId" = ANY(${orderedIds}::text[]) LIMIT 1`;
    if (positions.length) throw fail('Actualiza la pantalla para ordenar con las prioridades vigentes.', 409);
    const selected = await tx.task.findMany({ where: { id: { in: orderedIds }, AND: [activeTaskSourceWhere] }, select: orderSelect });
    if (selected.length !== orderedIds.length || new Set(selected.map(task => task.status)).size !== 1) {
      throw fail('Los pendientes cambiaron. Actualiza el tablero.', 409);
    }
    if (previousIds && selected.sort(compareTaskOrder).some((task, index) => task.id !== previousIds[index])) {
      throw fail('La prioridad cambió. Actualiza el tablero antes de ordenar.', 409);
    }
    const column = await tx.task.findMany({ where: { status: selected[0].status, AND: [activeTaskSourceWhere] }, select: orderSelect });
    return saveOrder(tx, mergeFilteredTaskOrder(column, orderedIds));
  });
};

// Also used by content/task reciprocity so changing a piece's date follows the
// same queue rule. Only a deliberate, authorized placement may override the tail.
export const updateOrderedTask = async (tx, args, current) => {
  const data = { ...args.data };
  // Parrillas, automatizaciones y la API antigua tampoco pueden cerrar partes ajenas.
  if ('status' in data && data.status !== current.status) {
    const persisted = await tx.task.findUnique({ where: { id: args.where.id }, include: { assignee: true, collaborators: true, workSessions: { where: { endedAt: null } } } });
    if (persisted && hasTaskParticipations({ ...persisted, ...data })) {
      const expected = aggregateParticipationStatus(taskParticipations({ ...persisted, ...data, status: persisted.status }));
      if (expected !== data.status) throw fail('El estado de esta tarea depende de sus participaciones. Revisa el equipo en Gestión.', 409);
    }
  }
  const hasAnchor = Object.hasOwn(data, 'orderBeforeId');
  const hasIndex = Object.hasOwn(data, 'sortOrder');
  const anchor = data.orderBeforeId;
  const index = data.sortOrder;
  delete data.orderBeforeId;
  delete data.sortOrder;
  if (hasAnchor && hasIndex) throw fail('Indica una sola posición para el pendiente.');
  if (hasIndex && !validIndex(index)) throw fail('La posición del pendiente no es válida.');
  if (hasAnchor && anchor !== null && (typeof anchor !== 'string' || !anchor || anchor === args.where.id)) throw fail('La posición del pendiente no es válida.');
  const status = data.status ?? current.status;
  let column;
  if (hasIndex || (hasAnchor && anchor !== null)) {
    column = (await tx.task.findMany({ where: { status, AND: [activeTaskSourceWhere] }, select: orderSelect })).filter(task => task.id !== args.where.id).sort(compareTaskOrder);
    if (hasAnchor && !column.some(task => task.id === anchor)) throw fail('El destino cambió. Actualiza el tablero.', 409);
  }
  if (hasAnchor || hasIndex || taskEntersNewQueue(current, data)) data.sortOrder = await nextTaskOrder(tx, status);
  const updated = await tx.task.update({ ...args, data });
  // Un cambio del agregado compartido no mueve las prioridades de las otras personas.
  const queueChanged = hasTaskParticipations(current)
    ? taskEntersNewQueue(current, { ...data, status: current.status })
    : taskEntersNewQueue(current, data);
  if (queueChanged || hasAnchor || hasIndex) await clearTaskCardOrder(tx, args.where.id);
  if (column) {
    const position = hasAnchor ? column.findIndex(task => task.id === anchor) : Math.min(index, column.length);
    column.splice(position, 0, updated);
    await saveOrder(tx, column);
    updated.sortOrder = position;
  }
  if ((hasAnchor || hasIndex) && !hasTaskParticipations(current)) {
    updated.cardOrders = await placeIndividualTaskCard(tx, args.where.id, status, { anchor, index });
  }
  return updated;
};
