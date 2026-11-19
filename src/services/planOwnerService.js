// El responsable de una parrilla es el community manager del cliente (Rodny, 19 de noviembre de 2026: «el
// responsable de la parrilla se coloque automáticamente según el community asignado en los clientes»). Al
// responsable le llegan las tareas de publicación y el reconocimiento de parrilla aprobada, así que tiene que ser
// quien la lleva. Solo se tocan las parrillas abiertas: una FINALIZADA conserva a quien la hizo. Un cliente sin
// community, o con uno inactivo, deja sus parrillas como están y se pueden asignar a mano.

const OPEN_PLANS = { deletedAt: null, status: { not: 'FINALIZADO' } };

const RESPONSIBLE_SELECT = { responsibleId: true, responsible: { select: { isActive: true } } };

/** El id del community activo del cliente, o null. */
export const communityOf = (client) => (client?.responsibleId && client.responsible?.isActive === true ? client.responsibleId : null);

/** Pone al community del cliente como responsable de sus parrillas abiertas. Devuelve cuántas cambió. */
// Los «Publicar» automáticos abiertos de una parrilla siguen a su responsable: pasan del anterior (o de nadie) al
// nuevo. Uno que un administrador le dio a otra persona se respeta.
export async function movePublicationTasks(db, { planId, from, to }) {
  if (!planId || !to || from === to) return 0;
  const { count } = await db.task.updateMany({
    where: {
      contentItem: { planId }, title: { startsWith: '[Publicar]' }, status: { not: 'REALIZADA' },
      OR: [{ assigneeId: null }, ...(from ? [{ assigneeId: from }] : [])]
    },
    data: { assigneeId: to }
  });
  return count;
}

// `community` lo pasa quien ya comprobó que esa persona está activa (la ficha del cliente) y se ahorra la lectura.
export async function syncClientPlanOwners(db, clientId, { community: known = null } = {}) {
  if (!clientId) return 0;
  const community = known || communityOf(await db.client.findUnique({ where: { id: clientId }, select: RESPONSIBLE_SELECT }));
  if (!community) return 0;
  // `not` solo no alcanza a las que no tienen responsable: en SQL, NULL <> x no es verdadero.
  const plans = await db.contentPlan.findMany({
    where: { clientId, ...OPEN_PLANS, OR: [{ ownerId: null }, { ownerId: { not: community } }] },
    select: { id: true, ownerId: true }
  });
  for (const plan of plans) {
    await db.contentPlan.update({ where: { id: plan.id }, data: { ownerId: community } });
    await movePublicationTasks(db, { planId: plan.id, from: plan.ownerId, to: community });
  }
  return plans.length;
}

/** Lo mismo para todos los clientes con community. Es idempotente: corre en cada arranque. */
export async function syncAllPlanOwners(db) {
  const clients = await db.client.findMany({ where: { responsibleId: { not: null } }, select: { id: true } });
  let plans = 0, touched = 0;
  for (const { id } of clients) {
    const count = await syncClientPlanOwners(db, id);
    plans += count;
    if (count) touched += 1;
  }
  return { plans, clients: touched };
}

export async function syncPlanOwnersOnBoot({ db, log = console } = {}) {
  try {
    const result = await syncAllPlanOwners(db);
    if (result.plans) log.log?.(`[Parrillas] Responsable según el community: ${result.plans} parrillas de ${result.clients} clientes.`);
    return result;
  } catch (error) {
    log.error?.('[Parrillas] No se pudo poner al community como responsable:', error.message);
    return { error: error.message };
  }
}
