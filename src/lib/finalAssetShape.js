/**
 * Forma de una pieza final.
 *
 * Desde el 24 de septiembre de 2026 una fila de `ContentItemFinalAsset` es **o** un archivo guardado por
 * nosotros **o** un enlace a Google Drive, nunca las dos cosas ni ninguna. El esquema no puede decirlo
 * (las dos mitades son columnas opcionales), así que la regla vive aquí y la comprueban el servicio antes
 * de escribir y las pruebas. Lo mismo vale para cómo se pinta: una sola función decide, y la usan el
 * editor interno y el portal del cliente, para que no se separen.
 */

import { DRIVE_PROVIDER, driveOpenUrl, drivePreviewUrl, driveThumbnailUrl } from './driveLinks.js';

export const isDriveAsset = (asset) => (
  Boolean(asset) && asset.externalProvider === DRIVE_PROVIDER && Boolean(asset.externalFileId)
);

/** `drive` | `image` | `video` | `file`. Lo último es lo que no sabemos mostrar y se ofrece para abrir. */
export const finalAssetKind = (asset) => {
  if (isDriveAsset(asset)) return 'drive';
  const mimeType = String(asset?.mimeType || '');
  if (mimeType.startsWith('image/')) return 'image';
  if (mimeType.startsWith('video/')) return 'video';
  return 'file';
};

/** El motivo por el que esa fila no es válida, en una frase, o `null` si lo es. */
export const finalAssetShapeProblem = (asset) => {
  const hasFile = Boolean(asset?.storageKey);
  const hasLink = Boolean(asset?.externalFileId || asset?.externalUrl);

  if (hasFile && hasLink) return 'Una pieza final no puede ser un archivo y un enlace a la vez.';
  if (!hasFile && !hasLink) return 'Una pieza final necesita un archivo o un enlace.';
  if (hasLink && !isDriveAsset(asset)) return 'Ese enlace no quedó resuelto en un archivo de Drive.';
  return null;
};

/**
 * La forma del marco de Drive, tomada del formato de la pieza (Rodny, 25 de septiembre de 2026).
 *
 * Google no dice si el video es vertical u horizontal, y el marco por defecto era apaisado: un reel
 * —que «normalmente son 9:16»— salía achatado, con dos franjas negras enormes a los lados. El único
 * dato fiable que tenemos es el formato que el equipo eligió para la pieza, así que se usa ese.
 */
export const VERTICAL_FORMATS = ['Reel', 'Video', 'Historia'];
export const driveEmbedAspect = (format) => (
  VERTICAL_FORMATS.includes(String(format || '')) ? '9 / 16' : '16 / 9'
);

/**
 * Las tres direcciones del enlace, o `null` si la fila es un archivo nuestro. Se arman desde el
 * identificador guardado, nunca volviendo a leer el texto que pegó la persona.
 */
export const driveAssetUrls = (asset) => (isDriveAsset(asset) ? {
  embedUrl: drivePreviewUrl(asset.externalFileId),
  thumbnailUrl: driveThumbnailUrl(asset.externalFileId),
  openUrl: driveOpenUrl(asset.externalFileId)
} : null);
