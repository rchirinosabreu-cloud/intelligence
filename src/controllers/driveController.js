import {
  createDriveFolder,
  listDriveContents,
  listDriveFiles,
  readDriveFile,
  readManagedDriveFile,
  restoreDriveFile,
  restoreDriveFolder,
  trashDriveFile,
  trashDriveFolder,
  updateDriveFile,
  updateDriveFolder,
  uploadDriveFile
} from '../services/driveService.js';

const clientErrorCodes = new Set([
  'DRIVE_FILE_KIND_INVALID',
  'DRIVE_FILE_NOT_FOUND',
  'DRIVE_FILE_UNAVAILABLE'
]);

export const list = async (req, res) => {
  try {
    const files = await listDriveFiles({
      query: req.query.query,
      kind: req.query.kind,
      limit: req.query.limit
    });
    return res.json({ files });
  } catch (error) {
    console.error('[DriveController] Error listando archivos:', error.response?.data || error.message || error);
    return res.status(500).json({ error: 'DRIVE_LIST_FAILED', message: 'No fue posible cargar los archivos.' });
  }
};

export const detail = async (req, res) => {
  try {
    const file = await readDriveFile({ meetingId: req.params.meetingId, kind: req.params.kind });
    if (file.body) {
      const encodedName = encodeURIComponent(file.name);
      res.setHeader('Content-Type', file.mimeType || 'application/octet-stream');
      res.setHeader('Content-Length', String(file.size || file.body.length));
      if (req.query.download === 'true') res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodedName}`);
      return res.send(file.body);
    }
    if (req.query.download === 'true') {
      const encodedName = encodeURIComponent(file.name);
      res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodedName}`);
      return res.type('application/json').send(JSON.stringify(file.content, null, 2));
    }
    return res.json({ file });
  } catch (error) {
    console.error('[DriveController] Error leyendo archivo:', error.response?.data || error.message || error);
    const status = error.code === 'DRIVE_FILE_NOT_FOUND' ? 404 : clientErrorCodes.has(error.code) ? 400 : 500;
    return res.status(status).json({
      error: error.code || 'DRIVE_FILE_READ_FAILED',
      message: clientErrorCodes.has(error.code) ? error.message : 'No fue posible abrir el archivo.'
    });
  }
};

export const contents = async (req, res) => {
  try {
    const result = await listDriveContents({
      folderId: req.query.folderId || null,
      query: req.query.query,
      includeTrash: req.query.trash === 'true'
    });
    return res.json(result);
  } catch (error) {
    console.error('[DriveController] Error cargando contenido:', error.response?.data || error.message || error);
    return res.status(500).json({ error: 'DRIVE_CONTENTS_FAILED', message: 'No fue posible cargar Drive.' });
  }
};

export const createFolder = async (req, res) => {
  try {
    const folder = await createDriveFolder({
      name: req.body.name,
      parentId: req.body.parentId,
      actorId: req.user.userId
    });
    return res.status(201).json({ folder });
  } catch (error) {
    console.error('[DriveController] Error creando carpeta:', error.response?.data || error.message || error);
    const status = ['DRIVE_NAME_REQUIRED', 'DRIVE_SYSTEM_FOLDER_READ_ONLY'].includes(error.code) ? 400 : 500;
    return res.status(status).json({ error: error.code || 'DRIVE_FOLDER_CREATE_FAILED', message: error.message || 'No fue posible crear la carpeta.' });
  }
};

export const upload = async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'DRIVE_FILE_REQUIRED', message: 'Selecciona un archivo.' });
    const file = await uploadDriveFile({
      file: req.file,
      folderId: req.body.folderId,
      subtitle: req.body.subtitle,
      actorId: req.user.userId
    });
    return res.status(201).json({ file });
  } catch (error) {
    console.error('[DriveController] Error subiendo archivo:', error.response?.data || error.message || error);
    const status = error.code === 'FILE_TOO_LARGE' ? 413 : ['UNSAFE_FILE_TYPE', 'INVALID_FILE'].includes(error.code) ? 415 : error.code === 'DRIVE_SYSTEM_FOLDER_READ_ONLY' ? 400 : 500;
    return res.status(status).json({ error: error.code || 'DRIVE_UPLOAD_FAILED', message: status === 500 ? 'No fue posible subir el archivo.' : error.message });
  }
};

