// La retirada deriva del origen, sin duplicar su estado ni borrar la tarea.
// Las consultas históricas no aplican este filtro.
// Un cliente archivado sale de la operación entera (Rodny, 10 de noviembre de 2026:
// «si yo archivo un cliente se archiva de operación y de todo»): sus tareas dejan de
// verse en Gestión, el dashboard, la carga y los avisos, sin borrarse. Reactivarlo
// desde Directorio las devuelve tal cual. Financiero no usa este filtro.
export const activeTaskSourceWhere = {
  client: { is: { isArchived: false } },
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
