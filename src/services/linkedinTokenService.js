/**
 * La llave de una página de LinkedIn conectada, lista para usar (23 de noviembre de 2026).
 *
 * La autorización de LinkedIn dura 60 días. Si LinkedIn le dio a la app un token de renovación (lo hace con
 * las apps aprobadas), la plataforma la renueva sola cuando le queda menos de una semana; si no, o si ya
 * venció, la cuenta se apaga con el motivo escrito para que la ficha del cliente pida reconectarla.
 * Los tokens viven cifrados: el de acceso en `encryptedToken` y el de renovación en `metadata`.
 */
import prisma from '../lib/prisma.js';
import { decrypt, encrypt } from '../utils/encryption.js';
import { createLinkedInClient } from './linkedinService.js';
import { LINKEDIN_RECONNECT_MESSAGE, linkedinAuthorizationState } from '../lib/linkedinPublishing.js';

/** Lo que se guarda de una autorización: cuándo vence cada token y, cifrado, el de renovación. */
export const linkedinTokenMetadata = (tokens, { now = new Date(), encryptToken = encrypt, previous = {} } = {}) => {
  const at = now.getTime();
  const refreshToken = tokens.refreshToken || null;
  return {
    ...previous,
    expiresAt: tokens.expiresInSeconds ? new Date(at + tokens.expiresInSeconds * 1000).toISOString() : null,
    ...(refreshToken ? {
      canRefresh: true,
      encryptedRefreshToken: encryptToken(refreshToken),
      // LinkedIn no reinicia el plazo del token de renovación al usarlo: se conserva el primero que dio.
      refreshExpiresAt: previous.refreshExpiresAt || (tokens.refreshExpiresInSeconds ? new Date(at + tokens.refreshExpiresInSeconds * 1000).toISOString() : null)
    } : { canRefresh: Boolean(previous.canRefresh) })
  };
};

export const createLinkedInTokenService = ({
  db = prisma,
  linkedin = createLinkedInClient(),
  decryptToken = decrypt,
  encryptToken = encrypt,
  now = () => new Date(),
  logger = console
} = {}) => {
  const expire = async (account) => {
    await db.clientSocialAccount.update({ where: { id: account.id }, data: { isActive: false, lastError: LINKEDIN_RECONNECT_MESSAGE, lastCheckedAt: now() } }).catch(() => {});
    return Object.assign(new Error(LINKEDIN_RECONNECT_MESSAGE), { permanent: true, code: 'LINKEDIN_REAUTH_REQUIRED' });
  };

  /** El token de acceso vigente de la cuenta; lo renueva antes si está por vencer y se puede. */
  const freshToken = async (account) => {
    const metadata = account.metadata && typeof account.metadata === 'object' ? account.metadata : {};
    const state = linkedinAuthorizationState({ metadata }, now());
    if (state.expired) throw await expire(account);
    const accessExpired = metadata.expiresAt && new Date(metadata.expiresAt).getTime() <= now().getTime();
    if (!state.needsRefresh || !metadata.encryptedRefreshToken) {
      if (accessExpired) throw await expire(account);
      return decryptToken(account.encryptedToken);
    }
    try {
      const tokens = await linkedin.refreshAccessToken(decryptToken(metadata.encryptedRefreshToken));
      await db.clientSocialAccount.update({
        where: { id: account.id },
        data: {
          encryptedToken: encryptToken(tokens.accessToken),
          metadata: linkedinTokenMetadata(tokens, { now: now(), encryptToken, previous: metadata }),
          lastError: null,
          lastCheckedAt: now()
        }
      });
      return tokens.accessToken;
    } catch (error) {
      // Renovar falló pero el token actual todavía sirve: se publica con él y se vuelve a intentar la próxima vez.
      if (!accessExpired && Number(error.status) !== 400 && Number(error.status) !== 401) {
        logger.error('[LinkedIn] No se pudo renovar la autorización; se usa la vigente:', error.message || error);
        return decryptToken(account.encryptedToken);
      }
      throw await expire(account);
    }
  };

  return { freshToken };
};

export const linkedinTokenService = createLinkedInTokenService();
