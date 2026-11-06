// La retirada deriva del origen, sin duplicar su estado ni borrar la tarea.
// Las consultas históricas no aplican este filtro.
export const activeTaskSourceWhere = {
  OR: [
    { contentItemId: null },
    { contentItem: { is: { deletedAt: null, plan: { is: { deletedAt: null } } } } },
  ],
};

export const taskSourceSelect = {
  contentItem: { select: { deletedAt: true, plan: { select: { deletedAt: true } } } },
};
export const taskRetiredAt = task => task?.contentItem?.deletedAt || task?.contentItem?.plan?.deletedAt || null;
export const assertTaskSourceActive = task => {
  if (taskRetiredAt(task)) throw Object.assign(new Error('La tarea fue retirada porque se eliminó su pieza o parrilla.'), {
    statusCode: 409, status: 409, gateStatus: 409, code: 'TASK_RETIRED',
  });
};