export const updateFile = async (req, res) => {
  try {
    const file = await updateDriveFile({ id: req.params.id, ...req.body });
    return res.json({ file });
  } catch (error) {
    console.error('[DriveController] Error actualizando archivo:', error.response?.data || error.message || error);
    return res.status(error.code === 'DRIVE_NAME_REQUIRED' ? 400 : 500).json({ error: error.code || 'DRIVE_FILE_UPDATE_FAILED', message: error.message || 'No fue posible actualizar el archivo.' });
  }
};

export const updateFolder = async (req, res) => {
  try {
    const folder = await updateDriveFolder({ id: req.params.id, ...req.body });
    return res.json({ folder });
  } catch (error) {
    console.error('[DriveController] Error actualizando carpeta:', error.response?.data || error.message || error);
    return res.status(['DRIVE_NAME_REQUIRED', 'DRIVE_FOLDER_CYCLE'].includes(error.code) ? 400 : 500).json({ error: error.code || 'DRIVE_FOLDER_UPDATE_FAILED', message: error.message || 'No fue posible actualizar la carpeta.' });
  }
};

export const removeFile = async (req, res) => {
  try {
    await trashDriveFile({ id: req.params.id });
    return res.json({ success: true });
  } catch (error) {
    console.error('[DriveController] Error enviando archivo a papelera:', error.response?.data || error.message || error);
    return res.status(500).json({ error: 'DRIVE_FILE_TRASH_FAILED', message: 'No fue posible enviar el archivo a la papelera.' });
  }
};

export const removeFolder = async (req, res) => {
  try {
    await trashDriveFolder({ id: req.params.id });
    return res.json({ success: true });
  } catch (error) {
    console.error('[DriveController] Error enviando carpeta a papelera:', error.response?.data || error.message || error);
    return res.status(500).json({ error: 'DRIVE_FOLDER_TRASH_FAILED', message: 'No fue posible enviar la carpeta a la papelera.' });
  }
};

export const restoreFile = async (req, res) => {
  try {
    const file = await restoreDriveFile({ id: req.params.id });
    return res.json({ file });
  } catch (error) {
    console.error('[DriveController] Error restaurando archivo:', error.response?.data || error.message || error);
    return res.status(500).json({ error: 'DRIVE_FILE_RESTORE_FAILED', message: 'No fue posible restaurar el archivo.' });
  }
};

export const restoreFolder = async (req, res) => {
  try {
    const folder = await restoreDriveFolder({ id: req.params.id });
    return res.json({ folder });
  } catch (error) {
    console.error('[DriveController] Error restaurando carpeta:', error.response?.data || error.message || error);
    return res.status(500).json({ error: 'DRIVE_FOLDER_RESTORE_FAILED', message: 'No fue posible restaurar la carpeta.' });
  }
};

export const managedFile = async (req, res) => {
  try {
    const result = await readManagedDriveFile({ id: req.params.id });
    const encodedName = encodeURIComponent(result.file.name);
    res.setHeader('Content-Type', result.mimeType || result.file.mimeType);
    res.setHeader('Content-Length', String(result.size));
    if (req.query.download === 'true') {
      res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodedName}`);
    }
    return res.send(result.body);
  } catch (error) {
    console.error('[DriveController] Error descargando archivo:', error.response?.data || error.message || error);
    return res.status(error.code === 'DRIVE_FILE_NOT_FOUND' ? 404 : 500).json({ error: error.code || 'DRIVE_FILE_READ_FAILED', message: error.message || 'No fue posible abrir el archivo.' });
  }
};
