import { acceptUpload } from './uploadStorage.js';

/** Count bytes as they arrive, across the complete request, before retaining each chunk. */
export function boundedUploadMemoryStorage({ maxTotalBytes, tooLargeMessage = 'El conjunto supera el tamaño permitido. Usa la subida directa.' }) {
  if (!Number.isSafeInteger(maxTotalBytes) || maxTotalBytes < 1) throw new Error('A positive upload memory budget is required.');
  const received = Symbol('uploadReceivedBytes');
  return {
    _handleFile(req, file, callback) {
      acceptUpload(req, file, () => {});
      let chunks = [], size = 0, finished = false;
      const finish = (error, value) => {
        if (finished) return;
        finished = true;
        if (error) chunks = [];
        callback(error, value);
      };
      file.stream.on('data', chunk => {
        if (finished) return;
        req[received] = (req[received] || 0) + chunk.length;
        if (req[received] > maxTotalBytes) return finish(Object.assign(new Error(tooLargeMessage), { status: 413 }));
        size += chunk.length;
        chunks.push(chunk);
      });
      file.stream.once('error', error => finish(error));
      file.stream.once('end', () => finish(null, { buffer: Buffer.concat(chunks), size }));
    },
    _removeFile(_req, file, callback) { delete file.buffer; callback(null); }
  };
}
