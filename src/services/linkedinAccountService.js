/**
 * Conectar la página de LinkedIn de un cliente (23 de noviembre de 2026).
 *
 * A diferencia de Meta —donde una llave de la agencia ve todas las páginas— aquí un administrador de la
 * página inicia sesión en LinkedIn una vez y autoriza a la plataforma. Tres pasos:
 *
 * 1. `start`: se arma la dirección de LinkedIn con un `state` firmado que dice para qué cliente y quién lo pidió.
 * 2. `exchange`: LinkedIn devuelve a la persona con un código; se cambia por los tokens y se listan las páginas
 *    donde puede publicar. Los tokens **no se guardan todavía**: viajan cifrados (`pending`) mientras elige.
 * 3. `link`: con la página elegida se guarda la cuenta, con el token cifrado como las de Meta.
 *
 * Es el mismo mecanismo que usará otra agencia para conectar las páginas de sus propios clientes.
 */
import jwt from 'jsonwebtoken';
import prisma from '../lib/prisma.js';
import { decrypt, encrypt } from '../utils/encryption.js';
import { createLinkedInClient } from './linkedinService.js';
import { linkedinTokenMetadata } from './linkedinTokenService.js';
import { publicSocialAccount } from './socialPublishingService.js';
import { LINKEDIN_PLATFORM } from '../lib/linkedinPublishing.js';

const STATE_TTL_SECONDS = 15 * 60;
const PENDING_TTL_MS = 15 * 60 * 1000;
const STATE_PURPOSE = 'linkedin-connect';
const httpError = (status, message, extra = {}) => Object.assign(new Error(message), { status, ...extra });
const NOT_CONFIGURED = 'La conexión con LinkedIn no está configurada: faltan LINKEDIN_CLIENT_ID y LINKEDIN_CLIENT_SECRET en el servidor.';

export const createLinkedInAccountService = ({
  db = prisma,
  linkedin = createLinkedInClient(),
  encryptToken = encrypt,
  decryptToken = decrypt,
  stateSecret = () => process.env.JWT_SECRET || '',
  now = () => new Date()
} = {}) => {
  const isConfigured = () => linkedin.isConfigured();
  const requireConfigured = () => {
    if (!isConfigured() || !stateSecret()) throw httpError(503, NOT_CONFIGURED, { code: 'LINKEDIN_NOT_CONFIGURED' });
  };

  const start = async ({ clientId, actorUserId, origin }) => {
    requireConfigured();
    const client = await db.client.findUnique({ where: { id: clientId }, select: { id: true } });
    if (!client) throw httpError(404, 'El cliente no existe.');
    // La dirección de regreso viaja firmada en el `state`: al volver se le repite a LinkedIn tal cual.
    const redirectUri = linkedin.redirectUri(origin);
    const state = jwt.sign({ purpose: STATE_PURPOSE, clientId, userId: actorUserId, redirectUri }, stateSecret(), { expiresIn: STATE_TTL_SECONDS });
    return { url: linkedin.authorizationUrl({ state, redirectUri }) };
  };

  const readState = (state, actorUserId) => {
    let payload;
    try {
      payload = jwt.verify(String(state || ''), stateSecret());
    } catch {
      throw httpError(400, 'La conexión con LinkedIn venció o no es válida. Vuelve a pulsar «Conectar LinkedIn».');
    }
    // Quien vuelve de LinkedIn tiene que ser quien salió: el `state` de otra persona no conecta nada.
    if (payload?.purpose !== STATE_PURPOSE || !payload.clientId || String(payload.userId) !== String(actorUserId)) {
      throw httpError(403, 'Esta conexión con LinkedIn la inició otra persona. Vuelve a empezar desde la ficha del cliente.');
    }
    return payload;
  };

  const readPending = (pending, actorUserId) => {
    let payload;
    try {
      payload = JSON.parse(decryptToken(String(pending || '')));
    } catch {
      throw httpError(400, 'La conexión con LinkedIn no es válida. Vuelve a pulsar «Conectar LinkedIn».');
    }
    if (!payload?.tokens?.accessToken || !payload.clientId || String(payload.userId) !== String(actorUserId)) {
      throw httpError(403, 'Esta conexión con LinkedIn la inició otra persona. Vuelve a empezar desde la ficha del cliente.');
    }
    if (Number(payload.expiresAt) < now().getTime()) throw httpError(400, 'Pasó demasiado tiempo. Vuelve a pulsar «Conectar LinkedIn».');
    return payload;
  };

  const exchange = async ({ code, state, actorUserId }) => {
    requireConfigured();
    const { clientId, redirectUri } = readState(state, actorUserId);
    const client = await db.client.findUnique({ where: { id: clientId }, select: { id: true, name: true, slug: true } });
    if (!client) throw httpError(404, 'El cliente no existe.');
    let tokens;
    let organizations;
    try {
      tokens = await linkedin.exchangeCode(String(code || ''), { redirectUri });
      organizations = await linkedin.listOrganizations(tokens.accessToken);
    } catch (error) {
      if (error?.name !== 'LinkedInError') throw error;
      throw httpError(Number(error.status) === 403 ? 403 : 502, Number(error.status) === 403
        ? 'LinkedIn no dio acceso a las páginas: la app todavía no tiene aprobado el producto «Community Management API».'
        : `LinkedIn no completó la conexión: ${error.message}`, { code: 'LINKEDIN_CONNECT_FAILED' });
    }
    const receivedAt = now().getTime();
    const pending = encryptToken(JSON.stringify({ tokens, clientId, userId: actorUserId, receivedAt, expiresAt: receivedAt + PENDING_TTL_MS }));
    return { clientId: client.id, clientName: client.name, clientSlug: client.slug || null, organizations, pending };
  };

  const link = async ({ pending, organizationId, actorUserId }) => {
    requireConfigured();
    const { tokens, clientId, receivedAt } = readPending(pending, actorUserId);
    // Se vuelve a preguntar a LinkedIn: la página elegida tiene que ser una donde esa persona publica.
    const organization = (await linkedin.listOrganizations(tokens.accessToken)).find((candidate) => candidate.organizationId === String(organizationId));
    if (!organization) throw httpError(404, 'Esa página no está entre las que puedes administrar en LinkedIn.');
    const externalId = organization.organizationId;
    const existing = await db.clientSocialAccount.findFirst({ where: { clientId, platform: LINKEDIN_PLATFORM, externalId } });
    const data = {
      displayName: organization.name,
      pageId: `linkedin:${externalId}`,
      encryptedToken: encryptToken(tokens.accessToken),
      isActive: true,
      connectedById: actorUserId,
      connectedAt: now(),
      lastError: null,
      lastCheckedAt: now(),
      metadata: { ...linkedinTokenMetadata(tokens, { now: new Date(receivedAt || now().getTime()), encryptToken }), vanityName: organization.vanityName || null }
    };
    const row = existing
      ? await db.clientSocialAccount.update({ where: { id: existing.id }, data })
      : await db.clientSocialAccount.create({ data: { clientId, platform: LINKEDIN_PLATFORM, externalId, isPrimary: false, ...data } });
    return publicSocialAccount(row);
  };

  return { isConfigured, start, exchange, link };
};

export const linkedinAccountService = createLinkedInAccountService();
