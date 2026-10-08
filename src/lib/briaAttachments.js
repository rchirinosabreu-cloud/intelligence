import { canUseBria } from './briaLivingMemory.js';
export const BRIA_FILE_MAX_BYTES = 20 * 1024 * 1024;
export const BRIA_FILES_MAX_BYTES = 30 * 1024 * 1024;
export const BRIA_FILES_MAX_COUNT = 5;
export const BRIA_AUDIO_MAX_BYTES = 20 * 1024 * 1024;
export const canAttachToBria = canUseBria;
export const attachmentError = (message, status = 400) => Object.assign(new Error(message), { status });
export const validateAttachmentSelection = files => {
  if (!Array.isArray(files) || files.length > BRIA_FILES_MAX_COUNT) throw attachmentError('Puedes adjuntar hasta 5 archivos por mensaje.');
  let total = 0;
  for (const file of files) {
    const size = file.buffer?.length ?? file.size;
    if (!Number.isSafeInteger(size) || size < 1) throw attachmentError(`El archivo ${file.name || file.originalname || ''} está vacío.`);
    if (size > BRIA_FILE_MAX_BYTES) throw attachmentError('Cada archivo puede pesar hasta 20 MB.');
    total += size;
  }
  if (total > BRIA_FILES_MAX_BYTES) throw attachmentError('Los adjuntos del mensaje pueden sumar hasta 30 MB.');
  return files;
};
