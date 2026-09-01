import express from 'express';
import { requireManagerRole } from '../../middlewares/authMiddleware.js';
import * as minutesController from '../../controllers/minutesController.js';

const router = express.Router();

router.get('/', minutesController.list);
router.get('/trash', requireManagerRole, minutesController.listTrash);
router.post('/sync', requireManagerRole, minutesController.sync);
router.patch('/:id/restore', requireManagerRole, minutesController.restore);
router.delete('/:id/permanent', requireManagerRole, minutesController.removePermanently);
router.delete('/:id', requireManagerRole, minutesController.trash);
router.get('/:id', minutesController.detail);

export default router;
