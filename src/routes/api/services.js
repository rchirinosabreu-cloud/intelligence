import express from 'express';
import multer from 'multer';
import { uploadMemoryStorage } from '../../lib/uploadStorage.js';
import { receivesFiles } from '../../lib/uploadMarker.js';
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

// El catálogo en Excel: descargarlo, revisar lo que cambiaría al subirlo y guardar (quien edita el catálogo).
const catalogUpload = multer({ storage: uploadMemoryStorage(), limits: { fileSize: 10 * 1024 * 1024, files: 1 } });
router.get('/export', serviceController.exportCatalog);
router.post('/import/preview', receivesFiles(catalogUpload.single('file'), { field: 'file' }), serviceController.previewCatalogImport);
router.post('/import', receivesFiles(catalogUpload.single('file'), { field: 'file' }), serviceController.applyCatalogImport);

export default router;
