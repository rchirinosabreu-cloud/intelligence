/**
 * La cola de publicación en Instagram y Facebook (Rodny, 29 de septiembre de 2026).
 *
 * Una fila de `SocialPublication` por pieza y **cuenta** (desde el 2 de octubre de 2026 un cliente puede
 * tener varias cuentas, y una pieza puede ir a una o a varias). Programar comprueba con `schedulingProblems` todo lo
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
import { imageDerivativeService } from './socialImageDerivativeService.js';
import { updateTask } from './nativeTaskService.js';
import { isPublicationTask } from '../lib/contentTaskReciprocity.js';
import {
  MAX_PUBLICATION_ATTEMPTS, PUBLICATION_LEASE_MS, SOCIAL_PLATFORMS, SOCIAL_PLATFORM_LABELS,
  CHOOSE_ACCOUNT_FIRST, describeMetaMedia, facebookMedia, humanizeMetaError, isPublishInstantTooSoon, isRetryableMetaError,
  itemStatusForQueue, nextPublicationRetryAt,
  pieceNeedsAccountChoice, pieceTargetAccounts, publishAtIso, schedulingProblems, socialPagesOf
} from '../lib/socialPublishing.js';
const AMBIGUOUS_PUBLISH_MESSAGE = 'Meta recibió la orden de publicar pero no confirmó el resultado. Revisa la cuenta antes de reintentar: si la pieza ya salió, no la vuelvas a programar.';

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
  socialAccountId: row.socialAccountId,
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
  isPrimary: Boolean(account.isPrimary),
  connectedAt: account.connectedAt,
  lastError: account.lastError
});

/**
 * La URL que se le da a Meta. Para una imagen se prepara primero la copia que esa red acepta: JPEG
 * dentro de la proporción del feed en Instagram, JPEG de hasta 4 MB en Facebook. Los videos van tal cual.
 */
