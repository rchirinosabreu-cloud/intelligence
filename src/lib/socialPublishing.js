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
/**
 * Un intento que no termina en media hora se considera muerto y otra réplica puede recogerlo. Media
 * hora y no diez minutos: un carrusel con videos espera a Meta hasta ocho minutos **por archivo**, y
 * recoger una fila viva sería publicar dos veces.
 */
export const PUBLICATION_LEASE_MS = 30 * 60 * 1000;
const RETRY_BASE_MS = 2 * 60 * 1000;
/** Programar para dentro de un minuto sería programar para «ahora»: el cron corre cada minuto. */
export const MIN_SCHEDULING_LEAD_MS = 2 * 60 * 1000;
const MIN_LEAD_MS = MIN_SCHEDULING_LEAD_MS;

/** El instante ya pasó (o está a menos de dos minutos): la misma regla que al programar. */
export const isPublishInstantTooSoon = (publishAt, now = new Date()) => (
  !publishAt || new Date(publishAt).getTime() < now.getTime() + MIN_SCHEDULING_LEAD_MS
);

export const CAPTION_MAX_CHARS = 2200;

// Proporciones que Instagram acepta en el feed (foto y carrusel): de 4:5 a 1.91:1. Fuera de eso rechaza.
export const INSTAGRAM_FEED_MIN_RATIO = 0.8;
export const INSTAGRAM_FEED_MAX_RATIO = 1.91;

/**
 * Qué hacer con una imagen antes de dársela a Instagram. La API solo acepta JPEG, y en el feed solo
 * dentro del rango de proporción: lo que no cumple se convierte en una copia (PNG → JPEG) y se le añade
 * margen —nunca se recorta— hasta el borde más cercano del rango. Historias no tienen regla de proporción.
 */
export const instagramImagePlan = ({ mimeType, width, height, kind, size = 0 }) => {
  const reasons = [];
  const mime = String(mimeType || '').toLowerCase();
  if (!/image\/jpe?g/.test(mime)) reasons.push('png');
  let canvas = null;
  const feed = kind === 'IMAGE' || kind === 'CAROUSEL';
  if (feed && width > 0 && height > 0) {
    const ratio = width / height;
    if (ratio < INSTAGRAM_FEED_MIN_RATIO) canvas = { width: Math.ceil(height * INSTAGRAM_FEED_MIN_RATIO), height };
    else if (ratio > INSTAGRAM_FEED_MAX_RATIO) canvas = { width, height: Math.ceil(width / INSTAGRAM_FEED_MAX_RATIO) };
    if (canvas) reasons.push('ratio');
  }
  if (Number(size) > META_IMAGE_MAX_BYTES) reasons.push('size');
  return { convert: reasons.length > 0, canvas, reasons };
};

// Límites publicados por Meta para /{ig-user-id}/media (leídos el 29 de septiembre de 2026).
export const META_IMAGE_MAX_BYTES = 8 * MB;
/**
 * Facebook, `/{page-id}/photos` (leído el 1 de octubre de 2026): acepta JPEG, BMP, PNG, GIF y TIFF,
 * pero «los archivos no pueden superar los 4 MB» y recomienda que un PNG no pase de 1 MB. Un PNG de
 * diseño pesa varias veces eso, así que a Facebook también se le manda una copia JPEG.
 */
export const FACEBOOK_PHOTO_MAX_BYTES = 4 * MB;
const FACEBOOK_PNG_RECOMMENDED_BYTES = 1 * MB;

/** Qué hacer con una imagen antes de dársela a Facebook: sin regla de proporción, solo formato y peso. */
export const facebookImagePlan = ({ mimeType, size = 0 }) => {
  const reasons = [];
  const mime = String(mimeType || '').toLowerCase();
  const jpeg = /image\/jpe?g/.test(mime);
  if (!jpeg && Number(size) > FACEBOOK_PNG_RECOMMENDED_BYTES) reasons.push('png');
  if (Number(size) > FACEBOOK_PHOTO_MAX_BYTES) reasons.push('size');
  return { convert: reasons.length > 0, canvas: null, reasons };
};
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
    // El peso de una imagen ya no impide nada: la copia que se le manda a Meta se comprime hasta caber
    // (8 MB en Instagram, 4 MB en Facebook). Antes un PNG de diseño de 9 MB bloqueaba la programación.
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

