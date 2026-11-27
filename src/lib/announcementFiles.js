import { getApiBaseUrl } from './apiBaseUrl';
import { formatFileSize } from './uploadLimits';

// Lo mismo que revisa el servidor (src/services/announcementFileService.js), para avisar antes de subir.
export const ANNOUNCEMENT_FILE_LIMIT = 10;
export const ANNOUNCEMENT_FILE_MAX_BYTES = 25 * 1024 * 1024;
const DISPLAYED_IMAGES = new Set(['image/png', 'image/jpeg', 'image/gif', 'image/webp']);

/** Si el anuncio lo enseña como imagen (miniatura) o como archivo (ficha con icono). */
export const isAnnouncementImage = (file) => DISPLAYED_IMAGES.has(file?.mimeType || file?.type);

/** Por qué un archivo no se puede añadir, o `null`. */
export const announcementFileProblem = (file) => {
  if (!file) return 'Elige un archivo.';
  if (!file.size) return `«${file.name}» está vacío.`;
  if (/\.hei[cf]$/i.test(file.name || '') || /hei[cf]/i.test(file.type || '')) return `«${file.name}» es una foto HEIC. Expórtala como JPG o PNG.`;
  if (file.size > ANNOUNCEMENT_FILE_MAX_BYTES) return `«${file.name}» pesa ${formatFileSize(file.size)} y el máximo es 25 MB. Compártelo por Drive y pon el enlace.`;
  return null;
};

export async function uploadAnnouncementFile(file) {
  const body = new FormData();
  body.append('file', file);
  const token = localStorage.getItem('authToken');
  const response = await fetch(`${getApiBaseUrl()}/api/dashboard/announcements/files`, {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    console.error('[Anuncios] Archivo:', data);
    throw new Error(data.error || 'No se pudo subir el archivo.');
  }
  return data;
}

/** La dirección completa de un archivo (el servidor la entrega relativa a la API). */
export const announcementFileSrc = (url) => (url ? `${getApiBaseUrl()}${url}` : null);

/** «PDF · 2,4 MB», «Excel · 380 KB»: la etiqueta corta de la ficha. */
export const announcementFileLabel = (file) => {
  const extension = (/\.([a-z0-9]{1,8})$/i.exec(file?.name || '')?.[1] || '').toUpperCase();
  const kinds = { PDF: 'PDF', DOC: 'Word', DOCX: 'Word', XLS: 'Excel', XLSX: 'Excel', CSV: 'CSV', PPT: 'PowerPoint', PPTX: 'PowerPoint', ZIP: 'ZIP', MP4: 'Video', MOV: 'Video', TXT: 'Texto', MP3: 'Audio' };
  const kind = kinds[extension] || extension || 'Archivo';
  return file?.size ? `${kind} · ${formatFileSize(file.size)}` : kind;
};
