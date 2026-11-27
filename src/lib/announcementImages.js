import { getApiBaseUrl } from './apiBaseUrl';

// Lo mismo que revisa el servidor (src/services/announcementImageService.js), para avisar antes de subir.
export const ANNOUNCEMENT_IMAGE_LIMIT = 6;
export const ANNOUNCEMENT_IMAGE_MAX_BYTES = 10 * 1024 * 1024;
export const ANNOUNCEMENT_IMAGE_ACCEPT = 'image/png,image/jpeg,image/gif,image/webp';
const ACCEPTED = new Set(ANNOUNCEMENT_IMAGE_ACCEPT.split(','));

/** Por qué una imagen no se puede añadir, o `null`. */
export const announcementImageProblem = (file) => {
  if (!file) return 'Elige una imagen.';
  if (/\.hei[cf]$/i.test(file.name || '') || /hei[cf]/i.test(file.type || '')) return `«${file.name}» es HEIC. Expórtala como JPG o PNG.`;
  if (!ACCEPTED.has(file.type)) return `«${file.name}» no es una imagen JPG, PNG, GIF o WebP.`;
  if (file.size > ANNOUNCEMENT_IMAGE_MAX_BYTES) return `«${file.name}» pesa más de 10 MB.`;
  return null;
};

export async function uploadAnnouncementImage(file) {
  const body = new FormData();
  body.append('image', file);
  const token = localStorage.getItem('authToken');
  const response = await fetch(`${getApiBaseUrl()}/api/dashboard/announcements/images`, {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    console.error('[Anuncios] Imagen:', data);
    throw new Error(data.error || 'No se pudo subir la imagen.');
  }
  return data;
}

/** La dirección completa de una imagen (el servidor la entrega relativa a la API). */
export const announcementImageSrc = (url) => (url ? `${getApiBaseUrl()}${url}` : null);