/**
 * Lo que de verdad recibe Facebook. Su API no ofrece un post de varias fotos con un video dentro
 * (`/{page-id}/feed` con fotos sin publicar no admite videos), así que un carrusel mixto sale en
 * Facebook **solo con las fotos** (Rodny, 1 de octubre de 2026: «publiquemos también en FB sin el
 * video»). Una sola foto restante es un post de foto; ninguna, no hay qué publicar.
 */
export const facebookMedia = ({ kind, assets = [] }) => {
  if (kind !== 'CAROUSEL') return { kind, assets, droppedVideos: [], problem: null };
  const photos = assets.filter((asset) => !isVideo(asset));
  const droppedVideos = assets.filter(isVideo);
  if (!photos.length) {
    return { kind, assets: [], droppedVideos, problem: 'En Facebook una publicación de varios archivos solo lleva fotos, y esta pieza solo tiene videos.' };
  }
  return { kind: photos.length === 1 ? 'IMAGE' : 'CAROUSEL', assets: photos, droppedVideos, problem: null };
};

/**
 * Avisos que no impiden programar pero que la persona tiene que saber antes de pulsar: hoy, que en
 * Facebook el carrusel sale sin sus videos. Se dicen en la banda, junto a los motivos que sí bloquean.
 */
export const schedulingNotices = ({ item, assets = [], platforms = [] }) => {
  const notices = [];
  const wanted = (platforms || []).map((platform) => String(platform || '').toUpperCase());
  if (!wanted.includes('FACEBOOK')) return notices;
  const media = describeMetaMedia({ format: item?.format, assets });
  if (media.problem) return notices;
  const facebook = facebookMedia({ kind: media.kind, assets });
  if (facebook.droppedVideos.length && !facebook.problem) {
    const names = facebook.droppedVideos.map((asset) => `«${asset.name || 'video'}»`).join(', ');
    notices.push(`En Facebook sale sin ${facebook.droppedVideos.length > 1 ? 'los videos' : 'el video'} ${names}: Facebook no admite video dentro de una publicación de varias fotos. En Instagram sale completo.`);
  }
  return notices;
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
    else if (wanted.includes('FACEBOOK')) {
      const facebook = facebookMedia({ kind: media.kind, assets });
      if (facebook.problem) problems.push(facebook.problem);
    }
  }

  if (String(item?.captionText || '').length > CAPTION_MAX_CHARS) {
    problems.push(`El texto de la publicación tiene ${item.captionText.length} caracteres; Meta acepta hasta 2.200.`);
  }
  return problems;
};

/** Espera creciente entre intentos: 2, 4 minutos… y al tercero se rinde. */
const searchable = (value) => String(value || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/**
 * Las páginas de «Conectar página», buscadas y en orden alfabético (Rodny, 1 de octubre de 2026: con
 * la llave del CEO la lista pasó de 1 página a 69). Busca en el nombre de la página y en el usuario
 * de Instagram, sin distinguir tildes ni mayúsculas; cada palabra escrita tiene que aparecer.
 */
export const filterSocialPages = (pages, query = '') => {
  const words = searchable(query).replace(/@/g, ' ').split(/\s+/).filter(Boolean);
  return [...(Array.isArray(pages) ? pages : [])]
    .filter((page) => {
      const haystack = searchable(`${page.pageName || ''} ${page.instagram?.username || ''}`);
      return words.every((word) => haystack.includes(word));
    })
    .sort((a, b) => String(a.pageName || '').trim().localeCompare(String(b.pageName || '').trim(), 'es', { sensitivity: 'base' }));
};

export const nextPublicationRetryAt =(attempts, now = new Date()) => {
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
  // Solo lo que dijo Meta se cuenta como dicho por Meta. Un fallo nuestro antes de pedirle nada
  // (leer el archivo, firmar la URL) salía como «Meta respondió: …» y mandaba a buscar donde no era.
  const fromMeta = error.name === 'MetaGraphError' || Number(error.status) > 0 || (error.code != null && Number.isFinite(code));
  if (!fromMeta) return message ? `No se pudo preparar la publicación: ${message}` : 'No se pudo preparar la publicación.';
  return message ? `Meta respondió: ${message}` : 'Meta respondió con un error sin detalle.';
};
