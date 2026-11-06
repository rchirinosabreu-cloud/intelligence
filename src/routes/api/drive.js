import express from 'express';
import multer from 'multer';
import * as driveController from '../../controllers/driveController.js';
import { uploadMemoryStorage } from '../../lib/uploadStorage.js';
import { protectDrive } from '../../middlewares/driveProtectionMiddleware.js';
import { changeDriveFolderPassword, unlockDriveFolder, lockDriveFolder } from '../../services/driveFolderProtectionService.js';
import { createRateLimiter } from '../../config/security.js';

const router = express.Router();
const upload = multer({
  storage: uploadMemoryStorage(),
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
const passwordLimit = createRateLimiter({ windowMs: 60_000, max: 10, keyGenerator: req => req.user.userId });
router.put('/folders/:id/password', passwordLimit, protectDrive(async (req, res) => res.json(await changeDriveFolderPassword(req.driveDb, req))));
router.post('/folders/:id/unlock', passwordLimit, protectDrive(async (req, res) => res.json(await unlockDriveFolder(req.driveDb, req))));
router.post('/folders/:id/lock', protectDrive(async (req, res) => res.json(await lockDriveFolder(req.driveDb, req))));
router.get('/contents', protectDrive(driveController.contents));
router.post('/folders', protectDrive(driveController.createFolder));
router.patch('/folders/:id', protectDrive(driveController.updateFolder));
router.patch('/folders/:id/restore', protectDrive(driveController.restoreFolder));
router.delete('/folders/:id', protectDrive(driveController.removeFolder));
router.post('/upload', uploadOne, protectDrive(driveController.upload));
router.get('/managed-files/:id/content', protectDrive(driveController.managedFile));
router.patch('/files/:id', protectDrive(driveController.updateFile));
router.patch('/files/:id/restore', protectDrive(driveController.restoreFile));
router.delete('/files/:id', protectDrive(driveController.removeFile));
router.get('/files/:meetingId/:kind', driveController.detail);

export default router;
