/**
 * Publicación automática en Instagram y Facebook (Rodny, 29 de septiembre de 2026).
 *
 * Meta no puede guardar una publicación programada: la API publica en el momento en que se le pide.
 * Por eso la hora vive aquí —`ContentItem.publishTime`, reloj de Bogotá— y un trabajo del servidor
 * publica cuando llega. Este módulo es lógica pura, compartida por el servicio, las rutas y la pantalla:
 * no toca la base ni la red.
 */
import { isDriveAsset } from './finalAssetShape.js';

const MB = 1024 * 1024;

export const SOCIAL_PLATFORMS = Object.freeze(['INSTAGRAM', 'FACEBOOK']);
export const SOCIAL_PLATFORM_LABELS = Object.freeze({ INSTAGRAM: 'Instagram', FACEBOOK: 'Facebook' });

export const PUBLICATION_STATUSES = Object.freeze(['SCHEDULED', 'PUBLISHING', 'PUBLISHED', 'FAILED', 'CANCELLED']);
export const ACTIVE_PUBLICATION_STATUSES = Object.freeze(['SCHEDULED', 'PUBLISHING']);

/** Una pieza sale solo si el cliente ya la aprobó; producción y realizado son etapas posteriores a esa aprobación. */
export const PUBLISHABLE_ITEM_STATUSES = Object.freeze(['APROBADO', 'EN_PRODUCCION', 'REALIZADO']);

export const MAX_PUBLICATION_ATTEMPTS = 3;
/** Un intento que no termina en diez minutos se considera muerto y otra réplica puede recogerlo. */
export const PUBLICATION_LEASE_MS = 10 * 60 * 1000;
const RETRY_BASE_MS = 2 * 60 * 1000;
/** Programar para dentro de un minuto sería programar para «ahora»: el cron corre cada minuto. */
const MIN_LEAD_MS = 2 * 60 * 1000;

export const CAPTION_MAX_CHARS = 2200;

// Límites publicados por Meta para /{ig-user-id}/media (leídos el 29 de septiembre de 2026).
export const META_IMAGE_MAX_BYTES = 8 * MB;
export const META_REEL_MAX_BYTES = 300 * MB;
export const META_STORY_VIDEO_MAX_BYTES = 100 * MB;
export const CAROUSEL_MIN_ITEMS = 2;
export const CAROUSEL_MAX_ITEMS = 10;

const IMAGE_TYPES = new Set(['image/jpeg', 'image/jpg', 'image/png']);
const VIDEO_TYPES = new Set(['video/mp4', 'video/quicktime']);

const mimeOf = (asset) => String(asset?.mimeType || '').toLowerCase().split(';', 1)[0].trim();
const isImage = (asset) => mimeOf(asset).startsWith('image/');
const isVideo = (asset) => mimeOf(asset).startsWith('video/');
const formatMb = (bytes) => `${Math.round(bytes / MB)} MB`;

const dayKeyOf = (value) => {
  if (!value) return null;
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0, 10);
};

export const splitPublishTime = (time) => {
  const match = /^(\d{2}):(\d{2})$/.exec(String(time || ''));
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return null;
  return { hours, minutes };
};

/**
 * El día de la pieza (guardado a medianoche UTC, se lee en UTC como en el calendario) más la hora en
 * reloj de Bogotá, que no tiene horario de verano: siempre -05:00.
 */
export const publishAtIso = (publishDate, publishTime) => {
  const dayKey = dayKeyOf(publishDate);
  if (!dayKey || !splitPublishTime(publishTime)) return null;
  const date = new Date(`${dayKey}T${publishTime}:00-05:00`);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
};

