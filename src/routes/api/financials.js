import express from 'express';
import multer from 'multer';
import {
    commitFinancialImport,
    getFinancialDashboard,
    createFinancialPayrollContract,
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
import {
    requireFinancialAccess,
    requireFinancialAdmin,
    requireFinancialApproval,
    requireFinancialWrite
} from '../../middlewares/authMiddleware.js';
import {
    closeFinancialPeriodHandler,
    approvePayrollTransactionHandler,
    createFinancialAccountHandler,
    createReceivableHandler,
    createReceivablePaymentHandler,
    generatePayrollPeriodHandler,
    getFinancialIntegrityAuditHandler,
    createFinancialRecordHandler,
    listFinancialAccountsHandler,
    listFinancialPeriodsHandler,
    listFinancialRecordsHandler,
    payPayrollTransactionHandler,
    reopenFinancialPeriodHandler,
    updateFinancialRecordHandler,
    voidFinancialRecordHandler
} from '../../controllers/financialRecordController.js';
import {
    approveBankReconciliationMatch,
    getBankReconciliation,
    importBankStatement,
    previewBankStatement,
    rebuildBankReconciliation
} from '../../controllers/bankReconciliationController.js';

const router = express.Router();
const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
        fileSize: 10 * 1024 * 1024
    }
});

router.get('/dashboard', requireFinancialAccess, getFinancialDashboard);
router.get('/accounts', requireFinancialAccess, listFinancialAccountsHandler);
router.post('/accounts', requireFinancialApproval, createFinancialAccountHandler);
router.get('/records', requireFinancialAccess, listFinancialRecordsHandler);
router.get('/integrity', requireFinancialAccess, getFinancialIntegrityAuditHandler);
router.post('/records', requireFinancialWrite, createFinancialRecordHandler);
router.patch('/records/:id', requireFinancialWrite, updateFinancialRecordHandler);
router.post('/records/:id/void', requireFinancialWrite, voidFinancialRecordHandler);
router.get('/periods', requireFinancialAccess, listFinancialPeriodsHandler);
router.post('/periods/close', requireFinancialApproval, closeFinancialPeriodHandler);
router.post('/periods/reopen', requireFinancialAdmin, reopenFinancialPeriodHandler);
router.get('/monthly-ledger', requireFinancialAccess, getFinancialMonthlyLedger);
router.patch('/monthly-summaries/:id', requireFinancialWrite, updateFinancialMonthlySummary);
router.get('/client-reconciliation', requireFinancialAccess, getFinancialClientReconciliation);
router.patch('/client-links/:sourceClientId', requireFinancialWrite, linkFinancialClient);
router.get('/receivables-ledger', requireFinancialAccess, getFinancialReceivablesLedger);
router.patch('/receivables/:id', requireFinancialWrite, updateFinancialReceivable);
router.post('/receivables', requireFinancialWrite, createReceivableHandler);
router.post('/receivables/:id/payments', requireFinancialWrite, createReceivablePaymentHandler);
router.get('/payroll-ledger', requireFinancialAccess, getFinancialPayrollLedger);
router.post('/payroll-contracts', requireFinancialWrite, createFinancialPayrollContract);
router.patch('/payroll-contracts/:id', requireFinancialWrite, updateFinancialPayrollContract);
router.post('/payroll/periods', requireFinancialWrite, generatePayrollPeriodHandler);
router.post('/payroll-transactions/:id/approve', requireFinancialApproval, approvePayrollTransactionHandler);
router.post('/payroll-transactions/:id/pay', requireFinancialApproval, payPayrollTransactionHandler);
router.post('/import/preview', requireFinancialApproval, upload.single('file'), previewFinancialImport);
router.post('/import/commit', requireFinancialApproval, upload.single('file'), commitFinancialImport);
router.get('/bank-reconciliation', requireFinancialAccess, getBankReconciliation);
router.post('/bank-reconciliation/preview', requireFinancialApproval, upload.single('file'), previewBankStatement);
router.post('/bank-reconciliation/import', requireFinancialApproval, upload.single('file'), importBankStatement);
router.post('/bank-reconciliation/rebuild', requireFinancialApproval, rebuildBankReconciliation);
router.post('/bank-reconciliation/matches/:id/approve', requireFinancialApproval, approveBankReconciliationMatch);

export default router;
