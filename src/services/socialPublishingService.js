/**
 * La cola de publicación en Instagram y Facebook (Rodny, 29 de septiembre de 2026).
 *
 * Una fila de `SocialPublication` por pieza y red. Programar comprueba con `schedulingProblems` todo lo
 * que impide salir y lo dice de una vez; el cron reclama las filas vencidas por compare-and-set (como
 * las revisiones de Bria: dos réplicas nunca publican la misma pieza), pide a Meta que publique con una
 * URL firmada del archivo y deja el enlace. Un fallo transitorio vuelve a la cola con espera creciente;
 * uno permanente queda `FAILED` con su motivo en español y avisa a quien programó. La pieza pasa a
 * `PUBLICADO` solo cuando no le queda ninguna red pendiente.
 */
import { randomUUID } from 'node:crypto';
import prisma from '../lib/prisma.js';
import { decrypt } from '../utils/encryption.js';
import { createNotification } from './notificationService.js';
import { createMetaGraphClient } from './metaGraphService.js';
import { createSignedDownload } from './s3Service.js';
import {
  ACTIVE_PUBLICATION_STATUSES, MAX_PUBLICATION_ATTEMPTS, PUBLICATION_LEASE_MS, SOCIAL_PLATFORMS, SOCIAL_PLATFORM_LABELS,
  describeMetaMedia, humanizeMetaError, isRetryableMetaError, nextPublicationRetryAt, publishAtIso, schedulingProblems
} from '../lib/socialPublishing.js';

const MAX_DIAGNOSTICS = 5;
/** Meta descarga el archivo al crear el contenedor; una hora cubre con holgura un reel de 300 MB. */
const MEDIA_URL_TTL_SECONDS = 60 * 60;

const httpError = (status, message, extra = {}) => Object.assign(new Error(message), { status, ...extra });

const itemInclude = {
  finalAssets: { orderBy: [{ position: 'asc' }, { createdAt: 'asc' }] },
  publications: true,
  plan: { select: { id: true, clientId: true, deletedAt: true, client: { select: { id: true, name: true, socialAccounts: true } } } }
};

const isVideoAsset = (asset) => String(asset?.mimeType || '').toLowerCase().startsWith('video/');

/** Lo que la pantalla puede ver de una fila: nunca el token, que ni siquiera vive aquí. */
export const publicPublication = (row) => row && ({
  id: row.id,
  contentItemId: row.contentItemId,
  platform: row.platform,
  status: row.status,
  scheduledAt: row.scheduledAt,
  attempts: row.attempts,
  nextAttemptAt: row.nextAttemptAt,
  permalink: row.permalink,
  externalMediaId: row.externalMediaId,
  error: row.error,
  publishedAt: row.publishedAt,
  cancelledAt: row.cancelledAt,
  requestedById: row.requestedById
});

export const publicSocialAccount = (account) => account && ({
  id: account.id,
  clientId: account.clientId,
  platform: account.platform,
  externalId: account.externalId,
  displayName: account.displayName,
  pageId: account.pageId,
  isActive: account.isActive,
  connectedAt: account.connectedAt,
  lastError: account.lastError
});

const defaultMediaUrlFor = async (asset) => {
  const key = asset.storageKey || asset.finalAssetKey;
  const { url } = await createSignedDownload({ key, expiresIn: MEDIA_URL_TTL_SECONDS });
  return url;
};