const defaultMediaUrlFor = async (asset, { platform, kind } = {}) => {
  let key = asset.storageKey || asset.finalAssetKey;
  if (platform === 'INSTAGRAM') key = (await imageDerivativeService.prepareForInstagram(asset, { kind })).key;
  else if (platform === 'FACEBOOK') key = (await imageDerivativeService.prepareForFacebook(asset)).key;
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
  // El cierre del pendiente «Publicar» pasa por el camino de siempre (reconocimientos, relojes,
  // historial): el mismo `updateTask` del botón de Gestión, sin la puerta de permisos, que es para
  // personas. Se inyecta para poder comprobarlo sin base de datos.
  completeTask = updateTask,
  logger = console
} = {}) => {
  const loadItem = async (itemId) => {
    const item = await db.contentItem.findUnique({ where: { id: itemId }, include: itemInclude });
    if (!item || item.deletedAt || item.plan?.deletedAt) throw httpError(404, 'La pieza no existe.');
    return item;
  };

  const accountsOf = (item) => (item.plan?.client?.socialAccounts || []);

  /** «Instagram (@endova.salud)»: con varias cuentas por cliente, la red sola ya no dice dónde. */
  const whereLabel = (account) => `${SOCIAL_PLATFORM_LABELS[account.platform] || account.platform}${account.displayName ? ` (${account.displayName})` : ''}`;

  /**
   * Meta publicó: el pendiente «Publicar» se cierra solo (Rodny, 15 de octubre de 2026: «si ya la
   * plataforma está reconociendo que se publicó en Meta, entonces eso debe publicarse automáticamente»).
   * Así el community manager no tiene que mover nada —que era justo lo que mataba la publicación— y el
   * logro queda a su nombre, porque el trabajo era programarla y lo hizo.
   *
   * Pasa por el `updateTask` de siempre, no por un atajo: cierra los relojes abiertos, escribe
   * `completedAt` y cuenta para los reconocimientos igual que el botón del tablero. Y **nunca tumba la
   * publicación**: la pieza ya salió, así que un fallo al cerrar el pendiente solo se anota.
   */
  const closePublicationTaskFor = async (itemId) => {
    try {
      const open = await db.task.findMany({
        where: { contentItemId: itemId, status: { not: 'REALIZADA' } },
        select: { id: true, title: true, assignee: { select: { userId: true } } }
      });
      for (const task of open.filter((row) => isPublicationTask(row.title || ''))) {
        await completeTask(task.id, { status: 'REALIZADA' }, task.assignee?.userId || null)
          .catch((error) => logger.error('[SocialPublishing] No se pudo cerrar el pendiente «Publicar»:', error.response?.data || error.message || error));
      }
    } catch (error) {
      logger.error('[SocialPublishing] No se pudieron leer los pendientes de la pieza:', error.response?.data || error.message || error);
    }
  };

  /**
   * Pone la pieza en el estado que le toca por su cola (`itemStatusForQueue`) y, si queda publicada,
   * cierra su pendiente «Publicar». Lo llama todo lo que mueve la cola —programar, cancelar, mover la
   * pieza de día, publicar y fallar—, para que el estado de la pieza y su cola no puedan discrepar.
   */
  const syncItemStatusWithQueue = async (itemId) => {
    const item = await db.contentItem.findUnique({
      where: { id: itemId },
      select: { id: true, status: true, publications: { select: { status: true } } }
    });
    if (!item) return null;
    const next = itemStatusForQueue({ status: item.status, publications: item.publications || [] });
    if (!next || next === item.status) return item.status;
    await db.contentItem.update({ where: { id: item.id }, data: { status: next } });
    if (next === 'PUBLICADO') await closePublicationTaskFor(item.id);
    return next;
  };

  /**
   * Programar en las cuentas elegidas (`accountIds`). Solo valen las cuentas a las que va la pieza
   * (`pieceTargetAccounts`): una cuenta del cliente que la pieza no nombra se rechaza, nunca se añade
   * a escondidas. `platforms` es la forma de antes, cuando había una cuenta por red: se resuelve
   * contra las cuentas de la pieza.
   */
  const schedulePublications = async ({ itemId, accountIds = null, platforms = [], actorUserId = null }) => {
    const item = await loadItem(itemId);
    const pool = pieceTargetAccounts(item, accountsOf(item));
    // Con varias cuentas y ninguna marcada no hay dónde programar: se pide elegir, nunca se asume una.
    if (pieceNeedsAccountChoice(item, accountsOf(item))) {
      throw httpError(422, CHOOSE_ACCOUNT_FIRST, { code: 'SOCIAL_PUBLICATION_INVALID', problems: [CHOOSE_ACCOUNT_FIRST] });
    }
    let targets;
    let problems;
    if (Array.isArray(accountIds)) {
      const wantedIds = Array.from(new Set(accountIds.map((id) => String(id))));
      targets = wantedIds.map((id) => pool.find((account) => account.id === id)).filter(Boolean);
      problems = targets.length === wantedIds.length ? [] : ['Una de las cuentas elegidas no es de esta pieza. Elige la cuenta en la pieza y vuelve a programar.'];
      problems.push(...schedulingProblems({ item, assets: item.finalAssets, targets, now: now() }));
    } else {
      const wanted = Array.from(new Set(platforms.map((platform) => String(platform || '').toUpperCase())));
      problems = schedulingProblems({ item, assets: item.finalAssets, accounts: pool, platforms: wanted, now: now() });
      targets = wanted.map((platform) => pool.find((candidate) => candidate.platform === platform && candidate.isActive !== false)).filter(Boolean);
    }
    for (const account of targets) {
      const existing = (item.publications || []).find((row) => row.socialAccountId === account.id);
      if (existing?.status === 'PUBLISHED') problems.push(`Esta pieza ya se publicó en ${whereLabel(account)}.`);
      else if (existing?.status === 'PUBLISHING') problems.push(`Esta pieza se está publicando en ${whereLabel(account)} ahora mismo.`);
    }
    if (problems.length) throw httpError(422, problems[0], { code: 'SOCIAL_PUBLICATION_INVALID', problems });

    const scheduledAt = new Date(publishAtIso(item.publishDate, item.publishTime));
    const rows = [];
    for (const account of targets) {
      const fresh = {
        status: 'SCHEDULED', scheduledAt, attempts: 0, nextAttemptAt: null, leaseToken: null, leaseAt: null, publishRequestedAt: null,
        error: null, permalink: null, externalMediaId: null, publishedAt: null, cancelledAt: null, requestedById: actorUserId
      };
      rows.push(await db.socialPublication.upsert({
        where: { contentItemId_socialAccountId: { contentItemId: item.id, socialAccountId: account.id } },
        create: { contentItemId: item.id, socialAccountId: account.id, platform: account.platform, ...fresh },
        update: { platform: account.platform, ...fresh }
      }));
    }
    // La pieza queda «Programada»: ya no es solo «hecha», está en la cola esperando su hora.
    if (rows.length) await syncItemStatusWithQueue(item.id);
    return rows;
  };

  /**
   * A qué cuentas va la pieza. Se guarda en la pieza y, en el mismo acto, se cancela lo que estuviera
   * programado en las cuentas que deja: nada sale en una cuenta que la pieza ya no nombra. Lo que ya
   * salió no se toca. Se pueden desmarcar todas (Rodny, 2 de octubre de 2026: «quiero poder
   * seleccionar y deseleccionar»): la pieza queda sin destino hasta que alguien marque uno.
   */
  const setItemSocialPages = async ({ itemId, pageIds = [] }) => {
    const item = await loadItem(itemId);
    const pages = socialPagesOf(accountsOf(item));
    const wanted = Array.from(new Set((Array.isArray(pageIds) ? pageIds : []).map((id) => String(id))));
    if (wanted.some((id) => !pages.some((page) => page.pageId === id))) throw httpError(422, 'Esa cuenta no está conectada a este cliente.');
    const socialPageIds = pages.filter((page) => wanted.includes(page.pageId)).map((page) => page.pageId);
    await db.contentItem.update({ where: { id: item.id }, data: { socialPageIds } });
    await resyncItemPublications(item.id, { enforceTargets: true });
    return { itemId: item.id, socialPageIds };
  };

  const cancelPublication = async ({ publicationId }) => {
    const row = await db.socialPublication.findUnique({ where: { id: publicationId } });
    if (!row) throw httpError(404, 'La publicación programada no existe.');
    if (row.status === 'PUBLISHING') throw httpError(409, 'Esta pieza se está publicando ahora mismo; ya no se puede cancelar.');
    if (row.status !== 'SCHEDULED') throw httpError(409, 'Solo se cancela una publicación que todavía está programada.');
    // El motivo de un intento fallido anterior no es el motivo de esta cancelación: la banda lo mostraría como tal.
    const cancelled = await db.socialPublication.update({ where: { id: row.id }, data: { status: 'CANCELLED', cancelledAt: now(), error: null, leaseToken: null, leaseAt: null } });
    // Sin nada vivo en la cola la pieza vuelve a «Realizado», que es lo que la devuelve al equipo.
    await syncItemStatusWithQueue(row.contentItemId);
    return cancelled;
  };

  /**
   * Cancelar lo que esta pieza tenga programado, con su motivo. Lo usa «Ya se publicó» (15 de octubre
   * de 2026): marcar a mano una pieza como publicada dejaba la cola armada, y al llegar la hora el
   * publicador la encontraba publicada y fallaba las dos redes. Una fila que se está publicando ahora
   * mismo no se toca: ya está en vuelo, y quien la marque a mano se lo encontrará dicho.
   */
  const cancelItemPublications = async ({ itemId, reason }) => {
    const { count } = await db.socialPublication.updateMany({
      where: { contentItemId: itemId, status: 'SCHEDULED' },
      data: { status: 'CANCELLED', cancelledAt: now(), error: reason, leaseToken: null, leaseAt: null }
    });
    return count;
  };

  const retryPublication = async ({ publicationId, actorUserId = null }) => {
    const row = await db.socialPublication.findUnique({ where: { id: publicationId } });
    if (!row) throw httpError(404, 'La publicación no existe.');
    if (row.status !== 'FAILED') throw httpError(409, 'Solo se reintenta una publicación que falló.');
    const current = now();
    const scheduledAt = new Date(row.scheduledAt).getTime() < current.getTime() ? current : row.scheduledAt;
    return db.socialPublication.update({
      where: { id: row.id },
      data: { status: 'SCHEDULED', scheduledAt, attempts: 0, nextAttemptAt: null, error: null, leaseToken: null, leaseAt: null, publishRequestedAt: null, requestedById: actorUserId || row.requestedById }
    });
  };

  /**
   * Volver a publicar lo que ya salió (Rodny, 1 de octubre de 2026): borró el carrusel en las dos redes
   * para corregir una imagen y la fila seguía «Publicada», sin nada que pulsar. Reabrir no publica nada:
   * deja la fila libre para el «Programar» de siempre, con todas sus reglas. Lo que había salido —enlace,
   * identificador, hora— queda en el historial de la fila. La plataforma no sabe si la publicación
   * anterior sigue en la red; por eso la pantalla pregunta antes y avisa de que quedaría duplicada.
   */
  const reopenPublication = async ({ publicationId, actorUserId = null }) => {
    const row = await db.socialPublication.findUnique({ where: { id: publicationId } });
    if (!row) throw httpError(404, 'La publicación no existe.');
    if (row.status !== 'PUBLISHED') throw httpError(409, 'Solo se vuelve a publicar una pieza ya publicada en esa red.');
    const current = now();
    const trace = {
      at: current.toISOString(), reopened: true, actorUserId,
      previousPermalink: row.permalink || null, previousMediaId: row.externalMediaId || null,
      previousPublishedAt: row.publishedAt ? new Date(row.publishedAt).toISOString() : null
    };
    const diagnostics = [...(Array.isArray(row.diagnostics) ? row.diagnostics : []), trace].slice(-MAX_DIAGNOSTICS);
    const updated = await db.socialPublication.update({
      where: { id: row.id },
      data: {
        status: 'CANCELLED', cancelledAt: current, error: 'Lista para publicar de nuevo: elige la hora y pulsa «Programar».',
        permalink: null, externalMediaId: null, publishedAt: null, publishRequestedAt: null,
        attempts: 0, nextAttemptAt: null, leaseToken: null, leaseAt: null, diagnostics
      }
    });
    // `PUBLICADO` lo puso la cola y no se puede programar: la pieza vuelve a «hecha y por salir».
    const item = await db.contentItem.findUnique({ where: { id: row.contentItemId } });
    if (item?.status === 'PUBLICADO') await db.contentItem.update({ where: { id: item.id }, data: { status: 'REALIZADO' } });
    return updated;
  };

  const listPlanPublications = async (planId) => {
    const rows = await db.socialPublication.findMany({ where: { contentItem: { planId, deletedAt: null } }, orderBy: { scheduledAt: 'asc' } });
    return rows.map(publicPublication);
  };

  /**
   * La pieza cambió de día o de hora: sus filas programadas la siguen. Sin hora, o con una hora que ya
   * pasó, se cancelan diciendo por qué: mover una pieza al pasado no puede publicarla en el acto.
   */
  async function resyncItemPublications(itemId, { enforceTargets = false } = {}) {
    const item = await db.contentItem.findUnique({ where: { id: itemId }, include: itemInclude });
    if (!item) return [];
    const scheduled = (item.publications || []).filter((row) => row.status === 'SCHEDULED');
    if (!scheduled.length) return [];
    const publishAt = publishAtIso(item.publishDate, item.publishTime);
    const cancelReason = !publishAt
      ? 'La pieza se quedó sin fecha u hora de publicación.'
      : isPublishInstantTooSoon(publishAt, now()) ? 'La nueva hora de publicación ya pasó; vuelve a programar la pieza con una hora por delante.' : null;
    // Las cuentas a las que va la pieza hoy: lo programado en una que ya no nombra no puede salir. Solo
    // se aplica cuando alguien acaba de cambiar las cuentas de la pieza (`enforceTargets`): un cambio de
    // día u hora mueve lo programado, pero nunca lo cancela porque la pieza no tuviera cuenta marcada.
    const stillTargets = new Set(pieceTargetAccounts(item, accountsOf(item)).map((account) => account.id));
    const updates = [];
    for (const row of scheduled) {
      const reason = enforceTargets && !stillTargets.has(row.socialAccountId) ? 'La pieza ya no va a esta cuenta.' : cancelReason;
      updates.push(await db.socialPublication.update({
        where: { id: row.id },
        data: reason
          ? { status: 'CANCELLED', cancelledAt: now(), error: reason, leaseToken: null, leaseAt: null }
          : { scheduledAt: new Date(publishAt), nextAttemptAt: null }
      }));
    }
    // Mover la pieza al pasado o quitarle la cuenta cancela su cola: entonces deja de estar programada.
    if (updates.length) await syncItemStatusWithQueue(item.id);
    return updates;
  }

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

  const recordFailure = async ({ row, item, error, leaseToken, publishRequested = false }) => {
    const attempts = Number(row.attempts || 0) + 1;
    // Si la orden de publicar ya salió y la respuesta se perdió (red, tiempo de espera, 5xx), no se sabe si
    // Meta publicó: repetirlo solo podría duplicar el post. Queda en manos de una persona.
    const ambiguous = publishRequested && isRetryableMetaError(error) && !error.permanent;
    const retryable = !ambiguous && isRetryableMetaError(error) && !error.permanent;
    const nextAttemptAt = retryable ? nextPublicationRetryAt(attempts, now()) : null;
    const humanError = ambiguous ? AMBIGUOUS_PUBLISH_MESSAGE : error.permanent ? error.message : humanizeMetaError(error);
    const diagnostic = {
      at: now().toISOString(), code: error.code ?? null, subcode: error.subcode ?? null, status: error.status ?? null,
      fbtraceId: error.fbtraceId ?? null, message: String(error.message || '').slice(0, 300), willRetry: Boolean(nextAttemptAt), ambiguous
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
    // Un fallo definitivo deja la cola sin nada vivo: la pieza deja de estar «Programada» y vuelve al
    // equipo, que es lo que permite volver a marcarla a mano si la publica por su cuenta.
    await syncItemStatusWithQueue(row.contentItemId);
    if (status === 'FAILED') {
      await notifyRequester(row, item, {
        type: 'SOCIAL_PUBLICATION_FAILED',
        message: `No se pudo publicar «${item.objective || item.format}» en ${row.socialAccount ? whereLabel(row.socialAccount) : (SOCIAL_PLATFORM_LABELS[row.platform] || row.platform)}: ${humanError}`
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
    let publishRequested = false;
    // Constancia de que la orden de publicar salió: se escribe **antes** de la llamada, no después.
    const beforePublish = async () => {
      publishRequested = true;
      await db.socialPublication.updateMany({ where: { id: row.id, leaseToken }, data: { publishRequestedAt: now() } });
    };
    try {
      if (!item || item.deletedAt) throw Object.assign(new Error('La pieza ya no existe.'), { permanent: true });
      if (full.publishRequestedAt && row.status === 'PUBLISHING') {
        // Una fila recogida con lease vencido **después** de haber mandado publicar: no se repite la orden.
        throw Object.assign(new Error(AMBIGUOUS_PUBLISH_MESSAGE), { permanent: true, code: 'PUBLISH_AMBIGUOUS' });
      }
      // Se vuelve a comprobar todo en el momento de salir: la pieza pudo perder la aprobación o el archivo.
      const problems = schedulingProblems({ item, assets: item.finalAssets, accounts: account ? [account] : [], platforms: [full.platform], now: new Date(0) });
      // «Esta pieza ya está publicada» dicho a la hora de salir señalaba justo lo contrario de lo que
      // pasaba: la pieza no había salido (15 de octubre de 2026). Lo que se dice aquí es que **no se
      // envió**, y después el motivo.
      if (problems.length) throw Object.assign(new Error(`No se envió a Meta: ${problems[0].charAt(0).toLowerCase()}${problems[0].slice(1)}`), { permanent: true });

      const described = describeMetaMedia({ format: item.format, assets: item.finalAssets });
      // Facebook recibe el carrusel sin sus videos (su API no los admite entre varias fotos).
      const media = full.platform === 'FACEBOOK' ? facebookMedia({ kind: described.kind, assets: described.assets }) : described;
      const files = [];
      for (const asset of media.assets) files.push({ url: await mediaUrlFor(asset, { platform: full.platform, kind: media.kind }), isVideo: isVideoAsset(asset) });
      const token = decryptToken(account.encryptedToken);
      const caption = String(item.captionText || '');
      const result = full.platform === 'INSTAGRAM'
        ? await meta.publishToInstagram({ igUserId: account.externalId, token, kind: media.kind, caption, media: files, coverUrl: null, beforePublish })
        : await meta.publishToFacebookPage({ pageId: account.externalId, token, kind: media.kind, caption, media: files, beforePublish });

      await db.socialPublication.updateMany({
        where: { id: row.id, leaseToken },
        data: { status: 'PUBLISHED', publishedAt: now(), externalMediaId: result.mediaId || null, permalink: result.permalink || null, error: null, leaseToken: null, leaseAt: null }
      });
      // Programadas, publicándose **o fallidas**: mientras una red pedida no haya salido, la pieza no
      // está publicada. Con todas fuera queda `PUBLICADO` y su pendiente «Publicar» se cierra solo.
      await syncItemStatusWithQueue(item.id);
      await notifyRequester(full, item, {
        type: 'SOCIAL_PUBLICATION_PUBLISHED',
        message: `«${item.objective || item.format}» ya está publicado en ${account ? whereLabel(account) : (SOCIAL_PLATFORM_LABELS[full.platform] || full.platform)}.`
      });
      return { id: row.id, status: 'PUBLISHED', permalink: result.permalink || null };
    } catch (error) {
      logger.error(`[SocialPublishing] Falló la publicación ${row.id} (${full.platform}):`, error.response?.data || error.message || error);
      const status = await recordFailure({ row: full, item: item || { id: full.contentItemId, planId: null }, error, leaseToken, publishRequested });
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

  return { schedulePublications, setItemSocialPages, cancelPublication, cancelItemPublications, retryPublication, reopenPublication, listPlanPublications, resyncItemPublications, processDuePublications, publishOne };
};

export const socialPublishingService = createSocialPublishingService();
export const {
  schedulePublications, cancelPublication, cancelItemPublications, retryPublication, listPlanPublications, resyncItemPublications, processDuePublications
} = socialPublishingService;
export { MAX_PUBLICATION_ATTEMPTS };
