/**
 * Conectar la cuenta de TikTok de un cliente (25 de noviembre de 2026).
 *
 * Como en LinkedIn, no hay llave de la agencia: el dueño de la cuenta inicia sesión en TikTok una vez y
 * autoriza a la plataforma. Tres pasos:
 *
 * 1. `start`: se arma la dirección de TikTok con un `state` firmado que dice para qué cliente y quién lo pidió.
 * 2. `exchange`: TikTok devuelve a la persona con un código; se cambia por los tokens y se lee qué cuenta
 *    autorizó. Los tokens **no se guardan todavía**: viajan cifrados (`pending`) mientras la persona confirma
 *    que esa es la cuenta del cliente (pudo tener otra sesión de TikTok abierta en el navegador).
 * 3. `link`: se guarda la cuenta, con el token cifrado como las demás.
 *
 * `creatorInfoFor` es lo que la pantalla de publicar le pregunta a TikTok cada vez que se abre.
 */
import jwt from 'jsonwebtoken';
import prisma from '../lib/prisma.js';
import { decrypt, encrypt } from '../utils/encryption.js';
import { createTikTokClient } from './tiktokService.js';
import { tiktokTokenMetadata, tiktokTokenService } from './tiktokTokenService.js';
import { publicSocialAccount } from './socialPublishingService.js';
import { TIKTOK_PLATFORM, humanizeTikTokError } from '../lib/tiktokPublishing.js';

const STATE_TTL_SECONDS = 15 * 60;
const PENDING_TTL_MS = 15 * 60 * 1000;
const STATE_PURPOSE = 'tiktok-connect';
const httpError = (status, message, extra = {}) => Object.assign(new Error(message), { status, ...extra });
const NOT_CONFIGURED = 'La conexión con TikTok no está configurada: faltan TIKTOK_CLIENT_KEY y TIKTOK_CLIENT_SECRET en el servidor.';
const OTHER_PERSON = 'Esta conexión con TikTok la inició otra persona. Vuelve a empezar desde la ficha del cliente.';

