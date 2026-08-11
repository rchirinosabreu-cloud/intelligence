import express from 'express';
import * as serviceController from '../../controllers/serviceController.js';
import { authenticateToken, requireManagerRole, requireModulePermission } from '../../middlewares/authMiddleware.js';

const router = express.Router();

router.use(authenticateToken);
router.get('/', requireModulePermission('cotizaciones'), serviceController.listServices);

// CRUD operations (Admin/PM only)
router.use(requireManagerRole);
router.post('/', serviceController.createService);
router.put('/:id', serviceController.updateService);
router.delete('/:id', serviceController.deleteService);

export default router;
