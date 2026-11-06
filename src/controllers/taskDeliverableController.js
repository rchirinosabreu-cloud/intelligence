import { createTaskDeliverableService } from '../services/taskDeliverableService.js';
import { getPlatformStorage } from '../services/platformStorageService.js';

const respondError = (res, error) => {
  if (res.headersSent) { res.destroy(); return; }
  const status = Number.isInteger(error.status) && ((error.status >= 400 && error.status < 500) || error.status === 503) ? error.status : 500;
  res.status(status).json({ error: status === 500 ? 'No se pudo completar la operación de entrega. Inténtalo de nuevo.' : error.message,
    ...(error.code?.startsWith('TASK_DELIVERABLE_') ? { code: error.code } : {}), ...(error.contentItemId ? { contentItemId: error.contentItemId } : {}) });
};

export function createTaskDeliverableController({ service = createTaskDeliverableService(), storage } = {}) {
  const json = (method, pick, status = 200) => async (req, res) => {
    try { res.status(status).json(await service[method](req.params.taskId, req.user, ...pick(req))); }
    catch (error) { respondError(res, error); }
  };
  const stream = disposition => async (req, res) => {
    try {
      const file = await service.file(req.params.taskId, req.params.fileId, req.user);
      const size = Number(file.size);
      let range, start = 0, end = size - 1;
      if (req.headers.range) {
        const match = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range);
        if (match && (match[1] || match[2])) {
          if (!match[1]) start = Math.max(0, size - Number(match[2]));
          else { start = Number(match[1]); if (match[2]) end = Math.min(end, Number(match[2])); }
        }
        if (!match || !Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start > end || start >= size || (!match[1] && !Number(match[2]))) return res.status(416).set('Content-Range', `bytes */${size}`).end();
        range = `bytes=${start}-${end}`;
      }
      const object = await (storage || getPlatformStorage(file.storageArea)).getFromS3Stream(file.storageKey, range ? { range } : {});
      res.status(range ? 206 : 200);
      res.set({ 'Content-Type': file.mimeType, 'Content-Length': String(end - start + 1), 'Accept-Ranges': 'bytes',
        'Content-Disposition': `${disposition}; filename*=UTF-8''${encodeURIComponent(file.name)}`,
        'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "sandbox; default-src 'none'" });
      if (range) res.set('Content-Range', `bytes ${start}-${end}/${size}`);
      object.Body.once('error', () => res.destroy());
      object.Body.pipe(res);
    } catch (error) { respondError(res, error); }
  };
  return {
    authorize: async (req, res, next) => { try { await service.authorize(req.params.taskId, req.user); next(); } catch (error) { respondError(res, error); } },
    get: json('get', () => []), replace: json('replace', req => [req.files || [], req.body || {}], 201),
    prepare: json('prepare', req => [req.body?.files, req.body || {}]),
    confirm: json('confirm', req => [req.body?.uploads, req.body || {}], 201),
    reorder: json('reorder', req => [req.body?.order, req.body || {}]), file: stream('inline'), download: stream('attachment')
  };
}
