import { runProtectedDriveRequest } from '../services/driveFolderProtectionService.js';

// Buffer the controller response until the guarded transaction commits. The controller
// receives a server-owned transaction, never a database or identity from the body.
export const protectDrive = handler => async (req, res) => {
  try {
    const headers = {};
    let status = 200, body, binary = false;
    const response = {
      status(value) { status = value; return this; },
      setHeader(key, value) { headers[key] = value; return this; },
      type(value) { headers['Content-Type'] = value; return this; },
      json(value) { body = value; return this; },
      send(value) { body = value; binary = true; return this; },
    };
    const result = await runProtectedDriveRequest(req, async db => {
      req.driveDb = db;
      try { await handler(req, response); } finally { delete req.driveDb; }
      if (status >= 400) throw Object.assign(new Error(body?.message || 'No fue posible completar la operación.'), { status, code: body?.error });
      return body;
    });
    res.setHeader('Cache-Control', 'private, no-store');
    for (const [key, value] of Object.entries(headers)) res.setHeader(key, value);
    return binary ? res.status(status).send(result) : res.status(status).json(result);
  } catch (error) {
    const status = error.status || 500;
    if (status >= 500) console.error('[Drive protection]', error.code || 'DRIVE_PROTECTION_FAILED');
    res.setHeader('Cache-Control', 'private, no-store');
    return res.status(status).json({ error: error.code || 'DRIVE_PROTECTION_FAILED',
      message: status >= 500 ? 'No fue posible comprobar el acceso a Drive.' : error.message,
      ...(error.folderId ? { folderId: error.folderId } : {}) });
  }
};
