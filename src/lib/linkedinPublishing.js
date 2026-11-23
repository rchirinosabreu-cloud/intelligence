/**
 * Publicación en páginas de empresa de LinkedIn (Rodny, 23 de noviembre de 2026: «empecemos montando lo de
 * LinkedIn»). Lógica pura, compartida por el servicio, las rutas y la pantalla: no toca la base ni la red.
 *
 * LinkedIn no es Meta, y aquí está lo que cambia (leído en su documentación ese día):
 *
 * - **Cada cliente autoriza su página.** En Meta una sola llave de la agencia ve todas las páginas; en
 *   LinkedIn un administrador de la página inicia sesión una vez y esa autorización vale 60 días (un año
 *   si LinkedIn le da a la app tokens de renovación).
 * - **Los archivos se suben, no se enlazan.** Meta descarga de una URL firmada; a LinkedIn hay que
 *   mandarle los bytes (imágenes enteras, videos en partes de 4 MB).
 * - **El texto lleva su propio formato** («little text»): quince caracteres reservados se escapan o
 *   LinkedIn corta el texto donde encuentra el primero.
 * - **No hay historias, ni portada aparte, ni video dentro de varias imágenes.**
 */

export const LINKEDIN_PLATFORM = 'LINKEDIN';

/** Lo que se le pide al administrador de la página al conectar. Los tres salen del producto Community Management API. */
export const LINKEDIN_SCOPES = Object.freeze(['w_organization_social', 'r_organization_social', 'rw_organization_admin']);

/** Roles de página que pueden publicar. LinkedIn escribe el de contenido de dos maneras según la página que se lea. */
export const LINKEDIN_POSTING_ROLES = Object.freeze(['ADMINISTRATOR', 'CONTENT_ADMINISTRATOR', 'CONTENT_ADMIN', 'DIRECT_SPONSORED_CONTENT_POSTER']);

export const LINKEDIN_TEXT_MAX_CHARS = 3000;
export const LINKEDIN_MULTI_IMAGE_MIN = 2;
export const LINKEDIN_MULTI_IMAGE_MAX = 20;
const MB = 1024 * 1024;
export const LINKEDIN_VIDEO_MAX_BYTES = 500 * MB;
export const LINKEDIN_VIDEO_MIN_BYTES = 75 * 1024;
/** Se renueva la autorización cuando le quedan menos días que estos, y se avisa en la ficha del cliente. */
export const LINKEDIN_RENEW_BEFORE_DAYS = 7;
const DAY_MS = 24 * 60 * 60 * 1000;

const mimeOf = (asset) => String(asset?.mimeType || '').toLowerCase().split(';', 1)[0].trim();
const isVideo = (asset) => mimeOf(asset).startsWith('video/');
const isImage = (asset) => mimeOf(asset).startsWith('image/');

