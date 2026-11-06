import multer from 'multer';
import { acceptUpload } from './uploadStorage.js';
import { validateUploadFile } from '../config/security.js';
import { TASK_DELIVERABLE_LIMITS, deliverableError } from './taskDeliverables.js';

// Bound the aggregate while receiving it, not after keeping twenty large buffers in memory.
export const boundedDeliverableStorage = () => ({
  _handleFile(req, file, callback) {
    let chunks = [], size = 0, finished = false;
    const finish = (error, value) => { if (finished) return; finished = true; if (error) chunks = []; callback(error, value); };
    file.stream.on('data', chunk => {
      if (finished) return;
      req.taskDeliverableReceivedBytes = (req.taskDeliverableReceivedBytes || 0) + chunk.length;
      if (req.taskDeliverableReceivedBytes > TASK_DELIVERABLE_LIMITS.maxServerTotalBytes) return finish(deliverableError('El conjunto supera 200 MB. Usa la subida directa.', 413));
      size += chunk.length; chunks.push(chunk);
    });
    file.stream.once('error', error => finish(error));
    file.stream.once('end', () => finish(null, { buffer: Buffer.concat(chunks), size }));
  },
  _removeFile(_req, file, callback) { delete file.buffer; callback(null); }
});

const receive = multer({ storage: boundedDeliverableStorage(),
  limits: { fileSize: TASK_DELIVERABLE_LIMITS.maxServerBytes, files: TASK_DELIVERABLE_LIMITS.maxFiles, fields: 2, fieldSize: 16 * 1024 },
  fileFilter: (req, file, callback) => acceptUpload(req, file, () => {
    try { validateUploadFile({ ...file, size: 0 }, { maxBytes: TASK_DELIVERABLE_LIMITS.maxServerBytes }); callback(null, true); }
    catch { callback(deliverableError('Ese tipo de archivo no está permitido.', 400, 'UNSAFE_FILE_TYPE')); }
  })
}).array('files', TASK_DELIVERABLE_LIMITS.maxFiles);

export const receiveTaskDeliverables = (req, res, next) => receive(req, res, error => {
  if (error) return res.status(error.status || (String(error.code).startsWith('LIMIT_') ? 413 : 400)).json({ error: error.status ? error.message : 'La subida supera los límites permitidos de la entrega.' });
  return next();
});
