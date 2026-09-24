/**
 * Límites de la pieza final de una parrilla (fotos y videos), compartidos por la pantalla y el servidor.
 *
 * Rodny, 24 de septiembre de 2026: un video de 30 MB se rechazaba con un `FILE_TOO_LARGE` en pantalla.
 * El tope real eran 25 MB y estaba puesto **dos veces**: en el formulario que recibe los archivos y otra vez
 * dentro del guardado en el almacenamiento. Aquí vive el número una sola vez, y los mensajes explican el peso
 * del archivo y el límite, nunca un código.
 */

export const FINAL_ASSET_MAX_BYTES = 100 * 1024 * 1024;
export const FINAL_ASSET_MAX_FILES = 10;
/**
 * El archivo viaja por la memoria del servidor antes de llegar al almacenamiento y corremos con una sola
 * réplica, así que un envío completo no puede pesar más que esto. Para ir más arriba habría que subir desde
 * el navegador directo al almacenamiento.
 */
export const FINAL_ASSET_MAX_TOTAL_BYTES = 200 * 1024 * 1024;

export const formatFileSize = (bytes) => {
  const value = Number(bytes || 0);
  if (!Number.isFinite(value) || value <= 0) return '0 MB';
  const megabytes = value / (1024 * 1024);
  if (megabytes < 1) return `${Math.max(1, Math.round(value / 1024))} KB`;
  if (megabytes >= 10) return `${Math.round(megabytes)} MB`;
  return `${(Math.round(megabytes * 10) / 10).toString().replace('.', ',')} MB`;
};

const fileName = (file) => file?.name || file?.originalname || 'El archivo';
const fileBytes = (file) => Number(file?.size ?? file?.buffer?.length ?? 0);

/**
 * Con el archivo delante, el aviso dice su nombre y su peso. El formulario del servidor corta la subida en
 * cuanto se pasa y ya no sabe ninguno de los dos, así que ahí queda la frase corta con el límite.
 */
export const fileTooLargeMessage = (file) => {
  const bytes = fileBytes(file);
  if (!file || bytes <= 0) return `Ese archivo supera el máximo de ${formatFileSize(FINAL_ASSET_MAX_BYTES)} por archivo.`;
  return `«${fileName(file)}» pesa ${formatFileSize(bytes)} y el máximo por archivo es ${formatFileSize(FINAL_ASSET_MAX_BYTES)}.`;
};

export const tooManyFilesMessage = () => `Puedes subir hasta ${FINAL_ASSET_MAX_FILES} archivos a la vez.`;

export const tooMuchAtOnceMessage = (totalBytes) => (
  `Estás subiendo ${formatFileSize(totalBytes)} de una vez y el máximo por envío es ${formatFileSize(FINAL_ASSET_MAX_TOTAL_BYTES)}. Divídelo en varias cargas.`
);

/**
 * Revisa la selección antes de enviarla. Devuelve el motivo en una frase, o `null` si se puede subir.
 * La pantalla la usa para avisar al instante, sin gastar la subida; el servidor la vuelve a aplicar.
 */
export const checkFinalAssetSelection = (files = []) => {
  const list = Array.from(files || []);
  if (list.length === 0) return 'Selecciona al menos un archivo.';
  if (list.length > FINAL_ASSET_MAX_FILES) return tooManyFilesMessage();

  const tooLarge = list.find((file) => fileBytes(file) > FINAL_ASSET_MAX_BYTES);
  if (tooLarge) return fileTooLargeMessage(tooLarge);

  const total = list.reduce((sum, file) => sum + fileBytes(file), 0);
  if (total > FINAL_ASSET_MAX_TOTAL_BYTES) return tooMuchAtOnceMessage(total);

  return null;
};
