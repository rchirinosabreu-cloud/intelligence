import prisma from '../lib/prisma.js';
import {
    createFinancialRecord,
    listFinancialRecords,
    updateFinancialRecord,
    voidFinancialRecord
} from '../services/financialRecordService.js';
import {
    closeFinancialPeriod,
    listFinancialPeriods,
    reopenFinancialPeriod
} from '../services/financialPeriodService.js';
import { replaceFinancialRecordAllocations } from '../services/financialRecordAllocationService.js';
import {
    attachFinancialRecordDocument,
    financialEvidenceStorage,
    openFinancialRecordDocument,
    voidFinancialRecordDocument
} from '../services/financialRecordDocumentService.js';
import { createReceivablePayment, reverseReceivablePayment } from '../services/receivablePaymentService.js';
import { createReceivable } from '../services/financialReceivableService.js';
import { auditFinancialIntegrity } from '../services/financialIntegrityAuditService.js';
import { createFinancialAccount, listFinancialAccounts } from '../services/financialAccountService.js';
import {
    approvePayrollTransaction,
    generatePayrollPeriod,
    payPayrollTransaction
} from '../services/financialPayrollService.js';

const respondWithError = (res, error, fallbackCode, fallbackMessage) => {
    const statusCode = Number(error?.statusCode) || 500;
    return res.status(statusCode).json({
        error: error?.code || fallbackCode,
        message: statusCode >= 500 ? fallbackMessage : error.message
    });
};

export const listFinancialRecordsHandler = async (req, res, dependencies = {}) => {
    const prismaClient = dependencies.prismaClient || prisma;
    const listRecords = dependencies.listRecords || listFinancialRecords;
    try {
        return res.json(await listRecords(prismaClient, req.query || {}));
    } catch (error) {
        console.error('[Financial records API] List failed:', error.response?.data || error);
        return respondWithError(res, error, 'FINANCIAL_RECORD_LIST_FAILED', 'No fue posible cargar los movimientos financieros.');
    }
};

export const listFinancialAccountsHandler = async (req, res, dependencies = {}) => {
    const prismaClient = dependencies.prismaClient || prisma;
    const listAccounts = dependencies.listAccounts || listFinancialAccounts;
    try {
        const includeInactive = req.query?.includeInactive === 'true';
        return res.json({ accounts: await listAccounts(prismaClient, { includeInactive }) });
    } catch (error) {
        console.error('[Financial accounts API] List failed:', error.response?.data || error);
        return respondWithError(res, error, 'FINANCIAL_ACCOUNT_LIST_FAILED', 'No fue posible cargar las cuentas financieras.');
    }
};

export const createFinancialAccountHandler = async (req, res, dependencies = {}) => {
    const prismaClient = dependencies.prismaClient || prisma;
    const createAccount = dependencies.createAccount || createFinancialAccount;
    try {
        const account = await createAccount(prismaClient, req.body || {}, req.user);
        return res.status(201).json({ message: 'Cuenta creada correctamente.', account });
    } catch (error) {
        console.error('[Financial accounts API] Create failed:', error.response?.data || error);
        return respondWithError(res, error, 'FINANCIAL_ACCOUNT_CREATE_FAILED', 'No fue posible crear la cuenta financiera.');
    }
};

export const createFinancialRecordHandler = async (req, res, dependencies = {}) => {
    const prismaClient = dependencies.prismaClient || prisma;
    const createRecord = dependencies.createRecord || createFinancialRecord;
    try {
        const record = await createRecord(prismaClient, req.body || {}, req.user);
        return res.status(201).json({
            message: 'Movimiento registrado correctamente.',
            record
        });
    } catch (error) {
        console.error('[Financial records API] Create failed:', error.response?.data || error);
        return respondWithError(res, error, 'FINANCIAL_RECORD_CREATE_FAILED', 'No fue posible registrar el movimiento financiero.');
    }
};