export const createTikTokAccountService = ({
  db = prisma,
  tiktok = createTikTokClient(),
  freshToken = (account) => tiktokTokenService.freshToken(account),
  encryptToken = encrypt,
  decryptToken = decrypt,
  stateSecret = () => process.env.JWT_SECRET || '',
  now = () => new Date()
} = {}) => {
  const isConfigured = () => tiktok.isConfigured();
  const requireConfigured = () => {
    if (!isConfigured() || !stateSecret()) throw httpError(503, NOT_CONFIGURED, { code: 'TIKTOK_NOT_CONFIGURED' });
  };

  const start = async ({ clientId, actorUserId, origin }) => {
    requireConfigured();
    const client = await db.client.findUnique({ where: { id: clientId }, select: { id: true } });
    if (!client) throw httpError(404, 'El cliente no existe.');
    // La dirección de regreso viaja firmada en el `state`: al volver se le repite a TikTok tal cual.
    const redirectUri = tiktok.redirectUri(origin);
    const state = jwt.sign({ purpose: STATE_PURPOSE, clientId, userId: actorUserId, redirectUri }, stateSecret(), { expiresIn: STATE_TTL_SECONDS });
    return { url: tiktok.authorizationUrl({ state, redirectUri }) };
  };

  const readState = (state, actorUserId) => {
    let payload;
    try {
      payload = jwt.verify(String(state || ''), stateSecret());
    } catch {
      throw httpError(400, 'La conexión con TikTok venció o no es válida. Vuelve a pulsar «Conectar TikTok».');
    }
    // Quien vuelve de TikTok tiene que ser quien salió: el `state` de otra persona no conecta nada.
    if (payload?.purpose !== STATE_PURPOSE || !payload.clientId || String(payload.userId) !== String(actorUserId)) throw httpError(403, OTHER_PERSON);
    return payload;
  };

  const readPending = (pending, actorUserId) => {
    let payload;
    try {
      payload = JSON.parse(decryptToken(String(pending || '')));
    } catch {
      throw httpError(400, 'La conexión con TikTok no es válida. Vuelve a pulsar «Conectar TikTok».');
    }
    if (!payload?.tokens?.accessToken || !payload.clientId || String(payload.userId) !== String(actorUserId)) throw httpError(403, OTHER_PERSON);
    if (Number(payload.expiresAt) < now().getTime()) throw httpError(400, 'Pasó demasiado tiempo. Vuelve a pulsar «Conectar TikTok».');
    return payload;
  };

  const exchange = async ({ code, state, actorUserId }) => {
    requireConfigured();
    const { clientId, redirectUri } = readState(state, actorUserId);
    const client = await db.client.findUnique({ where: { id: clientId }, select: { id: true, name: true, slug: true } });
    if (!client) throw httpError(404, 'El cliente no existe.');
    let tokens;
    let creator;
    try {
      tokens = await tiktok.exchangeCode(String(code || ''), { redirectUri });
      // `creator_info` trae el usuario (@) y exige el permiso de publicar: si falta, se dice aquí y no al programar.
      creator = await tiktok.creatorInfo(tokens.accessToken);
    } catch (error) {
      if (error?.name !== 'TikTokError') throw error;
      throw httpError(error.code === 'scope_not_authorized' ? 403 : 502, error.code === 'scope_not_authorized'
        ? 'La cuenta de TikTok no dio permiso de publicar. Vuelve a conectarla y acepta el permiso.'
        : `TikTok no completó la conexión: ${error.message}`, { code: 'TIKTOK_CONNECT_FAILED' });
    }
    if (!tokens.openId) throw httpError(502, 'TikTok no dijo qué cuenta autorizó. Vuelve a intentarlo.', { code: 'TIKTOK_CONNECT_FAILED' });
    const receivedAt = now().getTime();
    const account = { openId: tokens.openId, username: creator.username, nickname: creator.nickname, avatarUrl: creator.avatarUrl };
    const pending = encryptToken(JSON.stringify({ tokens, account, clientId, userId: actorUserId, receivedAt, expiresAt: receivedAt + PENDING_TTL_MS }));
    return { clientId: client.id, clientName: client.name, clientSlug: client.slug || null, account: { username: account.username, nickname: account.nickname, avatarUrl: account.avatarUrl }, pending };
  };

  const link = async ({ pending, actorUserId }) => {
    requireConfigured();
    const { tokens, account, clientId, receivedAt } = readPending(pending, actorUserId);
    const externalId = String(account.openId);
    const existing = await db.clientSocialAccount.findFirst({ where: { clientId, platform: TIKTOK_PLATFORM, externalId } });
    const data = {
      displayName: account.username ? `@${account.username}` : (account.nickname || 'Cuenta de TikTok'),
      pageId: `tiktok:${externalId}`,
      encryptedToken: encryptToken(tokens.accessToken),
      isActive: true,
      connectedById: actorUserId,
      connectedAt: now(),
      lastError: null,
      lastCheckedAt: now(),
      metadata: { ...tiktokTokenMetadata(tokens, { now: new Date(receivedAt || now().getTime()), encryptToken }), username: account.username || null, nickname: account.nickname || null }
    };
    const row = existing
      ? await db.clientSocialAccount.update({ where: { id: existing.id }, data })
      : await db.clientSocialAccount.create({ data: { clientId, platform: TIKTOK_PLATFORM, externalId, isPrimary: false, ...data } });
    return publicSocialAccount(row);
  };

  /** Lo que la cuenta permite ahora mismo, para pintar la pantalla de publicar. Nunca se guarda. */
  const creatorInfoFor = async ({ accountId }) => {
    requireConfigured();
    const account = await db.clientSocialAccount.findUnique({ where: { id: String(accountId || '') } });
    if (!account || account.platform !== TIKTOK_PLATFORM) throw httpError(404, 'La cuenta de TikTok no existe.');
    if (account.isActive === false) throw httpError(409, account.lastError || 'La cuenta de TikTok está desconectada.', { code: 'TIKTOK_DISCONNECTED' });
    try {
      const info = await tiktok.creatorInfo(await freshToken(account));
      return { accountId: account.id, ...info };
    } catch (error) {
      if (error?.code === 'TIKTOK_REAUTH_REQUIRED') throw httpError(409, error.message, { code: 'TIKTOK_DISCONNECTED' });
      if (error?.name !== 'TikTokError') throw error;
      // La cuenta no puede publicar ahora (tope diario, bloqueo): la pantalla lo dice y no deja programar.
      throw httpError(Number(error.status) === 429 ? 429 : 409, humanizeTikTokError(error), { code: 'TIKTOK_CANNOT_POST' });
    }
  };

  return { isConfigured, start, exchange, link, creatorInfoFor };
};

export const tiktokAccountService = createTikTokAccountService();
