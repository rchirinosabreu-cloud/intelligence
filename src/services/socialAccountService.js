/**
 * Cuentas de Instagram y Facebook conectadas por cliente (29 de septiembre de 2026).
 *
 * El «robot» que publica es el usuario del sistema del Business Manager de Brain Studio; su token vive
 * en `META_SYSTEM_USER_TOKEN` y nunca pasa por la pantalla. Un administrador elige, por cliente, qué
 * página administra ese usuario: se guardan la página (Facebook) y su Instagram profesional, con el
 * token de página cifrado. Desconectar no borra la fila —es historial— sino que la apaga.
 */
import prisma from '../lib/prisma.js';
import { encrypt } from '../utils/encryption.js';
import { createMetaGraphClient } from './metaGraphService.js';
import { publicSocialAccount } from './socialPublishingService.js';

const httpError = (status, message, extra = {}) => Object.assign(new Error(message), { status, ...extra });

export const createSocialAccountService = ({
  db = prisma,
  meta = createMetaGraphClient(),
  encrypt: encryptToken = encrypt,
  systemToken = () => process.env.META_SYSTEM_USER_TOKEN || '',
  now = () => new Date()
} = {}) => {
  const isConfigured = () => Boolean(String(systemToken() || '').trim());

  const requireToken = () => {
    const token = String(systemToken() || '').trim();
    if (!token) throw httpError(503, 'La conexión con Meta no está configurada: falta META_SYSTEM_USER_TOKEN en el servidor.', { code: 'META_NOT_CONFIGURED' });
    return token;
  };

  const listAvailablePages = async () => {
    const token = requireToken();
    const pages = await meta.listManagedPages(token);
    return pages.map(({ pageId, pageName, instagram }) => ({ pageId, pageName, instagram }));
  };

  const listClientAccounts = async (clientId) => {
    const rows = await db.clientSocialAccount.findMany({ where: { clientId }, orderBy: { platform: 'asc' } });
    return rows.map(publicSocialAccount);
  };

  const linkPage = async ({ clientId, pageId, actorUserId = null }) => {
    const token = requireToken();
    const client = await db.client.findUnique({ where: { id: clientId }, select: { id: true, name: true } });
    if (!client) throw httpError(404, 'El cliente no existe.');
    const page = (await meta.listManagedPages(token)).find((candidate) => candidate.pageId === String(pageId));
    if (!page) throw httpError(404, 'El usuario del sistema de Meta no administra esa página. Dale acceso desde el Business Manager y vuelve a intentarlo.');
    if (!page.pageToken) throw httpError(422, 'Meta no entregó un token para esa página.');

    const shared = { encryptedToken: encryptToken(page.pageToken), pageId: page.pageId, isActive: true, connectedById: actorUserId, connectedAt: now(), lastError: null, lastCheckedAt: now() };
    const rows = [];
    rows.push(await db.clientSocialAccount.upsert({
      where: { clientId_platform: { clientId, platform: 'FACEBOOK' } },
      create: { clientId, platform: 'FACEBOOK', externalId: page.pageId, displayName: page.pageName, ...shared },
      update: { externalId: page.pageId, displayName: page.pageName, ...shared }
    }));
    if (page.instagram?.id) {
      const displayName = page.instagram.username ? `@${page.instagram.username}` : page.pageName;
      rows.push(await db.clientSocialAccount.upsert({
        where: { clientId_platform: { clientId, platform: 'INSTAGRAM' } },
        create: { clientId, platform: 'INSTAGRAM', externalId: page.instagram.id, displayName, ...shared },
        update: { externalId: page.instagram.id, displayName, ...shared }
      }));
    }
    return rows.map(publicSocialAccount);
  };

  const disconnectAccount = async ({ accountId }) => {
    const row = await db.clientSocialAccount.findUnique({ where: { id: accountId } });
    if (!row) throw httpError(404, 'La cuenta conectada no existe.');
    await db.socialPublication.updateMany({
      where: { socialAccountId: row.id, status: 'SCHEDULED' },
      data: { status: 'CANCELLED', cancelledAt: now(), error: 'La cuenta se desconectó antes de la hora de publicación.', leaseToken: null, leaseAt: null }
    });
    const updated = await db.clientSocialAccount.update({ where: { id: row.id }, data: { isActive: false, lastCheckedAt: now() } });
    return publicSocialAccount(updated);
  };

  return { isConfigured, listAvailablePages, listClientAccounts, linkPage, disconnectAccount };
};

export const socialAccountService = createSocialAccountService();
