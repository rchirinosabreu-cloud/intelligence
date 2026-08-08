import express from 'express';
import multer from 'multer';
import {
    commitFinancialImport,
    getFinancialDashboard,
    getFinancialClientReconciliation,
    getFinancialMonthlyLedger,
    getFinancialPayrollLedger,
    getFinancialReceivablesLedger,
    linkFinancialClient,
    previewFinancialImport,
    updateFinancialPayrollContract,
    updateFinancialReceivable,
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
router.get('/client-reconciliation', requireFinancialAccess, getFinancialClientReconciliation);
router.patch('/client-links/:sourceClientId', requireFinancialAccess, linkFinancialClient);
router.get('/receivables-ledger', requireFinancialAccess, getFinancialReceivablesLedger);
router.patch('/receivables/:id', requireFinancialAccess, updateFinancialReceivable);
router.get('/payroll-ledger', requireFinancialAccess, getFinancialPayrollLedger);
router.patch('/payroll-contracts/:id', requireFinancialAccess, updateFinancialPayrollContract);
router.post('/import/preview', requireFinancialAccess, upload.single('file'), previewFinancialImport);
router.post('/import/commit', requireFinancialAccess, upload.single('file'), commitFinancialImport);

export default router;
