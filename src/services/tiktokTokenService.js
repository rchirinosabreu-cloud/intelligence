/**
 * La llave de una cuenta de TikTok conectada, lista para usar (25 de noviembre de 2026).
 *
 * La llave de acceso de TikTok dura 24 horas; con el token de renovación (un año) la plataforma la cambia
 * sola cada vez que hace falta. TikTok puede entregar un token de renovación nuevo al renovar: se guarda
 * el que venga. Cuando el de renovación vence o el dueño retira el permiso, la cuenta se apaga con el
 * motivo escrito para que la ficha del cliente pida reconectarla. Los tokens viven cifrados: el de acceso
 * en `encryptedToken` y el de renovación en `metadata`.
 */
import prisma from '../lib/prisma.js';
import { decrypt, encrypt } from '../utils/encryption.js';
import { createTikTokClient } from './tiktokService.js';
import { TIKTOK_RECONNECT_MESSAGE, tiktokAuthorizationState } from '../lib/tiktokPublishing.js';

/** Lo que se guarda de una autorización: cuándo vence cada token y, cifrado, el de renovación. */
export const tiktokTokenMetadata = (tokens, { now = new Date(), encryptToken = encrypt, previous = {} } = {}) => {
  const at = now.getTime();
  return {
    ...previous,
    expiresAt: tokens.expiresInSeconds ? new Date(at + tokens.expiresInSeconds * 1000).toISOString() : null,
    ...(tokens.refreshToken ? {
      encryptedRefreshToken: encryptToken(tokens.refreshToken),
      refreshExpiresAt: tokens.refreshExpiresInSeconds ? new Date(at + tokens.refreshExpiresInSeconds * 1000).toISOString() : (previous.refreshExpiresAt || null)
    } : {}),
    ...(tokens.scope ? { scope: tokens.scope } : {})
  };
};

export const createTikTokTokenService = ({
  db = prisma,
  tiktok = createTikTokClient(),
  decryptToken = decrypt,
  encryptToken = encrypt,
  now = () => new Date(),
  logger = console
} = {}) => {
  const expire = async (account) => {
    await db.clientSocialAccount.update({ where: { id: account.id }, data: { isActive: false, lastError: TIKTOK_RECONNECT_MESSAGE, lastCheckedAt: now() } }).catch(() => {});
    return Object.assign(new Error(TIKTOK_RECONNECT_MESSAGE), { permanent: true, code: 'TIKTOK_REAUTH_REQUIRED' });
  };

  /** El token de acceso vigente de la cuenta; lo renueva antes si está por vencer. */
  const freshToken = async (account) => {
    const metadata = account.metadata && typeof account.metadata === 'object' ? account.metadata : {};
    const state = tiktokAuthorizationState({ metadata }, now());
    if (state.expired) throw await expire(account);
    if (!state.needsRefresh) return decryptToken(account.encryptedToken);
    if (!metadata.encryptedRefreshToken) throw await expire(account);
    const accessExpired = !metadata.expiresAt || new Date(metadata.expiresAt).getTime() <= now().getTime();
    try {
      const tokens = await tiktok.refreshAccessToken(decryptToken(metadata.encryptedRefreshToken));
      await db.clientSocialAccount.update({
        where: { id: account.id },
        data: {
          encryptedToken: encryptToken(tokens.accessToken),
          metadata: tiktokTokenMetadata(tokens, { now: now(), encryptToken, previous: metadata }),
          lastError: null,
          lastCheckedAt: now()
        }
      });
      return tokens.accessToken;
    } catch (error) {
      const rejected = error?.name === 'TikTokError' && Number(error.status) >= 400 && Number(error.status) < 500;
      // TikTok no contestó (red, 5xx) y la llave actual todavía sirve: se publica con ella.
      if (!rejected && !accessExpired) {
        logger.error('[TikTok] No se pudo renovar la autorización; se usa la vigente:', error.message || error);
        return decryptToken(account.encryptedToken);
      }
      // TikTok no contestó y la llave ya venció: es pasajero, la cola lo reintenta. La cuenta no se apaga.
      if (!rejected) throw error;
      throw await expire(account);
    }
  };

  return { freshToken };
};

export const tiktokTokenService = createTikTokTokenService();
