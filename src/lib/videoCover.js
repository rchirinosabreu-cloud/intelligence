/**
 * La portada de un video (Rodny, 15 de octubre de 2026: «a veces los videos que se publican necesitan
 * portadas»).
 *
 * Lógica pura, compartida por la pantalla, la ruta y el publicador: no toca la base ni la red.
 *
 * Lo que Meta admite, leído en su referencia el 15 de octubre de 2026:
 *
 * - **Reel de Instagram** (`POST /{ig-user-id}/media` con `media_type=REELS`): `cover_url`, una URL
 *   pública que Meta descarga. «Si especificas cover_url y thumb_offset, usamos cover_url». La foto de
 *   portada tiene que ser JPEG, de 8 MB como máximo y en sRGB; recomiendan 9:16 y, si no lo es,
 *   **recortan el rectángulo central 9:16**. Y como publicamos los reels con `share_to_feed`, para la
 *   cuadrícula del perfil recortan además **el cuadrado central 1:1 de esa misma portada**: lo que
 *   importa tiene que caber en el centro.
 * - **Video de Facebook**: `POST /{video-id}/thumbnails` con `source` (el archivo) e `is_preferred`.
 *   Es una llamada **aparte y posterior** a publicar, así que una portada que falle nunca puede tumbar
 *   una publicación que ya salió. Tope de 10 MB y recomiendan la misma proporción del video.
 * - **Historia de Instagram y videos dentro de un carrusel: no.** El parámetro de Instagram es «solo
 *   para Reels» y los contenedores hijos de una secuencia no lo admiten. No inventarles una portada.
 */

const MB = 1024 * 1024;

/** Lo que Instagram acepta como foto de portada de un reel; Facebook admite hasta 10 MB. */
export const COVER_MAX_BYTES = 8 * MB;
export const COVER_TYPES = Object.freeze(['image/jpeg', 'image/jpg', 'image/png']);
/** Vertical, como el reel. Meta recomienda 9:16 y recorta el centro si no lo es. */
export const COVER_RATIO = 9 / 16;

const mimeOf = (value) => String(value || '').toLowerCase().split(';', 1)[0].trim();
const formatMb = (bytes) => `${(bytes / MB).toFixed(1).replace('.0', '')} MB`;

/**
 * Por qué este archivo no sirve de portada, dicho para quien lo está subiendo. Nunca un código: el
 * aviso nombra el archivo y el límite, como el resto de las subidas de la plataforma.
 */
export const coverFileProblem = ({ name, mimeType, size } = {}) => {
  const label = name ? `«${name}»` : 'La portada';
  if (!COVER_TYPES.includes(mimeOf(mimeType))) return `${label} debe ser JPG o PNG.`;
  if (Number(size || 0) > COVER_MAX_BYTES) {
    return `${label} pesa ${formatMb(Number(size))} y Meta acepta portadas de hasta ${formatMb(COVER_MAX_BYTES)}.`;
  }
  return null;
};

/**
 * Si esta pieza puede llevar portada. `kind` es el `media_type` que ya calcula `describeMetaMedia`:
 * solo un reel la admite. Una historia o un video dentro de un carrusel, no.
 */
export const kindAcceptsCover = (kind) => kind === 'REELS';

/**
 * Qué hacer con la portada antes de dársela a Meta, con la misma forma que `instagramImagePlan`:
 * PNG → JPEG sRGB, y margen hasta 9:16 —**nunca recorte**, como el resto de las copias para Meta—
 * para que no sea Meta quien decida qué parte de la imagen se tira.
 */
export const coverImagePlan = ({ mimeType, width, height, size = 0 } = {}) => {
  const reasons = [];
  if (!/^image\/jpe?g$/.test(mimeOf(mimeType))) reasons.push('png');

  let canvas = null;
  if (width > 0 && height > 0) {
    const ratio = width / height;
    // Un píxel arriba o abajo no vale un reprocesado; lo que se corrige es una proporción distinta.
    if (Math.abs(ratio - COVER_RATIO) > 0.01) {
      canvas = ratio > COVER_RATIO
        ? { width, height: Math.ceil(width / COVER_RATIO) }   // apaisada: crece a lo alto
        : { width: Math.ceil(height * COVER_RATIO), height }; // más estrecha que 9:16: crece a lo ancho
      reasons.push('ratio');
    }
  }

  if (Number(size || 0) > COVER_MAX_BYTES) reasons.push('size');
  return { convert: reasons.length > 0, canvas, reasons };
};

/** Lo que la pantalla sabe de la portada de una pieza; nunca la clave del almacenamiento. */
export const publicCover = (item) => (item?.coverKey ? {
  name: item.coverName || 'portada',
  mimeType: item.coverMimeType || null,
  size: item.coverSize || null
} : null);

export const hasCover = (item) => Boolean(item?.coverKey);
