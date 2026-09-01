import express from 'express';
import { requireManagerRole } from '../../middlewares/authMiddleware.js';
import * as minutesController from '../../controllers/minutesController.js';

const router = express.Router();

router.get('/', minutesController.list);
router.post('/sync', requireManagerRole, minutesController.sync);
router.get('/:id', minutesController.detail);

export default router;