export const createSocialPublishingService = ({
  db = prisma,
  meta = createMetaGraphClient(),
  decrypt: decryptToken = decrypt,
  mediaUrlFor = defaultMediaUrlFor,
  now = () => new Date(),
  notify = createNotification,
  randomId = randomUUID,
  logger = console
} = {}) => {
  const loadItem = async (itemId) => {
    const item = await db.contentItem.findUnique({ where: { id: itemId }, include: itemInclude });
    if (!item || item.deletedAt || item.plan?.deletedAt) throw httpError(404, 'La pieza no existe.');
    return item;
  };

  const accountsOf = (item) => (item.plan?.client?.socialAccounts || []);

  const schedulePublications = async ({ itemId, platforms = [], actorUserId = null }) => {
    const item = await loadItem(itemId);
    const wanted = Array.from(new Set(platforms.map((platform) => String(platform || '').toUpperCase())));
    const problems = schedulingProblems({ item, assets: item.finalAssets, accounts: accountsOf(item), platforms: wanted, now: now() });
    for (const platform of wanted) {
      const existing = (item.publications || []).find((row) => row.platform === platform);
      if (existing?.status === 'PUBLISHED') problems.push(`Esta pieza ya se publicó en ${SOCIAL_PLATFORM_LABELS[platform] || platform}.`);
      else if (existing?.status === 'PUBLISHING') problems.push(`Esta pieza se está publicando en ${SOCIAL_PLATFORM_LABELS[platform] || platform} ahora mismo.`);
    }
    if (problems.length) throw httpError(422, problems[0], { code: 'SOCIAL_PUBLICATION_INVALID', problems });

    const scheduledAt = new Date(publishAtIso(item.publishDate, item.publishTime));
    const rows = [];
    for (const platform of wanted) {
      const account = accountsOf(item).find((candidate) => candidate.platform === platform && candidate.isActive !== false);
      const fresh = {
        status: 'SCHEDULED', scheduledAt, attempts: 0, nextAttemptAt: null, leaseToken: null, leaseAt: null,
        error: null, permalink: null, externalMediaId: null, publishedAt: null, cancelledAt: null, requestedById: actorUserId
      };
      rows.push(await db.socialPublication.upsert({
        where: { contentItemId_platform: { contentItemId: item.id, platform } },
        create: { contentItemId: item.id, socialAccountId: account.id, platform, ...fresh },
        update: { socialAccountId: account.id, ...fresh }
      }));
    }
    return rows;
  };

  const cancelPublication = async ({ publicationId }) => {
    const row = await db.socialPublication.findUnique({ where: { id: publicationId } });
    if (!row) throw httpError(404, 'La publicación programada no existe.');
    if (row.status === 'PUBLISHING') throw httpError(409, 'Esta pieza se está publicando ahora mismo; ya no se puede cancelar.');
    if (row.status !== 'SCHEDULED') throw httpError(409, 'Solo se cancela una publicación que todavía está programada.');
    return db.socialPublication.update({ where: { id: row.id }, data: { status: 'CANCELLED', cancelledAt: now(), leaseToken: null, leaseAt: null } });
  };

  const retryPublication = async ({ publicationId, actorUserId = null }) => {
    const row = await db.socialPublication.findUnique({ where: { id: publicationId } });
    if (!row) throw httpError(404, 'La publicación no existe.');
    if (row.status !== 'FAILED') throw httpError(409, 'Solo se reintenta una publicación que falló.');
    const current = now();
    const scheduledAt = new Date(row.scheduledAt).getTime() < current.getTime() ? current : row.scheduledAt;
    return db.socialPublication.update({
      where: { id: row.id },
      data: { status: 'SCHEDULED', scheduledAt, attempts: 0, nextAttemptAt: null, error: null, leaseToken: null, leaseAt: null, requestedById: actorUserId || row.requestedById }
    });
  };

  const listPlanPublications = async (planId) => {
    const rows = await db.socialPublication.findMany({ where: { contentItem: { planId, deletedAt: null } }, orderBy: { scheduledAt: 'asc' } });
    return rows.map(publicPublication);
  };

  /** La pieza cambió de día o de hora: sus filas programadas la siguen; sin hora, se cancelan diciendo por qué. */
  const resyncItemPublications = async (itemId) => {
    const item = await db.contentItem.findUnique({ where: { id: itemId }, include: itemInclude });
    if (!item) return [];
    const scheduled = (item.publications || []).filter((row) => row.status === 'SCHEDULED');
    if (!scheduled.length) return [];
    const publishAt = publishAtIso(item.publishDate, item.publishTime);
    const updates = [];
    for (const row of scheduled) {
      updates.push(await db.socialPublication.update({
        where: { id: row.id },
        data: publishAt
          ? { scheduledAt: new Date(publishAt), nextAttemptAt: null }
          : { status: 'CANCELLED', cancelledAt: now(), error: 'La pieza se quedó sin fecha u hora de publicación.' }
      }));
    }
    return updates;
  };

  const claim = async (row) => {
    const token = randomId();
    const current = now();
    const claimed = await db.socialPublication.updateMany({
      where: { id: row.id, status: row.status, leaseToken: row.leaseToken ?? null },
      data: { status: 'PUBLISHING', leaseToken: token, leaseAt: current }
    });
    return claimed.count === 1 ? token : null;
  };

  const notifyRequester = async (row, item, { type, message }) => {
    if (!row.requestedById) return;
    try {
      await notify({ userId: row.requestedById, type, message, relatedId: item.id, resourceId: item.planId, url: `/parrillas/${item.planId}?item=${item.id}` });
    } catch (error) {
      logger.error('[SocialPublishing] No se pudo avisar a quien programó:', error.response?.data || error.message || error);
    }
  };

  const recordFailure = async ({ row, item, error, leaseToken }) => {
    const attempts = Number(row.attempts || 0) + 1;
    const retryable = isRetryableMetaError(error) && !error.permanent;
    const nextAttemptAt = retryable ? nextPublicationRetryAt(attempts, now()) : null;
    const humanError = error.permanent ? error.message : humanizeMetaError(error);
    const diagnostic = {
      at: now().toISOString(), code: error.code ?? null, subcode: error.subcode ?? null, status: error.status ?? null,
      fbtraceId: error.fbtraceId ?? null, message: String(error.message || '').slice(0, 300), willRetry: Boolean(nextAttemptAt)
    };
    const diagnostics = [...(Array.isArray(row.diagnostics) ? row.diagnostics : []), diagnostic].slice(-MAX_DIAGNOSTICS);
    const status = nextAttemptAt ? 'SCHEDULED' : 'FAILED';
    await db.socialPublication.updateMany({
      where: { id: row.id, leaseToken },
      data: { status, attempts, nextAttemptAt, error: humanError, diagnostics, leaseToken: null, leaseAt: null }
    });
    if (error.code === 190 || error.code === 102) {
      await db.clientSocialAccount.update({ where: { id: row.socialAccountId }, data: { isActive: false, lastError: humanError, lastCheckedAt: now() } }).catch(() => {});
    }
    if (status === 'FAILED') {
      await notifyRequester(row, item, {
        type: 'SOCIAL_PUBLICATION_FAILED',
        message: `No se pudo publicar «${item.objective || item.format}» en ${SOCIAL_PLATFORM_LABELS[row.platform] || row.platform}: ${humanError}`
      });
    }
    return status;
  };

  const publishOne = async (row) => {
    const leaseToken = await claim(row);
    if (!leaseToken) return { id: row.id, status: 'SKIPPED' };
    const full = await db.socialPublication.findUnique({ where: { id: row.id }, include: { socialAccount: true } });
    const item = await db.contentItem.findUnique({ where: { id: full.contentItemId }, include: itemInclude });
    const account = full.socialAccount;
    try {
      if (!item || item.deletedAt) throw Object.assign(new Error('La pieza ya no existe.'), { permanent: true });
      // Se vuelve a comprobar todo en el momento de salir: la pieza pudo perder la aprobación o el archivo.
      const problems = schedulingProblems({ item, assets: item.finalAssets, accounts: account ? [account] : [], platforms: [full.platform], now: new Date(0) });
      if (problems.length) throw Object.assign(new Error(problems[0]), { permanent: true });

      const media = describeMetaMedia({ format: item.format, assets: item.finalAssets });
      const files = [];
      for (const asset of media.assets) files.push({ url: await mediaUrlFor(asset), isVideo: isVideoAsset(asset) });
      const token = decryptToken(account.encryptedToken);
      const caption = String(item.captionText || '');
      const result = full.platform === 'INSTAGRAM'
        ? await meta.publishToInstagram({ igUserId: account.externalId, token, kind: media.kind, caption, media: files, coverUrl: null })
        : await meta.publishToFacebookPage({ pageId: account.externalId, token, kind: media.kind, caption, media: files });

      await db.socialPublication.updateMany({
        where: { id: row.id, leaseToken },
        data: { status: 'PUBLISHED', publishedAt: now(), externalMediaId: result.mediaId || null, permalink: result.permalink || null, error: null, leaseToken: null, leaseAt: null }
      });
      const pending = await db.socialPublication.count({ where: { contentItemId: item.id, status: { in: [...ACTIVE_PUBLICATION_STATUSES] } } });
      if (pending === 0 && item.status !== 'PUBLICADO') {
        await db.contentItem.update({ where: { id: item.id }, data: { status: 'PUBLICADO' } });
      }
      await notifyRequester(full, item, {
        type: 'SOCIAL_PUBLICATION_PUBLISHED',
        message: `«${item.objective || item.format}» ya está publicado en ${SOCIAL_PLATFORM_LABELS[full.platform] || full.platform}.`
      });
      return { id: row.id, status: 'PUBLISHED', permalink: result.permalink || null };
    } catch (error) {
      logger.error(`[SocialPublishing] Falló la publicación ${row.id} (${full.platform}):`, error.response?.data || error.message || error);
      const status = await recordFailure({ row: full, item: item || { id: full.contentItemId, planId: null }, error, leaseToken });
      return { id: row.id, status, error: error.message };
    }
  };

  /** Las filas cuya hora llegó, más las que otra réplica reclamó y nunca terminó. */
  const processDuePublications = async ({ limit = 5 } = {}) => {
    const current = now();
    const staleLease = new Date(current.getTime() - PUBLICATION_LEASE_MS);
    const due = await db.socialPublication.findMany({
      where: {
        OR: [
          { status: 'SCHEDULED', scheduledAt: { lte: current }, OR: [{ nextAttemptAt: null }, { nextAttemptAt: { lte: current } }] },
          { status: 'PUBLISHING', leaseAt: { lt: staleLease } }
        ]
      },
      orderBy: { scheduledAt: 'asc' },
      take: limit
    });
    const outcomes = [];
    for (const row of due) {
      if (!SOCIAL_PLATFORMS.includes(row.platform)) {
        await db.socialPublication.updateMany({ where: { id: row.id, status: row.status }, data: { status: 'FAILED', error: 'Red no reconocida.', leaseToken: null, leaseAt: null } });
        outcomes.push({ id: row.id, status: 'FAILED' });
        continue;
      }
      outcomes.push(await publishOne(row));
    }
    return outcomes;
  };

  return { schedulePublications, cancelPublication, retryPublication, listPlanPublications, resyncItemPublications, processDuePublications, publishOne };
};

export const socialPublishingService = createSocialPublishingService();
export const {
  schedulePublications, cancelPublication, retryPublication, listPlanPublications, resyncItemPublications, processDuePublications
} = socialPublishingService;
export { MAX_PUBLICATION_ATTEMPTS };
