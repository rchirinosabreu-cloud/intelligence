import express from 'express';
import multer from 'multer';
import {
    commitFinancialImport,
    getFinancialDashboard,
    getFinancialMonthlyLedger,
    previewFinancialImport,
    updateFinancialMonthlySummary
} from '../../controllers/financialController.js';
import { requireFinancialAccess } from '../../middlewares/authMiddleware.js';

const router = express.Router();
const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
        fileSize: 10 * 1024 * 1024
    }
});

router.get('/dashboard', requireFinancialAccess, getFinancialDashboard);
router.get('/monthly-ledger', requireFinancialAccess, getFinancialMonthlyLedger);
router.patch('/monthly-summaries/:id', requireFinancialAccess, updateFinancialMonthlySummary);
router.post('/import/preview', requireFinancialAccess, upload.single('file'), previewFinancialImport);
router.post('/import/commit', requireFinancialAccess, upload.single('file'), commitFinancialImport);

export default router;
