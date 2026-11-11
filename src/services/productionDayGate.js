import { jornadaCloseProblem } from '../lib/productionDays.js';

// El pendiente de una jornada de producción no se cierra sin su evidencia (reunión del 10 de noviembre de 2026: «se
// termine cuando suba las evidencias»). Vive aparte del servicio de jornadas porque está en el camino de cada cierre de
// tarea: es una lectura indexada y no arrastra los recordatorios ni la creación de pendientes.
export async function productionTaskCloseProblem(db, taskId) {
  if (!taskId || !db?.productionDay?.findUnique) return null;
  const day = await db.productionDay.findUnique({ where: { taskId: String(taskId) }, select: { id: true, evidenceUrl: true } });
  if (!day) return null;
  if (day.evidenceUrl) return null;
  const files = db.taskDeliverable?.count ? await db.taskDeliverable.count({ where: { taskId: String(taskId) } }) : 0;
  return jornadaCloseProblem({ ...day, hasDeliverables: files > 0 });
}
