/**
 * La copia de una imagen lista para Instagram (Rodny, 30 de septiembre de 2026).
 *
 * El equipo exporta en PNG y publica desde Meta Business Suite, que convierte a JPEG por dentro sin
 * decirlo. La API de Instagram no: solo acepta JPEG y rechaza las imágenes del feed fuera de 4:5–1.91:1.
 * Así que la plataforma hace lo mismo que Business Suite —convierte y añade margen blanco, nunca
 * recorta— en una **copia** que vive junto al original (`derived/`), y el diseñador no cambia nada.
 * El original de la parrilla no se toca. Facebook recibe el original: acepta PNG.
 */
import { getS3ObjectBuffer, headS3Object, putS3Object } from './s3Service.js';
import { instagramImagePlan } from '../lib/socialPublishing.js';

const JPEG_QUALITY = 92;
const WHITE = { r: 255, g: 255, b: 255 };

const isImage = (asset) => String(asset?.mimeType || '').toLowerCase().startsWith('image/');
const originalKeyOf = (asset) => asset.storageKey || asset.finalAssetKey;

/** `…/final-assets/derived/<id>-instagram.jpg`, al lado del original y bajo la carpeta de la pieza. */
export const derivedKeyFor = (asset) => {
  const key = originalKeyOf(asset);
  const slash = key.lastIndexOf('/');
  const folder = slash >= 0 ? key.slice(0, slash) : '';
  return `${folder ? `${folder}/` : ''}derived/${asset.id}-instagram.jpg`;
};

/** Ancho y alto reales, ya con la orientación EXIF aplicada (una foto de celular «vertical» suele venir girada). */
export const sharpProbe = async (buffer) => {
  const sharp = (await import('sharp')).default;
  const meta = await sharp(buffer).metadata();
  const rotated = Number(meta.orientation || 1) >= 5;
  return { width: rotated ? meta.height : meta.width, height: rotated ? meta.width : meta.height };
};

/** PNG → JPEG sRGB de alta calidad; la transparencia y el margen quedan en blanco, como en Business Suite. */
export const sharpTransform = async (buffer, plan) => {
  const sharp = (await import('sharp')).default;
  let image = sharp(buffer).rotate().flatten({ background: WHITE });
  if (plan?.canvas) {
    image = image.resize(plan.canvas.width, plan.canvas.height, { fit: 'contain', background: WHITE, withoutEnlargement: false });
  }
  return image.toColourspace('srgb').jpeg({ quality: JPEG_QUALITY, mozjpeg: true }).toBuffer();
};

export const createImageDerivativeService = ({
  readObject = getS3ObjectBuffer,
  writeObject = putS3Object,
  headObject = headS3Object,
  probe = sharpProbe,
  transform = sharpTransform,
  logger = console
} = {}) => {
  const prepareForInstagram = async (asset, { kind } = {}) => {
    const originalKey = originalKeyOf(asset);
    if (!isImage(asset)) return { key: originalKey, derived: false };
    const key = derivedKeyFor(asset);
    if (await headObject(key)) return { key, derived: true, cached: true };

    const buffer = await readObject(originalKey);
    const { width, height } = await probe(buffer);
    const plan = instagramImagePlan({ mimeType: asset.mimeType, width, height, kind });
    if (!plan.convert) return { key: originalKey, derived: false };

    const jpeg = await transform(buffer, plan);
    await writeObject({ key, body: jpeg, contentType: 'image/jpeg' });
    logger.info?.(`[SocialPublishing] Copia para Instagram de «${asset.name || asset.id}»: ${plan.reasons.join(', ')}${plan.canvas ? ` → ${plan.canvas.width}×${plan.canvas.height}` : ''}`);
    return { key, derived: true, cached: false, plan };
  };

  return { prepareForInstagram };
};

export const imageDerivativeService = createImageDerivativeService();
