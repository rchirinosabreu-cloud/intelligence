import prisma from '../lib/prisma.js';
import { publishAnnouncement, archiveAnnouncement } from './announcementDeliveryService.js';

// La ruta anterior comparte ahora el mismo origen; nunca elimina por límite de presentación.
export const getGlobalAnnouncements = () => prisma.globalAnnouncement.findMany({ where: { archivedAt: null }, orderBy: { createdAt: 'desc' } });
export const createGlobalAnnouncement = (body, actor) => publishAnnouncement(prisma, body, actor);
export const deleteGlobalAnnouncement = (id, body, actor) => archiveAnnouncement(prisma, id, body, actor);
