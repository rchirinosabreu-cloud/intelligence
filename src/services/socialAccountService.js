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
    const rows = await db.clientSocialAccount.findMany({ where: { clientId }, orderBy: [{ connectedAt: 'asc' }, { platform: 'asc' }] });
    return rows.map(publicSocialAccount);
  };

  const linkPage = async ({ clientId, pageId, actorUserId = null }) => {
    const token = requireToken();
    const client = await db.client.findUnique({ where: { id: clientId }, select: { id: true, name: true } });
    if (!client) throw httpError(404, 'El cliente no existe.');
    const page = (await meta.listManagedPages(token)).find((candidate) => candidate.pageId === String(pageId));
    if (!page) throw httpError(404, 'La cuenta de Meta de la agencia no administra esa página. Dale acceso a la página y vuelve a intentarlo.');
    if (!page.pageToken) throw httpError(422, 'Meta no entregó un token para esa página.');

    // Un cliente puede tener varias cuentas (Rodny, 2 de octubre de 2026): conectar otra página **añade**,
    // no reemplaza. Antes se guardaba «la cuenta de Facebook del cliente» y una segunda página pisaba la
    // primera, con lo que lo programado para Endova habría salido en la página nueva.
    const existing = await db.clientSocialAccount.findMany({ where: { clientId } });
    // La primera página que se conectó va primero en las listas. Es solo orden: ninguna sale por defecto.
    const becomesPrimary = !existing.some((row) => row.isPrimary);
    const shared = { encryptedToken: encryptToken(page.pageToken), pageId: page.pageId, isActive: true, connectedById: actorUserId, connectedAt: now(), lastError: null, lastCheckedAt: now() };
    const save = async ({ platform, externalId, displayName }) => {
      const current = existing.find((row) => row.platform === platform && row.externalId === externalId);
      if (current) {
        return db.clientSocialAccount.update({ where: { id: current.id }, data: { displayName, ...shared, ...(becomesPrimary ? { isPrimary: true } : {}) } });
      }
      return db.clientSocialAccount.create({ data: { clientId, platform, externalId, displayName, isPrimary: becomesPrimary, ...shared } });
    };

    // El cliente tenía una sola cuenta y ahora va a tener dos. Con una sola, las piezas no nombran
    // cuenta (van a la única); con varias, la que no nombra ninguna no va a ninguna. Para que lo ya
    // programado no se quede sin destino, esas piezas pasan a nombrar la cuenta donde estaban.
    const priorPages = Array.from(new Set(existing.map((row) => row.pageId)));
    if (priorPages.length === 1 && priorPages[0] && priorPages[0] !== page.pageId) {
      await db.contentItem.updateMany({
        where: {
          socialPageIds: { isEmpty: true },
          publications: { some: { socialAccountId: { in: existing.map((row) => row.id) }, status: { in: ['SCHEDULED', 'PUBLISHING'] } } }
        },
        data: { socialPageIds: [priorPages[0]] }
      });
    }

    const rows = [await save({ platform: 'FACEBOOK', externalId: page.pageId, displayName: page.pageName })];
    const instagramId = page.instagram?.id ? String(page.instagram.id) : null;
    if (instagramId) {
      rows.push(await save({ platform: 'INSTAGRAM', externalId: instagramId, displayName: page.instagram.username ? `@${page.instagram.username}` : page.pageName }));
    }
    // El Instagram que esta misma página tenía y ya no tiene (lo quitaron o lo cambiaron por otro) no
    // puede seguir vivo: la parrilla lo ofrecería y una pieza saldría en el perfil equivocado. Se apaga
    // y se cancela lo suyo. Solo el de **esta** página: el de otra cuenta del cliente no se toca.
    const stale = existing.filter((row) => row.platform === 'INSTAGRAM' && row.pageId === page.pageId && row.externalId !== instagramId && row.isActive !== false);
    for (const row of stale) {
      await db.socialPublication.updateMany({
        where: { socialAccountId: row.id, status: 'SCHEDULED' },
        data: { status: 'CANCELLED', cancelledAt: now(), error: 'La página conectada cambió y ya no tiene Instagram vinculado.', leaseToken: null, leaseAt: null }
      });
      rows.push(await db.clientSocialAccount.update({
        where: { id: row.id },
        data: { isActive: false, lastError: 'La página conectada ya no tiene Instagram vinculado.', lastCheckedAt: now() }
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