export const updateFinancialRecordHandler = async (req, res, dependencies = {}) => {
    const prismaClient = dependencies.prismaClient || prisma;
    const updateRecord = dependencies.updateRecord || updateFinancialRecord;
    try {
        const record = await updateRecord(prismaClient, req.params.id, req.body || {}, req.user);
        return res.json({
            message: 'Movimiento actualizado correctamente.',
            record
        });
    } catch (error) {
        console.error('[Financial records API] Update failed:', error.response?.data || error);
        return respondWithError(res, error, 'FINANCIAL_RECORD_UPDATE_FAILED', 'No fue posible actualizar el movimiento financiero.');
    }
};

export const voidFinancialRecordHandler = async (req, res, dependencies = {}) => {
    const prismaClient = dependencies.prismaClient || prisma;
    const voidRecord = dependencies.voidRecord || voidFinancialRecord;
    try {
        const record = await voidRecord(prismaClient, req.params.id, req.body?.reason, req.user);
        return res.json({
            message: 'Movimiento anulado correctamente.',
            record
        });
    } catch (error) {
        console.error('[Financial records API] Void failed:', error.response?.data || error);
        return respondWithError(res, error, 'FINANCIAL_RECORD_VOID_FAILED', 'No fue posible anular el movimiento financiero.');
    }
};

export const replaceFinancialRecordAllocationsHandler = async (req, res, dependencies = {}) => {
    const prismaClient = dependencies.prismaClient || prisma;
    const replaceAllocations = dependencies.replaceAllocations || replaceFinancialRecordAllocations;
    try {
        const record = await replaceAllocations(prismaClient, req.params.id, req.body?.allocations, req.user);
        return res.json({
            message: record.allocations.length > 0 ? 'Desglose guardado correctamente.' : 'Desglose retirado correctamente.',
            record
        });
    } catch (error) {
        console.error('[Financial records API] Allocation failed:', error.response?.data || error);
        return respondWithError(res, error, 'FINANCIAL_ALLOCATION_FAILED', 'No fue posible guardar el desglose del movimiento.');
    }
};

export const uploadFinancialRecordDocumentHandler = async (req, res, dependencies = {}) => {
    const prismaClient = dependencies.prismaClient || prisma;
    const storage = dependencies.storage || financialEvidenceStorage();
    const attachDocument = dependencies.attachDocument || attachFinancialRecordDocument;
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'FINANCIAL_DOCUMENT_REQUIRED', message: 'Selecciona un documento PDF, JPG o PNG.' });
        }
        const document = await attachDocument(prismaClient, storage, req.params.id, req.file, req.user);
        return res.status(201).json({ message: 'Documento guardado correctamente.', document });
    } catch (error) {
        console.error('[Financial documents API] Upload failed:', error.response?.data || error);
        return respondWithError(res, error, 'FINANCIAL_DOCUMENT_UPLOAD_FAILED', 'No fue posible guardar el documento.');
    }
};

