/**
 * La copia de una imagen lista para Meta (Rodny, 30 de septiembre y 1 de octubre de 2026).
 *
 * El equipo exporta en PNG y publica desde Meta Business Suite, que convierte por dentro sin decirlo.
 * La API no: Instagram solo acepta JPEG de hasta 8 MB y rechaza el feed fuera de 4:5–1.91:1; Facebook
 * acepta PNG pero ningún archivo de más de 4 MB (y recomienda PNG de hasta 1 MB). Así que la plataforma
 * hace lo mismo que Business Suite —convierte, comprime hasta caber y, en Instagram, añade margen
 * blanco, nunca recorta— en una **copia** junto al original (`derived/`), una por red, y el diseñador
 * no cambia nada. El original de la parrilla no se toca.
 */
import { getS3ObjectBuffer, headS3Object, putS3Object } from './s3Service.js';
import { FACEBOOK_PHOTO_MAX_BYTES, META_IMAGE_MAX_BYTES, facebookImagePlan, instagramImagePlan } from '../lib/socialPublishing.js';

/** De más a menos calidad: se baja solo lo necesario para caber en el tope de la red. */
const JPEG_QUALITIES = [92, 86, 80, 72, 64];
const WHITE = { r: 255, g: 255, b: 255 };

const isImage = (asset) => String(asset?.mimeType || '').toLowerCase().startsWith('image/');
const originalKeyOf = (asset) => asset.storageKey || asset.finalAssetKey;

/** `…/final-assets/derived/<id>-instagram.jpg` (o `-facebook.jpg`), al lado del original. */
export const derivedKeyFor = (asset, platform = 'INSTAGRAM') => {
  const key = originalKeyOf(asset);
  const slash = key.lastIndexOf('/');
  const folder = slash >= 0 ? key.slice(0, slash) : '';
  return `${folder ? `${folder}/` : ''}derived/${asset.id}-${String(platform).toLowerCase()}.jpg`;
};

/** Ancho y alto reales, ya con la orientación EXIF aplicada (una foto de celular «vertical» suele venir girada). */
export const sharpProbe = async (buffer) => {
  const sharp = (await import('sharp')).default;
  const meta = await sharp(buffer).metadata();
  const rotated = Number(meta.orientation || 1) >= 5;
  return { width: rotated ? meta.height : meta.width, height: rotated ? meta.width : meta.height };
};

/**
 * PNG → JPEG sRGB; la transparencia y el margen quedan en blanco, como en Business Suite. Con
 * `maxBytes` se baja la calidad por pasos hasta caber: una copia algo más comprimida sale, una
 * que pesa de más Meta la rechaza.
 */
export const sharpTransform = async (buffer, plan, { maxBytes = 0 } = {}) => {
  const sharp = (await import('sharp')).default;
  const render = (quality) => {
    let image = sharp(buffer).rotate().flatten({ background: WHITE });
    if (plan?.canvas) {
      image = image.resize(plan.canvas.width, plan.canvas.height, { fit: 'contain', background: WHITE, withoutEnlargement: false });
    }
    return image.toColourspace('srgb').jpeg({ quality, mozjpeg: true }).toBuffer();
  };
  let output = await render(JPEG_QUALITIES[0]);
  for (const quality of JPEG_QUALITIES.slice(1)) {
    if (!maxBytes || output.length <= maxBytes) break;
    output = await render(quality);
  }
  return output;
};

export const createImageDerivativeService = ({
  readObject = getS3ObjectBuffer,
  writeObject = putS3Object,
  headObject = headS3Object,
  probe = sharpProbe,
  transform = sharpTransform,
  logger = console
} = {}) => {
  const prepare = async (asset, { platform, kind } = {}) => {
    const originalKey = originalKeyOf(asset);
    if (!isImage(asset)) return { key: originalKey, derived: false };
    const key = derivedKeyFor(asset, platform);
    if (await headObject(key)) return { key, derived: true, cached: true };

    let plan;
    let buffer = null;
    if (platform === 'FACEBOOK') {
      // Facebook no tiene regla de proporción: se decide solo con el tipo y el peso, sin leer el archivo.
      plan = facebookImagePlan({ mimeType: asset.mimeType, size: asset.size });
    } else {
      buffer = await readObject(originalKey);
      const { width, height } = await probe(buffer);
      plan = instagramImagePlan({ mimeType: asset.mimeType, width, height, kind, size: asset.size });
    }
    if (!plan.convert) return { key: originalKey, derived: false };

    const maxBytes = platform === 'FACEBOOK' ? FACEBOOK_PHOTO_MAX_BYTES : META_IMAGE_MAX_BYTES;
    const jpeg = await transform(buffer || await readObject(originalKey), plan, { maxBytes });
    await writeObject({ key, body: jpeg, contentType: 'image/jpeg' });
    logger.info?.(`[SocialPublishing] Copia para ${platform === 'FACEBOOK' ? 'Facebook' : 'Instagram'} de «${asset.name || asset.id}»: ${plan.reasons.join(', ')}${plan.canvas ? ` → ${plan.canvas.width}×${plan.canvas.height}` : ''}`);
    return { key, derived: true, cached: false, plan };
  };

  const prepareForInstagram = (asset, { kind } = {}) => prepare(asset, { platform: 'INSTAGRAM', kind });
  const prepareForFacebook = (asset) => prepare(asset, { platform: 'FACEBOOK' });

  return { prepareForInstagram, prepareForFacebook };
};

export const imageDerivativeService = createImageDerivativeService();