const RESERVED = /[|{}@[\]()<>#\\*_~]/g;
const HASHTAG = /#([\p{L}\p{N}_]+)/gu;

/**
 * El texto de la pieza en el formato de LinkedIn. Todo carácter reservado se escapa con una barra —también
 * cuando no forma parte de nada: un paréntesis suelto sin escapar corta la publicación ahí— y cada
 * `#etiqueta` se escribe como plantilla de etiqueta para que siga siendo una etiqueta y no texto plano.
 * Las menciones (@Empresa) salen como texto: enlazarlas exige el identificador de LinkedIn de cada una.
 */
export const escapeLinkedInText = (text) => {
  const source = String(text || '');
  let out = '';
  let last = 0;
  for (const match of source.matchAll(HASHTAG)) {
    out += source.slice(last, match.index).replace(RESERVED, '\\$&');
    out += `{hashtag|\\#|${match[1]}}`;
    last = match.index + match[0].length;
  }
  return out + source.slice(last).replace(RESERVED, '\\$&');
};

/**
 * Lo que de verdad recibe LinkedIn a partir de lo que ya describe `describeMetaMedia` (`kind` y archivos).
 * `kind`: IMAGE, MULTI_IMAGE o VIDEO. Un carrusel con videos sale solo con sus imágenes (como en Facebook),
 * y una historia no sale: LinkedIn no tiene.
 */
export const linkedinMedia = ({ kind, assets = [] }) => {
  const result = (linkedinKind, list, extra = {}) => ({ kind: linkedinKind, assets: list, droppedVideos: [], problem: null, ...extra });
  if (kind === 'STORIES') return result(null, [], { problem: 'Una historia no se publica en LinkedIn: LinkedIn no tiene historias.' });
  if (kind === 'REELS') {
    const [video] = assets;
    if (mimeOf(video) !== 'video/mp4') return result('VIDEO', assets, { problem: `«${video?.name || 'El video'}» debe ser MP4 para publicarse en LinkedIn.` });
    const size = Number(video?.size || 0);
    if (size > LINKEDIN_VIDEO_MAX_BYTES) return result('VIDEO', assets, { problem: `«${video.name || 'El video'}» pesa ${Math.round(size / MB)} MB; LinkedIn acepta videos de hasta 500 MB.` });
    if (size > 0 && size < LINKEDIN_VIDEO_MIN_BYTES) return result('VIDEO', assets, { problem: `«${video.name || 'El video'}» es demasiado pequeño para LinkedIn (mínimo 75 KB).` });
    return result('VIDEO', assets);
  }
  if (kind === 'IMAGE') return result('IMAGE', assets);
  if (kind === 'CAROUSEL') {
    const photos = assets.filter(isImage);
    const droppedVideos = assets.filter(isVideo);
    if (!photos.length) return result(null, [], { droppedVideos, problem: 'En LinkedIn una publicación de varios archivos solo lleva imágenes, y esta pieza solo tiene videos.' });
    if (photos.length > LINKEDIN_MULTI_IMAGE_MAX) return result('MULTI_IMAGE', photos, { droppedVideos, problem: `LinkedIn admite hasta ${LINKEDIN_MULTI_IMAGE_MAX} imágenes en una publicación.` });
    return result(photos.length === 1 ? 'IMAGE' : 'MULTI_IMAGE', photos, { droppedVideos });
  }
  return result(null, [], { problem: 'LinkedIn no publica este formato.' });
};

/** El enlace público de una publicación a partir de su identificador (`urn:li:share:…` o `urn:li:ugcPost:…`). */
export const linkedinPostUrl = (urn) => (urn ? `https://www.linkedin.com/feed/update/${encodeURIComponent(String(urn)).replace(/%3A/gi, ':')}/` : null);

/**
 * Cómo está la autorización de una cuenta de LinkedIn. `expiresAt` es cuando deja de poder publicar si
 * nadie hace nada; con token de renovación la plataforma la renueva sola y lo que cuenta es `refreshExpiresAt`.
 */
export const linkedinAuthorizationState = (account, now = new Date()) => {
  const meta = account?.metadata || account || {};
  const access = meta.expiresAt ? new Date(meta.expiresAt).getTime() : null;
  const refresh = meta.refreshExpiresAt ? new Date(meta.refreshExpiresAt).getTime() : null;
  const hardStop = meta.canRefresh && refresh ? refresh : access;
  if (!hardStop) return { daysLeft: null, expired: false, expiringSoon: false, needsRefresh: false };
  const current = now.getTime();
  const daysLeft = Math.floor((hardStop - current) / DAY_MS);
  return {
    daysLeft,
    expired: hardStop <= current,
    expiringSoon: hardStop > current && daysLeft < LINKEDIN_RENEW_BEFORE_DAYS,
    needsRefresh: Boolean(meta.canRefresh) && access != null && access - current < LINKEDIN_RENEW_BEFORE_DAYS * DAY_MS
  };
};

export const LINKEDIN_RECONNECT_MESSAGE = 'La autorización de LinkedIn venció: un administrador de la página tiene que volver a conectarla desde la ficha del cliente.';

/** El motivo de un fallo de LinkedIn, en español y diciendo qué hacer. */
export const humanizeLinkedInError = (error) => {
  if (!error) return 'LinkedIn no respondió.';
  const status = Number(error.status || 0);
  const code = String(error.code || '');
  const message = String(error.message || '').trim();
  if (status === 401 || code === 'REVOKED_ACCESS_TOKEN' || code === 'EXPIRED_ACCESS_TOKEN' || code === 'INVALID_ACCESS_TOKEN') return LINKEDIN_RECONNECT_MESSAGE;
  if (status === 403) return 'LinkedIn no dejó publicar: quien conectó la página ya no es su administrador, o la app no tiene el permiso. Vuelve a conectarla desde la ficha del cliente.';
  if (status === 429) return 'LinkedIn puso un límite temporal de publicaciones; se vuelve a intentar en unos minutos.';
  if (status === 426 || /version/i.test(code)) return 'LinkedIn retiró la versión de su API que usa la plataforma: hay que actualizar LINKEDIN_API_VERSION.';
  if (code === 'MEDIA_ASSET_PROCESSING_FAILED' || code === 'PROCESSING_FAILED') return 'LinkedIn no pudo procesar el archivo: revisa el formato y el tamaño de la pieza final.';
  if (code === 'PROCESSING_TIMEOUT') return 'LinkedIn no terminó de procesar el archivo a tiempo; se vuelve a intentar.';
  if (/duplicate/i.test(code) || /duplicate/i.test(message)) return 'LinkedIn rechazó la publicación por ser idéntica a otra reciente de la misma página.';
  if (status >= 500 || !status) return 'No se pudo llegar a LinkedIn; se vuelve a intentar.';
  return message ? `LinkedIn respondió: ${message}` : 'LinkedIn respondió con un error sin detalle.';
};
