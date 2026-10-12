import prisma from '../lib/prisma.js';
import { createNotification } from './notificationService.js';

/**
 * Avisa a cada administrador activo, en la campana y en el celular, que alguien del equipo reportó un
 * incidente de seguridad (12 de octubre de 2026). El mensaje nombra a quien reportó y nunca lleva lo que
 * escribió: el aviso viaja por servicios push de terceros y el detalle solo se lee en Gobierno de IA.
 * `createNotification` ya descarta a quien no está en el equipo vigente.
 */
export const notifyIncidentReportToAdmins = async ({ db = prisma, incidentId, reporterId, reporterName, notify = createNotification }) => {
  const admins = await db.user.findMany({ where: { role: 'ADMIN', isActive: true }, select: { id: true } });
  for (const admin of admins) {
    if (admin.id === reporterId) continue;
    await notify({
      userId: admin.id,
      type: 'SECURITY_INCIDENT_REPORTED',
      message: `${reporterName || 'Alguien del equipo'} reportó un incidente de seguridad. Revísalo en Gobierno de IA.`,
      relatedId: incidentId,
      url: '/gobierno-ia?tab=incidents',
      actorId: reporterId
    }).catch((error) => console.error('[IncidentReport] Aviso no entregado:', error?.message || error));
  }
};