const mediaFileProblem = (asset, { kind }) => {
  const name = asset?.name || 'un archivo';
  if (isDriveAsset(asset)) {
    return `«${name}» es un enlace de Drive y Meta no puede leerlo. Por ahora sube el archivo a la pieza para publicarlo solo.`;
  }
  if (isImage(asset)) {
    if (!IMAGE_TYPES.has(mimeOf(asset))) return `«${name}» debe ser JPG o PNG para publicarse en Meta.`;
    if (Number(asset.size || 0) > META_IMAGE_MAX_BYTES) return `«${name}» pesa ${formatMb(asset.size)}; Meta acepta imágenes de hasta 8 MB.`;
    return null;
  }
  if (isVideo(asset)) {
    if (!VIDEO_TYPES.has(mimeOf(asset))) return `«${name}» debe ser MP4 o MOV para publicarse en Meta.`;
    const cap = kind === 'STORIES' ? META_STORY_VIDEO_MAX_BYTES : META_REEL_MAX_BYTES;
    if (Number(asset.size || 0) > cap) {
      return `«${name}» pesa ${formatMb(asset.size)}; Meta acepta ${kind === 'STORIES' ? 'historias de hasta 100 MB' : 'videos de hasta 300 MB'}.`;
    }
    return null;
  }
  return `«${name}» no es una imagen ni un video.`;
};

/**
 * Qué le vamos a pedir a Meta con esta pieza. `kind` sigue los `media_type` de la API: IMAGE (una foto
 * en el feed), CAROUSEL, REELS (todo video del feed es reel para Meta) y STORIES.
 */
export const describeMetaMedia = ({ format, assets = [] }) => {
  const result = (kind, problem = null) => ({ kind, assets, problem });
  const normalized = String(format || '').trim().toLowerCase();
  if (!assets.length) return result(null, 'La pieza no tiene pieza final cargada.');

  const driveProblem = assets.map((asset) => (isDriveAsset(asset) ? mediaFileProblem(asset, {}) : null)).find(Boolean);
  if (driveProblem) return result(null, driveProblem);

  let kind;
  if (normalized === 'historia') {
    if (assets.length !== 1) return result('STORIES', 'Una historia lleva una sola imagen o un solo video.');
    kind = 'STORIES';
  } else if (normalized === 'reel' || normalized === 'video') {
    if (assets.length !== 1 || !isVideo(assets[0])) return result('REELS', 'Un reel lleva un solo video.');
    kind = 'REELS';
  } else if (normalized === 'carrusel') {
    if (assets.length < CAROUSEL_MIN_ITEMS) return result('CAROUSEL', 'Un carrusel necesita al menos dos archivos.');
    if (assets.length > CAROUSEL_MAX_ITEMS) return result('CAROUSEL', 'Un carrusel lleva como máximo 10 archivos.');
    kind = 'CAROUSEL';
  } else if (assets.length === 1) {
    kind = isVideo(assets[0]) ? 'REELS' : 'IMAGE';
  } else {
    if (assets.length > CAROUSEL_MAX_ITEMS) return result('CAROUSEL', 'Un carrusel lleva como máximo 10 archivos.');
    kind = 'CAROUSEL';
  }

  const fileProblem = assets.map((asset) => mediaFileProblem(asset, { kind })).find(Boolean);
  return result(kind, fileProblem || null);
};

const platformLabel = (platform) => SOCIAL_PLATFORM_LABELS[platform] || platform;

/**
 * Todo lo que impide programar la pieza, dicho de una vez y en español: la pantalla lo muestra antes de
 * pedirlo y el servidor lo vuelve a comprobar antes de crear la cola.
 */
export const schedulingProblems = ({ item, assets = [], accounts = [], platforms = [], now = new Date() }) => {
  const problems = [];
  const status = String(item?.status || '');
  if (status === 'PUBLICADO') problems.push('Esta pieza ya está publicada.');
  else if (!PUBLISHABLE_ITEM_STATUSES.includes(status)) problems.push('La pieza tiene que estar aprobada por el cliente antes de programarla.');

  const publishAt = publishAtIso(item?.publishDate, item?.publishTime);
  if (!publishAt) problems.push('La pieza necesita fecha y hora de publicación.');
  else if (new Date(publishAt).getTime() < now.getTime() + MIN_LEAD_MS) problems.push('La hora de publicación ya pasó o está demasiado cerca: elige una hora al menos dos minutos más adelante.');

  const wanted = Array.from(new Set((platforms || []).map((platform) => String(platform || '').toUpperCase())));
  if (!wanted.length || wanted.some((platform) => !SOCIAL_PLATFORMS.includes(platform))) {
    problems.push('Elige al menos una red: Instagram o Facebook.');
  } else {
    for (const platform of wanted) {
      const account = accounts.find((candidate) => candidate.platform === platform && candidate.isActive !== false);
      if (!account) problems.push(`Este cliente no tiene ${platformLabel(platform)} conectado. Se conecta desde la ficha del cliente.`);
    }
    const media = describeMetaMedia({ format: item?.format, assets });
    if (media.problem) problems.push(media.problem);
    else if (media.kind === 'STORIES' && wanted.includes('FACEBOOK')) problems.push('Una historia solo se publica en Instagram, no en Facebook.');
  }

  if (String(item?.captionText || '').length > CAPTION_MAX_CHARS) {
    problems.push(`El texto de la publicación tiene ${item.captionText.length} caracteres; Meta acepta hasta 2.200.`);
  }
  return problems;
};

