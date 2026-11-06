import { validateUploadFile } from '../config/security.js';
import { canOpenTask } from './taskPrivacy.js';
import { isManagerRole } from './taskEditPermissions.js';
import { fileContentProblem } from './fileSignature.js';

export const TASK_DELIVERABLE_LIMITS = Object.freeze({ maxFiles: 20, maxServerBytes: 200 * 1024 ** 2, maxServerTotalBytes: 200 * 1024 ** 2, maxDirectBytes: 2 * 1024 ** 3 });
export const deliverableError = (message, status = 400, code = 'TASK_DELIVERABLE_INVALID') => Object.assign(new Error(message), { status, statusCode: status, code });
export const deliverableActorId = user => user?.userId || user?.id || null;

export function taskDeliverableAccess(task, user) {
  const userId = deliverableActorId(user);
  const canRead = Boolean(userId && task && canOpenTask(task, userId));
  const participates = task?.assignee?.userId === userId || (task?.collaborators || []).some(row => row.member?.userId === userId);
  const canUpload = canRead && !task.contentItemId && (participates || task.creatorId === userId || isManagerRole(user?.role));
  return { canRead, canUpload, canReorder: canUpload, writeBlockedReason: canUpload ? null : task?.contentItemId
    ? 'La entrega de esta tarea pertenece a su pieza de parrilla.' : 'Solo el creador, participantes o dirección con acceso pueden actualizar la entrega.' };
}

export function deliverableMutationInput({ requestId, expectedRevision } = {}) {
  if (typeof requestId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(requestId)) throw deliverableError('La entrega necesita un identificador de solicitud válido.');
  if (!/^(0|[1-9]\d*)$/.test(String(expectedRevision)) || !Number.isSafeInteger(Number(expectedRevision))) throw deliverableError('Actualiza la tarea para obtener la revisión de su entrega.');
  return { requestId, expectedRevision: Number(expectedRevision) };
}

export function validateDeliverableFiles(files, mode = 'server') {
  if (!Array.isArray(files) || files.length < 1 || files.length > TASK_DELIVERABLE_LIMITS.maxFiles) throw deliverableError('Selecciona entre 1 y 20 archivos para la entrega completa.');
  const limit = mode === 'direct' ? TASK_DELIVERABLE_LIMITS.maxDirectBytes : TASK_DELIVERABLE_LIMITS.maxServerBytes;
  const result = files.map(file => {
    if (!file || typeof file !== 'object') throw deliverableError('La selección contiene un archivo no válido.');
    const name = String(file.originalname || file.name || '').trim();
    const mimeType = String(file.mimetype || file.mimeType || 'application/octet-stream').toLowerCase().split(';')[0].trim();
    const size = Number(file.size ?? file.buffer?.length);
    if (!name || name.length > 255 || /[\x00-\x1f\x7f]/.test(name) || !/^[a-z0-9.+-]+\/[a-z0-9.+-]+$/.test(mimeType) || !Number.isSafeInteger(size) || size < 1) throw deliverableError('Uno de los archivos no tiene nombre, tipo o tamaño válido.');
    if (file.buffer && file.buffer.length !== size) throw deliverableError('El tamaño del archivo no coincide con el recibido.');
    try { validateUploadFile({ originalname: name, mimetype: mimeType, size }, { maxBytes: limit }); }
    catch (error) { throw deliverableError(error.code === 'FILE_TOO_LARGE' ? 'El archivo supera el tamaño permitido para esta subida.' : 'Ese tipo de archivo no está permitido.', error.code === 'FILE_TOO_LARGE' ? 413 : 400, error.code); }
    return { name, mimeType, size };
  });
  if (mode === 'server' && result.reduce((sum, file) => sum + file.size, 0) > TASK_DELIVERABLE_LIMITS.maxServerTotalBytes) throw deliverableError('Este conjunto supera 200 MB. Súbelo directamente al almacenamiento.', 413);
  return result;
}

export function validateDeliverablePrefix(buffer, file = {}) {
  const bytes = Buffer.from(buffer || []), text = bytes.toString('utf8').trimStart();
  if (bytes.subarray(0, 2).toString() === 'MZ' || bytes.subarray(0, 4).equals(Buffer.from([0x7f, 0x45, 0x4c, 0x46])) || /^\s*(?:<!doctype\s+html|<html\b|<svg\b|<script\b|#!)/i.test(text)) throw deliverableError('El contenido del archivo no está permitido.', 400, 'UNSAFE_FILE_TYPE');
  const problem = fileContentProblem({ ...file, bytes });
  if (problem) throw deliverableError(problem, 400, 'UNSAFE_FILE_TYPE');
}
