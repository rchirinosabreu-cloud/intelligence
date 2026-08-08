import express from 'express';
import multer from 'multer';
import { getFinancialDashboard, previewFinancialImport } from '../../controllers/financialController.js';
import { requireFinancialAccess } from '../../middlewares/authMiddleware.js';

const router = express.Router();
const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
        fileSize: 10 * 1024 * 1024
    }
});

router.get('/dashboard', requireFinancialAccess, getFinancialDashboard);
router.post('/import/preview', requireFinancialAccess, upload.single('file'), previewFinancialImport);

export default router;
