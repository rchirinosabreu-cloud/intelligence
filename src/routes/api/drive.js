import express from 'express';
import multer from 'multer';
import * as driveController from '../../controllers/driveController.js';

const router = express.Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024, files: 1 }
});
const uploadOne = (req, res, next) => upload.single('file')(req, res, error => {
  if (!error) return next();
  console.error('[Drive] Error recibiendo archivo:', error.message);
  return res.status(error.code === 'LIMIT_FILE_SIZE' ? 413 : 400).json({
    error: error.code || 'DRIVE_MULTIPART_FAILED',
    message: error.code === 'LIMIT_FILE_SIZE' ? 'El archivo supera el límite de 25 MB.' : 'No fue posible recibir el archivo.'
  });
});

router.get('/files', driveController.list);
router.get('/contents', driveController.contents);
router.post('/folders', driveController.createFolder);
router.patch('/folders/:id', driveController.updateFolder);
router.patch('/folders/:id/restore', driveController.restoreFolder);
router.delete('/folders/:id', driveController.removeFolder);
router.post('/upload', uploadOne, driveController.upload);
router.get('/managed-files/:id/content', driveController.managedFile);
router.patch('/files/:id', driveController.updateFile);
router.patch('/files/:id/restore', driveController.restoreFile);
router.delete('/files/:id', driveController.removeFile);
router.get('/files/:meetingId/:kind', driveController.detail);

export default router;
