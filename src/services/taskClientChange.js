// Validate again inside the native update transaction, not just while preparing a Bria draft.
export const assertTaskClientChange = async (db, task, payload) => {
  if (!Object.hasOwn(payload, 'clientId') || payload.clientId === task.clientId) return;
  const reject = (statusCode, message) => { throw Object.assign(new Error(message), { statusCode, gateStatus: statusCode }); };
  if (typeof payload.clientId !== 'string' || !payload.clientId.trim()) reject(400, 'Selecciona un cliente válido para la tarea.');
  if (task.contentItemId || task.contentItem) reject(409, 'Esta tarea pertenece a una pieza de parrilla. Su cliente se conserva con la pieza; no se puede trasladar solo la tarea.');
  const client = await db.client.findUnique({ where: { id: payload.clientId }, select: { id: true, isArchived: true } });
  if (!client || client.isArchived) reject(400, 'El cliente de destino no existe o está archivado. Selecciona un cliente activo.');
};