/** Espera creciente entre intentos: 2, 4 minutos… y al tercero se rinde. */
export const nextPublicationRetryAt = (attempts, now = new Date()) => {
  if (attempts >= MAX_PUBLICATION_ATTEMPTS) return null;
  return new Date(now.getTime() + RETRY_BASE_MS * 2 ** Math.max(0, attempts - 1));
};

const NETWORK_CODES = new Set(['ECONNRESET', 'ETIMEDOUT', 'ENOTFOUND', 'EAI_AGAIN', 'ECONNREFUSED', 'UND_ERR_CONNECT_TIMEOUT', 'UND_ERR_HEADERS_TIMEOUT', 'ABORT_ERR']);
const META_TRANSIENT_CODES = new Set([1, 2, 4, 17, 32, 613]);

/** «No nos pudieron atender» se reintenta; «este trabajo está mal» no. */
export const isRetryableMetaError = (error) => {
  if (!error) return false;
  const status = Number(error.status || error.response?.status || 0);
  const code = error.code;
  if (NETWORK_CODES.has(String(code))) return true;
  if (typeof code === 'number' && META_TRANSIENT_CODES.has(code)) return true;
  if (status === 429 || status === 408 || status >= 500) return true;
  return !status && code == null;
};

const META_ERROR_TEXT = Object.freeze({
  190: 'La conexión con Meta venció: hay que volver a conectar la cuenta desde la ficha del cliente.',
  102: 'La conexión con Meta venció: hay que volver a conectar la cuenta desde la ficha del cliente.',
  10: 'La cuenta conectada no tiene permiso para publicar en esa página o perfil.',
  200: 'La cuenta conectada no tiene permiso para publicar en esa página o perfil.',
  4: 'Meta puso un límite temporal de publicaciones; se vuelve a intentar en unos minutos.',
  17: 'Meta puso un límite temporal de publicaciones; se vuelve a intentar en unos minutos.',
  32: 'Meta puso un límite temporal de publicaciones; se vuelve a intentar en unos minutos.',
  613: 'Meta puso un límite temporal de publicaciones; se vuelve a intentar en unos minutos.',
  9007: 'Meta no pudo leer el archivo: revisa el formato y el tamaño de la pieza final.',
  2207026: 'Meta rechazó el video: revisa la duración, la resolución o el formato del archivo.',
  2207003: 'Meta no pudo descargar el archivo a tiempo; se vuelve a intentar.',
  2207052: 'Meta no pudo descargar el archivo a tiempo; se vuelve a intentar.',
  36000: 'Meta rechazó el archivo: revisa el formato y el tamaño de la pieza final.',
  36001: 'Meta rechazó el archivo: revisa el formato y el tamaño de la pieza final.',
  36003: 'Meta rechazó la proporción de la imagen: en el feed acepta de 4:5 a 1.91:1.'
});

export const humanizeMetaError = (error) => {
  if (!error) return 'Meta no respondió.';
  const code = typeof error.code === 'number' ? error.code : Number(error.code);
  if (Number.isFinite(code) && META_ERROR_TEXT[code]) return META_ERROR_TEXT[code];
  if (NETWORK_CODES.has(String(error.code))) return 'No se pudo llegar a Meta; se vuelve a intentar.';
  const message = String(error.userMessage || error.message || '').trim();
  return message ? `Meta respondió: ${message}` : 'Meta respondió con un error sin detalle.';
};