const safeDocumentName = (name = 'documento') => String(name).replace(/[\r\n"\\/]/g, '_').slice(0, 180) || 'documento';

export const streamFinancialRecordDocumentHandler = async (req, res, dependencies = {}) => {
    const prismaClient = dependencies.prismaClient || prisma;
    const storage = dependencies.storage || financialEvidenceStorage();
    const openDocument = dependencies.openDocument || openFinancialRecordDocument;
    try {
        const { document, object } = await openDocument(prismaClient, storage, req.params.id, req.params.documentId);
        const disposition = req.query?.download === '1' ? 'attachment' : 'inline';
        const filename = safeDocumentName(document.name);
        const asciiName = filename.replace(/[^\x20-\x7E]/g, '_');
        res.setHeader('Access-Control-Expose-Headers', 'Content-Disposition');
        // The stored type was detected from the bytes at upload; never trust the bucket's echo of a client header.
        res.setHeader('Content-Type', document.mimeType);
        res.setHeader('Content-Disposition', `${disposition}; filename="${asciiName}"; filename*=UTF-8''${encodeURIComponent(filename).replace(/['()*]/g, char => '%' + char.charCodeAt(0).toString(16))}`);
        res.setHeader('Cache-Control', 'private, no-store');
        res.setHeader('X-Content-Type-Options', 'nosniff');
        if (object.ContentLength) res.setHeader('Content-Length', String(object.ContentLength));
        object.Body.on('error', (error) => {
            console.error('[Financial documents API] Stream failed:', error);
            if (!res.headersSent) res.status(500).json({ error: 'FINANCIAL_DOCUMENT_STREAM_FAILED', message: 'No se pudo cargar el documento.' });
            else res.destroy(error);
        });
        return object.Body.pipe(res);
    } catch (error) {
        console.error('[Financial documents API] Open failed:', error?.message || error);
        if (res.headersSent) return undefined;
        if (error?.name === 'NoSuchKey') {
            return res.status(404).json({ error: 'FINANCIAL_DOCUMENT_MISSING', message: 'El archivo no está disponible en el almacenamiento.' });
        }
        return respondWithError(res, error, 'FINANCIAL_DOCUMENT_OPEN_FAILED', 'No fue posible abrir el documento.');
    }
};

export const voidFinancialRecordDocumentHandler = async (req, res, dependencies = {}) => {
    const prismaClient = dependencies.prismaClient || prisma;
    const voidDocument = dependencies.voidDocument || voidFinancialRecordDocument;
    try {
        const document = await voidDocument(prismaClient, req.params.id, req.params.documentId, req.body?.reason, req.user);
        return res.json({ message: 'Documento anulado. El archivo se conserva en la bitácora.', document });
    } catch (error) {
        console.error('[Financial documents API] Void failed:', error.response?.data || error);
        return respondWithError(res, error, 'FINANCIAL_DOCUMENT_VOID_FAILED', 'No fue posible anular el documento.');
    }
};

export const listFinancialPeriodsHandler = async (req, res, dependencies = {}) => {
    const prismaClient = dependencies.prismaClient || prisma;
    const listPeriods = dependencies.listPeriods || listFinancialPeriods;
    try {
        return res.json({ periods: await listPeriods(prismaClient, req.query?.year) });
    } catch (error) {
        console.error('[Financial periods API] List failed:', error.response?.data || error);
        return respondWithError(res, error, 'FINANCIAL_PERIOD_LIST_FAILED', 'No fue posible cargar los periodos contables.');
    }
};

export const closeFinancialPeriodHandler = async (req, res, dependencies = {}) => {
    const prismaClient = dependencies.prismaClient || prisma;
    const closePeriod = dependencies.closePeriod || closeFinancialPeriod;
    try {
        const period = await closePeriod(prismaClient, req.body || {}, req.user);
        return res.json({ message: 'Periodo cerrado correctamente.', period });
    } catch (error) {
        console.error('[Financial periods API] Close failed:', error.response?.data || error);
        return respondWithError(res, error, 'FINANCIAL_PERIOD_CLOSE_FAILED', 'No fue posible cerrar el periodo contable.');
    }
};

export const reopenFinancialPeriodHandler = async (req, res, dependencies = {}) => {
    const prismaClient = dependencies.prismaClient || prisma;
    const reopenPeriod = dependencies.reopenPeriod || reopenFinancialPeriod;
    try {
        const period = await reopenPeriod(prismaClient, req.body || {}, req.user);
        return res.json({ message: 'Periodo reabierto correctamente.', period });
    } catch (error) {
        console.error('[Financial periods API] Reopen failed:', error.response?.data || error);
        return respondWithError(res, error, 'FINANCIAL_PERIOD_REOPEN_FAILED', 'No fue posible reabrir el periodo contable.');
    }
};

export const createReceivablePaymentHandler = async (req, res, dependencies = {}) => {
    const prismaClient = dependencies.prismaClient || prisma;
    const createPayment = dependencies.createPayment || createReceivablePayment;
    try {
        const result = await createPayment(prismaClient, req.params.id, req.body || {}, req.user);
        return res.status(201).json({
            message: 'Pago de cartera registrado correctamente.',
            ...result
        });
    } catch (error) {
        console.error('[Receivable payments API] Create failed:', error.response?.data || error);
        return respondWithError(res, error, 'RECEIVABLE_PAYMENT_CREATE_FAILED', 'No fue posible registrar el pago de cartera.');
    }
};

export const reverseReceivablePaymentHandler = async (req, res, dependencies = {}) => {
    const prismaClient = dependencies.prismaClient || prisma;
    const reversePayment = dependencies.reversePayment || reverseReceivablePayment;
    try {
        const result = await reversePayment(prismaClient, req.params.paymentId, req.body || {}, req.user);
        return res.json({
            message: result.voidedRecord
                ? 'Abono revertido. El ingreso que había generado quedó anulado.'
                : 'Abono revertido. El ingreso vinculado se conservó y vuelve a estar disponible.',
            ...result
        });
    } catch (error) {
        console.error('[Receivable payments API] Reversal failed:', error.response?.data || error);
        return respondWithError(res, error, 'RECEIVABLE_PAYMENT_REVERSAL_FAILED', 'No fue posible revertir el abono.');
    }
};

export const createReceivableHandler = async (req, res, dependencies = {}) => {
    const prismaClient = dependencies.prismaClient || prisma;
    const createReceivableService = dependencies.createReceivableService || createReceivable;
    try {
        const receivable = await createReceivableService(prismaClient, req.body || {}, req.user);
        return res.status(201).json({ message: 'Cuenta por cobrar registrada.', receivable });
    } catch (error) {
        console.error('[Receivables API] Create failed:', error.response?.data || error);
        return respondWithError(res, error, 'RECEIVABLE_CREATE_FAILED', 'No fue posible registrar la cuenta por cobrar.');
    }
};

export const getFinancialIntegrityAuditHandler = async (req, res, dependencies = {}) => {
    const prismaClient = dependencies.prismaClient || prisma;
    const auditIntegrity = dependencies.auditIntegrity || auditFinancialIntegrity;
    try {
        const audit = await auditIntegrity(prismaClient, req.query || {});
        return res.json(audit);
    } catch (error) {
        console.error('[Financial integrity API] Audit failed:', error.response?.data || error);
        return respondWithError(res, error, 'FINANCIAL_INTEGRITY_AUDIT_FAILED', 'No fue posible auditar la integridad financiera.');
    }
};

export const generatePayrollPeriodHandler = async (req, res, dependencies = {}) => {
    const prismaClient = dependencies.prismaClient || prisma;
    const generatePeriod = dependencies.generatePeriod || generatePayrollPeriod;
    try {
        const result = await generatePeriod(prismaClient, req.body || {}, req.user);
        return res.status(201).json({ message: 'Periodo de nomina generado.', ...result });
    } catch (error) {
        console.error('[Financial payroll API] Generate failed:', error.response?.data || error);
        return respondWithError(res, error, 'PAYROLL_GENERATE_FAILED', 'No fue posible generar el periodo de nomina.');
    }
};

export const approvePayrollTransactionHandler = async (req, res, dependencies = {}) => {
    const prismaClient = dependencies.prismaClient || prisma;
    const approveTransaction = dependencies.approveTransaction || approvePayrollTransaction;
    try {
        const transaction = await approveTransaction(prismaClient, req.params.id, req.user);
        return res.json({ message: 'Liquidacion aprobada.', transaction });
    } catch (error) {
        console.error('[Financial payroll API] Approve failed:', error.response?.data || error);
        return respondWithError(res, error, 'PAYROLL_APPROVE_FAILED', 'No fue posible aprobar la liquidacion.');
    }
};

export const payPayrollTransactionHandler = async (req, res, dependencies = {}) => {
    const prismaClient = dependencies.prismaClient || prisma;
    const payTransaction = dependencies.payTransaction || payPayrollTransaction;
    try {
        const result = await payTransaction(prismaClient, req.params.id, req.body || {}, req.user);
        return res.json({ message: 'Pago de nomina registrado.', ...result });
    } catch (error) {
        console.error('[Financial payroll API] Payment failed:', error.response?.data || error);
        return respondWithError(res, error, 'PAYROLL_PAYMENT_FAILED', 'No fue posible registrar el pago de nomina.');
    }
};
