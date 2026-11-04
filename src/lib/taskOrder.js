import { taskDueDay } from './taskDeadlines.js';

const compareText = (a, b) => a < b ? -1 : a > b ? 1 : 0;
const createdTime = task => new Date(task.createdAt || 0).getTime() || 0;

// One comparator for the board and the server. Old rows can share rank zero;
// dates, creation time and identity make those ties stable across refreshes.
export const compareTaskOrder = (a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0)
  || compareText(taskDueDay(a.dueDate) || '9999-12-31', taskDueDay(b.dueDate) || '9999-12-31')
  || createdTime(a) - createdTime(b)
  || compareText(a.id, b.id);

export const mergeFilteredTaskOrder = (tasks, orderedIds) => {
  const selected = new Set(orderedIds);
  if (selected.size !== orderedIds.length) throw Object.assign(new Error('La selección tiene pendientes repetidos.'), { statusCode: 400 });
  const byId = new Map(tasks.map(task => [task.id, task]));
  if (orderedIds.some(id => !byId.has(id))) throw Object.assign(new Error('Los pendientes cambiaron. Actualiza el tablero.'), { statusCode: 409 });
  let index = 0;
  return [...tasks].sort(compareTaskOrder).map(task => selected.has(task.id) ? byId.get(orderedIds[index++]) : task);
};

export const taskEntersNewQueue = (current, data) => ['status', 'assigneeId', 'clientId'].some(
  key => Object.hasOwn(data, key) && (data[key] ?? null) !== (current[key] ?? null)
) || (Object.hasOwn(data, 'dueDate') && taskDueDay(data.dueDate) !== taskDueDay(current.dueDate));
