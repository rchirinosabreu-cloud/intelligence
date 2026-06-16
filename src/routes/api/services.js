import express from 'express';
import * as serviceController from '../../controllers/serviceController.js';
import { authenticateToken } from '../../middlewares/authMiddleware.js';

const router = express.Router();

// Publicly list services for the quotation form
router.get('/', serviceController.listServices);

// CRUD operations (Admin/PM only via authenticateToken)
router.use(authenticateToken);
router.post('/', serviceController.createService);
router.put('/:id', serviceController.updateService);
router.delete('/:id', serviceController.deleteService);

export default router;
