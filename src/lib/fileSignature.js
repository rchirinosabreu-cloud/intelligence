/**
 * Qué es un archivo según su contenido, no según su nombre (Rodny, 1 de octubre de 2026).
 *
 * El primer carrusel real no salió porque «02.png» era un video MP4 con la extensión cambiada. La
 * plataforma se fio del nombre, intentó tres veces convertir un video en JPEG y avisó «Meta respondió:
 * Input buffer contains unsupported image format», cuando a Meta no se le había pedido nada. Lógica
 * pura: la usan la subida (para no aceptarlo) y el publicador (para decir qué archivo es).
 */

const startsWith = (bytes, signature, offset = 0) => signature.every((byte, index) => bytes[offset + index] === byte);
const ascii = (bytes, from, to) => String.fromCharCode(...bytes.subarray(from, to));

/** Marcas de imagen dentro del contenedor ISO (el mismo de los MP4): HEIC/HEIF y AVIF. */
const ISO_IMAGE_BRANDS = new Set(['heic', 'heix', 'hevc', 'heim', 'heis', 'hevm', 'hevs', 'mif1', 'msf1', 'avif', 'avis']);

/** Devuelve el tipo real por la firma de los primeros bytes, o `null` si no se reconoce (sin opinión). */
export const sniffMediaType = (input) => {
  if (!input || typeof input.length !== 'number' || input.length < 12) return null;
  const bytes = input instanceof Uint8Array ? input : Uint8Array.from(input);
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'image/png';
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return 'image/jpeg';
  if (ascii(bytes, 0, 4) === 'GIF8') return 'image/gif';
  if (ascii(bytes, 0, 4) === 'RIFF' && ascii(bytes, 8, 12) === 'WEBP') return 'image/webp';
  if (ascii(bytes, 4, 8) === 'ftyp') {
    const brand = ascii(bytes, 8, 12);
    if (ISO_IMAGE_BRANDS.has(brand.trim().toLowerCase())) return 'image/heic';
    return brand.startsWith('qt') ? 'video/quicktime' : 'video/mp4';
  }
  if (startsWith(bytes, [0x1a, 0x45, 0xdf, 0xa3])) return 'video/webm';
  return null;
};

const familyOf = (mimeType) => {
  const family = String(mimeType || '').toLowerCase().split('/')[0];
  return family === 'image' || family === 'video' ? family : null;
};
const FAMILY_NOUN = { image: 'una imagen', video: 'un video' };
const TYPE_LABEL = { 'video/mp4': 'MP4', 'video/quicktime': 'MOV', 'video/webm': 'WebM', 'image/png': 'PNG', 'image/jpeg': 'JPG', 'image/gif': 'GIF', 'image/webp': 'WebP', 'image/heic': 'HEIC' };

/**
 * El problema de un archivo cuyo contenido contradice lo que dice ser (imagen ↔ video), o `null`.
 * Solo se pronuncia si reconoce el contenido: un formato desconocido nunca bloquea nada.
 */
export const fileContentProblem = ({ name, mimeType, bytes } = {}) => {
  const declared = familyOf(mimeType);
  const real = sniffMediaType(bytes);
  const actual = familyOf(real);
  if (!declared || !actual || declared === actual) return null;
  return `«${name || 'El archivo'}» dice ser ${FAMILY_NOUN[declared]}, pero su contenido es ${FAMILY_NOUN[actual]} (${TYPE_LABEL[real] || real}) con la extensión cambiada. Vuelve a exportarlo o súbelo con su extensión real.`;
};
