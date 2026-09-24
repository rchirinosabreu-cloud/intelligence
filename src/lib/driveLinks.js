/**
 * Enlaces de Google Drive como pieza final de una parrilla.
 *
 * Rodny, 24 de septiembre de 2026: un video que no cabe subido se entrega como enlace de Drive.
 * Drive reparte el mismo archivo en varias formas de enlace según desde dónde se copie, así que el
 * enlace se entiende **una sola vez** —aquí— y se guarda ya resuelto en su identificador; la pantalla
 * y el portal del cliente arman la vista previa desde ese identificador, nunca volviendo a leer el texto.
 *
 * Lo que este archivo NO sabe: si el archivo está compartido con el cliente. Eso vive en Drive y solo se
 * comprueba preguntándole a Google (`driveShareService.js`).
 */

export const DRIVE_PROVIDER = 'DRIVE';

const DRIVE_HOSTS = new Set(['drive.google.com', 'docs.google.com']);
const FILE_ID = /^[A-Za-z0-9_-]{8,}$/;
/** Documentos nativos de Google: se abren en su editor, no son un archivo subido con una pieza dentro. */
const NATIVE_DOC_PATHS = /^\/(document|spreadsheets|presentation|forms)\//;

const readUrl = (raw) => {
  const text = String(raw ?? '').trim();
  if (!text) return { problem: 'Pega el enlace del archivo en Google Drive.' };
  if (!/^https:\/\//i.test(text)) return { problem: 'El enlace tiene que empezar por https://' };

  let url;
  try {
    url = new URL(text);
  } catch {
    return { problem: 'Ese enlace no se entiende. Cópialo otra vez desde Drive.' };
  }

  const host = url.hostname.replace(/^www\./i, '').toLowerCase();
  if (!DRIVE_HOSTS.has(host)) return { problem: 'Por ahora solo se aceptan enlaces de Google Drive.' };
  if (url.pathname.startsWith('/drive/folders/')) {
    return { problem: 'Ese es el enlace de una carpeta. Abre el archivo en Drive y copia el enlace del archivo.' };
  }
  if (NATIVE_DOC_PATHS.test(url.pathname)) {
    return { problem: 'Ese enlace es de un documento de Google, no de un archivo subido a Drive.' };
  }

  return { url };
};

/** El identificador del archivo, o `null` si el enlace no lleva uno reconocible. */
export const parseDriveFileId = (raw) => {
  const { url } = readUrl(raw);
  if (!url) return null;

  const fromPath = url.pathname.match(/\/file\/d\/([^/?#]+)/);
  const candidate = fromPath?.[1] || url.searchParams.get('id');
  return candidate && FILE_ID.test(candidate) ? candidate : null;
};

/** El motivo por el que ese enlace no sirve, en una frase, o `null` si sirve. */
export const driveLinkProblem = (raw) => {
  const { problem, url } = readUrl(raw);
  if (problem) return problem;
  if (!parseDriveFileId(url.toString())) return 'No encontré el identificador del archivo en ese enlace.';
  return null;
};

const built = (fileId, build) => (FILE_ID.test(String(fileId ?? '')) ? build(fileId) : null);

/** Lo que va dentro del marco: el reproductor de Drive, sin su interfaz de archivo. */
export const drivePreviewUrl = (fileId) => built(fileId, (id) => `https://drive.google.com/file/d/${id}/preview`);

/** Una imagen fija para listas y miniaturas, sin cargar el reproductor entero. */
export const driveThumbnailUrl = (fileId) => built(fileId, (id) => `https://drive.google.com/thumbnail?id=${id}&sz=w1600`);

/** Drive en su propia pestaña, para descargar o revisar permisos. */
export const driveOpenUrl = (fileId) => built(fileId, (id) => `https://drive.google.com/file/d/${id}/view`);
